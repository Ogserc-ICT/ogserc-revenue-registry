import { and, desc, eq, gte, ilike, inArray, lte, ne, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { demandNotices, feeHeads, licenceFeeBands, lists, payers, receipts, sch3RegistrationFees, settings } from "@/db/schema";
import { UserFacingError } from "./action-result";
import { computeAmount, receiptAmountDue } from "./amount";
import { type AuditActor, AUDIT_ACTIONS, diffFields, writeAudit } from "./audit";
import { lagosToday } from "./dates";
import { getDemandNotice } from "./dn-service";
import { formatAmount, toDecimal } from "./money";
import { allocateSerial, formatReceiptNo } from "./numbering";
import type { ReceiptFilters, ReceiptValues } from "./validation";

export type ReceiptStatus = (typeof receipts.$inferSelect)["status"];

export const STATUS_BY_FILTER = {
  pending: "Pending Confirmation",
  confirmed: "Confirmed",
  reversed: "Reversed",
} as const satisfies Record<string, ReceiptStatus>;

// ---------- Register ----------

/*
 * A payment reference used on more than one receipt (any status, case-insensitive) is shown in
 * red on the register (BUILD_SPEC 5). The table names are written out because Drizzle leaves
 * them off in single-table queries, which would make the inner query compare r2 with itself.
 */
const duplicateRef = sql<boolean>`exists (select 1 from ${receipts} r2
  where lower(r2.payment_ref) = lower("receipts"."payment_ref") and r2.id <> "receipts"."id")`;

export interface ReceiptRow {
  id: string;
  receiptNo: string;
  receiptDate: string;
  payerId: string;
  payerName: string;
  revenueCode: string;
  revenueHead: string;
  dnNo: string | null;
  amountDue: string;
  amountPaid: string;
  channel: string;
  collectingAccount: string;
  paymentRef: string;
  valueDate: string;
  status: ReceiptStatus;
  recordedById: string | null;
  recordedBy: string;
  confirmedBy: string | null;
  isSample: boolean;
  duplicateRef: boolean;
}

export interface ReceiptTotals {
  count: number;
  /** Paid on receipts that aren't reversed. */
  paid: string;
  confirmed: string;
  pendingCount: number;
  pending: string;
  reversedCount: number;
}

export const RECEIPTS_PAGE_SIZE = 25;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The Register's filters as a SQL condition (shared with the Excel export). */
export function receiptWhere(f: ReceiptFilters): SQL | undefined {
  const where: SQL[] = [];
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    where.push(
      or(
        ilike(receipts.receiptNo, term),
        ilike(receipts.payerName, term),
        ilike(receipts.payerId, term),
        ilike(receipts.paymentRef, term),
      )!,
    );
  }
  if (f.status) where.push(eq(receipts.status, STATUS_BY_FILTER[f.status]));
  if (f.payer) where.push(eq(receipts.payerId, f.payer));
  if (f.code) where.push(eq(receipts.revenueCode, f.code));
  if (f.account) where.push(eq(receipts.collectingAccount, f.account));
  if (f.from) where.push(gte(receipts.receiptDate, f.from));
  if (f.to) where.push(lte(receipts.receiptDate, f.to));
  return where.length ? and(...where) : undefined;
}

export async function listReceipts(
  db: Db,
  f: ReceiptFilters,
  pageSize = RECEIPTS_PAGE_SIZE,
): Promise<{ rows: ReceiptRow[]; totals: ReceiptTotals }> {
  const condition = receiptWhere(f);
  const live = sql`${receipts.status} <> 'Reversed'`;
  const select = () =>
    db
      .select({
        id: receipts.id,
        receiptNo: receipts.receiptNo,
        receiptDate: receipts.receiptDate,
        payerId: receipts.payerId,
        payerName: receipts.payerName,
        revenueCode: receipts.revenueCode,
        revenueHead: receipts.revenueHead,
        dnNo: receipts.dnNo,
        amountDue: receipts.amountDue,
        amountPaid: receipts.amountPaid,
        channel: receipts.channel,
        collectingAccount: receipts.collectingAccount,
        paymentRef: receipts.paymentRef,
        valueDate: receipts.valueDate,
        status: receipts.status,
        recordedById: receipts.recordedById,
        recordedBy: receipts.recordedBy,
        confirmedBy: receipts.confirmedBy,
        isSample: receipts.isSample,
        duplicateRef,
        wCount: sql<number>`count(*) over ()`,
        wPaid: sql<string>`coalesce(sum(case when ${live} then ${receipts.amountPaid} else 0 end) over (), 0)`,
        wConfirmed: sql<string>`coalesce(sum(case when ${receipts.status} = 'Confirmed' then ${receipts.amountPaid} else 0 end) over (), 0)`,
        wPendingCount: sql<number>`count(*) filter (where ${receipts.status} = 'Pending Confirmation') over ()`,
        wPending: sql<string>`coalesce(sum(case when ${receipts.status} = 'Pending Confirmation' then ${receipts.amountPaid} else 0 end) over (), 0)`,
        wReversedCount: sql<number>`count(*) filter (where ${receipts.status} = 'Reversed') over ()`,
      })
      .from(receipts)
      .where(condition)
      .orderBy(desc(receipts.receiptDate), desc(receipts.receiptNo))
      .limit(pageSize);

  const rows = await select().offset((f.page - 1) * pageSize);
  const first = rows[0] ?? (f.page > 1 ? (await select())[0] : undefined);
  return {
    rows: rows.map(({ wCount: _a, wPaid: _b, wConfirmed: _c, wPendingCount: _d, wPending: _e, wReversedCount: _f, ...r }) => ({
      ...r,
      duplicateRef: Boolean(r.duplicateRef),
    })),
    totals: {
      count: Number(first?.wCount ?? 0),
      paid: String(first?.wPaid ?? "0"),
      confirmed: String(first?.wConfirmed ?? "0"),
      pendingCount: Number(first?.wPendingCount ?? 0),
      pending: String(first?.wPending ?? "0"),
      reversedCount: Number(first?.wReversedCount ?? 0),
    },
  };
}

export type ReceiptRecord = typeof receipts.$inferSelect & { duplicateRef: boolean };

export async function getReceipt(db: Db, id: string): Promise<ReceiptRecord | null> {
  const [row] = await db
    .select({ r: receipts, duplicateRef })
    .from(receipts)
    .where(eq(receipts.id, id))
    .limit(1);
  return row ? { ...row.r, duplicateRef: Boolean(row.duplicateRef) } : null;
}

/** A live (not reversed) receipt with this payment reference, ignoring case. */
export async function findLiveRef(db: Db, ref: string, excludeId?: string) {
  const [hit] = await db
    .select({ id: receipts.id, receiptNo: receipts.receiptNo })
    .from(receipts)
    .where(
      and(
        sql`lower(${receipts.paymentRef}) = lower(${ref.trim()})`,
        ne(receipts.status, "Reversed"),
        excludeId ? ne(receipts.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  return hit ?? null;
}

// ---------- Record and edit ----------

/** The demand notice is for a different revenue head; the officer must confirm (BUILD_SPEC 4.3). */
export class CodeMismatchError extends Error {
  constructor(
    public readonly dnNo: string,
    public readonly dnCode: string,
    public readonly receiptCode: string,
  ) {
    super(`Demand notice ${dnNo} is for ${dnCode}, not ${receiptCode}.`);
  }
}

interface Prepared {
  row: Omit<typeof receipts.$inferInsert, "receiptNo" | "status" | "recordedBy" | "recordedById">;
  /** Paid is more than the notice's outstanding balance: allowed, but worth knowing. */
  overpaysNotice: string | null;
}

async function inActiveList(tx: Db, listName: string, value: string, current?: string) {
  if (value === current) return true;
  const [hit] = await tx
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.listName, listName), eq(lists.value, value), eq(lists.active, true)))
    .limit(1);
  return Boolean(hit);
}

/**
 * Every BUILD_SPEC 4.3 check, collected so the form can list all the problems at once. Works
 * out the amount due on the server (override, then the notice's balance, then the computed
 * amount, then the amount paid) and takes the snapshots that keep history fixed.
 */
/**
 * Registration is a one-off payment (owner's decision, Nov 2026). For a registration head
 * (REG-A..K), returns the payer's existing registration receipts if they already cover this
 * head's Schedule 3 fee; null when another receipt is allowed. Pending and confirmed receipts
 * both count, so a second receipt can't slip in while the first awaits confirmation; reversed
 * ones don't, so a mistaken receipt can be reversed and recorded again. Part payments are
 * allowed until the fee is covered.
 */
export async function registrationAlreadyPaid(tx: Db, payerId: string, feeCode: string, excludeReceiptId?: string) {
  const [sch3] = await tx
    .select({ feeNgn: sch3RegistrationFees.feeNgn })
    .from(sch3RegistrationFees)
    .where(eq(sch3RegistrationFees.revenueCode, feeCode));
  if (!sch3 || toDecimal(sch3.feeNgn).lte(0)) return null;
  const existing = await tx
    .select({ receiptNo: receipts.receiptNo, amountPaid: receipts.amountPaid })
    .from(receipts)
    .innerJoin(sch3RegistrationFees, eq(sch3RegistrationFees.revenueCode, receipts.revenueCode))
    .where(
      and(
        eq(receipts.payerId, payerId),
        ne(receipts.status, "Reversed"),
        excludeReceiptId ? ne(receipts.id, excludeReceiptId) : undefined,
      ),
    )
    .orderBy(receipts.receiptNo);
  const paid = existing.reduce((a, r) => a.plus(r.amountPaid), toDecimal(0));
  return paid.gte(sch3.feeNgn) ? { paid: paid.toFixed(2), receiptNos: existing.map((r) => r.receiptNo) } : null;
}

async function prepare(
  tx: Db,
  v: ReceiptValues,
  opts: { acknowledgeCodeMismatch: boolean; excludeId?: string; current?: typeof receipts.$inferSelect },
): Promise<Prepared> {
  const errors: Record<string, string> = {};
  const [payer] = await tx.select().from(payers).where(eq(payers.payerId, v.payerId));
  if (!payer) errors.payerId = "The payer doesn't exist. Add the payer first.";
  else if (!payer.active && payer.payerId !== opts.current?.payerId) errors.payerId = "That payer is inactive. Reactivate it on Payers first.";
  const [fee] = await tx.select().from(feeHeads).where(eq(feeHeads.code, v.feeCode));
  if (!fee) errors.feeCode = "That revenue head doesn't exist. Pick one from the list.";
  else if (!fee.active && fee.code !== opts.current?.revenueCode) errors.feeCode = "That revenue head is inactive.";

  if (!(await inActiveList(tx, "Payment channels", v.channel, opts.current?.channel))) {
    errors.channel = "Select the payment channel from the list.";
  }
  if (!(await inActiveList(tx, "Collecting accounts", v.collectingAccount, opts.current?.collectingAccount))) {
    errors.collectingAccount = "Select the bank / collecting account from the list.";
  }
  const dup = await findLiveRef(tx, v.paymentRef, opts.excludeId);
  if (dup) {
    errors.paymentRef = `Payment reference ${v.paymentRef} is already in the register on ${dup.receiptNo} (possible duplicate).`;
  }

  let dn: Awaited<ReturnType<typeof getDemandNotice>> = null;
  if (v.dnNo) {
    const [hit] = await tx.select({ id: demandNotices.id }).from(demandNotices).where(eq(demandNotices.dnNo, v.dnNo));
    dn = hit ? await getDemandNotice(tx, hit.id, lagosToday()) : null;
    if (!dn) errors.dnNo = `Demand notice ${v.dnNo} was not found.`;
    else if (dn.payerId !== v.payerId) errors.dnNo = `Demand notice ${v.dnNo} was issued to a different payer.`;
    else if (dn.cancelled) errors.dnNo = `Demand notice ${v.dnNo} has been cancelled.`;
  }

  if (payer && fee) {
    const registered = await registrationAlreadyPaid(tx, payer.payerId, fee.code, opts.excludeId);
    if (registered) {
      errors.feeCode =
        `${payer.name} has already registered: ₦${formatAmount(registered.paid)} paid on ${registered.receiptNos.join(", ")}. ` +
        "Registration is a one-off payment, so a second registration receipt can't be recorded.";
    }
  }

  if (Object.keys(errors).length || !payer || !fee) {
    throw new UserFacingError("Receipt not saved. Fix the following:", errors);
  }
  if (dn && dn.revenueCode !== fee.code && !opts.acknowledgeCodeMismatch) {
    throw new CodeMismatchError(dn.dnNo, dn.revenueCode, fee.code);
  }

  const [s] = await tx.select().from(settings).where(eq(settings.id, 1));
  const bands = fee.basis === "MW Band" ? await tx.select().from(licenceFeeBands).where(eq(licenceFeeBands.code, fee.code)) : [];
  const result = computeAmount({
    fee,
    bands,
    usdNgnRate: s!.usdNgnRate,
    payerCapacityMw: payer.capacityMw,
    payerRevenueBaseNgn: payer.revenueBaseNgn,
    quantity: v.quantity,
    override: v.overrideDue,
    form: "receipt",
  });
  // A receipt against a notice is due the notice's balance. Only confirmed receipts count
  // towards that balance, so a pending receipt being edited never counts against itself.
  const amountDue = receiptAmountDue({
    result,
    dnSelected: Boolean(dn),
    dnOutstanding: dn?.outstanding ?? null,
    amountPaid: v.amountPaid,
  })!;
  const paid = toDecimal(v.amountPaid);
  const overpaysNotice = dn && paid.gt(dn.outstanding) ? paid.minus(dn.outstanding).toFixed(2) : null;

  return {
    row: {
      receiptDate: v.receiptDate,
      payerId: payer.payerId,
      payerName: payer.name,
      payerCategory: payer.category,
      revenueCode: fee.code,
      revenueHead: fee.head,
      revenueCategory: fee.category,
      revenueType: fee.revenueType,
      budgetLineId: fee.budgetLineId,
      dnNo: dn?.dnNo ?? null,
      period: v.period,
      basisQty: fee.basis === "MW Band" ? (result.bandMw?.toString() ?? null) : v.quantity,
      rateUsed: result.rateNgn?.toDecimalPlaces(6).toString() ?? null,
      fxUsed: result.fxUsed?.toString() ?? null,
      amountDue: amountDue.toFixed(2),
      amountPaid: paid.toFixed(2),
      channel: v.channel,
      collectingAccount: v.collectingAccount,
      paymentRef: v.paymentRef.trim(),
      valueDate: v.valueDate ?? v.receiptDate,
      remarks: v.remarks,
    },
    overpaysNotice,
  };
}

/** Postgres refused a second live receipt with this reference (a concurrent save beat this one). */
export function isDuplicateRefViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = e?.cause ?? e;
  return c?.code === "23505" && (c.constraint_name ?? "").includes("receipts_payment_ref_live_uq");
}

/**
 * Records a receipt (BUILD_SPEC 4.3). Pending Confirmation unless auto-confirm is on, in which
 * case it is Confirmed by "<user> (auto)". Serial, insert and audit share one transaction.
 */
export async function recordReceipt(
  db: Db,
  actor: AuditActor,
  v: ReceiptValues,
  opts: { acknowledgeCodeMismatch: boolean },
) {
  return db.transaction(async (tx) => {
    const { row, overpaysNotice } = await prepare(tx, v, opts);
    const [s] = await tx.select().from(settings).where(eq(settings.id, 1));
    const auto = s!.autoConfirm;
    const status: ReceiptStatus = auto ? "Confirmed" : "Pending Confirmation";
    const receiptNo = formatReceiptNo(s!.receiptPrefix, Number(v.receiptDate.slice(0, 4)), await allocateSerial(tx, "receipt"));
    const [saved] = await tx
      .insert(receipts)
      .values({
        ...row,
        receiptNo,
        status,
        recordedById: actor.id,
        recordedBy: actor.name,
        ...(auto ? { confirmedById: actor.id, confirmedBy: `${actor.name} (auto)`, confirmedAt: new Date() } : {}),
      })
      .returning({ id: receipts.id });
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.receiptRecorded,
      reference: receiptNo,
      details: {
        payer: `${row.payerId} ${row.payerName}`,
        code: row.revenueCode,
        amountPaid: row.amountPaid,
        amountDue: row.amountDue,
        status,
        ...(row.dnNo ? { dnNo: row.dnNo } : {}),
        ...(opts.acknowledgeCodeMismatch && row.dnNo ? { revenueCodeDiffersFromNotice: true } : {}),
        ...(overpaysNotice ? { overpaysNoticeBy: overpaysNotice } : {}),
      },
    });
    return { id: saved!.id, receiptNo, status, amountPaid: row.amountPaid, overpaysNotice };
  });
}

/**
 * Edits a pending receipt (BUILD_SPEC 4.4): only the person who recorded it, only before
 * Finance confirms it. Confirmed and reversed receipts can never be edited. The receipt number
 * keeps its year, so the receipt date has to stay in that year.
 */
export async function updatePendingReceipt(
  db: Db,
  actor: AuditActor,
  id: string,
  v: ReceiptValues,
  opts: { acknowledgeCodeMismatch: boolean },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(receipts).where(eq(receipts.id, id)).for("update");
    if (!current) throw new UserFacingError("That receipt no longer exists. Refresh the page.");
    if (current.status !== "Pending Confirmation") {
      throw new UserFacingError(`Receipt ${current.receiptNo} is ${current.status.toLowerCase()} and can't be edited. A confirmed receipt can only be reversed.`);
    }
    if (!actor.id || current.recordedById !== actor.id) {
      throw new UserFacingError("Only the person who recorded this receipt can edit it.");
    }
    if (v.receiptDate.slice(0, 4) !== current.receiptDate.slice(0, 4)) {
      throw new UserFacingError("Check the highlighted field.", {
        receiptDate: `Keep the receipt date in ${current.receiptDate.slice(0, 4)}: the receipt number includes the year.`,
      });
    }
    const { row, overpaysNotice } = await prepare(tx, v, { ...opts, excludeId: id, current });
    const changes = diffFields(current as unknown as Record<string, unknown>, row as Record<string, unknown>);
    if (Object.keys(changes).length === 0) return { changed: 0, receiptNo: current.receiptNo };
    await tx.update(receipts).set(row).where(eq(receipts.id, id));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.receiptEdited,
      reference: current.receiptNo,
      details: { changes, ...(overpaysNotice ? { overpaysNoticeBy: overpaysNotice } : {}) },
    });
    return { changed: Object.keys(changes).length, receiptNo: current.receiptNo };
  });
}

// ---------- Confirm and reverse ----------

/**
 * Finance confirms receipts against the bank or TSA statement (BUILD_SPEC 4.4). Only Pending
 * receipts change. Nobody can confirm a receipt they recorded themselves: that is enforced
 * here, on the server (BUILD_SPEC 2). One audit entry per receipt.
 */
export async function confirmReceipts(db: Db, actor: AuditActor, ids: string[]) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: receipts.id, receiptNo: receipts.receiptNo, status: receipts.status, recordedById: receipts.recordedById, amountPaid: receipts.amountPaid })
      .from(receipts)
      .where(inArray(receipts.id, ids))
      .for("update");
    const now = new Date();
    const confirmedIds: string[] = [];
    let notPending = 0;
    let ownReceipts = 0;
    for (const r of rows) {
      if (r.status !== "Pending Confirmation") {
        notPending++;
        continue;
      }
      if (actor.id && r.recordedById === actor.id) {
        ownReceipts++;
        continue;
      }
      await tx
        .update(receipts)
        .set({ status: "Confirmed", confirmedById: actor.id, confirmedBy: actor.name, confirmedAt: now })
        .where(eq(receipts.id, r.id));
      await writeAudit(tx, {
        actor,
        action: AUDIT_ACTIONS.receiptConfirmed,
        reference: r.receiptNo,
        details: { amountPaid: formatAmount(r.amountPaid) },
      });
      confirmedIds.push(r.id);
    }
    return { confirmed: confirmedIds.length, confirmedIds, notPending, ownReceipts, missing: ids.length - rows.length };
  });
}

/**
 * Finance reverses receipts (BUILD_SPEC 4.4). A reason is required. Reversed receipts stay on
 * the register, struck through, and drop out of every total. One audit entry per receipt.
 */
export async function reverseReceipts(db: Db, actor: AuditActor, ids: string[], reason: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: receipts.id, receiptNo: receipts.receiptNo, status: receipts.status, amountPaid: receipts.amountPaid })
      .from(receipts)
      .where(inArray(receipts.id, ids))
      .for("update");
    const now = new Date();
    const reversedIds: string[] = [];
    for (const r of rows) {
      if (r.status === "Reversed") continue;
      await tx
        .update(receipts)
        .set({ status: "Reversed", reversedById: actor.id, reversedBy: actor.name, reversedAt: now, reverseReason: reason })
        .where(eq(receipts.id, r.id));
      await writeAudit(tx, {
        actor,
        action: AUDIT_ACTIONS.receiptReversed,
        reference: r.receiptNo,
        details: { reason, previousStatus: r.status, amountPaid: formatAmount(r.amountPaid) },
      });
      reversedIds.push(r.id);
    }
    return { reversed: reversedIds.length, reversedIds, skipped: ids.length - reversedIds.length };
  });
}
