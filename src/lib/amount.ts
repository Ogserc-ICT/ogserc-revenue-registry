import Decimal from "decimal.js";
import type { Currency, FeeBasis } from "./fees";
import { type MoneyInput, toDecimal } from "./money";

/**
 * The amount engine shared by New demand notice and New receipt (BUILD_SPEC 4.2), ported from
 * the workbook's New Demand Notice formulas. Pure functions, safe in client components, so the
 * live calculation panel and the server's save use exactly the same arithmetic.
 */

export interface AmountFee {
  code: string;
  basis: FeeBasis;
  currency: Currency;
  publishedRate: string | null;
  capNgn: string | null;
  unitBasis: string | null;
}

export interface AmountBand {
  code: string;
  aboveMw: string;
  upToMw: string;
  publishedRate: string | null;
  currency: Currency;
}

export interface AmountInput {
  fee: AmountFee | null;
  /** Licence fee bands; only those with the fee's code are used. */
  bands: readonly AmountBand[];
  usdNgnRate: MoneyInput;
  /** The payer's installed capacity; used for MW Band when above 0. */
  payerCapacityMw: MoneyInput;
  /** The payer's annual revenue base; shown in the % of Revenue hint. */
  payerRevenueBaseNgn: MoneyInput;
  /** Basis quantity as typed. Blank counts as 0, as in the workbook (the form defaults it to 1). */
  quantity: MoneyInput;
  /** Override amount; when entered it wins (BUILD_SPEC 4.2 step 3). */
  override: MoneyInput;
  /** Which form's wording to use for the quantity hint; the workbook's two forms differ. */
  form?: "dn" | "receipt";
}

export interface AmountResult {
  /** Effective rate in naira (band rate for MW Band); 0 when the rate isn't set. Null without a fee. */
  rateNgn: Decimal | null;
  /** The US$ rate converted, so the FX used can be stored (BUILD_SPEC 4.2 improvement). */
  fxUsed: Decimal | null;
  /** MW used for the band lookup: the payer's capacity if above 0, else the quantity. */
  bandMw: Decimal | null;
  /** Computed amount before any override; null for Variable or when nothing can be computed. */
  computed: Decimal | null;
  /** True when a daily or other cap reduced the computed amount. */
  capped: boolean;
  /** What will be billed: the override, else the computed amount. Null if neither is above 0. */
  amount: Decimal | null;
  source: "override" | "computed" | null;
  /** The workbook's rate line, e.g. "₦45,000,000.00 for 25.0 MW (band rate)  (US$ fee @ ₦1,500/US$)". */
  rateText: string;
  /** The workbook's quantity hint for the basis, e.g. "Usually 1". */
  quantityHint: string;
}

const isEntered = (v: MoneyInput) => v !== null && v !== undefined && String(v).trim() !== "";

/** Excel TEXT(x, "#,##0.00"). */
const fmt2 = (d: Decimal) => groupThousands(d.toFixed(2));
/** Excel TEXT(x, "#,##0.0"). */
const fmt1 = (d: Decimal) => groupThousands(d.toFixed(1));
/** Excel TEXT(x, "#,##0"). */
const fmt0 = (d: Decimal) => groupThousands(d.toFixed(0));

function groupThousands(fixed: string): string {
  const [whole = "0", frac] = fixed.replace(/^-/, "").split(".");
  const sign = fixed.startsWith("-") ? "-" : "";
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac !== undefined ? `.${frac}` : ""}`;
}

/** The band for a capacity: above_mw < MW <= up_to_mw (BUILD_SPEC 4.2). */
export function findBand(bands: readonly AmountBand[], code: string, mw: Decimal): AmountBand | undefined {
  return bands.find((b) => b.code === code && toDecimal(b.aboveMw).lt(mw) && toDecimal(b.upToMw).gte(mw));
}

export function computeAmount(input: AmountInput): AmountResult {
  const { fee } = input;
  const fx = toDecimal(input.usdNgnRate);
  const qty = toDecimal(input.quantity);
  const capacity = toDecimal(input.payerCapacityMw);
  const override = isEntered(input.override) ? toDecimal(input.override) : null;

  if (!fee) {
    return {
      rateNgn: null,
      fxUsed: null,
      bandMw: null,
      computed: null,
      capped: false,
      amount: override && override.gt(0) ? override : null,
      source: override && override.gt(0) ? "override" : null,
      rateText: "",
      quantityHint: "",
    };
  }

  const unit = fee.unitBasis ?? "";
  const usd = fee.currency === "USD";
  const bandMw = capacity.gt(0) ? capacity : qty;
  const cap = toDecimal(fee.capNgn);

  // 1. Effective rate (G22 in the workbook).
  let rateNgn: Decimal;
  if (fee.basis === "MW Band") {
    const band = findBand(input.bands, fee.code, bandMw);
    const bandRate = band?.publishedRate != null ? toDecimal(band.publishedRate) : new Decimal(0);
    rateNgn = band?.currency === "USD" ? bandRate.times(fx) : bandRate;
  } else {
    const published = toDecimal(fee.publishedRate);
    rateNgn = usd ? published.times(fx) : published;
  }

  // 2. Computed amount by basis (C27).
  let computed: Decimal | null = null;
  let capped = false;
  if (fee.basis === "MW Band") {
    computed = rateNgn.gt(0) ? rateNgn : null;
  } else if (fee.basis !== "Variable") {
    const raw = rateNgn.times(qty);
    if (cap.gt(0) && raw.gt(cap)) {
      computed = cap;
      capped = true;
    } else {
      computed = raw;
    }
  }
  if (computed) computed = computed.toDecimalPlaces(2);

  // 3. Override wins.
  let amount: Decimal | null = null;
  let source: AmountResult["source"] = null;
  if (override && override.gt(0)) {
    amount = override;
    source = "override";
  } else if (computed && computed.gt(0)) {
    amount = computed;
    source = "computed";
  }

  return {
    rateNgn,
    fxUsed: usd ? fx : null,
    bandMw: fee.basis === "MW Band" ? bandMw : null,
    computed,
    capped,
    amount,
    source,
    rateText: rateText(fee, rateNgn, bandMw, fx, cap, unit),
    quantityHint:
      input.form === "receipt"
        ? receiptQuantityHint(fee.basis, capacity, bandMw, toDecimal(input.payerRevenueBaseNgn))
        : quantityHint(fee.basis, capacity, bandMw, toDecimal(input.payerRevenueBaseNgn)),
  };
}

/** The workbook's "Rate" line (C22), word for word. */
function rateText(fee: AmountFee, rate: Decimal, bandMw: Decimal, fx: Decimal, cap: Decimal, unit: string): string {
  const usd = fee.currency === "USD";
  let text: string;
  if (fee.basis === "Variable") {
    return `Variable - enter the amount${usd ? ` (${unit})` : ""}`;
  } else if (fee.basis === "% of Revenue") {
    text = `${rate.times(100).toFixed(2)}% ${unit}`.trim();
  } else if (fee.basis === "MW Band") {
    text = rate.isZero()
      ? `⚠ No band rate for ${fmt1(bandMw)} MW - use Override`
      : `₦${fmt2(rate)} for ${fmt1(bandMw)} MW (band rate)`;
  } else if (fee.publishedRate === null) {
    // The workbook showed "₦0.00 …" here; saying why is clearer.
    text = "⚠ Rate not set - use Override";
  } else {
    text = `₦${fmt2(rate)} ${unit}`.trim();
  }
  if (usd) text += `  (US$ fee @ ₦${fmt0(fx)}/US$)`;
  if (cap.gt(0)) text += `  · capped at ₦${fmt0(cap)}`;
  return text;
}

/** The workbook's hint beside Basis quantity (E23), word for word. */
function quantityHint(basis: FeeBasis, capacity: Decimal, bandMw: Decimal, revenueBase: Decimal): string {
  switch (basis) {
    case "Per MW":
      return `Use the payer's capacity: ${fmt1(capacity)} MW`;
    case "MW Band":
      return `Band looked up on ${fmt1(bandMw)} MW (payer capacity, else this quantity)`;
    case "% of Revenue":
      return `Use the revenue base: ₦${fmt0(revenueBase)}`;
    case "Per Day":
      return "Days late - the Schedule 3 cap is applied automatically";
    case "Variable":
      return "Not used - put the amount in Override amount";
    default:
      return "Usually 1";
  }
}

/** The New Receipt sheet's hint beside Basis quantity (E25), word for word. */
function receiptQuantityHint(basis: FeeBasis, capacity: Decimal, bandMw: Decimal, revenueBase: Decimal): string {
  switch (basis) {
    case "Per MW":
      return `Enter capacity in MW. Payer record shows ${fmt1(capacity)} MW.`;
    case "MW Band":
      return `Band is looked up on the payer's capacity (${fmt1(bandMw)} MW). If Payers has no capacity, type the MW here.`;
    case "% of Revenue":
      return `Enter the NGN base. Payer record shows ₦${fmt0(revenueBase)}.`;
    case "Per Day":
      return "Enter the number of days late - the Schedule 3 cap is applied automatically.";
    case "Variable":
      return "Not used - put the amount in Override amount due.";
    default:
      return "Number of units (usually 1).";
  }
}

/** Receipt form hint before a revenue head is picked (E25). */
export const RECEIPT_QUANTITY_HINT_EMPTY = "Quantity used to compute the amount due (usually 1).";

/**
 * The workbook's form status line (C34), in order. `payerChosen` and `feeChosen` say whether
 * the selects are filled in.
 */
export function formStatus(opts: { payerChosen: boolean; feeChosen: boolean; result: AmountResult }): {
  ready: boolean;
  message: string;
} {
  if (!opts.payerChosen) return { ready: false, message: "Select the payer" };
  if (!opts.feeChosen) return { ready: false, message: "Select the revenue head" };
  if (!opts.result.amount) return { ready: false, message: "Enter the amount in Override amount" };
  return { ready: true, message: "Ready to issue" };
}

/**
 * The New Receipt form status line (C40), in the workbook's order. `refInRegister` is the
 * live duplicate check on the payment reference.
 */
export function receiptFormStatus(o: {
  payerChosen: boolean;
  feeChosen: boolean;
  amountPaid: MoneyInput;
  channel: string;
  account: string;
  paymentRef: string;
  refInRegister: boolean;
}): { ready: boolean; message: string } {
  if (!o.payerChosen) return { ready: false, message: "Select the payer" };
  if (!o.feeChosen) return { ready: false, message: "Select the revenue head" };
  if (!isEntered(o.amountPaid) || toDecimal(o.amountPaid).lte(0)) return { ready: false, message: "Enter the amount paid" };
  if (!o.channel) return { ready: false, message: "Select the payment channel" };
  if (!o.account) return { ready: false, message: "Select the bank / collecting account" };
  if (!o.paymentRef.trim()) return { ready: false, message: "Enter the payment reference / RRR" };
  if (o.refInRegister) return { ready: false, message: "⚠ Payment reference already in the register" };
  return { ready: true, message: "Ready to save" };
}

/**
 * The live check line (BUILD_SPEC 4.3, workbook C41). It compares against the amount due
 * before the "due = paid" fallback, so it stays blank when nothing is due.
 */
export function paymentCheckLine(amountDue: Decimal | null, amountPaid: MoneyInput): {
  kind: "part" | "over" | "match" | null;
  text: string;
} {
  if (!amountDue || !isEntered(amountPaid) || toDecimal(amountPaid).isZero()) return { kind: null, text: "" };
  const paid = toDecimal(amountPaid);
  if (paid.lt(amountDue)) return { kind: "part", text: `Part payment – balance ₦${fmt2(amountDue.minus(paid))}` };
  if (paid.gt(amountDue)) return { kind: "over", text: `Over-payment of ₦${fmt2(paid.minus(amountDue))}` };
  return { kind: "match", text: "Payment matches amount due" };
}

/**
 * Receipt form only (BUILD_SPEC 4.2 steps 4-5): an override wins; otherwise a selected demand
 * notice's outstanding balance; otherwise the computed amount; otherwise the amount paid.
 * Pass `amountPaid: null` to get the amount due before that last fallback (for the check line).
 */
export function receiptAmountDue(opts: {
  result: AmountResult;
  dnOutstanding: MoneyInput;
  dnSelected: boolean;
  amountPaid: MoneyInput;
}): Decimal | null {
  const { result } = opts;
  if (result.source === "override") return result.amount;
  if (opts.dnSelected) return toDecimal(opts.dnOutstanding);
  if (result.amount) return result.amount;
  return isEntered(opts.amountPaid) ? toDecimal(opts.amountPaid) : null;
}
