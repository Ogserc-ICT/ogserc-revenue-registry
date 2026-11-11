import Decimal from "decimal.js";
import { formatAmount, type MoneyInput, toDecimal } from "./money";

/** Fee schedule helpers. Pure functions, safe in client components. */

export const FEE_BASES = ["Fixed", "Per MW", "MW Band", "% of Revenue", "Per Unit", "Per Day", "Variable"] as const;
export type FeeBasis = (typeof FEE_BASES)[number];
export const CURRENCIES = ["NGN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const REVENUE_TYPES = ["IGR", "Non-IGR"] as const;

/** Bases whose rate lives elsewhere (band table) or is assessed case by case. */
export const basisHasRate = (basis: FeeBasis) => basis !== "MW Band" && basis !== "Variable";

export const BASIS_HINTS: Record<FeeBasis, string> = {
  Fixed: "A set amount per item. Amount = rate × quantity (usually 1).",
  "Per MW": "Rate per MW of capacity. Amount = rate × MW.",
  "MW Band": "The rate depends on the payer's capacity. Set it in Licence fee tables.",
  "% of Revenue": "A percentage of the payer's revenue. Amount = rate × ₦ revenue base.",
  "Per Unit": "Rate per unit. Amount = rate × number of units.",
  "Per Day": "Rate per day. Amount = MIN(rate × days, cap) when a cap is set.",
  Variable: "No set rate. The officer enters the amount on each notice or receipt.",
};

/** 0.015 -> "1.5" (for showing a % of Revenue rate). */
export function fractionToPercent(fraction: MoneyInput): string {
  return toDecimal(fraction).times(100).toDecimalPlaces(4).toString();
}

/** "1.5" -> "0.015" (for storing a % of Revenue rate). */
export function percentToFraction(percent: MoneyInput): string {
  return toDecimal(percent).div(100).toDecimalPlaces(6).toString();
}

/** Plain number without trailing zeros, grouped: 1500.000000 -> "1,500". */
export function formatPlain(value: MoneyInput): string {
  const d = toDecimal(value);
  const [whole = "0", frac] = d.abs().toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${d.isNegative() ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export interface RatedFee {
  basis: FeeBasis;
  currency: Currency;
  publishedRate: string | null;
  capNgn: string | null;
}

/** The naira rate: published rate × FX for US$ fees. Null where the basis has no single rate. */
export function rateInNaira(fee: RatedFee, usdNgnRate: MoneyInput): Decimal | null {
  if (!basisHasRate(fee.basis) || fee.publishedRate === null) return null;
  const rate = toDecimal(fee.publishedRate);
  return fee.currency === "USD" ? rate.times(toDecimal(usdNgnRate)) : rate;
}

/**
 * One-line description of a fee's rate for the fee schedule, e.g.
 * "₦200,000.00 per day, capped at ₦20,000,000.00" or "US$120,000 (₦180,000,000.00 @ ₦1,500/US$)".
 */
export function describeRate(fee: RatedFee, usdNgnRate: MoneyInput): string {
  if (fee.basis === "MW Band") return "By MW band (see Licence fee tables)";
  if (fee.basis === "Variable") return "Variable: amount entered on each notice or receipt";
  if (fee.publishedRate === null) return "Rate not set";
  if (fee.basis === "% of Revenue") return `${fractionToPercent(fee.publishedRate)}% of revenue`;

  const naira = rateInNaira(fee, usdNgnRate)!;
  let text =
    fee.currency === "USD"
      ? `US$${formatPlain(fee.publishedRate)} (₦${formatAmount(naira)} @ ₦${formatPlain(usdNgnRate)}/US$)`
      : `₦${formatAmount(naira)}`;
  if (fee.basis === "Per MW") text += " per MW";
  if (fee.basis === "Per Day") {
    text += " per day";
    if (fee.capNgn !== null && toDecimal(fee.capNgn).gt(0)) text += `, capped at ₦${formatAmount(fee.capNgn)}`;
  }
  return text;
}

/** Share of a total as a percentage with 2 dp, or null when the total is 0. */
export function shareOf(part: MoneyInput, total: MoneyInput): string | null {
  const t = toDecimal(total);
  if (t.isZero()) return null;
  return toDecimal(part).div(t).times(100).toFixed(2);
}

export interface DescribedFee extends RatedFee {
  head: string;
  appliesTo: string | null;
  legalBasis: string | null;
  unitBasis: string | null;
  frequency: string | null;
}

/**
 * The two lines shown under a revenue head picker: what the head stands for (who it applies to,
 * from the fee schedule) and the fee to be paid. Both come from the fee schedule, so Finance
 * keeps them current by editing the head.
 */
export function feeHeadInfo(fee: DescribedFee, usdNgnRate: MoneyInput): { standsFor: string; legalBasis: string | null; feeToPay: string } {
  const standsFor = fee.appliesTo?.trim() ? `${fee.head}: ${fee.appliesTo.trim()}` : fee.head;
  let feeToPay = describeRate(fee, usdNgnRate);
  const unit = fee.unitBasis?.trim();
  // "per day" and "per MW" are already in the rate text; add the unit for set amounts.
  if (fee.basis === "Fixed" && fee.publishedRate !== null && unit) feeToPay += ` ${unit}`;
  if (fee.frequency?.trim().toLowerCase() === "one-off") feeToPay += " (one-off)";
  return { standsFor, legalBasis: fee.legalBasis?.trim() || null, feeToPay };
}
