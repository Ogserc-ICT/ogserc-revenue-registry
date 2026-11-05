import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  budgetLines,
  feeHeads,
  licenceFeeBands,
  lists,
  receipts,
  revenueBudget,
  sch3LateCharges,
  sch3RegistrationFees,
} from "@/db/schema";
import { UserFacingError } from "./action-result";
import { type AuditActor, AUDIT_ACTIONS, diffFields, writeAudit } from "./audit";
import { changedMonths, sumAmounts } from "./budget";
import { basisHasRate } from "./fees";
import type { FeeHeadValues } from "./validation";

// ---------- Fee schedule ----------

export type FeeHeadRow = typeof feeHeads.$inferSelect;

/**
 * Codes whose rate comes from the Schedule 3 tables (REG-A..K, LRC-01..06). Their rate is
 * edited on the Registration fees page and copied into the fee head on save (BUILD_SPEC 3).
 */
export async function schedule3LinkedCodes(db: Db): Promise<Set<string>> {
  const [reg, late] = await Promise.all([
    db.select({ code: sch3RegistrationFees.revenueCode }).from(sch3RegistrationFees),
    db.select({ a: sch3LateCharges.initialCode, b: sch3LateCharges.dailyCode }).from(sch3LateCharges),
  ]);
  return new Set([...reg.map((r) => r.code), ...late.flatMap((r) => [r.a, r.b])]);
}

/** Confirmed receipts per revenue code for a year (receipt date, BUILD_SPEC 4.7). */
export async function collectedByCode(db: Db, financialYear: number): Promise<Map<string, string>> {
  const rows = await db
    .select({ code: receipts.revenueCode, total: sql<string>`sum(${receipts.amountPaid})` })
    .from(receipts)
    .where(
      and(
        eq(receipts.status, "Confirmed"),
        sql`extract(year from ${receipts.receiptDate}) = ${financialYear}`,
      ),
    )
    .groupBy(receipts.revenueCode);
  return new Map(rows.map((r) => [r.code, r.total]));
}

async function assertInList(tx: Db, listName: string, value: string | null, current: string | null | undefined, field: string) {
  if (value === null || value === current) return;
  const [hit] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.listName, listName), eq(lists.value, value), eq(lists.active, true)))
    .limit(1);
  if (!hit) {
    throw new UserFacingError("Check the highlighted fields.", {
      [field]: `Pick a value from the ${listName.toLowerCase()} list.`,
    });
  }
}

async function assertBudgetLine(tx: Db, id: string | null) {
  if (id === null) return;
  const [hit] = await tx.select({ id: budgetLines.id }).from(budgetLines).where(eq(budgetLines.id, id));
  if (!hit) throw new UserFacingError("Check the highlighted fields.", { budgetLineId: "Pick a budget line." });
}

/** Rate and cap only make sense for some bases; clear them otherwise so the record stays honest. */
function rateFields(v: FeeHeadValues) {
  return {
    publishedRate: basisHasRate(v.basis) ? v.publishedRate : null,
    capNgn: v.basis === "Per Day" ? v.capNgn : null,
  };
}

const headFields = (v: FeeHeadValues) => ({
  head: v.head,
  category: v.category,
  appliesTo: v.appliesTo,
  basis: v.basis,
  currency: v.currency,
  ...rateFields(v),
  publishedRateText: v.publishedRateText,
  unitBasis: v.unitBasis,
  frequency: v.frequency,
  revenueType: v.revenueType,
  budgetLineId: v.budgetLineId,
  legalBasis: v.legalBasis,
  ncoaCode: v.ncoaCode,
  rateStatus: v.rateStatus,
  notes: v.notes,
  active: v.active,
});

/** `values.publishedRate` must already be a fraction for "% of Revenue" (the action converts it). */
export async function createFeeHead(db: Db, actor: AuditActor, code: string, values: FeeHeadValues) {
  return db.transaction(async (tx) => {
    const [exists] = await tx.select({ code: feeHeads.code }).from(feeHeads).where(sql`upper(${feeHeads.code}) = ${code}`);
    if (exists) throw new UserFacingError("Check the highlighted field.", { code: `${code} already exists. Pick another code.` });
    await assertInList(tx, "Revenue categories", values.category, undefined, "category");
    await assertInList(tx, "Frequency", values.frequency, undefined, "frequency");
    await assertBudgetLine(tx, values.budgetLineId);
    const [{ maxSort } = { maxSort: 0 }] = await tx
      .select({ maxSort: sql<number>`coalesce(max(${feeHeads.sortOrder}), 0)::int` })
      .from(feeHeads);
    const row = { code, ...headFields(values), sortOrder: Number(maxSort) + 10 };
    await tx.insert(feeHeads).values(row);
    await writeAudit(tx, { actor, action: AUDIT_ACTIONS.feeHeadAdded, reference: code, details: { ...row } });
    return { code };
  });
}

/**
 * Edits a fee head; the code never changes. For Schedule 3 heads the basis, currency, rate
 * and cap are kept from the Schedule 3 tables whatever was submitted.
 * Receipts and notices keep their own snapshots, so history is not rewritten.
 */
export async function updateFeeHead(db: Db, actor: AuditActor, code: string, values: FeeHeadValues) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(feeHeads).where(eq(feeHeads.code, code)).for("update");
    if (!current) throw new UserFacingError("That fee head no longer exists. Refresh the page.");
    await assertInList(tx, "Revenue categories", values.category, current.category, "category");
    await assertInList(tx, "Frequency", values.frequency, current.frequency, "frequency");
    await assertBudgetLine(tx, values.budgetLineId);

    const next: Partial<FeeHeadRow> = headFields(values);
    if ((await schedule3LinkedCodes(tx)).has(code)) {
      next.basis = current.basis;
      next.currency = current.currency;
      next.publishedRate = current.publishedRate;
      next.capNgn = current.capNgn;
    }
    const changes = diffFields(current, next);
    if (Object.keys(changes).length === 0) return { changed: 0 };
    await tx.update(feeHeads).set(next).where(eq(feeHeads.code, code));
    await writeAudit(tx, { actor, action: AUDIT_ACTIONS.feeHeadChanged, reference: code, details: { changes } });
    return { changed: Object.keys(changes).length };
  });
}

// ---------- Schedule 3 ----------

/** Changes a category's registration fee and copies it into its REG-x fee head, in one transaction. */
export async function updateSchedule3Fee(db: Db, actor: AuditActor, category: string, feeNgn: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sch3RegistrationFees)
      .where(eq(sch3RegistrationFees.category, category))
      .for("update");
    if (!row) throw new UserFacingError("That Schedule 3 category no longer exists. Refresh the page.");
    const changes = diffFields(row, { feeNgn });
    if (Object.keys(changes).length === 0) return { changed: 0 };
    await tx.update(sch3RegistrationFees).set({ feeNgn }).where(eq(sch3RegistrationFees.category, category));
    await tx.update(feeHeads).set({ publishedRate: feeNgn }).where(eq(feeHeads.code, row.revenueCode));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.schedule3Changed,
      reference: `Schedule 3 Part A, Category ${category}`,
      details: { changes, feeHeadUpdated: row.revenueCode },
    });
    return { changed: 1 };
  });
}

/** Changes a late-charge group and copies the amounts into its LRC fee heads, in one transaction. */
export async function updateSchedule3Group(
  db: Db,
  actor: AuditActor,
  group: string,
  values: { initialNgn: string; dailyNgn: string; dailyCapNgn: string },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(sch3LateCharges).where(eq(sch3LateCharges.group, group)).for("update");
    if (!row) throw new UserFacingError("That late-charge group no longer exists. Refresh the page.");
    const changes = diffFields(row, values);
    if (Object.keys(changes).length === 0) return { changed: 0 };
    await tx.update(sch3LateCharges).set(values).where(eq(sch3LateCharges.group, group));
    await tx.update(feeHeads).set({ publishedRate: values.initialNgn }).where(eq(feeHeads.code, row.initialCode));
    await tx
      .update(feeHeads)
      .set({ publishedRate: values.dailyNgn, capNgn: values.dailyCapNgn })
      .where(eq(feeHeads.code, row.dailyCode));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.schedule3Changed,
      reference: `Schedule 3 Part B, ${group}`,
      details: { changes, feeHeadsUpdated: [row.initialCode, row.dailyCode] },
    });
    return { changed: Object.keys(changes).length };
  });
}

// ---------- Licence fee bands ----------

export async function updateBandRate(db: Db, actor: AuditActor, id: number, publishedRate: string | null) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(licenceFeeBands).where(eq(licenceFeeBands.id, id)).for("update");
    if (!row) throw new UserFacingError("That band no longer exists. Refresh the page.");
    const changes = diffFields(row, { publishedRate });
    if (Object.keys(changes).length === 0) return { changed: 0, row };
    await tx.update(licenceFeeBands).set({ publishedRate }).where(eq(licenceFeeBands.id, id));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.licenceBandChanged,
      reference: `${row.code} ${row.bandLabel}`,
      details: { changes, currency: row.currency },
    });
    return { changed: 1, row };
  });
}

// ---------- Revenue budget ----------

export interface BudgetLineRow {
  id: string;
  name: string;
  groupCode: string;
  groupName: string;
  /** Jan..Dec at full stored precision; "0" where no row exists yet. */
  months: string[];
  sourceNote: string | null;
}

export async function getBudget(db: Db, financialYear: number): Promise<BudgetLineRow[]> {
  const [lines, rows] = await Promise.all([
    db.select().from(budgetLines).orderBy(asc(budgetLines.sortOrder)),
    db.select().from(revenueBudget).where(eq(revenueBudget.financialYear, financialYear)),
  ]);
  return lines.map((l) => {
    const mine = rows.filter((r) => r.budgetLineId === l.id);
    return {
      id: l.id,
      name: l.name,
      groupCode: l.groupCode,
      groupName: l.groupName,
      months: Array.from({ length: 12 }, (_, i) => mine.find((r) => r.month === i + 1)?.amount ?? "0"),
      sourceNote: mine.find((r) => r.sourceNote)?.sourceNote ?? null,
    };
  });
}

/**
 * Saves one budget line's months. Only months whose 2 dp value changed are written, so the
 * workbook's full-precision figures stay exact where nobody touched them.
 */
export async function saveBudgetLine(
  db: Db,
  actor: AuditActor,
  financialYear: number,
  budgetLineId: string,
  months: string[],
) {
  return db.transaction(async (tx) => {
    const [line] = await tx.select().from(budgetLines).where(eq(budgetLines.id, budgetLineId));
    if (!line) throw new UserFacingError("That budget line no longer exists. Refresh the page.");
    const existing = await tx
      .select()
      .from(revenueBudget)
      .where(and(eq(revenueBudget.financialYear, financialYear), eq(revenueBudget.budgetLineId, budgetLineId)))
      .for("update");
    const stored = Array.from({ length: 12 }, (_, i) => existing.find((r) => r.month === i + 1)?.amount ?? "0");
    const changes = changedMonths(stored, months);
    if (changes.length === 0) return { changed: 0, line };

    for (const c of changes) {
      await tx
        .insert(revenueBudget)
        .values({ financialYear, budgetLineId, month: c.month, amount: c.new, sourceNote: `Edited by ${actor.name}` })
        .onConflictDoUpdate({
          target: [revenueBudget.financialYear, revenueBudget.budgetLineId, revenueBudget.month],
          set: { amount: c.new },
        });
    }
    const after = stored.map((v, i) => changes.find((c) => c.month === i + 1)?.new ?? v);
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.budgetChanged,
      reference: `FY${financialYear} ${budgetLineId}`,
      details: {
        line: line.name,
        months: changes,
        lineTotal: { old: sumAmounts(stored).toString(), new: sumAmounts(after).toString() },
      },
    });
    return { changed: changes.length, line };
  });
}
