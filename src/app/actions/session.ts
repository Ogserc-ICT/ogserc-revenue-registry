"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/db";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/session";
import { FY_COOKIE, getAvailableYears } from "@/lib/settings-server";

export async function signOutAction() {
  const user = await getCurrentUser();
  if (user) {
    await db.transaction((tx) =>
      writeAudit(tx, {
        actor: { id: user.id, name: user.name },
        action: AUDIT_ACTIONS.signOut,
        reference: user.email,
      }),
    );
  }
  await signOut({ redirectTo: "/sign-in?reason=signed-out" });
}

/** The FY chip. A per-user view preference stored in a cookie, not a data change, so not audited. */
export async function setViewingYearAction(year: number) {
  const user = await getCurrentUser();
  if (!user) return;
  const parsed = z.number().int().safeParse(year);
  if (!parsed.success || !(await getAvailableYears()).includes(parsed.data)) return;
  (await cookies()).set(FY_COOKIE, String(parsed.data), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: (process.env.AUTH_URL ?? "").startsWith("https://"),
    maxAge: 60 * 60 * 24 * 180,
  });
}
