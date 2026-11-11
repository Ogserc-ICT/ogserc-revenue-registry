import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Precision rules:
 *  - money amounts:      NUMERIC(18,2)
 *  - rates and FX:       NUMERIC(18,6)  (e.g. 1.5% levy = 0.015)
 *  - phased budget:      NUMERIC(20,6)  (rounded only for display, so totals match the workbook)
 *  - quantities:         NUMERIC(20,4)  (days, MW, or a ₦ revenue base)
 */
const money = (name: string) => numeric(name, { precision: 18, scale: 2 });
const rate = (name: string) => numeric(name, { precision: 18, scale: 6 });
const qty = (name: string) => numeric(name, { precision: 20, scale: 4 });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------- Enums (logic values, not editable lists) ----------

export const roleEnum = pgEnum("role", ["admin", "revenue_officer", "finance_officer", "viewer"]);
export const feeBasisEnum = pgEnum("fee_basis", [
  "Fixed",
  "Per MW",
  "MW Band",
  "% of Revenue",
  "Per Unit",
  "Per Day",
  "Variable",
]);
export const currencyEnum = pgEnum("currency", ["NGN", "USD"]);
export const revenueTypeEnum = pgEnum("revenue_type", ["IGR", "Non-IGR"]);
export const receiptStatusEnum = pgEnum("receipt_status", [
  "Pending Confirmation",
  "Confirmed",
  "Reversed",
]);
export const serialKeyEnum = pgEnum("serial_key", ["receipt", "dn", "payer"]);
export const budgetToDateRuleEnum = pgEnum("budget_to_date_rule", [
  "including_current_month",
  "completed_months_only",
]);

// ---------- Users and auth ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roles: roleEnum("roles").array().notNull().default(sql`'{}'::role[]`),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: tstz("last_login_at"),
    passwordChangedAt: tstz("password_changed_at"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

/** Sign-in attempts, used for the 15-minute lockout after 5 failures (wired in Phase 6). */
export const signInAttempts = pgTable(
  "sign_in_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    ip: text("ip"),
    succeeded: boolean("succeeded").notNull(),
    at: tstz("at").notNull().defaultNow(),
  },
  (t) => [index("sign_in_attempts_email_at_idx").on(sql`lower(${t.email})`, t.at)],
);

// ---------- Settings, serials, lists ----------

/** A bank account payers can pay into, printed on demand notices. */
export interface PaymentAccount {
  bank: string;
  accountName: string;
  accountNumber: string;
}

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    orgName: text("org_name").notNull(),
    addressLine: text("address_line").notNull().default(""),
    financialYear: integer("financial_year").notNull(),
    receiptPrefix: text("receipt_prefix").notNull().default("OGSERC/RCT"),
    dnPrefix: text("dn_prefix").notNull().default("OGSERC/DN"),
    payerPrefix: text("payer_prefix").notNull().default("OGS-P-"),
    defaultTermsDays: integer("default_terms_days").notNull().default(30),
    asAtDate: date("as_at_date", { mode: "string" }),
    autoConfirm: boolean("auto_confirm").notNull().default(false),
    usdNgnRate: rate("usd_ngn_rate").notNull().default("1500"),
    budgetVersionLabel: text("budget_version_label").notNull().default(""),
    budgetToDateRule: budgetToDateRuleEnum("budget_to_date_rule")
      .notNull()
      .default("including_current_month"),
    // Receiver (OGSERC) details printed on demand notices and receipts; Finance keeps them current.
    orgPhone: text("org_phone").notNull().default(""),
    orgEmail: text("org_email").notNull().default(""),
    paymentAccounts: jsonb("payment_accounts").$type<PaymentAccount[]>().notNull().default([]),
    dnPaymentInstructions: text("dn_payment_instructions").notNull().default(""),
    signatoryName: text("signatory_name").notNull().default(""),
    signatoryDesignation: text("signatory_designation").notNull().default(""),
    latePaymentNote: text("late_payment_note").notNull().default(""),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [check("settings_single_row", sql`${t.id} = 1`)],
);

/**
 * Serial counters. `year = 0` is the single running serial (policy decision 1: no yearly reset).
 * Always allocate through `allocateSerial()` inside the inserting transaction.
 */
export const serials = pgTable(
  "serials",
  {
    key: serialKeyEnum("key").notNull(),
    year: integer("year").notNull().default(0),
    nextValue: integer("next_value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.year] }),
    check("serials_next_value_positive", sql`${t.nextValue} >= 1`),
  ],
);

export const lists = pgTable(
  "lists",
  {
    id: serial("id").primaryKey(),
    listName: text("list_name").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("lists_name_value_uq").on(t.listName, sql`lower(${t.value})`)],
);

// ---------- Reference data ----------

export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  groupCode: text("group_code").notNull(),
  groupName: text("group_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const feeHeads = pgTable("fee_heads", {
  code: text("code").primaryKey(),
  head: text("head").notNull(),
  category: text("category").notNull(),
  appliesTo: text("applies_to"),
  basis: feeBasisEnum("basis").notNull(),
  currency: currencyEnum("currency").notNull().default("NGN"),
  publishedRate: rate("published_rate"),
  publishedRateText: text("published_rate_text"),
  capNgn: money("cap_ngn"),
  unitBasis: text("unit_basis"),
  frequency: text("frequency"),
  revenueType: revenueTypeEnum("revenue_type").notNull(),
  budgetLineId: text("budget_line_id").references(() => budgetLines.id),
  legalBasis: text("legal_basis"),
  ncoaCode: text("ncoa_code"),
  rateStatus: text("rate_status"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sch3RegistrationFees = pgTable("sch3_registration_fees", {
  category: text("category").primaryKey(),
  registrant: text("registrant").notNull(),
  feeNgn: money("fee_ngn").notNull(),
  lateGroup: text("late_group"),
  revenueCode: text("revenue_code").notNull(),
  budgetLineId: text("budget_line_id").references(() => budgetLines.id),
});

export const sch3LateCharges = pgTable("sch3_late_charges", {
  group: text("group").primaryKey(),
  categories: text("categories").notNull(),
  initialNgn: money("initial_ngn").notNull(),
  dailyNgn: money("daily_ngn").notNull(),
  dailyCapNgn: money("daily_cap_ngn").notNull(),
  initialCode: text("initial_code").notNull(),
  dailyCode: text("daily_code").notNull(),
});

export const licenceFeeBands = pgTable(
  "licence_fee_bands",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    fee: text("fee").notNull(),
    bandLabel: text("band_label").notNull(),
    aboveMw: numeric("above_mw", { precision: 12, scale: 3 }).notNull(),
    upToMw: numeric("up_to_mw", { precision: 12, scale: 3 }).notNull(),
    // Null where the source table has no rate for the band (e.g. EMG-01 201-400 MW).
    publishedRate: rate("published_rate"),
    currency: currencyEnum("currency").notNull(),
    source: text("source"),
  },
  (t) => [uniqueIndex("licence_fee_bands_code_range_uq").on(t.code, t.aboveMw, t.upToMw)],
);

// ---------- Payers ----------

export const payers = pgTable(
  "payers",
  {
    payerId: text("payer_id").primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    licenceNo: text("licence_no"),
    licenceStatus: text("licence_status"),
    capacityMw: numeric("capacity_mw", { precision: 12, scale: 3 }),
    revenueBaseNgn: money("revenue_base_ngn"),
    lga: text("lga"),
    address: text("address"),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    dateRegistered: date("date_registered", { mode: "string" }),
    notes: text("notes"),
    sch3Category: text("sch3_category"),
    expectedRegMonth: text("expected_reg_month"),
    active: boolean("active").notNull().default(true),
    isSample: boolean("is_sample").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id),
    createdBy: text("created_by"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payers_name_lower_uq").on(sql`lower(${t.name})`),
    check(
      "payers_expected_reg_month_valid",
      sql`${t.expectedRegMonth} IS NULL OR ${t.expectedRegMonth} IN ('1','2','3','4','5','6','7','8','9','10','11','12','Even')`,
    ),
  ],
);

// ---------- Demand notices ----------

export const demandNotices = pgTable(
  "demand_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dnNo: text("dn_no").notNull().unique(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    payerId: text("payer_id")
      .notNull()
      .references(() => payers.payerId),
    payerName: text("payer_name").notNull(),
    revenueCode: text("revenue_code")
      .notNull()
      .references(() => feeHeads.code),
    revenueHead: text("revenue_head").notNull(),
    period: text("period"),
    basisQty: qty("basis_qty"),
    rateUsed: rate("rate_used"),
    fxUsed: rate("fx_used"),
    amountBilled: money("amount_billed").notNull(),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    // Derived, never written: issue_date + payment_terms_days (BUILD_SPEC 4.5).
    dueDate: date("due_date", { mode: "string" }).generatedAlwaysAs(
      sql`issue_date + payment_terms_days`,
    ),
    cancelled: boolean("cancelled").notNull().default(false),
    cancelledById: uuid("cancelled_by_id").references(() => users.id),
    cancelledBy: text("cancelled_by"),
    cancelledAt: tstz("cancelled_at"),
    cancelReason: text("cancel_reason"),
    issuedById: uuid("issued_by_id").references(() => users.id),
    issuedBy: text("issued_by").notNull(),
    remarks: text("remarks"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("demand_notices_payer_idx").on(t.payerId),
    index("demand_notices_issue_date_idx").on(t.issueDate),
    check("demand_notices_amount_positive", sql`${t.amountBilled} > 0`),
  ],
);

// ---------- Receipts ----------

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receiptNo: text("receipt_no").notNull().unique(),
    receiptDate: date("receipt_date", { mode: "string" }).notNull(),
    payerId: text("payer_id")
      .notNull()
      .references(() => payers.payerId),
    // Snapshots taken at save time; later fee schedule edits must not rewrite history.
    payerName: text("payer_name").notNull(),
    payerCategory: text("payer_category"),
    revenueCode: text("revenue_code")
      .notNull()
      .references(() => feeHeads.code),
    revenueHead: text("revenue_head").notNull(),
    revenueCategory: text("revenue_category").notNull(),
    revenueType: revenueTypeEnum("revenue_type").notNull(),
    budgetLineId: text("budget_line_id").references(() => budgetLines.id),
    dnNo: text("dn_no").references(() => demandNotices.dnNo),
    period: text("period"),
    basisQty: qty("basis_qty"),
    rateUsed: rate("rate_used"),
    fxUsed: rate("fx_used"),
    amountDue: money("amount_due").notNull(),
    amountPaid: money("amount_paid").notNull(),
    channel: text("channel").notNull(),
    collectingAccount: text("collecting_account").notNull(),
    paymentRef: text("payment_ref").notNull(),
    valueDate: date("value_date", { mode: "string" }).notNull(),
    status: receiptStatusEnum("status").notNull().default("Pending Confirmation"),
    confirmedById: uuid("confirmed_by_id").references(() => users.id),
    confirmedBy: text("confirmed_by"),
    confirmedAt: tstz("confirmed_at"),
    reversedById: uuid("reversed_by_id").references(() => users.id),
    reversedBy: text("reversed_by"),
    reversedAt: tstz("reversed_at"),
    reverseReason: text("reverse_reason"),
    recordedById: uuid("recorded_by_id").references(() => users.id),
    recordedBy: text("recorded_by").notNull(),
    remarks: text("remarks"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("receipts_receipt_date_idx").on(t.receiptDate),
    index("receipts_value_date_idx").on(t.valueDate),
    index("receipts_payer_idx").on(t.payerId),
    index("receipts_dn_idx").on(t.dnNo),
    index("receipts_status_idx").on(t.status),
    // Backstop for BUILD_SPEC 4.3: payment ref unique (case-insensitive) among non-reversed receipts.
    uniqueIndex("receipts_payment_ref_live_uq")
      .on(sql`lower(${t.paymentRef})`)
      .where(sql`${t.status} <> 'Reversed'`),
    check("receipts_amount_paid_positive", sql`${t.amountPaid} > 0`),
  ],
);

// ---------- Bank recon and budget ----------

export const bankStatementTotals = pgTable(
  "bank_statement_totals",
  {
    id: serial("id").primaryKey(),
    financialYear: integer("financial_year").notNull(),
    month: smallint("month").notNull(),
    collectingAccount: text("collecting_account").notNull(),
    statementTotal: money("statement_total").notNull(),
    enteredById: uuid("entered_by_id").references(() => users.id),
    enteredBy: text("entered_by").notNull(),
    enteredAt: tstz("entered_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bank_statement_totals_uq").on(t.financialYear, t.month, t.collectingAccount),
    check("bank_statement_totals_month", sql`${t.month} BETWEEN 1 AND 12`),
  ],
);

export const revenueBudget = pgTable(
  "revenue_budget",
  {
    id: serial("id").primaryKey(),
    financialYear: integer("financial_year").notNull(),
    budgetLineId: text("budget_line_id")
      .notNull()
      .references(() => budgetLines.id),
    month: smallint("month").notNull(),
    amount: numeric("amount", { precision: 20, scale: 6 }).notNull().default("0"),
    sourceNote: text("source_note"),
  },
  (t) => [
    uniqueIndex("revenue_budget_uq").on(t.financialYear, t.budgetLineId, t.month),
    check("revenue_budget_month", sql`${t.month} BETWEEN 1 AND 12`),
  ],
);

// ---------- Audit log (append-only; UPDATE/DELETE/TRUNCATE blocked by trigger) ----------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: tstz("at").notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id),
    userName: text("user_name").notNull(),
    action: text("action").notNull(),
    reference: text("reference"),
    details: jsonb("details").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("audit_log_at_idx").on(t.at),
    index("audit_log_user_idx").on(t.userId),
    index("audit_log_action_idx").on(t.action),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
