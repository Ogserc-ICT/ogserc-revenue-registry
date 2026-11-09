import Decimal from "decimal.js";
import { daysBetween } from "./registration";
import { type MoneyInput, toDecimal } from "./money";

/**
 * Demand notice derived fields (BUILD_SPEC 4.5), computed on read and never stored. Ported from
 * the workbook's WriteDNFormulas. The SQL in dn-service.ts implements the same rules for
 * filtering and paging; tests check the two agree.
 */

export const AGING_BUCKETS = [
  "Cancelled",
  "Settled",
  "Not yet due",
  "1-30 days",
  "31-60 days",
  "61-90 days",
  "Over 90 days",
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const DN_STATUSES = ["Unpaid", "Part-paid", "Overdue", "Part-paid (overdue)", "Paid", "Cancelled"] as const;
export type DnStatus = (typeof DN_STATUSES)[number];

export interface DnDerivedInput {
  amountBilled: MoneyInput;
  /** Confirmed receipts against this notice. */
  paidToDate: MoneyInput;
  cancelled: boolean;
  dueDate: string;
  /** settings.as_at_date or today in Lagos (BUILD_SPEC 4.5). */
  asAt: string;
}

export interface DnDerived {
  outstanding: Decimal;
  daysOverdue: number;
  agingBucket: AgingBucket;
  status: DnStatus;
}

export function deriveDemandNotice(i: DnDerivedInput): DnDerived {
  const billed = toDecimal(i.amountBilled);
  const paid = toDecimal(i.paidToDate);
  const outstanding = i.cancelled ? new Decimal(0) : Decimal.max(0, billed.minus(paid));
  const late = daysBetween(i.dueDate, i.asAt);
  const daysOverdue = outstanding.gt(0) && late > 0 ? late : 0;

  let agingBucket: AgingBucket;
  if (i.cancelled) agingBucket = "Cancelled";
  else if (outstanding.lte(0)) agingBucket = "Settled";
  else if (daysOverdue === 0) agingBucket = "Not yet due";
  else if (daysOverdue <= 30) agingBucket = "1-30 days";
  else if (daysOverdue <= 60) agingBucket = "31-60 days";
  else if (daysOverdue <= 90) agingBucket = "61-90 days";
  else agingBucket = "Over 90 days";

  let status: DnStatus;
  if (i.cancelled) status = "Cancelled";
  else if (outstanding.lte(0)) status = "Paid";
  else if (paid.gt(0)) status = daysOverdue > 0 ? "Part-paid (overdue)" : "Part-paid";
  else status = daysOverdue > 0 ? "Overdue" : "Unpaid";

  return { outstanding, daysOverdue, agingBucket, status };
}

/** Pill colours from DESIGN.md 4. */
export const DN_STATUS_TONES = {
  Paid: "emerald",
  "Part-paid": "gold",
  Overdue: "rose",
  "Part-paid (overdue)": "rose",
  Unpaid: "muted",
  Cancelled: "slate",
} as const satisfies Record<DnStatus, string>;
