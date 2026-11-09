import Decimal from "decimal.js";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { bankStatementTotals, budgetLines, feeHeads, lists, payers, receipts } from "@/db/schema";
import { type AuditActor, AUDIT_ACTIONS, writeAudit } from "./audit";
import { monthsElapsed, sumAmounts } from "./budget";
import { addDays } from "./dates";
import { type AgingBucket, AGING_BUCKETS } from "./demandNotice";
import { allDemandNotices, type DnRow } from "./dn-service";
import { getBudget } from "./fees-service";
import { type MoneyInput, toDecimal } from "./money";

/*
 * Report figures (BUILD_SPEC 4.7-4.9). Revenue counts only Confirmed receipts, placed in the
 * FY by receipt date. Bank recon uses value date and includes Pending (not Reversed).
 * Everything is worked out with decimal.js and returned as strings.
 */

const D0 = () => new Decimal(0);
const str = (d: Decimal) => d.toFixed(2);
/** a / b as a percentage with 2 dp, or null when b is 0. */
export const pct = (a: MoneyInput, b: MoneyInput) => {
  const den = toDecimal(b);
  return den.isZero() ? null : toDecimal(a).div(den).times(100).toFixed(2);
};

export type BudgetRule = "including_current_month" | "completed_months_only";

// ---------- Confirmed revenue for a year ----------

interface RevenueCell {
  month: number;
  code: string;
  category: string;
  revenueType: "IGR" | "Non-IGR";
  budgetLineId: string | null;
  payerId: string;
  total: Decimal;
}

/** Confirmed receipts for the FY, grouped by month, head, category, type, budget line and payer. */
async function confirmedCells(db: Db, fy: number): Promise<RevenueCell[]> {
  const rows = await db
    .select({
      month: sql<number>`extract(month from ${receipts.receiptDate})::int`,
      code: receipts.revenueCode,
      category: receipts.revenueCategory,
      revenueType: receipts.revenueType,
      budgetLineId: receipts.budgetLineId,
      payerId: receipts.payerId,
      total: sql<string>`sum(${receipts.amountPaid})`,
    })
    .from(receipts)
    .where(and(eq(receipts.status, "Confirmed"), sql`extract(year from ${receipts.receiptDate}) = ${fy}`))
    .groupBy(
      sql`extract(month from ${receipts.receiptDate})`,
      receipts.revenueCode,
      receipts.revenueCategory,
      receipts.revenueType,
      receipts.budgetLineId,
      receipts.payerId,
    );
  return rows.map((r) => ({ ...r, month: Number(r.month), total: toDecimal(r.total) }));
}

const sumWhere = <T extends { total: Decimal }>(rows: T[], keep: (r: T) => boolean) =>
  rows.filter(keep).reduce((a, r) => a.plus(r.total), D0());

// ---------- Budget vs actual (BUILD_SPEC 4.8) ----------

export type LineStatus =
  | "Unbudgeted receipts"
  | "No budget set"
  | "Not yet phased"
  | "On / above budget"
  | "Slightly behind"
  | "Behind budget";

/** The workbook's status, checked in the BUILD_SPEC 4.8 order. */
export function lineStatus(budgetFy: MoneyInput, budgetToDate: MoneyInput, actualToDate: MoneyInput, actualFy: MoneyInput): LineStatus {
  const bFy = toDecimal(budgetFy);
  if (bFy.isZero() && toDecimal(actualFy).gt(0)) return "Unbudgeted receipts";
  if (bFy.isZero()) return "No budget set";
  const bTd = toDecimal(budgetToDate);
  if (bTd.isZero()) return "Not yet phased";
  const achieved = toDecimal(actualToDate).div(bTd);
  if (achieved.gte(1)) return "On / above budget";
  if (achieved.gte(0.75)) return "Slightly behind";
  return "Behind budget";
}

export interface BvaFigures {
  budgetFy: string;
  budgetToDate: string;
  actualToDate: string;
  variance: string;
  /** Achieved vs budget to date, %. */
  achievedToDate: string | null;
  actualFy: string;
  /** % of the full-year budget. */
  achievedFy: string | null;
}

export interface BvaLine extends BvaFigures {
  id: string;
  name: string;
  groupName: string;
  status: LineStatus;
  /** Confirmed actual by month, Jan-Dec. */
  monthly: string[];
}

function figures(budgetFy: Decimal, budgetToDate: Decimal, actualToDate: Decimal, actualFy: Decimal): BvaFigures {
  return {
    budgetFy: str(budgetFy),
    budgetToDate: str(budgetToDate),
    actualToDate: str(actualToDate),
    variance: str(actualToDate.minus(budgetToDate)),
    achievedToDate: pct(actualToDate, budgetToDate),
    actualFy: str(actualFy),
    achievedFy: pct(actualFy, budgetFy),
  };
}

export interface BudgetVsActual {
  financialYear: number;
  monthsElapsed: number;
  rule: BudgetRule;
  lines: BvaLine[];
  groups: (BvaFigures & { name: string })[];
  total: BvaFigures;
  /** Phased budget by month (all lines), Jan-Dec. */
  monthlyBudget: string[];
  /** Confirmed FY receipts whose head has no budget line ("Every receipt maps to a budget line"). */
  unmappedCount: number;
  unmappedAmount: string;
}

export async function budgetVsActual(db: Db, fy: number, asAt: string, rule: BudgetRule): Promise<BudgetVsActual> {
  const [cells, budget, unmapped] = await Promise.all([
    confirmedCells(db, fy),
    getBudget(db, fy),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${receipts.amountPaid}), 0)` })
      .from(receipts)
      .where(and(eq(receipts.status, "Confirmed"), isNull(receipts.budgetLineId), sql`extract(year from ${receipts.receiptDate}) = ${fy}`)),
  ]);
  const elapsed = monthsElapsed(fy, asAt, rule);

  // Budget figures are stored to 6 dp (the workbook's phasing). Totals add the exact figures and
  // round once at the end, as the workbook does; adding rounded line totals would drift by kobo.
  const exact = new Map<string, { budgetFy: Decimal; budgetToDate: Decimal; actualToDate: Decimal; actualFy: Decimal }>();
  const lines: BvaLine[] = budget.map((l) => {
    const budgetFy = sumAmounts(l.months);
    const budgetToDate = sumAmounts(l.months.slice(0, elapsed));
    const mine = cells.filter((c) => c.budgetLineId === l.id);
    const actualFy = sumWhere(mine, () => true);
    const actualToDate = sumWhere(mine, (c) => c.month <= elapsed);
    exact.set(l.id, { budgetFy, budgetToDate, actualToDate, actualFy });
    return {
      id: l.id,
      name: l.name,
      groupName: l.groupName,
      ...figures(budgetFy, budgetToDate, actualToDate, actualFy),
      status: lineStatus(budgetFy, budgetToDate, actualToDate, actualFy),
      monthly: Array.from({ length: 12 }, (_, i) => str(sumWhere(mine, (c) => c.month === i + 1))),
    };
  });

  const add = (rows: BvaLine[]) => {
    const s = (k: "budgetFy" | "budgetToDate" | "actualToDate" | "actualFy") =>
      rows.reduce((a, r) => a.plus(exact.get(r.id)![k]), D0());
    return figures(s("budgetFy"), s("budgetToDate"), s("actualToDate"), s("actualFy"));
  };
  const groupNames = [...new Set(lines.map((l) => l.groupName))];

  return {
    financialYear: fy,
    monthsElapsed: elapsed,
    rule,
    lines,
    groups: groupNames.map((name) => ({ name, ...add(lines.filter((l) => l.groupName === name)) })),
    total: add(lines),
    monthlyBudget: Array.from({ length: 12 }, (_, i) => str(sumAmounts(budget.map((l) => l.months[i])))),
    unmappedCount: Number(unmapped[0]?.n ?? 0),
    unmappedAmount: str(toDecimal(unmapped[0]?.total)),
  };
}

// ---------- Monthly summary (BUILD_SPEC 4.9) ----------

export interface SummaryRow {
  key: string;
  label: string;
  /** Jan-Dec. */
  months: string[];
  total: string;
  share: string | null;
}

export interface MonthlySummary {
  financialYear: number;
  heads: (SummaryRow & { code: string; category: string; revenueType: string; budgetLineId: string | null })[];
  categories: SummaryRow[];
  types: SummaryRow[];
  total: SummaryRow;
  budget: SummaryRow;
  /** Category subtotals add up to the head totals, month by month (the workbook's check). */
  reconciles: boolean;
}

export async function monthlySummary(db: Db, fy: number): Promise<MonthlySummary> {
  const [cells, heads, budget] = await Promise.all([
    confirmedCells(db, fy),
    db
      .select({ code: feeHeads.code, head: feeHeads.head, category: feeHeads.category, revenueType: feeHeads.revenueType, budgetLineId: feeHeads.budgetLineId })
      .from(feeHeads)
      .orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code)),
    getBudget(db, fy),
  ]);
  const fyTotal = sumWhere(cells, () => true);
  const row = (key: string, label: string, keep: (c: RevenueCell) => boolean): SummaryRow => {
    const months = Array.from({ length: 12 }, (_, i) => sumWhere(cells, (c) => keep(c) && c.month === i + 1));
    const total = months.reduce((a, m) => a.plus(m), D0());
    return { key, label, months: months.map(str), total: str(total), share: pct(total, fyTotal) };
  };

  // Every fee head, in fee schedule order, plus any code on a receipt that is no longer a head.
  const known = new Set(heads.map((h) => h.code));
  const extra = [...new Set(cells.map((c) => c.code))].filter((c) => !known.has(c));
  const headRows = [
    ...heads.map((h) => ({ ...row(h.code, h.head, (c) => c.code === h.code), code: h.code, category: h.category, revenueType: h.revenueType, budgetLineId: h.budgetLineId })),
    ...extra.map((code) => {
      const c0 = cells.find((c) => c.code === code)!;
      return { ...row(code, code, (c) => c.code === code), code, category: c0.category, revenueType: c0.revenueType, budgetLineId: c0.budgetLineId };
    }),
  ];
  const categoryNames = [...new Set([...heads.map((h) => h.category), ...cells.map((c) => c.category)])];
  const categories = categoryNames.map((name) => row(name, name, (c) => c.category === name));
  const total = row("total", "Total confirmed", () => true);
  const monthlyBudget = Array.from({ length: 12 }, (_, i) => sumAmounts(budget.map((l) => l.months[i])));
  const budgetTotal = monthlyBudget.reduce((a, m) => a.plus(m), D0());

  const reconciles = Array.from({ length: 12 }, (_, i) => i).every((i) =>
    sumAmounts(categories.map((c) => c.months[i])).eq(sumAmounts(headRows.map((h) => h.months[i]))),
  );

  return {
    financialYear: fy,
    heads: headRows,
    categories,
    types: (["IGR", "Non-IGR"] as const).map((t) => row(t, t, (c) => c.revenueType === t)),
    total,
    budget: { key: "budget", label: "Phased budget", months: monthlyBudget.map(str), total: str(budgetTotal), share: null },
    reconciles,
  };
}

// ---------- Arrears (BUILD_SPEC 4.9) ----------

export type OpenBucket = Exclude<AgingBucket, "Cancelled" | "Settled">;
export const OPEN_BUCKETS: OpenBucket[] = AGING_BUCKETS.filter((b): b is OpenBucket => b !== "Cancelled" && b !== "Settled");

export interface ArrearsRow {
  payerId: string;
  name: string;
  category: string | null;
  billed: string;
  paid: string;
  outstanding: string;
  buckets: Record<OpenBucket, string>;
  openNotices: number;
  collectionRate: string | null;
}

/**
 * Per payer: billed and paid on notices that aren't cancelled, outstanding, the five ageing
 * buckets, open notices and collection rate (paid / billed). With an all-payers total.
 */
export function arrearsFromNotices(notices: DnRow[], payerInfo: Map<string, { name: string; category: string | null }>) {
  const byPayer = new Map<string, DnRow[]>();
  for (const n of notices) byPayer.set(n.payerId, [...(byPayer.get(n.payerId) ?? []), n]);
  const build = (payerId: string, name: string, category: string | null, mine: DnRow[]): ArrearsRow => {
    const live = mine.filter((n) => !n.cancelled);
    const billed = sumAmounts(live.map((n) => n.amountBilled));
    const paid = sumAmounts(live.map((n) => n.paidToDate));
    const buckets = Object.fromEntries(
      OPEN_BUCKETS.map((b) => [b, str(sumAmounts(mine.filter((n) => n.agingBucket === b).map((n) => n.outstanding)))]),
    ) as Record<OpenBucket, string>;
    return {
      payerId,
      name,
      category,
      billed: str(billed),
      paid: str(paid),
      outstanding: str(sumAmounts(mine.map((n) => n.outstanding))),
      buckets,
      openNotices: mine.filter((n) => toDecimal(n.outstanding).gt(0)).length,
      collectionRate: pct(paid, billed),
    };
  };
  const rows = [...byPayer.entries()]
    .map(([id, mine]) => {
      const info = payerInfo.get(id);
      return build(id, info?.name ?? mine[0]!.payerName, info?.category ?? null, mine);
    })
    .sort((a, b) => toDecimal(b.outstanding).comparedTo(a.outstanding) || a.payerId.localeCompare(b.payerId));
  return { rows, total: build("", "Total - all payers", null, notices) };
}

export async function arrears(db: Db, asAt: string) {
  const [notices, payerRows] = await Promise.all([
    allDemandNotices(db, asAt),
    db.select({ payerId: payers.payerId, name: payers.name, category: payers.category }).from(payers),
  ]);
  return arrearsFromNotices(notices, new Map(payerRows.map((p) => [p.payerId, p])));
}

// ---------- Dashboard (BUILD_SPEC 4.9, DESIGN.md 3) ----------

export interface Dashboard {
  financialYear: number;
  asAt: string;
  confirmedFy: string;
  igr: string;
  nonIgr: string;
  annualBudget: string;
  budgetToDate: string;
  monthsElapsed: number;
  /** "Achieved vs budget to date" and "Achieved vs full-year budget", % (BUILD_SPEC 4.8). */
  achievedToDate: string | null;
  achievedFy: string | null;
  /** Budget to date as a share of the full year, for the marker on the progress bar. */
  budgetToDateShare: string | null;
  pendingAmount: string;
  pendingCount: number;
  dnOutstanding: string;
  dnOpenCount: number;
  over90Amount: string;
  over90Count: number;
  receiptsFy: number;
  reversedFy: number;
  collectionRate: string | null;
  monthly: { month: number; confirmed: string; budget: string }[];
  categoryMix: { category: string; amount: string; share: string | null }[];
  topPayers: { payerId: string; name: string; amount: string }[];
  ageing: { bucket: OpenBucket; amount: string; count: number; share: string | null }[];
  attention: {
    stalePending: { id: string; receiptNo: string; payerName: string; amountPaid: string; receiptDate: string }[];
    over90: { id: string; dnNo: string; payerName: string; outstanding: string; daysOverdue: number }[];
    noSch3Count: number;
    unbudgeted: { id: string; name: string; actualFy: string }[];
    unmappedCount: number;
  };
}

export async function dashboard(db: Db, fy: number, asAt: string, rule: BudgetRule): Promise<Dashboard> {
  const [cells, bva, notices, pending, recorded, payerRows, noSch3, stale] = await Promise.all([
    confirmedCells(db, fy),
    budgetVsActual(db, fy, asAt, rule),
    allDemandNotices(db, asAt),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${receipts.amountPaid}), 0)` })
      .from(receipts)
      .where(eq(receipts.status, "Pending Confirmation")),
    db
      .select({
        live: sql<number>`(count(*) filter (where ${receipts.status} <> 'Reversed'))::int`,
        reversed: sql<number>`(count(*) filter (where ${receipts.status} = 'Reversed'))::int`,
      })
      .from(receipts)
      .where(sql`extract(year from ${receipts.receiptDate}) = ${fy}`),
    db.select({ payerId: payers.payerId, name: payers.name }).from(payers),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(payers)
      .where(and(eq(payers.active, true), isNull(payers.sch3Category))),
    // Pending more than 3 days (by receipt date) as at the report date.
    db
      .select({ id: receipts.id, receiptNo: receipts.receiptNo, payerName: receipts.payerName, amountPaid: receipts.amountPaid, receiptDate: receipts.receiptDate })
      .from(receipts)
      .where(and(eq(receipts.status, "Pending Confirmation"), sql`${receipts.receiptDate} < ${addDays(asAt, -3)}::date`))
      .orderBy(asc(receipts.receiptDate))
      .limit(5),
  ]);

  const confirmedFy = sumWhere(cells, () => true);
  const live = notices.filter((n) => !n.cancelled);
  const billed = sumAmounts(live.map((n) => n.amountBilled));
  const paidOnNotices = sumAmounts(live.map((n) => n.paidToDate));
  const outstanding = sumAmounts(notices.map((n) => n.outstanding));
  const names = new Map(payerRows.map((p) => [p.payerId, p.name]));

  const byPayer = new Map<string, Decimal>();
  for (const c of cells) byPayer.set(c.payerId, (byPayer.get(c.payerId) ?? D0()).plus(c.total));
  const byCategory = new Map<string, Decimal>();
  for (const c of cells) byCategory.set(c.category, (byCategory.get(c.category) ?? D0()).plus(c.total));

  const over90 = notices.filter((n) => n.agingBucket === "Over 90 days");
  return {
    financialYear: fy,
    asAt,
    confirmedFy: str(confirmedFy),
    igr: str(sumWhere(cells, (c) => c.revenueType === "IGR")),
    nonIgr: str(sumWhere(cells, (c) => c.revenueType === "Non-IGR")),
    annualBudget: bva.total.budgetFy,
    budgetToDate: bva.total.budgetToDate,
    monthsElapsed: bva.monthsElapsed,
    achievedToDate: bva.total.achievedToDate,
    achievedFy: bva.total.achievedFy,
    budgetToDateShare: pct(bva.total.budgetToDate, bva.total.budgetFy),
    pendingAmount: str(toDecimal(pending[0]?.total)),
    pendingCount: Number(pending[0]?.n ?? 0),
    dnOutstanding: str(outstanding),
    dnOpenCount: notices.filter((n) => toDecimal(n.outstanding).gt(0)).length,
    over90Amount: str(sumAmounts(over90.map((n) => n.outstanding))),
    over90Count: over90.length,
    receiptsFy: Number(recorded[0]?.live ?? 0),
    reversedFy: Number(recorded[0]?.reversed ?? 0),
    collectionRate: pct(paidOnNotices, billed),
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      confirmed: str(sumWhere(cells, (c) => c.month === i + 1)),
      budget: bva.monthlyBudget[i]!,
    })),
    categoryMix: [...byCategory.entries()]
      .sort((a, b) => b[1].comparedTo(a[1]))
      .map(([category, amount]) => ({ category, amount: str(amount), share: pct(amount, confirmedFy) })),
    topPayers: [...byPayer.entries()]
      .filter(([, v]) => v.gt(0))
      .sort((a, b) => b[1].comparedTo(a[1]))
      .slice(0, 5)
      .map(([payerId, amount]) => ({ payerId, name: names.get(payerId) ?? payerId, amount: str(amount) })),
    ageing: OPEN_BUCKETS.map((bucket) => {
      const mine = notices.filter((n) => n.agingBucket === bucket);
      const amount = sumAmounts(mine.map((n) => n.outstanding));
      return { bucket, amount: str(amount), count: mine.length, share: pct(amount, outstanding) };
    }),
    attention: {
      stalePending: stale,
      over90: over90
        .sort((a, b) => toDecimal(b.outstanding).comparedTo(a.outstanding))
        .slice(0, 5)
        .map((n) => ({ id: n.id, dnNo: n.dnNo, payerName: n.payerName, outstanding: n.outstanding, daysOverdue: n.daysOverdue })),
      noSch3Count: Number(noSch3[0]?.n ?? 0),
      unbudgeted: bva.lines.filter((l) => l.status === "Unbudgeted receipts").map((l) => ({ id: l.id, name: l.name, actualFy: l.actualFy })),
      unmappedCount: bva.unmappedCount,
    },
  };
}

// ---------- Bank recon (BUILD_SPEC 4.9) ----------

export interface ReconCell {
  register: string;
  /** Null until Finance enters the statement total. */
  statement: string | null;
  /** statement - register, null until a statement total is entered. */
  difference: string | null;
}

export interface BankRecon {
  financialYear: number;
  accounts: string[];
  /** months[m][account] for m = 0..11. */
  months: Record<string, ReconCell>[];
  totals: Record<string, ReconCell>;
  pendingCount: number;
  pendingAmount: string;
}

export async function bankRecon(db: Db, fy: number): Promise<BankRecon> {
  const [listed, register, statements, pending] = await Promise.all([
    db
      .select({ value: lists.value })
      .from(lists)
      .where(and(eq(lists.listName, "Collecting accounts"), eq(lists.active, true)))
      .orderBy(asc(lists.sortOrder)),
    db
      .select({
        account: receipts.collectingAccount,
        month: sql<number>`extract(month from ${receipts.valueDate})::int`,
        total: sql<string>`sum(${receipts.amountPaid})`,
      })
      .from(receipts)
      .where(and(ne(receipts.status, "Reversed"), sql`extract(year from ${receipts.valueDate}) = ${fy}`))
      .groupBy(receipts.collectingAccount, sql`extract(month from ${receipts.valueDate})`),
    db.select().from(bankStatementTotals).where(eq(bankStatementTotals.financialYear, fy)),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<string>`coalesce(sum(${receipts.amountPaid}), 0)` })
      .from(receipts)
      .where(eq(receipts.status, "Pending Confirmation")),
  ]);
  // Active accounts, plus any account that has receipts or a statement this year.
  const accounts = [...new Set([...listed.map((l) => l.value), ...register.map((r) => r.account), ...statements.map((s) => s.collectingAccount)])];

  const cell = (reg: Decimal, stmt: string | null): ReconCell => ({
    register: str(reg),
    statement: stmt === null ? null : str(toDecimal(stmt)),
    difference: stmt === null ? null : str(toDecimal(stmt).minus(reg)),
  });
  const months = Array.from({ length: 12 }, (_, i) =>
    Object.fromEntries(
      accounts.map((acc) => {
        const reg = toDecimal(register.find((r) => r.account === acc && Number(r.month) === i + 1)?.total);
        const stmt = statements.find((s) => s.collectingAccount === acc && s.month === i + 1)?.statementTotal ?? null;
        return [acc, cell(reg, stmt)];
      }),
    ),
  );
  const totals = Object.fromEntries(
    accounts.map((acc) => {
      const reg = sumAmounts(months.map((m) => m[acc]!.register));
      const entered = statements.filter((s) => s.collectingAccount === acc);
      return [acc, cell(reg, entered.length ? str(sumAmounts(entered.map((s) => s.statementTotal))) : null)];
    }),
  );
  return {
    financialYear: fy,
    accounts,
    months,
    totals,
    pendingCount: Number(pending[0]?.n ?? 0),
    pendingAmount: str(toDecimal(pending[0]?.total)),
  };
}

/** Finance enters (or clears, with null) a month's statement total for an account. Audited. */
export async function saveStatementTotal(
  db: Db,
  actor: AuditActor,
  v: { financialYear: number; month: number; collectingAccount: string; statementTotal: string | null },
) {
  return db.transaction(async (tx) => {
    const where = and(
      eq(bankStatementTotals.financialYear, v.financialYear),
      eq(bankStatementTotals.month, v.month),
      eq(bankStatementTotals.collectingAccount, v.collectingAccount),
    );
    const [current] = await tx.select().from(bankStatementTotals).where(where).for("update");
    const old = current ? str(toDecimal(current.statementTotal)) : null;
    const next = v.statementTotal === null ? null : str(toDecimal(v.statementTotal));
    if (old === next) return { changed: false };
    if (next === null) {
      await tx.delete(bankStatementTotals).where(where);
    } else if (current) {
      await tx.update(bankStatementTotals).set({ statementTotal: next, enteredById: actor.id, enteredBy: actor.name, enteredAt: new Date() }).where(where);
    } else {
      await tx.insert(bankStatementTotals).values({ ...v, statementTotal: next, enteredById: actor.id, enteredBy: actor.name });
    }
    await writeAudit(tx, {
      actor,
      action: AUDIT_ACTIONS.statementTotalEntered,
      reference: `FY${v.financialYear} month ${v.month} · ${v.collectingAccount}`,
      details: { changes: { statementTotal: { old, new: next } } },
    });
    return { changed: true };
  });
}

/** Budget line names, for labels. */
export async function budgetLineNames(db: Db) {
  return db.select({ id: budgetLines.id, name: budgetLines.name }).from(budgetLines).orderBy(asc(budgetLines.sortOrder));
}
