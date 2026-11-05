import Decimal from "decimal.js";
import { type MoneyInput, toDecimal } from "./money";

/** Revenue budget helpers. Pure functions, safe in client components. */

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function sumAmounts(values: readonly MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}

/**
 * Parses a budget figure typed by a person: commas and spaces allowed, up to 2 decimal
 * places, not negative. Blank means 0. Returns null when it isn't a valid amount.
 */
export function parseBudgetInput(raw: string): string | null {
  const v = raw.replace(/[,\s₦]/g, "");
  if (v === "") return "0";
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  return new Decimal(v).toFixed(2);
}

/**
 * What a month cell shows in the editor: the stored figure at 2 dp. Stored figures keep the
 * workbook's full precision, so a cell only counts as changed if the person types a
 * different 2 dp value (see changedMonths).
 */
export const budgetCellValue = (stored: MoneyInput) => toDecimal(stored).toFixed(2);

export interface MonthChange {
  month: number;
  old: string;
  new: string;
}

/**
 * The months whose submitted value differs from the stored one at 2 dp. Untouched months are
 * left alone, so their full-precision values (and the FY total) don't drift.
 * `stored` and `submitted` are indexed 0-11 for Jan-Dec.
 */
export function changedMonths(stored: readonly MoneyInput[], submitted: readonly string[]): MonthChange[] {
  const out: MonthChange[] = [];
  for (let i = 0; i < 12; i++) {
    const before = toDecimal(stored[i]);
    const after = toDecimal(submitted[i]);
    if (!before.toDecimalPlaces(2).eq(after)) {
      out.push({ month: i + 1, old: before.toString(), new: after.toFixed(2) });
    }
  }
  return out;
}

/**
 * Months elapsed in the FY at the as-at date (BUILD_SPEC 4.8). The workbook counts the
 * current month as complete ("including_current_month"); the setting can switch to
 * completed months only.
 */
export function monthsElapsed(
  financialYear: number,
  asAt: string,
  rule: "including_current_month" | "completed_months_only" = "including_current_month",
): number {
  const year = Number(asAt.slice(0, 4));
  const month = Number(asAt.slice(5, 7));
  if (year < financialYear) return 0;
  if (year > financialYear) return 12;
  return rule === "including_current_month" ? month : month - 1;
}
