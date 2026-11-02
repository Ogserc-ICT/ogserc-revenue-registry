import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { receipts, revenueBudget, settings } from "@/db/schema";
import { resolveAsAt } from "./dates";

export const FY_COOKIE = "ogsrr.fy";

export const getSettings = cache(async () => {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) throw new Error("Settings are missing. Run `pnpm seed` first.");
  return row;
});

/** The as-at date for reports (settings.as_at_date, or today in Lagos). */
export async function getAsAt(): Promise<string> {
  return resolveAsAt((await getSettings()).asAtDate);
}

/** Financial years that have a budget or receipts, plus the settings FY. */
export const getAvailableYears = cache(async (): Promise<number[]> => {
  const s = await getSettings();
  const rows = await db.execute<{ y: number }>(sql`
    select distinct financial_year as y from ${revenueBudget}
    union
    select distinct extract(year from ${receipts.receiptDate})::int as y from ${receipts}
  `);
  const years = new Set<number>([s.financialYear, ...Array.from(rows, (r) => Number(r.y))]);
  return [...years].sort((a, b) => b - a);
});

/** The FY the user is viewing: their chip choice (cookie) if valid, else settings.financial_year. */
export async function getViewingYear(): Promise<number> {
  const s = await getSettings();
  const raw = Number((await cookies()).get(FY_COOKIE)?.value);
  const years = await getAvailableYears();
  return years.includes(raw) ? raw : s.financialYear;
}
