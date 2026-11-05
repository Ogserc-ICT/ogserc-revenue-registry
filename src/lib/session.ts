import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { type Role, users } from "@/db/schema";
import { ActionAuthError } from "./action-result";
import type { AuditActor } from "./audit";
import { type Capability, can } from "./permissions";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  mustChangePassword: boolean;
}

/**
 * The signed-in user, re-read from the database on every request, so deactivation and role
 * changes take effect immediately rather than when the session cookie expires.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, roles: u.roles, mustChangePassword: u.mustChangePassword };
});

/** For pages inside the app shell. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?reason=signed-out");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}

/** For pages: `ok: false` means render the no-access state. */
export async function gatePage(
  capability: Capability,
): Promise<{ ok: true; user: CurrentUser } | { ok: false; user: CurrentUser }> {
  const user = await requireUser();
  return { ok: can(user.roles, capability), user };
}

export { ActionAuthError };

/**
 * For server actions. Throws if the user is signed out, must change their password, or
 * lacks the capability. The UI hiding a button is not security (CLAUDE.md rule 10).
 */
export async function requireAction(capability?: Capability): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionAuthError("Your session has ended. Sign in again.");
  if (user.mustChangePassword) throw new ActionAuthError("Change your temporary password first.");
  if (capability && !can(user.roles, capability)) {
    throw new ActionAuthError("You don't have permission to do that.");
  }
  return user;
}

export const actorOf = (user: CurrentUser): AuditActor => ({ id: user.id, name: user.name });
