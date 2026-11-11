import Decimal from "decimal.js";
import { type MoneyInput, toDecimal } from "./money";

/**
 * Schedule 3 registration rules (BUILD_SPEC 4.6 and 4.9). Pure functions, safe in client
 * components; money stays in decimal.js throughout.
 */

export interface Sch3Category {
  category: string;
  feeNgn: string;
  /** LR-1 / LR-2 / LR-3, or null where no late charge applies (Category I). */
  lateGroup: string | null;
}

export interface Sch3LateGroup {
  group: string;
  initialNgn: string;
  dailyNgn: string;
  dailyCapNgn: string;
}

export type RegistrationStatus = "Fee not set" | "Registered" | "Part-paid" | "Not registered";

/** BUILD_SPEC 4.6, checked in this order. */
export function registrationStatus(fee: MoneyInput, paid: MoneyInput): RegistrationStatus {
  const f = toDecimal(fee);
  const p = toDecimal(paid);
  if (f.lte(0)) return "Fee not set";
  if (p.gte(f)) return "Registered";
  if (p.gt(0)) return "Part-paid";
  return "Not registered";
}

/** Whole days from `from` to `to` (YYYY-MM-DD); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface LateRegistrationResult {
  daysLate: number;
  registrationFee: Decimal;
  /** null when the category has no late charge. */
  chargeGroup: string | null;
  initialCharge: Decimal;
  dailyCharges: Decimal;
  /** True when the daily charges hit the group's cap. */
  dailyCapped: boolean;
  totalAdminCharges: Decimal;
  totalPayable: Decimal;
}

/**
 * Late registration calculator (BUILD_SPEC 4.9).
 * days late = max(0, assessment - deadline); daily charges = MIN(days x daily, cap);
 * the initial charge applies once the registration is late at all. Category I has no late
 * charge. Example: Cat F, 30 Jun -> 31 Jul 2026 = 31 days: 500,000 + 1,000,000 + 6,200,000.
 */
export function lateRegistration(
  category: Sch3Category,
  groups: readonly Sch3LateGroup[],
  deadline: string,
  assessmentDate: string,
): LateRegistrationResult {
  const daysLate = Math.max(0, daysBetween(deadline, assessmentDate));
  const registrationFee = toDecimal(category.feeNgn);
  const group = category.lateGroup ? groups.find((g) => g.group === category.lateGroup) : undefined;

  let initialCharge = new Decimal(0);
  let dailyCharges = new Decimal(0);
  let dailyCapped = false;
  if (group && daysLate > 0) {
    initialCharge = toDecimal(group.initialNgn);
    const uncapped = toDecimal(group.dailyNgn).times(daysLate);
    const cap = toDecimal(group.dailyCapNgn);
    dailyCapped = cap.gt(0) && uncapped.gt(cap);
    dailyCharges = dailyCapped ? cap : uncapped;
  }
  const totalAdminCharges = initialCharge.plus(dailyCharges);
  return {
    daysLate,
    registrationFee,
    chargeGroup: group?.group ?? null,
    initialCharge,
    dailyCharges,
    dailyCapped,
    totalAdminCharges,
    totalPayable: registrationFee.plus(totalAdminCharges),
  };
}

/** Schedule 3 categories A-K. */
export const SCH3_CATEGORIES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

/** The fee head that records a category's registration fee, e.g. "F" -> "REG-F". */
export const registrationCode = (category: string) => `REG-${category}`;

/** Payer categories whose Schedule 3 category follows from generating capacity (C, D, I or K). */
const BY_CAPACITY = new Set(["Legacy GenCo", "Independent Generation Licensee", "Embedded Generator", "Captive Power Plant"]);

/** Payer categories that map straight to one Schedule 3 category, from the Schedule 3 descriptions. */
const BY_CATEGORY: Record<string, string> = {
  "Successor DisCo (legacy)": "A",
  "Integrated Utility": "B",
  "Mini-Grid Developer": "E",
  "Independent Distribution Licensee": "F",
  "Embedded Distributor": "F",
  "Supply / Trading Licensee": "F",
  "Private / Estate / Industrial-Park Network": "G",
  "Metering Service Provider": "H",
  "Franchisee / Sub-franchisee": "J",
};

/**
 * A suggested Schedule 3 category for a new payer (owner's decision, Nov 2026: prefill only; the
 * officer can change it). Generation goes by capacity: C at 10 MW or more, D from 1 MW, and below
 * 1 MW, I for own use (captive) from 200 kW, else K. Null when nothing fits or capacity is unknown.
 */
export function suggestSch3Category(payerCategory: string, capacityMw: string): string | null {
  const direct = BY_CATEGORY[payerCategory];
  if (direct) return direct;
  if (!BY_CAPACITY.has(payerCategory)) return null;
  const raw = capacityMw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const mw = toDecimal(raw);
  if (mw.lte(0)) return null;
  if (mw.gte(10)) return "C";
  if (mw.gte(1)) return "D";
  if (payerCategory === "Captive Power Plant") return mw.gte("0.2") ? "I" : null;
  return "K";
}
