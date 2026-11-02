import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal | string | number | null | undefined;

export function toDecimal(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return value instanceof Decimal ? value : new Decimal(value);
}

/** "31050000" -> "31,050,000.00". No currency sign; the UI renders the naira sign separately. */
export function formatAmount(value: MoneyInput): string {
  const d = toDecimal(value).toDecimalPlaces(2);
  const [whole = "0", frac = "00"] = d.abs().toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${d.isNegative() && !d.isZero() ? "-" : ""}${grouped}.${frac}`;
}

export function formatNaira(value: MoneyInput): string {
  return `₦${formatAmount(value)}`;
}

/** KPI-card abbreviation: 111.1m, 3.33bn, 7.75m, 50k (with the naira sign). */
export function abbreviateNaira(value: MoneyInput): string {
  const d = toDecimal(value);
  const abs = d.abs();
  const sign = d.isNegative() ? "-" : "";
  const fmt = (x: Decimal, dp: number) => x.toDecimalPlaces(dp).toString();
  if (abs.gte(1e9)) return `${sign}₦${fmt(abs.div(1e9), 2)}bn`;
  if (abs.gte(1e6)) return `${sign}₦${fmt(abs.div(1e6), 2)}m`;
  if (abs.gte(1e3)) return `${sign}₦${fmt(abs.div(1e3), 1)}k`;
  return `${sign}₦${fmt(abs, 2)}`;
}
