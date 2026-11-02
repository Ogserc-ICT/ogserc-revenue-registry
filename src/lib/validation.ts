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
