import type { Role } from "@/db/schema";
import { hasAnyRole } from "./roles";

/**
 * Server-side capability map (BUILD_SPEC section 2). The UI uses the same map to hide
 * controls, but every server action checks it again.
 */
export const CAPABILITIES = {
  "settings.manage": ["admin"],
  // Receiver details on notices and receipts: name, address, bank accounts, signatory.
  "receiver.edit": ["admin", "finance_officer"],
  "users.manage": ["admin"],
  "serials.manage": ["admin"],
  "audit.view": ["admin", "finance_officer"],
  "pending.view": ["admin", "finance_officer"],
  "receipts.record": ["admin", "revenue_officer"],
  "receipts.view": ["admin", "revenue_officer", "finance_officer", "viewer"],
  "receipts.confirm": ["admin", "finance_officer"],
  "receipts.reverse": ["admin", "finance_officer"],
  "dn.issue": ["admin", "revenue_officer"],
  "dn.view": ["admin", "revenue_officer", "finance_officer"],
  "dn.cancel": ["admin", "finance_officer"],
  "payers.edit": ["admin", "revenue_officer"],
  "payers.view": ["admin", "revenue_officer", "finance_officer"],
  "bankRecon.view": ["admin", "finance_officer", "viewer"],
  "bankRecon.enter": ["admin", "finance_officer"],
  "reports.view": ["admin", "revenue_officer", "finance_officer", "viewer"],
  "fees.view": ["admin", "revenue_officer", "finance_officer", "viewer"],
  "fees.edit": ["admin"],
  "budget.edit": ["admin"],
  "data.manage": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(userRoles: readonly Role[], capability: Capability): boolean {
  return hasAnyRole(userRoles, CAPABILITIES[capability]);
}
