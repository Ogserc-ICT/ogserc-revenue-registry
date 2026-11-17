import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { handoverBatches, handoverLines } from "@/db/schema";
import { AUDIT_ACTIONS, type AuditActor, writeAudit } from "./audit";
import { type HandoverLine, HandoverFileError, parseHandover, previousBatchNo } from "./handover";
import { readHandoverWorkbook } from "./handover-xlsx";
import { toDecimal } from "./money";

/**
 * Imports one R&E handover batch (REVENUE-REGISTRY-CONTRACT.md §5): all of it in one transaction,
 * or none of it. The preview runs the same import and rolls it back.
 */

export type LineOutcome = "add" | "held";

export interface HandoverReport {
  batchNo: string;
  /** "already-imported": the same batch with the same checksum is held; nothing changes. */
  status: "new" | "already-imported";
  preparedAt: string | null;
  preparedBy: string | null;
  paymentLines: number;
  reversalLines: number;
  netTotal: string;
  lines: { lineId: string; lineType: "Payment" | "Reversal"; payNo: string; payer: string; amount: string; outcome: LineOutcome }[];
  added: number;
  skipped: number;
  warnings: string[];
  ignoredColumns: string[];
}

class DryRunRollback extends Error {}

/** Under Next's 1 MB server-action body limit. A batch of a few thousand lines is well inside it. */
export const MAX_HANDOVER_BYTES = 900_000;

export async function importHandover(
  db: Db,
  actor: AuditActor,
  file: { name: string; bytes: Uint8Array },
  opts: { dryRun: boolean },
): Promise<HandoverReport> {
  const parsed = parseHandover(await readHandoverWorkbook(file.name, file.bytes));
  const { batch, lines } = parsed;
  let report: HandoverReport | null = null;

  const run = async (tx: Db) => {
    // Serialise imports so two people importing at once can't race past the checks below.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ogsrr.handover-import'))`);

    // Step 4: the same batch again.
    const [held] = await tx.select({ checksum: handoverBatches.checksum }).from(handoverBatches).where(eq(handoverBatches.batchNo, batch.batchNo));
    if (held) {
      if (held.checksum !== batch.checksum) {
        throw new HandoverFileError(`Batch ${batch.batchNo} was already imported with different contents, so this file was refused.`, [
          "A batch never changes after R&E prepares it. Tell R&E: one of the two files is wrong.",
        ]);
      }
      report = summary("already-imported", lines.map((l) => ({ l, outcome: "held" as const })), []);
      return;
    }

    // Step 5: lines already held (from another batch).
    const ids = lines.map((l) => l.lineId);
    const existing = ids.length
      ? await tx.select({ lineId: handoverLines.lineId, amount: handoverLines.amount, batchNo: handoverLines.batchNo }).from(handoverLines).where(inArray(handoverLines.lineId, ids))
      : [];
    const heldById = new Map(existing.map((e) => [e.lineId, e]));
    const conflicts = lines
      .filter((l) => heldById.has(l.lineId) && !toDecimal(heldById.get(l.lineId)!.amount).eq(l.amount))
      .map((l) => `${l.lineId} is held from ${heldById.get(l.lineId)!.batchNo} with a different amount.`);
    if (conflicts.length) throw new HandoverFileError("Some lines are already held with different amounts, so this file was refused.", conflicts);

    // Step 6: a reversal needs its payment, from an earlier batch.
    const reversals = lines.filter((l) => l.lineType === "Reversal" && !heldById.has(l.lineId));
    if (reversals.length) {
      const paymentIds = reversals.map((r) => `${r.payNo}:P`);
      const heldPayments = new Set(
        (await tx.select({ lineId: handoverLines.lineId }).from(handoverLines).where(inArray(handoverLines.lineId, paymentIds))).map((r) => r.lineId),
      );
      const orphans = reversals.filter((r) => !heldPayments.has(`${r.payNo}:P`));
      if (orphans.length) {
        throw new HandoverFileError("Import the earlier batch first.", orphans.map((r) => `${r.lineId} reverses ${r.payNo}, whose payment isn't held yet.`));
      }
    }

    const outcomes = lines.map((l) => ({ l, outcome: (heldById.has(l.lineId) ? "held" : "add") as LineOutcome }));
    const toAdd = outcomes.filter((o) => o.outcome === "add").map((o) => o.l);

    // Recommended: warn when the previous batch of the year hasn't been imported.
    const warnings: string[] = [];
    const prev = previousBatchNo(batch.batchNo);
    if (prev) {
      const [p] = await tx.select({ batchNo: handoverBatches.batchNo }).from(handoverBatches).where(eq(handoverBatches.batchNo, prev));
      if (!p) warnings.push(`The previous batch, ${prev}, hasn't been imported. Check with R&E that no file was missed.`);
    }

    // Steps 7 and 8: record the batch, store each new line as received, audit.
    await tx.insert(handoverBatches).values({
      batchNo: batch.batchNo,
      checksum: batch.checksum,
      formatVersion: batch.formatVersion,
      preparedAt: batch.preparedAt,
      preparedBy: batch.preparedBy,
      confirmedFrom: batch.confirmedFrom,
      confirmedTo: batch.confirmedTo,
      paymentLines: batch.paymentLines,
      reversalLines: batch.reversalLines,
      paymentTotal: batch.paymentTotal,
      reversalTotal: batch.reversalTotal,
      netTotal: batch.netTotal,
      linesAdded: toAdd.length,
      linesSkipped: lines.length - toAdd.length,
      fileName: file.name,
      fileBytes: Buffer.from(file.bytes),
      importedById: actor.id,
      importedBy: actor.name,
    });
    if (toAdd.length) await tx.insert(handoverLines).values(toAdd.map(toRow));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.handoverImported,
      reference: batch.batchNo,
      details: {
        fileName: file.name,
        checksum: batch.checksum,
        paymentLines: batch.paymentLines,
        reversalLines: batch.reversalLines,
        netTotal: batch.netTotal,
        linesAdded: toAdd.length,
        linesSkipped: lines.length - toAdd.length,
        ...(warnings.length ? { warnings } : {}),
      },
    });
    report = summary("new", outcomes, warnings);
    if (opts.dryRun) throw new DryRunRollback();
  };

  const summary = (status: HandoverReport["status"], outcomes: { l: HandoverLine; outcome: LineOutcome }[], warnings: string[]): HandoverReport => ({
    batchNo: batch.batchNo,
    status,
    preparedAt: batch.preparedAt,
    preparedBy: batch.preparedBy,
    paymentLines: batch.paymentLines,
    reversalLines: batch.reversalLines,
    netTotal: batch.netTotal,
    lines: outcomes.map(({ l, outcome }) => ({ lineId: l.lineId, lineType: l.lineType, payNo: l.payNo, payer: l.payer, amount: l.amount, outcome })),
    added: outcomes.filter((o) => o.outcome === "add").length,
    skipped: outcomes.filter((o) => o.outcome === "held").length,
    warnings,
    ignoredColumns: parsed.ignoredColumns,
  });

  try {
    await db.transaction(run);
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  return report!;
}

function toRow(l: HandoverLine): typeof handoverLines.$inferInsert {
  const { amountKobo: _kobo, ...rest } = l;
  void _kobo;
  return rest;
}

// ---------- Reading ----------

export const HANDOVER_PAGE_SIZE = 50;

export interface HandoverFilters {
  q?: string;
  batch?: string;
  type?: "Payment" | "Reversal";
  page: number;
}

export function linesWhere(f: Omit<HandoverFilters, "page">): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.batch) parts.push(eq(handoverLines.batchNo, f.batch));
  if (f.type) parts.push(eq(handoverLines.lineType, f.type));
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(or(ilike(handoverLines.payNo, like), ilike(handoverLines.payer, like), ilike(handoverLines.rrr, like), ilike(handoverLines.ackNo, like)));
  }
  return parts.length ? and(...parts) : undefined;
}

/** Lines newest batch first, with whether each payment has since been reversed. */
export async function listHandoverLines(db: Db, f: HandoverFilters) {
  const where = linesWhere(f);
  // Qualified by hand: in a single-table query Drizzle leaves the table name off, and the bare
  // column would bind to the subquery's own table.
  const reversed = sql<boolean>`exists (select 1 from handover_lines r where r.line_id = "handover_lines"."pay_no" || ':R')`;
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        lineId: handoverLines.lineId,
        lineType: handoverLines.lineType,
        payNo: handoverLines.payNo,
        batchNo: handoverLines.batchNo,
        dateReceived: handoverLines.dateReceived,
        dateConfirmed: handoverLines.dateConfirmed,
        amount: handoverLines.amount,
        purpose: handoverLines.purpose,
        revenueCode: handoverLines.revenueCode,
        channel: handoverLines.channel,
        rrr: handoverLines.rrr,
        payer: handoverLines.payer,
        paidFor: handoverLines.paidFor,
        category: handoverLines.category,
        reversed,
      })
      .from(handoverLines)
      .where(where)
      .orderBy(desc(handoverLines.batchNo), handoverLines.lineId)
      .limit(HANDOVER_PAGE_SIZE)
      .offset((f.page - 1) * HANDOVER_PAGE_SIZE),
    db
      .select({
        count: sql<number>`count(*)::int`,
        payments: sql<string>`coalesce(sum(${handoverLines.amount}) filter (where ${handoverLines.lineType} = 'Payment'), 0)::text`,
        reversals: sql<string>`coalesce(sum(${handoverLines.amount}) filter (where ${handoverLines.lineType} = 'Reversal'), 0)::text`,
        net: sql<string>`coalesce(sum(${handoverLines.amount}), 0)::text`,
      })
      .from(handoverLines)
      .where(where),
  ]);
  return { rows, totals: totals! };
}

export async function listHandoverBatches(db: Db) {
  return db
    .select({
      batchNo: handoverBatches.batchNo,
      preparedAt: handoverBatches.preparedAt,
      preparedBy: handoverBatches.preparedBy,
      paymentLines: handoverBatches.paymentLines,
      reversalLines: handoverBatches.reversalLines,
      netTotal: handoverBatches.netTotal,
      linesAdded: handoverBatches.linesAdded,
      linesSkipped: handoverBatches.linesSkipped,
      fileName: handoverBatches.fileName,
      importedAt: handoverBatches.importedAt,
      importedBy: handoverBatches.importedBy,
    })
    .from(handoverBatches)
    .orderBy(desc(handoverBatches.importedAt));
}
