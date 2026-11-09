import { and, asc, eq, ilike, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { demandNotices, lists, payers, receipts, sch3RegistrationFees, settings } from "@/db/schema";
import { UserFacingError } from "./action-result";
import { type AuditActor, AUDIT_ACTIONS, diffFields, writeAudit } from "./audit";
import { allocateSerial, formatPayerId } from "./numbering";
import { findNearDuplicates, isSameName, type NearDuplicate } from "./payer-names";
import type { RegistrationStatus } from "./registration";
import type { PayerFilters, PayerValues } from "./validation";

/*
 * Payer derived fields (BUILD_SPEC 4.6), computed on read and never stored:
 *  - total confirmed paid (all years);
 *  - total billed, excluding cancelled notices;
 *  - outstanding = sum of each notice's MAX(0, billed - confirmed paid against it), cancelled = 0;
 *  - registration fee from Schedule 3, registration paid = confirmed REG-{category} receipts;
 *  - registration status, in the BUILD_SPEC order (same rule as registrationStatus()).
 */
function summarySource(db: Db) {
  const confirmed = eq(receipts.status, "Confirmed");

  const paid = db
    .select({ payerId: receipts.payerId, totalPaid: sql<string>`sum(${receipts.amountPaid})`.as("total_paid") })
    .from(receipts)
    .where(confirmed)
    .groupBy(receipts.payerId)
    .as("paid");

  const dnPaid = db
    .select({ dnNo: receipts.dnNo, paid: sql<string>`sum(${receipts.amountPaid})`.as("dn_paid") })
    .from(receipts)
    .where(and(confirmed, isNotNull(receipts.dnNo)))
    .groupBy(receipts.dnNo)
    .as("dnpaid");

  const dnBalance = sql`greatest(0, ${demandNotices.amountBilled} - coalesce(${dnPaid.paid}, 0))`;
  const dnSum = db
    .select({
      payerId: demandNotices.payerId,
      totalBilled: sql<string>`sum(case when ${demandNotices.cancelled} then 0 else ${demandNotices.amountBilled} end)`.as(
        "total_billed",
      ),
      outstanding: sql<string>`sum(case when ${demandNotices.cancelled} then 0 else ${dnBalance} end)`.as("outstanding"),
      openNotices: sql<number>`(count(*) filter (where not ${demandNotices.cancelled} and ${dnBalance} > 0))::int`.as(
        "open_notices",
      ),
    })
    .from(demandNotices)
    .leftJoin(dnPaid, eq(dnPaid.dnNo, demandNotices.dnNo))
    .groupBy(demandNotices.payerId)
    .as("dnsum");

  const regPaid = db
    .select({ payerId: receipts.payerId, regPaid: sql<string>`sum(${receipts.amountPaid})`.as("reg_paid") })
    .from(receipts)
    .innerJoin(payers, eq(payers.payerId, receipts.payerId))
    .where(and(confirmed, sql`${receipts.revenueCode} = 'REG-' || ${payers.sch3Category}`))
    .groupBy(receipts.payerId)
    .as("regpaid");

  const regPaidAmount = sql`coalesce(${regPaid.regPaid}, 0)`;
  const regStatus = sql<RegistrationStatus>`case
      when coalesce(${sch3RegistrationFees.feeNgn}, 0) <= 0 then 'Fee not set'
      when ${regPaidAmount} >= ${sch3RegistrationFees.feeNgn} then 'Registered'
      when ${regPaidAmount} > 0 then 'Part-paid'
      else 'Not registered' end`;

  const fields = {
    payerId: payers.payerId,
    name: payers.name,
    category: payers.category,
    licenceNo: payers.licenceNo,
    licenceStatus: payers.licenceStatus,
    capacityMw: payers.capacityMw,
    revenueBaseNgn: payers.revenueBaseNgn,
    lga: payers.lga,
    address: payers.address,
    contactPerson: payers.contactPerson,
    phone: payers.phone,
    email: payers.email,
    dateRegistered: payers.dateRegistered,
    notes: payers.notes,
    sch3Category: payers.sch3Category,
    expectedRegMonth: payers.expectedRegMonth,
    active: payers.active,
    isSample: payers.isSample,
    createdBy: payers.createdBy,
    createdAt: payers.createdAt,
    totalPaid: sql<string>`coalesce(${paid.totalPaid}, 0)`,
    totalBilled: sql<string>`coalesce(${dnSum.totalBilled}, 0)`,
    outstanding: sql<string>`coalesce(${dnSum.outstanding}, 0)`,
    openNotices: sql<number>`coalesce(${dnSum.openNotices}, 0)`,
    registrationFee: sql<string | null>`${sch3RegistrationFees.feeNgn}`,
    registrationPaid: sql<string>`${regPaidAmount}`,
    registrationStatus: regStatus,
    // Rows matching the filters before paging (one query instead of a separate count).
    totalCount: sql<number>`count(*) over ()`,
  };

  const query = () =>
    db
      .select(fields)
      .from(payers)
      .leftJoin(paid, eq(paid.payerId, payers.payerId))
      .leftJoin(dnSum, eq(dnSum.payerId, payers.payerId))
      .leftJoin(regPaid, eq(regPaid.payerId, payers.payerId))
      .leftJoin(sch3RegistrationFees, eq(sch3RegistrationFees.category, payers.sch3Category))
      .$dynamic();

  return { query, regStatus };
}

export interface PayerSummary {
  payerId: string;
  name: string;
  category: string | null;
  licenceNo: string | null;
  licenceStatus: string | null;
  capacityMw: string | null;
  revenueBaseNgn: string | null;
  lga: string | null;
  address: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  dateRegistered: string | null;
  notes: string | null;
  sch3Category: string | null;
  expectedRegMonth: string | null;
  active: boolean;
  isSample: boolean;
  createdBy: string | null;
  createdAt: Date;
  totalPaid: string;
  totalBilled: string;
  outstanding: string;
  openNotices: number;
  registrationFee: string | null;
  registrationPaid: string;
  registrationStatus: RegistrationStatus;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const PAYERS_PAGE_SIZE = 25;

export async function listPayers(
  db: Db,
  f: PayerFilters,
  pageSize = PAYERS_PAGE_SIZE,
): Promise<{ rows: PayerSummary[]; total: number }> {
  const { query, regStatus } = summarySource(db);
  const where: SQL[] = [];
  if (f.show === "active") where.push(eq(payers.active, true));
  if (f.show === "inactive") where.push(eq(payers.active, false));
  if (f.category) where.push(eq(payers.category, f.category));
  if (f.sch3 === "none") where.push(isNull(payers.sch3Category));
  else if (f.sch3) where.push(eq(payers.sch3Category, f.sch3));
  if (f.reg) where.push(sql`${regStatus} = ${f.reg}`);
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    where.push(or(ilike(payers.name, term), ilike(payers.payerId, term), ilike(payers.licenceNo, term))!);
  }
  const condition = where.length ? and(...where) : undefined;

  const rows = await query()
    .where(condition)
    .orderBy(asc(payers.payerId))
    .limit(pageSize)
    .offset((f.page - 1) * pageSize);
  let total = Number(rows[0]?.totalCount ?? 0);
  if (rows.length === 0 && f.page > 1) {
    // Past the last page: count without paging so the page links still make sense.
    const [first] = await query().where(condition).limit(1);
    total = Number(first?.totalCount ?? 0);
  }
  return { rows: rows.map(normaliseSummary), total };
}

export async function getPayerSummary(db: Db, payerId: string): Promise<PayerSummary | null> {
  const { query } = summarySource(db);
  const [row] = await query().where(eq(payers.payerId, payerId)).limit(1);
  return row ? normaliseSummary(row) : null;
}

export interface PayerNotice {
  id: string;
  dnNo: string;
  issueDate: string;
  revenueCode: string;
  revenueHead: string;
  amountBilled: string;
  cancelled: boolean;
  /** Confirmed receipts against this notice. */
  paid: string;
}

/** A payer's latest demand notices with confirmed paid-to-date (BUILD_SPEC 4.5). */
export async function listPayerNotices(db: Db, payerId: string, limit = 10): Promise<PayerNotice[]> {
  const dnPaid = db
    .select({ dnNo: receipts.dnNo, paid: sql<string>`sum(${receipts.amountPaid})`.as("dn_paid") })
    .from(receipts)
    .where(and(eq(receipts.status, "Confirmed"), eq(receipts.payerId, payerId), isNotNull(receipts.dnNo)))
    .groupBy(receipts.dnNo)
    .as("dnpaid");
  return db
    .select({
      id: demandNotices.id,
      dnNo: demandNotices.dnNo,
      issueDate: demandNotices.issueDate,
      revenueCode: demandNotices.revenueCode,
      revenueHead: demandNotices.revenueHead,
      amountBilled: demandNotices.amountBilled,
      cancelled: demandNotices.cancelled,
      paid: sql<string>`coalesce(${dnPaid.paid}, 0)`,
    })
    .from(demandNotices)
    .leftJoin(dnPaid, eq(dnPaid.dnNo, demandNotices.dnNo))
    .where(eq(demandNotices.payerId, payerId))
    .orderBy(sql`${demandNotices.issueDate} desc`, sql`${demandNotices.dnNo} desc`)
    .limit(limit);
}

function normaliseSummary(
  r: Omit<PayerSummary, "openNotices"> & { openNotices: number | string; totalCount?: number | string },
): PayerSummary {
  const { totalCount: _total, ...rest } = r;
  return { ...rest, openNotices: Number(r.openNotices) };
}

// ---------- Add and edit ----------

/** Thrown when the name looks like an existing payer and the user hasn't confirmed it. */
export class NearDuplicateError extends Error {
  constructor(public readonly matches: NearDuplicate[]) {
    super("This name looks like an existing payer.");
  }
}

const LIST_FIELDS = {
  category: "Payer categories",
  licenceStatus: "Licence status",
  lga: "LGAs",
} as const satisfies Partial<Record<keyof PayerValues, string>>;

/** Each list-backed value must be an active list value, unless it is unchanged on an edit. */
async function assertListValues(tx: Db, values: PayerValues, current?: PayerValues) {
  const errors: Record<string, string> = {};
  for (const [field, listName] of Object.entries(LIST_FIELDS) as [keyof typeof LIST_FIELDS, string][]) {
    const value = values[field];
    if (value === null || value === current?.[field]) continue;
    const [hit] = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.listName, listName), eq(lists.value, value), eq(lists.active, true)))
      .limit(1);
    if (!hit) errors[field] = `Pick a value from the ${listName.toLowerCase()} list.`;
  }
  if (Object.keys(errors).length) throw new UserFacingError("Check the highlighted fields.", errors);
}

async function checkName(tx: Db, name: string, acknowledged: boolean, excludePayerId?: string) {
  // The unique index on lower(name) is the final backstop against a concurrent add of the
  // same name; this check gives the friendly message and the near-duplicate warning.
  const existing = await tx.select({ payerId: payers.payerId, name: payers.name }).from(payers);
  const exact = existing.find((p) => p.payerId !== excludePayerId && isSameName(p.name, name));
  if (exact) {
    throw new UserFacingError("Check the highlighted field.", {
      name: `${exact.payerId} already has this name. Open that payer instead of adding a new one.`,
    });
  }
  const near = findNearDuplicates(name, existing, excludePayerId);
  if (near.length > 0 && !acknowledged) throw new NearDuplicateError(near);
  return near;
}

const toRow = (v: PayerValues) => ({
  name: v.name,
  category: v.category,
  licenceNo: v.licenceNo,
  licenceStatus: v.licenceStatus,
  capacityMw: v.capacityMw,
  revenueBaseNgn: v.revenueBaseNgn,
  lga: v.lga,
  address: v.address,
  contactPerson: v.contactPerson,
  phone: v.phone,
  email: v.email,
  dateRegistered: v.dateRegistered,
  sch3Category: v.sch3Category,
  expectedRegMonth: v.expectedRegMonth,
  notes: v.notes,
});

/** Adds a payer with the next payer ID. Serial, insert and audit share one transaction. */
export async function createPayer(
  db: Db,
  actor: AuditActor,
  values: PayerValues,
  opts: { acknowledgeNearDuplicates: boolean },
): Promise<{ payerId: string; name: string }> {
  return db.transaction(async (tx) => {
    await assertListValues(tx, values);
    const near = await checkName(tx, values.name, opts.acknowledgeNearDuplicates);
    const [s] = await tx.select({ payerPrefix: settings.payerPrefix }).from(settings).where(eq(settings.id, 1));
    if (!s) throw new UserFacingError("Settings are missing. Run the seed script first.");
    const payerId = formatPayerId(s.payerPrefix, await allocateSerial(tx, "payer"));
    await tx.insert(payers).values({
      payerId,
      ...toRow(values),
      createdById: actor.id,
      createdBy: actor.name,
    });
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.payerAdded,
      reference: payerId,
      details: {
        name: values.name,
        category: values.category,
        sch3Category: values.sch3Category,
        ...(near.length ? { similarNamesConfirmed: near.map((n) => `${n.payerId} ${n.name}`) } : {}),
      },
    });
    return { payerId, name: values.name };
  });
}

/** Edits a payer. Only changed fields are audited, with old and new values. */
export async function updatePayer(
  db: Db,
  actor: AuditActor,
  payerId: string,
  values: PayerValues & { active: boolean },
  opts: { acknowledgeNearDuplicates: boolean },
): Promise<{ changed: number; name: string }> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payers).where(eq(payers.payerId, payerId)).for("update");
    if (!current) throw new UserFacingError("That payer no longer exists. Refresh the page.");
    const currentValues = { ...toRow(current as unknown as PayerValues) } as PayerValues;
    await assertListValues(tx, values, currentValues);
    const renamed = values.name !== current.name;
    const near = renamed ? await checkName(tx, values.name, opts.acknowledgeNearDuplicates, payerId) : [];

    const next = { ...toRow(values), active: values.active };
    const changes = diffFields(current as unknown as Record<string, unknown>, next);
    if (Object.keys(changes).length === 0) return { changed: 0, name: current.name };
    await tx.update(payers).set(next).where(eq(payers.payerId, payerId));
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.payerEdited,
      reference: payerId,
      details: {
        changes,
        ...(near.length ? { similarNamesConfirmed: near.map((n) => `${n.payerId} ${n.name}`) } : {}),
      },
    });
    return { changed: Object.keys(changes).length, name: values.name };
  });
}
