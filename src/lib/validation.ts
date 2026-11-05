import { z } from "zod";
import { isIsoDate } from "./dates";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password";

const trimmed = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);
const required = (label: string, max = 200) =>
  trimmed(max).min(1, `Enter the ${label}.`);

export const roleSchema = z.enum(["admin", "revenue_officer", "finance_officer", "viewer"]);

// ---------- Auth ----------

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(MAX_PASSWORD_LENGTH),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(MAX_PASSWORD_LENGTH, `Use at most ${MAX_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The two new passwords don't match. Type the same password in both fields.",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password that is different from your current one.",
  });

// ---------- Users ----------

export const createUserSchema = z.object({
  name: required("full name", 120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  roles: z.array(roleSchema).min(1, "Pick at least one role."),
});

export const updateRolesSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(roleSchema).min(1, "Pick at least one role."),
});

export const userIdSchema = z.object({ userId: z.string().uuid() });

// ---------- Settings ----------

const prefix = (label: string) =>
  required(label, 30).regex(/^[A-Za-z0-9/_-]+$/, "Use letters, numbers, / - or _ only, no spaces.");

const decimalString = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, `Enter the ${label} as a number, e.g. 1500 or 1500.50.`)
    .refine((v) => Number(v) > 0, `The ${label} must be above 0.`);

export const settingsSchema = z.object({
  orgName: required("organisation name"),
  addressLine: trimmed(300),
  financialYear: z.coerce
    .number({ message: "Enter the financial year, e.g. 2026." })
    .int("Enter a whole year, e.g. 2026.")
    .min(2000, "Enter a year from 2000 onwards.")
    .max(2100, "Enter a year before 2100."),
  receiptPrefix: prefix("receipt prefix"),
  dnPrefix: prefix("demand notice prefix"),
  payerPrefix: prefix("payer ID prefix"),
  defaultTermsDays: z.coerce
    .number({ message: "Enter the payment terms in days." })
    .int("Enter a whole number of days.")
    .min(0, "Payment terms can't be negative.")
    .max(365, "Use 365 days or fewer."),
  asAtDate: z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), "Pick a valid date, or leave it blank to use today.")
    .transform((v) => (v === "" ? null : v)),
  autoConfirm: z.boolean(),
  usdNgnRate: decimalString("exchange rate"),
  budgetVersionLabel: trimmed(120),
  budgetToDateRule: z.enum(["including_current_month", "completed_months_only"]),
  dnPaymentInstructions: trimmed(1000),
  dnSignatory: trimmed(200),
  latePaymentNote: trimmed(1000),
});

export type SettingsInput = z.input<typeof settingsSchema>;
export type SettingsValues = z.output<typeof settingsSchema>;

export const raiseSerialSchema = z.object({
  key: z.enum(["receipt", "dn", "payer"]),
  nextValue: z.coerce
    .number({ message: "Enter a whole number." })
    .int("Enter a whole number.")
    .min(1)
    .max(99_999_999),
});

// ---------- Lists ----------

export const listValueSchema = z.object({
  listName: required("list name", 80),
  value: required("value", 200),
});

export const listToggleSchema = z.object({ id: z.coerce.number().int().positive(), active: z.boolean() });

export const listMoveSchema = z.object({
  id: z.coerce.number().int().positive(),
  direction: z.enum(["up", "down"]),
});

// ---------- Shared field helpers (forms send strings) ----------

const blankToNull = (v: string) => (v === "" ? null : v);

const optionalText = (max: number) => trimmed(max).transform(blankToNull);

/**
 * An optional decimal typed by a person: commas and spaces are ignored. `dp` is the most
 * decimal places accepted. Blank becomes null.
 */
export const optionalDecimal = (label: string, dp: number, opts: { positive?: boolean } = {}) =>
  z
    .string()
    .transform((v) => v.replace(/[,\s₦$]/g, ""))
    .refine(
      (v) => v === "" || new RegExp(`^\\d+(\\.\\d{1,${dp}})?$`).test(v),
      dp === 0
        ? `Enter the ${label} as a whole number, without minus signs.`
        : `Enter the ${label} as a number with up to ${dp} decimal places, e.g. 1500 or 1500.50.`,
    )
    .refine((v) => !opts.positive || v === "" || Number(v) > 0, `The ${label} must be above 0.`)
    .transform(blankToNull);

const requiredDecimal = (label: string, dp: number, opts: { positive?: boolean } = {}) =>
  optionalDecimal(label, dp, opts).refine((v) => v !== null, `Enter the ${label}.`);

const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isIsoDate(v), `Pick a valid ${label}, or leave it blank.`)
    .transform(blankToNull);

// ---------- Payers ----------

export const SCH3_CATEGORY_VALUES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
export const EXPECTED_REG_MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Even"] as const;

export const payerSchema = z.object({
  name: required("payer name", 200),
  category: optionalText(120),
  licenceNo: optionalText(60),
  licenceStatus: optionalText(60),
  capacityMw: optionalDecimal("capacity in MW", 3),
  revenueBaseNgn: optionalDecimal("revenue base", 2),
  lga: optionalText(80),
  address: optionalText(300),
  contactPerson: optionalText(120),
  phone: optionalText(40),
  email: trimmed(200)
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address, or leave it blank.")
    .transform((v) => (v === "" ? null : v.toLowerCase())),
  dateRegistered: optionalDate("registration date"),
  sch3Category: z
    .string()
    .transform(blankToNull)
    .refine((v) => v === null || (SCH3_CATEGORY_VALUES as readonly string[]).includes(v), "Pick a Schedule 3 category."),
  expectedRegMonth: z
    .string()
    .transform(blankToNull)
    .refine((v) => v === null || (EXPECTED_REG_MONTHS as readonly string[]).includes(v), "Pick a month or Even."),
  notes: optionalText(1000),
});

export type PayerValues = z.output<typeof payerSchema>;

export const payerFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().max(120).optional().catch(undefined),
  reg: z.enum(["Fee not set", "Registered", "Part-paid", "Not registered"]).optional().catch(undefined),
  sch3: z.union([z.enum(SCH3_CATEGORY_VALUES), z.literal("none")]).optional().catch(undefined),
  show: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export type PayerFilters = z.output<typeof payerFilterSchema>;

// ---------- Fee schedule ----------

export const feeHeadSchema = z
  .object({
    head: required("revenue head", 200),
    category: required("revenue category", 120),
    appliesTo: optionalText(300),
    basis: z.enum(["Fixed", "Per MW", "MW Band", "% of Revenue", "Per Unit", "Per Day", "Variable"], {
      message: "Pick a charging basis.",
    }),
    currency: z.enum(["NGN", "USD"], { message: "Pick a currency." }),
    /** For "% of Revenue" this is the percentage (1.5 = 1.5%); the action converts it. */
    publishedRate: optionalDecimal("rate", 6),
    publishedRateText: optionalText(200),
    capNgn: optionalDecimal("daily cap", 2),
    unitBasis: optionalText(200),
    frequency: optionalText(60),
    revenueType: z.enum(["IGR", "Non-IGR"], { message: "Pick IGR or Non-IGR." }),
    budgetLineId: optionalText(20),
    legalBasis: optionalText(300),
    ncoaCode: optionalText(40),
    rateStatus: optionalText(120),
    notes: optionalText(1000),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.basis === "% of Revenue" && v.publishedRate !== null && Number(v.publishedRate) > 100) {
      ctx.addIssue({ code: "custom", path: ["publishedRate"], message: "Enter a percentage of 100 or less." });
    }
    if (v.basis === "% of Revenue" && v.currency !== "NGN") {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "A % of revenue fee is charged in naira." });
    }
  });

export type FeeHeadValues = z.output<typeof feeHeadSchema>;

export const feeCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]+(-[A-Z0-9]+)*$/, "Use capital letters, numbers and hyphens only, e.g. APP-11.")
  .max(20, "Keep the code under 20 characters.");

export const sch3FeeSchema = z.object({
  category: z.enum(SCH3_CATEGORY_VALUES),
  feeNgn: requiredDecimal("registration fee", 2, { positive: true }),
});

export const sch3GroupSchema = z.object({
  group: z.string().trim().regex(/^LR-\d$/),
  initialNgn: requiredDecimal("initial charge", 2),
  dailyNgn: requiredDecimal("daily charge", 2),
  dailyCapNgn: requiredDecimal("daily charges cap", 2),
});

export const bandRateSchema = z.object({
  id: z.coerce.number().int().positive(),
  publishedRate: optionalDecimal("rate", 2),
});

export const lateCalcSchema = z.object({
  category: z.enum(SCH3_CATEGORY_VALUES),
  deadline: z.string().refine(isIsoDate),
  assessed: z.string().refine(isIsoDate),
});

// ---------- Revenue budget ----------

export const budgetLineEditSchema = z.object({
  financialYear: z.coerce.number().int().min(2000).max(2100),
  budgetLineId: z.string().trim().min(1).max(20),
  months: z.array(requiredDecimal("amount", 2)).length(12),
});

// ---------- Audit log filters ----------

export const auditFilterSchema = z.object({
  user: z.union([z.string().uuid(), z.literal("system")]).optional().catch(undefined),
  action: z.string().max(80).optional().catch(undefined),
  from: z.string().refine(isIsoDate).optional().catch(undefined),
  to: z.string().refine(isIsoDate).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

/** Every error message from a failed parse, keyed by field (first message per field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
