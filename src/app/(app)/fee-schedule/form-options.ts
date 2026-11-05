import "server-only";
import { asc, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { budgetLines, feeHeads } from "@/db/schema";
import { fractionToPercent } from "@/lib/fees";
import type { FeeHeadRow } from "@/lib/fees-service";
import { getListValues, withCurrent } from "@/lib/lists-server";
import type { FeeHeadFormOptions, FeeHeadFormValues } from "./fee-head-form";

export async function getFeeHeadFormOptions(current?: FeeHeadRow): Promise<FeeHeadFormOptions> {
  const [categories, frequencies, lines, statuses] = await Promise.all([
    getListValues("Revenue categories"),
    getListValues("Frequency"),
    db.select({ id: budgetLines.id, name: budgetLines.name }).from(budgetLines).orderBy(asc(budgetLines.sortOrder)),
    db.selectDistinct({ s: feeHeads.rateStatus }).from(feeHeads).where(isNotNull(feeHeads.rateStatus)),
  ]);
  return {
    categories: withCurrent(categories, current?.category),
    frequencies: withCurrent(frequencies, current?.frequency),
    budgetLines: lines.map((l) => [l.id, l.name]),
    rateStatuses: ["Approved", ...statuses.map((s) => s.s!).filter((s) => s !== "Approved").sort()],
  };
}

/** Numeric columns come back as "120000.000000"; show them as a person would type them. */
const plain = (v: string | null) => (v === null ? "" : v.includes(".") ? v.replace(/\.?0+$/, "") : v);

export function toFormValues(row: FeeHeadRow): FeeHeadFormValues {
  return {
    code: row.code,
    head: row.head,
    category: row.category,
    appliesTo: row.appliesTo ?? "",
    basis: row.basis,
    currency: row.currency,
    publishedRate:
      row.publishedRate === null ? "" : row.basis === "% of Revenue" ? fractionToPercent(row.publishedRate) : plain(row.publishedRate),
    publishedRateText: row.publishedRateText ?? "",
    capNgn: plain(row.capNgn),
    unitBasis: row.unitBasis ?? "",
    frequency: row.frequency ?? "",
    revenueType: row.revenueType,
    budgetLineId: row.budgetLineId ?? "",
    legalBasis: row.legalBasis ?? "",
    ncoaCode: row.ncoaCode ?? "",
    rateStatus: row.rateStatus ?? "",
    notes: row.notes ?? "",
    active: row.active,
  };
}
