import { and, desc, eq, gte, ilike, inArray, isNotNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { demandNotices, feeHeads, licenceFeeBands, payers, receipts, settings } from "@/db/schema";
import { UserFacingError } from "./action-result";
import { computeAmount } from "./amount";
import { type AuditActor, AUDIT_ACTIONS, writeAudit } from "./audit";
import type { AgingBucket, DnStatus } from "./demandNotice";
import { formatAmount } from "./money";
import { allocateSerial, formatDnNo } from "./numbering";
import type { DnFilters, IssueDnValues } from "./validation";

/*
 * Demand notice derived fields in SQL (BUILD_SPEC 4.5), so the register can filter and page on
 * status and ageing. Same rules as deriveDemandNotice() in demandNotice.ts; tests check they agree.
 */
function derivedSource(db: Db, asAt: string) {
  const dnPaid = db
    .select({ dnNo: receipts.dnNo, paid: sql<string>`sum(${receipts.amountPaid})`.as("dn_paid") })
    .from(receipts)
    .where(and(eq(receipts.status, "Confirmed"), isNotNull(receipts.dnNo)))
    .groupBy(receipts.dnNo)
    .as("dnpaid");

  const asAtDate = sql`${asAt}::date`;
  const paid = sql<string>`coalesce(${dnPaid.paid}, 0)`;
  const outstanding = sql<string>`(case when ${demandNotices.cancelled} then 0
      else greatest(0, ${demandNotices.amountBilled} - ${paid}) end)`;
  const days = sql<number>`(case when ${outstanding} > 0 and ${asAtDate} > ${demandNotices.dueDate}
      then (${asAtDate} - ${demandNotices.dueDate}) else 0 end)`;
  const bucket = sql<AgingBucket>`(case
      when ${demandNotices.cancelled} then 'Cancelled'
      when ${outstanding} <= 0 then 'Settled'
      when ${days} = 0 then 'Not yet due'
      when ${days} <= 30 then '1-30 days'
      when ${days} <= 60 then '31-60 days'
      when ${days} <= 90 then '61-90 days'
      else 'Over 90 days' end)`;
  const status = sql<DnStatus>`(case
      when ${demandNotices.cancelled} then 'Cancelled'
      when ${outstanding} <= 0 then 'Paid'
      when ${paid} > 0 then (case when ${days} > 0 then 'Part-paid (overdue)' else 'Part-paid' end)
      else (case when ${days} > 0 then 'Overdue' else 'Unpaid' end) end)`;

  const fields = {
    id: demandNotices.id,
    dnNo: demandNotices.dnNo,
    issueDate: demandNotices.issueDate,
    dueDate: demandNotices.dueDate,
    payerId: demandNotices.payerId,
    payerName: demandNotices.payerName,
    revenueCode: demandNotices.revenueCode,
    revenueHead: demandNotices.revenueHead,
    period: demandNotices.period,
    basisQty: demandNotices.basisQty,
    rateUsed: demandNotices.rateUsed,
    fxUsed: demandNotices.fxUsed,
    amountBilled: demandNotices.amountBilled,
    paymentTermsDays: demandNotices.paymentTermsDays,
    cancelled: demandNotices.cancelled,
    cancelledBy: demandNotices.cancelledBy,
    cancelledAt: demandNotices.cancelledAt,
    cancelReason: demandNotices.cancelReason,
    issuedBy: demandNotices.issuedBy,
    remarks: demandNotices.remarks,
    isSample: demandNotices.isSample,
    createdAt: demandNotices.createdAt,
    paidToDate: paid,
    outstanding,
    daysOverdue: sql<number>`${days}::int`,
    agingBucket: bucket,
    status,
  };

  const query = (extra: Record<string, SQL> = {}) =>
    db
      .select({ ...fields, ...extra })
      .from(demandNotices)
      .leftJoin(dnPaid, eq(dnPaid.dnNo, demandNotices.dnNo))
      .$dynamic();

  return { query, outstanding, status, bucket };
}

export interface DnRow {
  id: string;
  dnNo: string;
  issueDate: string;
  dueDate: string | null;
  payerId: string;
  payerName: string;
  revenueCode: string;
  revenueHead: string;
  period: string | null;
  basisQty: string | null;
  rateUsed: string | null;
  fxUsed: string | null;
  amountBilled: string;
  paymentTermsDays: number;
  cancelled: boolean;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  issuedBy: string;
  remarks: string | null;
  isSample: boolean;
  createdAt: Date;
  paidToDate: string;
  outstanding: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
  status: DnStatus;
}

export interface DnTotals {
  count: number;
  /** Billed on notices that aren't cancelled. */
  billed: string;
  paid: string;
  outstanding: string;
  openCount: number;
}

export const DN_PAGE_SIZE = 25;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The register: filtered, newest first, paged, with totals across every matching notice. */
export async function listDemandNotices(
  db: Db,
  f: DnFilters,
  asAt: string,
  pageSize = DN_PAGE_SIZE,
): Promise<{ rows: DnRow[]; totals: DnTotals }> {
  const { query, outstanding, status, bucket } = derivedSource(db, asAt);
  const where: SQL[] = [];
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    where.push(
      or(ilike(demandNotices.dnNo, term), ilike(demandNotices.payerName, term), ilike(demandNotices.payerId, term))!,
    );
  }
  if (f.status === "open") where.push(sql`${outstanding} > 0`);
  else if (f.status) where.push(sql`${status} = ${f.status}`);
  if (f.bucket) where.push(sql`${bucket} = ${f.bucket}`);
  if (f.payer) where.push(eq(demandNotices.payerId, f.payer));
  if (f.code) where.push(eq(demandNotices.revenueCode, f.code));
  if (f.from) where.push(gte(demandNotices.issueDate, f.from));
  if (f.to) where.push(lte(demandNotices.issueDate, f.to));
  const condition = where.length ? and(...where) : undefined;

  // Window aggregates give the totals for every matching row in the same query as the page.
  const windowed = {
    wCount: sql<number>`count(*) over ()`,
    wBilled: sql<string>`sum(case when ${demandNotices.cancelled} then 0 else ${demandNotices.amountBilled} end) over ()`,
    wPaid: sql<string>`sum(case when ${demandNotices.cancelled} then 0 else coalesce(dnpaid.dn_paid, 0) end) over ()`,
    wOutstanding: sql<string>`sum(${outstanding}) over ()`,
    wOpen: sql<number>`count(*) filter (where ${outstanding} > 0) over ()`,
  };
  const page = async (p: number) =>
    query(windowed)
      .where(condition)
      .orderBy(desc(demandNotices.issueDate), desc(demandNotices.dnNo))
      .limit(pageSize)
      .offset((p - 1) * pageSize);

  const rows = await page(f.page);
  // The window columns aren't in the inferred row type, so read them as a plain record.
  let totalsSource: Record<string, unknown> | undefined = rows[0];
  // Past the last page: read the totals from page 1 so the summary still makes sense.
  if (!totalsSource && f.page > 1) totalsSource = (await page(1))[0];
  const totals: DnTotals = {
    count: Number(totalsSource?.wCount ?? 0),
    billed: String(totalsSource?.wBilled ?? "0"),
    paid: String(totalsSource?.wPaid ?? "0"),
    outstanding: String(totalsSource?.wOutstanding ?? "0"),
    openCount: Number(totalsSource?.wOpen ?? 0),
  };
  return { rows: rows.map(toRow), totals };
}

function toRow(r: Record<string, unknown>): DnRow {
  const { wCount: _a, wBilled: _b, wPaid: _c, wOutstanding: _d, wOpen: _e, ...rest } = r;
  return { ...(rest as unknown as DnRow), daysOverdue: Number(rest.daysOverdue) };
}

export async function getDemandNotice(db: Db, id: string, asAt: string): Promise<DnRow | null> {
  const { query } = derivedSource(db, asAt);
  const [row] = await query({}).where(eq(demandNotices.id, id)).limit(1);
  return row ? toRow(row) : null;
}

/** Open (outstanding > 0) notices for a payer, oldest first: for the receipt form's DN picker. */
export async function openNoticesForPayer(db: Db, payerId: string, asAt: string): Promise<DnRow[]> {
  const { query, outstanding } = derivedSource(db, asAt);
  const rows = await query({})
    .where(and(eq(demandNotices.payerId, payerId), sql`${outstanding} > 0`))
    .orderBy(demandNotices.issueDate, demandNotices.dnNo);
  return rows.map(toRow);
}

// ---------- Issue ----------

/**
 * Issues a demand notice. The amount is worked out again here from the fee schedule, bands and
 * FX rate (never trusted from the browser); an override wins. Serial, insert and audit share
 * one transaction, so a failed save never uses up a number.
 */
export async function issueDemandNotice(db: Db, actor: AuditActor, v: IssueDnValues) {
  return db.transaction(async (tx) => {
    const errors: Record<string, string> = {};
    const [payer] = await tx.select().from(payers).where(eq(payers.payerId, v.payerId));
    if (!payer) errors.payerId = "That payer doesn't exist. Pick one from the list.";
    else if (!payer.active) errors.payerId = "That payer is inactive. Reactivate it on Payers first.";
    const [fee] = await tx.select().from(feeHeads).where(eq(feeHeads.code, v.feeCode));
    if (!fee) errors.feeCode = "That revenue head doesn't exist. Pick one from the list.";
    else if (!fee.active) errors.feeCode = "That revenue head is inactive.";
    if (Object.keys(errors).length || !payer || !fee) {
      throw new UserFacingError("Demand notice not issued. Fix the highlighted fields.", errors);
    }

    const [s] = await tx.select().from(settings).where(eq(settings.id, 1));
    if (!s) throw new UserFacingError("Settings are missing. Run the seed script first.");
    const bands =
      fee.basis === "MW Band"
        ? await tx.select().from(licenceFeeBands).where(eq(licenceFeeBands.code, fee.code))
        : [];
    const result = computeAmount({
      fee,
      bands,
      usdNgnRate: s.usdNgnRate,
      payerCapacityMw: payer.capacityMw,
      payerRevenueBaseNgn: payer.revenueBaseNgn,
      quantity: v.quantity,
      override: v.override,
    });
    if (!result.amount || result.amount.lte(0)) {
      throw new UserFacingError("Demand notice not issued. Fix the highlighted fields.", {
        override: "The amount could not be computed. Enter it in Override amount.",
      });
    }

    const serial = await allocateSerial(tx, "dn");
    const dnNo = formatDnNo(s.dnPrefix, Number(v.issueDate.slice(0, 4)), serial);
    const amountBilled = result.amount.toFixed(2);
    const [row] = await tx
      .insert(demandNotices)
      .values({
        dnNo,
        issueDate: v.issueDate,
        payerId: payer.payerId,
        payerName: payer.name,
        revenueCode: fee.code,
        revenueHead: fee.head,
        period: v.period,
        basisQty: fee.basis === "MW Band" ? (result.bandMw?.toString() ?? null) : v.quantity,
        rateUsed: result.rateNgn?.toDecimalPlaces(6).toString() ?? null,
        fxUsed: result.fxUsed?.toString() ?? null,
        amountBilled,
        paymentTermsDays: v.paymentTermsDays,
        issuedById: actor.id,
        issuedBy: actor.name,
        remarks: v.remarks,
      })
      .returning({ id: demandNotices.id, dueDate: demandNotices.dueDate });
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.dnIssued,
      reference: dnNo,
      details: {
        payer: `${payer.payerId} ${payer.name}`,
        code: fee.code,
        amount: amountBilled,
        amountSource: result.source,
        ...(result.source === "override" && result.computed ? { computedAmount: result.computed.toFixed(2) } : {}),
        dueDate: row?.dueDate,
      },
    });
    return { id: row!.id, dnNo, amountBilled, dueDate: row!.dueDate };
  });
}

// ---------- Cancel ----------

/**
 * Cancels notices (Finance/Admin). Already-cancelled ones are skipped, as in the workbook.
 * One audit entry per notice cancelled, all in one transaction.
 */
export async function cancelDemandNotices(db: Db, actor: AuditActor, ids: string[], reason: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: demandNotices.id,
        dnNo: demandNotices.dnNo,
        cancelled: demandNotices.cancelled,
        amountBilled: demandNotices.amountBilled,
      })
      .from(demandNotices)
      .where(inArray(demandNotices.id, ids))
      .for("update");
    const now = new Date();
    let cancelled = 0;
    for (const r of rows) {
      if (r.cancelled) continue;
      await tx
        .update(demandNotices)
        .set({ cancelled: true, cancelledById: actor.id, cancelledBy: actor.name, cancelledAt: now, cancelReason: reason })
        .where(eq(demandNotices.id, r.id));
      await writeAudit(tx, {
        actor,
        action: AUDIT_ACTIONS.dnCancelled,
        reference: r.dnNo,
        details: { reason, amountBilled: formatAmount(r.amountBilled) },
      });
      cancelled++;
    }
    return { cancelled, skipped: ids.length - cancelled };
  });
}
