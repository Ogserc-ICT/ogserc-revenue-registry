"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { AuthError } from "next-auth";
import { signIn, unstable_update } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { changePasswordSchema, fieldErrors, signInSchema } from "@/lib/validation";

/** Only same-site relative paths, so a crafted callbackUrl can't send users elsewhere. */
function safeCallback(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  try {
    const url = new URL(value, "http://local");
    if (url.origin !== "http://local" || url.pathname.startsWith("/sign-in")) return "/dashboard";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/dashboard";
  }
}

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: safeCallback(formData.get("callbackUrl")) });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        ok: false,
        error: "That email and password don't match an active account. Check both and try again.",
      };
    }
    throw err; // includes Next's redirect after a successful sign-in
  }
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has ended. Sign in again." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row || !(await bcrypt.compare(parsed.data.currentPassword, row.passwordHash))) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: { currentPassword: "That isn't your current password. Type it again." },
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  const wasTemporary = row.mustChangePassword;
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(users.id, user.id));
    await writeAudit(tx, {
      actor: { id: user.id, name: user.name },
      action: AUDIT_ACTIONS.passwordChanged,
      reference: user.email,
      details: { replacedTemporaryPassword: wasTemporary },
    });
  });

  // Re-issue the session token so the proxy stops sending this user to /change-password.
  await unstable_update({});
  return { ok: true, message: "Password changed" };
}
