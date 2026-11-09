import "server-only";
import { asc, desc } from "drizzle-orm";
import type ExcelJS from "exceljs";
import { db } from "@/db";
import * as t from "@/db/schema";
import { MONTH_LABELS } from "./budget";
import { listDemandNotices } from "./dn-service";
import { addSheet, newWorkbook, type SheetColumn } from "./excel";
import type { Capability } from "./permissions";
import { receiptWhere } from "./receipt-service";
import { arrears, bankRecon, budgetVsActual, monthlySummary, OPEN_BUCKETS } from "./reports-service";
import { getAsAt, getSettings } from "./settings-server";
import { dnFilterSchema, receiptFilterSchema } from "./validation";

/*
 * Excel exports (BUILD_SPEC 5 and 6). Each one names the capability needed to download it; the
 * route checks it and audits the download. "Everything" is Admin only and replaces the
 * workbook's Backup Copy.
 */

export interface ExportResult {
  workbook: ExcelJS.Workbook;
  filename: string;
  /** Rows written, for the audit entry. */
  rows: number;
}

export interface ExportDef {
  capability: Capability;
  build: (q: URLSearchParams, fy: number) => Promise<ExportResult>;
}

const params = (q: URLSearchParams) => Object.fromEntries([...q.entries()].filter(([, v]) => v !== ""));
const stamp = () => new Date().toISOString().slice(0, 10);

async function exportRegister(q: URLSearchParams): Promise<ExportResult> {
  const f = receiptFilterSchema.parse(params(q));
  const rows = await db.select().from(t.receipts).where(receiptWhere(f)).orderBy(desc(t.receipts.receiptDate), desc(t.receipts.receiptNo));
  type R = (typeof rows)[number];
  const cols: SheetColumn<R>[] = [
    { header: "Receipt No", width: 24, value: (r) => r.receiptNo },
    { header: "Receipt date", type: "date", width: 13, value: (r) => r.receiptDate },
    { header: "Payer ID", width: 12, value: (r) => r.payerId },
    { header: "Payer", width: 36, value: (r) => r.payerName },
    { header: "Payer category", width: 28, value: (r) => r.payerCategory },
    { header: "Revenue code", width: 12, value: (r) => r.revenueCode },
    { header: "Revenue head", width: 40, value: (r) => r.revenueHead },
    { header: "Revenue category", width: 34, value: (r) => r.revenueCategory },
    { header: "Revenue type", width: 10, value: (r) => r.revenueType },
    { header: "Budget line", width: 10, value: (r) => r.budgetLineId },
    { header: "Demand notice", width: 22, value: (r) => r.dnNo },
    { header: "Period", width: 14, value: (r) => r.period },
    { header: "Basis qty", type: "money", value: (r) => r.basisQty },
    { header: "Amount due (₦)", type: "money", width: 18, value: (r) => r.amountDue },
    { header: "Amount paid (₦)", type: "money", width: 18, value: (r) => r.amountPaid },
    { header: "Channel", width: 18, value: (r) => r.channel },
    { header: "Collecting account", width: 32, value: (r) => r.collectingAccount },
    { header: "Payment ref / RRR", width: 22, value: (r) => r.paymentRef },
    { header: "Value date", type: "date", width: 13, value: (r) => r.valueDate },
    { header: "Status", width: 20, value: (r) => r.status },
    { header: "Recorded by", width: 22, value: (r) => r.recordedBy },
    { header: "Recorded at", type: "datetime", width: 18, value: (r) => r.createdAt },
    { header: "Confirmed by", width: 22, value: (r) => r.confirmedBy },
    { header: "Confirmed at", type: "datetime", width: 18, value: (r) => r.confirmedAt },
    { header: "Reversed by", width: 22, value: (r) => r.reversedBy },
    { header: "Reversed at", type: "datetime", width: 18, value: (r) => r.reversedAt },
    { header: "Reason for reversing", width: 30, value: (r) => r.reverseReason },
    { header: "Remarks", width: 30, value: (r) => r.remarks },
  ];
  const wb = newWorkbook("Register");
  addSheet(wb, "Register", cols, rows);
  return { workbook: wb, filename: `OGSERC-Register-${stamp()}.xlsx`, rows: rows.length };
}

async function exportDemandNotices(q: URLSearchParams): Promise<ExportResult> {
  const f = dnFilterSchema.parse({ ...params(q), page: 1 });
  const asAt = await getAsAt();
  const { rows } = await listDemandNotices(db, f, asAt, 1_000_000);
  type R = (typeof rows)[number];
  const cols: SheetColumn<R>[] = [
    { header: "DN No", width: 22, value: (r) => r.dnNo },
    { header: "Issue date", type: "date", width: 13, value: (r) => r.issueDate },
    { header: "Payer ID", width: 12, value: (r) => r.payerId },
    { header: "Payer", width: 36, value: (r) => r.payerName },
    { header: "Revenue code", width: 12, value: (r) => r.revenueCode },
    { header: "Revenue head", width: 40, value: (r) => r.revenueHead },
    { header: "Period", width: 14, value: (r) => r.period },
    { header: "Amount billed (₦)", type: "money", width: 18, value: (r) => r.amountBilled },
    { header: "Due date", type: "date", width: 13, value: (r) => r.dueDate },
    { header: "Paid to date (₦)", type: "money", width: 18, value: (r) => r.paidToDate },
    { header: "Outstanding (₦)", type: "money", width: 18, value: (r) => r.outstanding },
    { header: "Days overdue", type: "int", value: (r) => r.daysOverdue },
    { header: "Ageing bucket", width: 14, value: (r) => r.agingBucket },
    { header: "Status", width: 20, value: (r) => r.status },
    { header: "Cancelled", width: 10, value: (r) => (r.cancelled ? "Yes" : "No") },
    { header: "Reason for cancelling", width: 30, value: (r) => r.cancelReason },
    { header: "Issued by", width: 22, value: (r) => r.issuedBy },
    { header: "Remarks", width: 30, value: (r) => r.remarks },
  ];
  const wb = newWorkbook("Demand notices");
  addSheet(wb, "Demand notices", cols, rows, { title: `Demand notices as at ${asAt}` });
  return { workbook: wb, filename: `OGSERC-Demand-Notices-${stamp()}.xlsx`, rows: rows.length };
}

async function exportBudgetVsActual(_q: URLSearchParams, fy: number): Promise<ExportResult> {
  const [asAt, s] = await Promise.all([getAsAt(), getSettings()]);
  const b = await budgetVsActual(db, fy, asAt, s.budgetToDateRule);
  const wb = newWorkbook("Budget vs actual");
  type F = (typeof b.lines)[number] | ((typeof b.groups)[number] & { id?: string; status?: string });
  const figureCols: SheetColumn<F>[] = [
    { header: "Budget FY (₦)", type: "money", width: 20, value: (r) => r.budgetFy },
    { header: "Budget to date (₦)", type: "money", width: 20, value: (r) => r.budgetToDate },
    { header: "Actual to date (₦)", type: "money", width: 20, value: (r) => r.actualToDate },
    { header: "Variance to date (₦)", type: "money", width: 20, value: (r) => r.variance },
    { header: "Achieved vs budget to date (%)", type: "pct", width: 16, value: (r) => r.achievedToDate },
    { header: "Actual FY (₦)", type: "money", width: 20, value: (r) => r.actualFy },
    { header: "Achieved vs full-year budget (%)", type: "pct", width: 16, value: (r) => r.achievedFy },
  ];
  const title = `FY ${fy} as at ${asAt}, ${b.monthsElapsed} months elapsed`;
  addSheet(
    wb,
    "By budget line",
    [
      { header: "ID", width: 8, value: (r: F) => ("id" in r ? r.id : "") },
      { header: "Budget line", width: 44, value: (r: F) => ("name" in r ? r.name : "") },
      ...figureCols,
      { header: "Status", width: 20, value: (r: F) => ("status" in r ? r.status : "") },
    ],
    [...b.lines, { ...b.total, name: "Total" } as F],
    { title, boldRow: (r) => !("id" in r) || !r.id },
  );
  addSheet(wb, "By budget group", [{ header: "Group", width: 52, value: (r: F) => ("name" in r ? r.name : "") }, ...figureCols], b.groups, { title });
  addSheet(
    wb,
    "Monthly actual",
    [
      { header: "ID", width: 8, value: (r: (typeof b.lines)[number]) => r.id },
      { header: "Budget line", width: 44, value: (r) => r.name },
      ...MONTH_LABELS.map((m, i): SheetColumn<(typeof b.lines)[number]> => ({ header: m, type: "money", width: 15, value: (r) => r.monthly[i] })),
      { header: "Actual FY (₦)", type: "money", width: 18, value: (r) => r.actualFy },
      { header: "Budget FY (₦)", type: "money", width: 20, value: (r) => r.budgetFy },
    ],
    b.lines,
    { title },
  );
  return { workbook: wb, filename: `OGSERC-Budget-vs-Actual-FY${fy}-${stamp()}.xlsx`, rows: b.lines.length };
}

async function exportMonthlySummary(_q: URLSearchParams, fy: number): Promise<ExportResult> {
  const m = await monthlySummary(db, fy);
  const wb = newWorkbook("Monthly summary");
  type R = { label: string; code?: string; category?: string; months: string[]; total: string; share: string | null; bold?: boolean };
  const rows: R[] = [];
  for (const c of m.categories) {
    for (const h of m.heads.filter((x) => x.category === c.key)) rows.push({ ...h, label: h.label });
    rows.push({ ...c, label: `${c.label} - subtotal`, bold: true });
  }
  for (const ty of m.types) rows.push({ ...ty, bold: true });
  rows.push({ ...m.total, bold: true }, { ...m.budget, label: "Phased budget" });
  addSheet(
    wb,
    "Monthly summary",
    [
      { header: "Code", width: 10, value: (r: R) => r.code },
      { header: "Revenue head / category", width: 52, value: (r) => r.label },
      ...MONTH_LABELS.map((mo, i): SheetColumn<R> => ({ header: mo, type: "money", width: 15, value: (r) => r.months[i] })),
      { header: "Total FY (₦)", type: "money", width: 18, value: (r) => r.total },
      { header: "Share of FY (%)", type: "pct", width: 12, value: (r) => r.share },
    ],
    rows,
    { title: `FY ${fy} confirmed revenue by receipt date${m.reconciles ? "" : " (check failed: categories ≠ heads)"}`, boldRow: (r) => Boolean(r.bold) },
  );
  return { workbook: wb, filename: `OGSERC-Monthly-Summary-FY${fy}-${stamp()}.xlsx`, rows: rows.length };
}

async function exportArrears(): Promise<ExportResult> {
  const asAt = await getAsAt();
  const a = await arrears(db, asAt);
  type R = (typeof a.rows)[number];
  const wb = newWorkbook("Arrears");
  addSheet(
    wb,
    "Arrears",
    [
      { header: "Payer ID", width: 12, value: (r: R) => r.payerId },
      { header: "Payer", width: 40, value: (r) => r.name },
      { header: "Category", width: 28, value: (r) => r.category },
      { header: "Total billed (₦)", type: "money", width: 18, value: (r) => r.billed },
      { header: "Paid vs notices (₦)", type: "money", width: 18, value: (r) => r.paid },
      { header: "Outstanding (₦)", type: "money", width: 18, value: (r) => r.outstanding },
      ...OPEN_BUCKETS.map((b): SheetColumn<R> => ({ header: `${b} (₦)`, type: "money", width: 16, value: (r) => r.buckets[b] })),
      { header: "Open notices", type: "int", value: (r) => r.openNotices },
      { header: "Collection rate (%)", type: "pct", width: 14, value: (r) => r.collectionRate },
    ],
    [a.total, ...a.rows],
    { title: `Arrears as at ${asAt}`, boldRow: (r) => r.payerId === "" },
  );
  return { workbook: wb, filename: `OGSERC-Arrears-${stamp()}.xlsx`, rows: a.rows.length };
}

async function exportBankRecon(_q: URLSearchParams, fy: number): Promise<ExportResult> {
  const r = await bankRecon(db, fy);
  type Row = { month: string; cells: (typeof r.months)[number] };
  const rows: Row[] = [...r.months.map((cells, i) => ({ month: MONTH_LABELS[i]!, cells })), { month: `FY ${fy}`, cells: r.totals }];
  const cols: SheetColumn<Row>[] = [{ header: "Month", width: 10, value: (x) => x.month }];
  for (const acc of r.accounts) {
    cols.push(
      { header: `${acc}: per register (₦)`, type: "money", width: 22, value: (x) => x.cells[acc]?.register },
      { header: `${acc}: per statement (₦)`, type: "money", width: 22, value: (x) => x.cells[acc]?.statement },
      { header: `${acc}: difference (₦)`, type: "money", width: 20, value: (x) => x.cells[acc]?.difference },
    );
  }
  const wb = newWorkbook("Bank recon");
  addSheet(wb, "Bank recon", cols, rows, {
    title: `FY ${fy}: register by value date (not reversed) vs statement. Pending to confirm: ${r.pendingCount}, ₦${r.pendingAmount}`,
    boldRow: (x) => x.month.startsWith("FY"),
  });
  return { workbook: wb, filename: `OGSERC-Bank-Recon-FY${fy}-${stamp()}.xlsx`, rows: 12 };
}

/** Every table, one sheet each, column names as in the database. Password hashes are left out. */
async function exportEverything(): Promise<ExportResult> {
  const wb = newWorkbook("Revenue Register - full export");
  const tables: [string, Promise<Record<string, unknown>[]>][] = [
    ["settings", db.select().from(t.settings)],
    ["serials", db.select().from(t.serials)],
    [
      "users",
      db
        .select({ id: t.users.id, name: t.users.name, email: t.users.email, roles: t.users.roles, active: t.users.active, lastLoginAt: t.users.lastLoginAt, createdAt: t.users.createdAt })
        .from(t.users),
    ],
    ["lists", db.select().from(t.lists).orderBy(asc(t.lists.listName), asc(t.lists.sortOrder))],
    ["budget_lines", db.select().from(t.budgetLines).orderBy(asc(t.budgetLines.sortOrder))],
    ["fee_heads", db.select().from(t.feeHeads).orderBy(asc(t.feeHeads.sortOrder))],
    ["sch3_registration_fees", db.select().from(t.sch3RegistrationFees)],
    ["sch3_late_charges", db.select().from(t.sch3LateCharges)],
    ["licence_fee_bands", db.select().from(t.licenceFeeBands).orderBy(asc(t.licenceFeeBands.id))],
    ["payers", db.select().from(t.payers).orderBy(asc(t.payers.payerId))],
    ["demand_notices", db.select().from(t.demandNotices).orderBy(asc(t.demandNotices.dnNo))],
    ["receipts", db.select().from(t.receipts).orderBy(asc(t.receipts.receiptNo))],
    ["bank_statement_totals", db.select().from(t.bankStatementTotals)],
    ["revenue_budget", db.select().from(t.revenueBudget).orderBy(asc(t.revenueBudget.financialYear), asc(t.revenueBudget.budgetLineId), asc(t.revenueBudget.month))],
    ["audit_log", db.select().from(t.auditLog).orderBy(asc(t.auditLog.id))],
  ];
  let total = 0;
  for (const [name, query] of tables) {
    const rows = await query;
    total += rows.length;
    const keys = rows[0] ? Object.keys(rows[0]) : ["(empty)"];
    addSheet(
      wb,
      name,
      keys.map((k) => ({
        header: k,
        width: 18,
        value: (r: Record<string, unknown>) => {
          const v = r[k];
          if (v === null || v === undefined) return null;
          if (v instanceof Date) return v;
          if (Array.isArray(v) || typeof v === "object") return JSON.stringify(v);
          return v as string | number | boolean;
        },
      })),
      rows,
    );
  }
  return { workbook: wb, filename: `OGSERC-Revenue-Register-full-export-${stamp()}.xlsx`, rows: total };
}

export const EXPORTS: Record<string, ExportDef> = {
  "register.xlsx": { capability: "receipts.view", build: (q) => exportRegister(q) },
  "demand-notices.xlsx": { capability: "dn.view", build: (q) => exportDemandNotices(q) },
  "budget-vs-actual.xlsx": { capability: "reports.view", build: exportBudgetVsActual },
  "monthly-summary.xlsx": { capability: "reports.view", build: exportMonthlySummary },
  "arrears.xlsx": { capability: "reports.view", build: () => exportArrears() },
  "bank-recon.xlsx": { capability: "bankRecon.view", build: exportBankRecon },
  "everything.xlsx": { capability: "data.manage", build: () => exportEverything() },
};
