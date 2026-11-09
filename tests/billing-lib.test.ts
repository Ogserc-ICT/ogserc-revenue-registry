import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  type AmountBand,
  type AmountFee,
  computeAmount,
  formStatus,
  paymentCheckLine,
  receiptAmountDue,
  receiptFormStatus,
} from "@/lib/amount";
import { deriveDemandNotice } from "@/lib/demandNotice";
import { amountInWords } from "@/lib/words";

type Json = Record<string, unknown>;
const feeJson = JSON.parse(readFileSync("seed/fee_heads.json", "utf8")) as Json[];
const bandJson = JSON.parse(readFileSync("seed/licence_fee_bands.json", "utf8")) as Json[];
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

const FEES = new Map<string, AmountFee>(
  feeJson.map((f) => [
    String(f.code),
    {
      code: String(f.code),
      basis: f.basis as AmountFee["basis"],
      currency: f.currency as AmountFee["currency"],
      publishedRate: str(f.published_rate),
      capNgn: str(f.cap_ngn),
      unitBasis: str(f.unit_basis),
    },
  ]),
);
const BANDS: AmountBand[] = bandJson.map((b) => ({
  code: String(b.code),
  aboveMw: String(b.above_mw),
  upToMw: String(b.up_to_mw),
  publishedRate: str(b.published_rate),
  currency: b.currency as AmountBand["currency"],
}));

const calc = (code: string, o: { mw?: string; qty?: string; override?: string; base?: string } = {}) =>
  computeAmount({
    fee: FEES.get(code)!,
    bands: BANDS,
    usdNgnRate: "1500",
    payerCapacityMw: o.mw ?? null,
    payerRevenueBaseNgn: o.base ?? null,
    quantity: o.qty ?? "1",
    override: o.override ?? "",
  });

describe("amount engine (BUILD_SPEC 4.2, acceptance checks)", () => {
  it("EMG-01 for a 1.5 MW payer is ₦50,000 (band rate)", () => {
    const r = calc("EMG-01", { mw: "1.5" });
    expect(r.amount?.toFixed(2)).toBe("50000.00");
    expect(r.source).toBe("computed");
    expect(r.rateText).toBe("₦50,000.00 for 1.5 MW (band rate)");
  });

  it("GEN-02 for a 25 MW payer is ₦45,000,000 (US$30,000 @ ₦1,500)", () => {
    const r = calc("GEN-02", { mw: "25" });
    expect(r.amount?.toFixed(2)).toBe("45000000.00");
    expect(r.fxUsed?.toString()).toBe("1500");
    expect(r.rateText).toBe("₦45,000,000.00 for 25.0 MW (band rate)  (US$ fee @ ₦1,500/US$)");
  });

  it("uses the quantity for the band when the payer has no capacity, and band edges are above < MW <= up to", () => {
    expect(calc("GEN-02", { qty: "10" }).amount?.toFixed(2)).toBe("7500000.00"); // 1-10 MW band, US$5,000
    expect(calc("GEN-02", { qty: "10.001" }).amount?.toFixed(2)).toBe("45000000.00"); // 11-50 MW band
  });

  it("warns when no band rate exists and requires an override", () => {
    const r = calc("EMG-01", { mw: "300" });
    expect(r.computed).toBeNull();
    expect(r.amount).toBeNull();
    expect(r.rateText).toBe("⚠ No band rate for 300.0 MW - use Override");
    expect(formStatus({ payerChosen: true, feeChosen: true, result: r }).message).toBe("Enter the amount in Override amount");
    expect(calc("EMG-01", { mw: "300", override: "75000" }).amount?.toFixed(2)).toBe("75000.00");
  });

  it("multiplies Fixed, Per Unit and % of Revenue by the quantity", () => {
    expect(calc("REG-F", { qty: "2" }).amount?.toFixed(2)).toBe("1000000.00");
    const levy = calc("LEV-01", { qty: "12000000000", base: "12000000000" });
    expect(levy.amount?.toFixed(2)).toBe("180000000.00");
    expect(levy.rateText.startsWith("1.50% ")).toBe(true);
    expect(levy.quantityHint).toBe("Use the revenue base: ₦12,000,000,000");
  });

  it("converts US$ fixed fees at the FX rate and says so", () => {
    const r = calc("PXL-02");
    expect(r.amount?.toFixed(2)).toBe("180000000.00");
    expect(r.rateText).toBe("₦180,000,000.00 per licence  (US$ fee @ ₦1,500/US$)");
  });

  it("caps Per Day charges: LRC-04 is ₦200,000 a day up to ₦20,000,000", () => {
    const r31 = calc("LRC-04", { qty: "31" });
    expect(r31.amount?.toFixed(2)).toBe("6200000.00");
    expect(r31.capped).toBe(false);
    expect(r31.rateText).toBe("₦200,000.00 per day late (quantity = days)  · capped at ₦20,000,000");
    const r200 = calc("LRC-04", { qty: "200" });
    expect(r200.amount?.toFixed(2)).toBe("20000000.00");
    expect(r200.capped).toBe(true);
  });

  it("has no computed amount for Variable heads; the override wins everywhere", () => {
    const v = calc("GRT-02");
    expect(v.computed).toBeNull();
    expect(v.rateText).toBe("Variable - enter the amount");
    expect(v.quantityHint).toBe("Not used - put the amount in Override amount");
    expect(calc("GRT-02", { override: "5000000" }).amount?.toFixed(2)).toBe("5000000.00");
    expect(calc("REG-F", { override: "450000" }).source).toBe("override");
  });

  it("says when a rate isn't set", () => {
    const fee: AmountFee = { code: "X", basis: "Fixed", currency: "NGN", publishedRate: null, capNgn: null, unitBasis: "per item" };
    const r = computeAmount({ fee, bands: [], usdNgnRate: "1500", payerCapacityMw: null, payerRevenueBaseNgn: null, quantity: "1", override: "" });
    expect(r.amount).toBeNull();
    expect(r.rateText).toBe("⚠ Rate not set - use Override");
  });

  it("reports the form status in the workbook's order", () => {
    const r = calc("REG-F");
    expect(formStatus({ payerChosen: false, feeChosen: true, result: r }).message).toBe("Select the payer");
    expect(formStatus({ payerChosen: true, feeChosen: false, result: r }).message).toBe("Select the revenue head");
    expect(formStatus({ payerChosen: true, feeChosen: true, result: r }).ready).toBe(true);
  });

  it("works out a receipt's amount due: override, then DN balance, then computed, then amount paid", () => {
    const computed = calc("REG-F");
    expect(receiptAmountDue({ result: computed, dnSelected: true, dnOutstanding: "15000000", amountPaid: "1" })?.toFixed(2)).toBe("15000000.00");
    expect(receiptAmountDue({ result: calc("REG-F", { override: "7" }), dnSelected: true, dnOutstanding: "15000000", amountPaid: "1" })?.toFixed(2)).toBe("7.00");
    expect(receiptAmountDue({ result: computed, dnSelected: false, dnOutstanding: null, amountPaid: "1" })?.toFixed(2)).toBe("500000.00");
    expect(receiptAmountDue({ result: calc("GRT-02"), dnSelected: false, dnOutstanding: null, amountPaid: "250" })?.toFixed(2)).toBe("250.00");
  });
});

describe("receipt form helpers (workbook New Receipt sheet)", () => {
  it("uses the receipt form's own quantity hints", () => {
    const r = (code: string, o: { mw?: string; base?: string } = {}) =>
      computeAmount({
        fee: FEES.get(code)!,
        bands: BANDS,
        usdNgnRate: "1500",
        payerCapacityMw: o.mw ?? null,
        payerRevenueBaseNgn: o.base ?? null,
        quantity: "1",
        override: "",
        form: "receipt",
      }).quantityHint;
    expect(r("REG-F")).toBe("Number of units (usually 1).");
    expect(r("GEN-02", { mw: "25" })).toBe("Band is looked up on the payer's capacity (25.0 MW). If Payers has no capacity, type the MW here.");
    expect(r("LEV-01", { base: "12000000000" })).toBe("Enter the NGN base. Payer record shows ₦12,000,000,000.");
    expect(r("GRT-02")).toBe("Not used - put the amount in Override amount due.");
  });

  it("gives the live check line against the amount due", () => {
    const d = (v: string) => new Decimal(v);
    expect(paymentCheckLine(d("60000000"), "45000000").text).toBe("Part payment – balance ₦15,000,000.00");
    expect(paymentCheckLine(d("100"), "150").text).toBe("Over-payment of ₦50.00");
    expect(paymentCheckLine(d("100"), "100.00").text).toBe("Payment matches amount due");
    expect(paymentCheckLine(null, "100").kind).toBeNull();
    expect(paymentCheckLine(d("100"), "").kind).toBeNull();
  });

  it("reports the form status in the workbook's order", () => {
    const base = { payerChosen: true, feeChosen: true, amountPaid: "10", channel: "Remita (TSA)", account: "TSA", paymentRef: "RRR1", refInRegister: false };
    expect(receiptFormStatus({ ...base, payerChosen: false }).message).toBe("Select the payer");
    expect(receiptFormStatus({ ...base, amountPaid: "0" }).message).toBe("Enter the amount paid");
    expect(receiptFormStatus({ ...base, channel: "" }).message).toBe("Select the payment channel");
    expect(receiptFormStatus({ ...base, account: "" }).message).toBe("Select the bank / collecting account");
    expect(receiptFormStatus({ ...base, paymentRef: " " }).message).toBe("Enter the payment reference / RRR");
    expect(receiptFormStatus({ ...base, refInRegister: true }).message).toBe("⚠ Payment reference already in the register");
    expect(receiptFormStatus(base).ready).toBe(true);
  });
});

describe("demand notice status and ageing (BUILD_SPEC 4.5)", () => {
  const asAt = "2026-11-02";
  it("DN-0001: billed 60m, paid 45m, 261 days, Part-paid (overdue)", () => {
    const d = deriveDemandNotice({ amountBilled: "60000000", paidToDate: "45000000", cancelled: false, dueDate: "2026-02-14", asAt });
    expect(d.outstanding.toFixed(2)).toBe("15000000.00");
    expect(d.daysOverdue).toBe(261);
    expect(d.agingBucket).toBe("Over 90 days");
    expect(d.status).toBe("Part-paid (overdue)");
  });

  it("puts each case in the right bucket and status, in order", () => {
    const base = { amountBilled: "100", paidToDate: "0", cancelled: false, asAt };
    const at = (dueDate: string) => deriveDemandNotice({ ...base, dueDate });
    expect(at("2026-11-02").agingBucket).toBe("Not yet due");
    expect(at("2026-11-02").status).toBe("Unpaid");
    expect(at("2026-11-01").agingBucket).toBe("1-30 days");
    expect(at("2026-11-01").status).toBe("Overdue");
    expect(at("2026-10-03").agingBucket).toBe("1-30 days"); // 30 days
    expect(at("2026-10-02").agingBucket).toBe("31-60 days"); // 31 days
    expect(at("2026-09-03").agingBucket).toBe("31-60 days"); // 60
    expect(at("2026-09-02").agingBucket).toBe("61-90 days"); // 61
    expect(at("2026-08-04").agingBucket).toBe("61-90 days"); // 90
    expect(at("2026-08-03").agingBucket).toBe("Over 90 days"); // 91
    const partNotDue = deriveDemandNotice({ ...base, paidToDate: "40", dueDate: "2026-12-01" });
    expect(partNotDue.status).toBe("Part-paid");
    expect(partNotDue.daysOverdue).toBe(0);
  });

  it("treats settled and cancelled notices as nothing outstanding", () => {
    const paid = deriveDemandNotice({ amountBilled: "100", paidToDate: "120", cancelled: false, dueDate: "2026-01-01", asAt });
    expect(paid.outstanding.toFixed(2)).toBe("0.00");
    expect([paid.agingBucket, paid.status, paid.daysOverdue]).toEqual(["Settled", "Paid", 0]);
    const cancelled = deriveDemandNotice({ amountBilled: "100", paidToDate: "50", cancelled: true, dueDate: "2026-01-01", asAt });
    expect([cancelled.outstanding.toFixed(2), cancelled.agingBucket, cancelled.status]).toEqual(["0.00", "Cancelled", "Cancelled"]);
  });
});

describe("amount in words (port of the VBA AmountInWords)", () => {
  it("matches the BUILD_SPEC examples", () => {
    expect(amountInWords("1000000.50")).toBe("One Million Naira, Fifty Kobo Only");
    expect(amountInWords("15000000")).toBe("Fifteen Million Naira Only");
    expect(amountInWords(0)).toBe("Zero Naira Only");
  });

  it("follows the VBA's use of 'and' and hyphens", () => {
    expect(amountInWords("105")).toBe("One Hundred and Five Naira Only");
    expect(amountInWords("1021")).toBe("One Thousand Twenty-One Naira Only");
    expect(amountInWords("2838653215.12")).toBe(
      "Two Billion Eight Hundred and Thirty-Eight Million Six Hundred and Fifty-Three Thousand Two Hundred and Fifteen Naira, Twelve Kobo Only",
    );
    expect(amountInWords("0.05")).toBe("Zero Naira, Five Kobo Only");
    expect(amountInWords("1000000000")).toBe("One Billion Naira Only");
  });

  it("rounds to kobo and carries 100 kobo into a naira", () => {
    expect(amountInWords("1.999")).toBe("Two Naira Only");
    expect(amountInWords("7.125")).toBe("Seven Naira, Thirteen Kobo Only");
  });
});
