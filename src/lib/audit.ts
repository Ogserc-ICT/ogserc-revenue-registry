import Decimal from "decimal.js";
import type { Db } from "@/db";
import { auditLog } from "@/db/schema";

/** Action names used in the audit log. Keep them stable: the Audit log filter lists them. */
export const AUDIT_ACTIONS = {
  signIn: "User signed in",
  signOut: "User signed out",
  passwordChanged: "Password changed",
  userCreated: "User created",
  userRolesChanged: "User roles changed",
  userDeactivated: "User deactivated",
  userReactivated: "User reactivated",
  userPasswordReset: "User password reset",
  settingsChanged: "Settings changed",
  serialRaised: "Serial raised",
  listValueAdded: "List value added",
  listValueChanged: "List value changed",
  listReordered: "List reordered",
  seedLoaded: "Seed loaded",
  // Later phases
  receiptRecorded: "Receipt recorded",
  receiptEdited: "Receipt edited",
  receiptConfirmed: "Receipt confirmed",
  receiptReversed: "Receipt reversed",
  dnIssued: "Demand notice issued",
  dnCancelled: "Demand notice cancelled",
  payerAdded: "Payer added",
  payerEdited: "Payer edited",
  feeHeadChanged: "Fee head changed",
  budgetChanged: "Budget changed",
  exported: "Export",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditActor {
  id: string | null;
  name: string;
}

export const SYSTEM_ACTOR: AuditActor = { id: null, name: "System" };

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  reference?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Appends an audit entry. Pass the open transaction that makes the change, so the entry
 * commits or rolls back with it (CLAUDE.md rule 5).
 */
export async function writeAudit(tx: Db, input: AuditInput): Promise<void> {
  await tx.insert(auditLog).values({
    userId: input.actor.id,
    userName: input.actor.name,
    action: input.action,
    reference: input.reference ?? null,
    details: input.details ?? null,
  });
}

/** Field-by-field old/new diff for "changed" audit entries. Unchanged fields are omitted. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    const oldValue = normalise(before[key]);
    const newValue = normalise(after[key]);
    if (oldValue !== newValue) changes[key] = { old: before[key] ?? null, new: after[key] ?? null };
  }
  return changes;
}

function normalise(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  // Treat numeric strings by value so "1500.000000" equals "1500".
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return new Decimal(v).toString();
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}
