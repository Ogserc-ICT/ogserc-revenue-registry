import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { signInAttempts, users } from "@/db/schema";
import { AUDIT_ACTIONS, SYSTEM_ACTOR, writeAudit } from "./audit";
import { isLocked, LOCK_AFTER_FAILURES, lockedUntil } from "./lockout";

/**
 * When `email`'s sign-in lock ends, or null if it isn't locked by its recent failures. Keyed on
 * the email typed, whether or not an account has it, so the lock message never reveals which
 * emails are real accounts.
 */
export async function signInLockedUntil(db: Db, email: string): Promise<Date | null> {
  const key = email.trim().toLowerCase();
  const [success] = await db
    .select({ at: signInAttempts.at })
    .from(signInAttempts)
    .where(and(sql`lower(${signInAttempts.email}) = ${key}`, eq(signInAttempts.succeeded, true)))
    .orderBy(desc(signInAttempts.at))
    .limit(1);
  const [account] = await db.select({ changed: users.passwordChangedAt }).from(users).where(sql`lower(${users.email}) = ${key}`).limit(1);
  // A successful sign-in, or a password change or Admin reset, starts the count again.
  const since = [success?.at, account?.changed].filter((d): d is Date => d instanceof Date).sort((a, b) => b.getTime() - a.getTime())[0];

  const failures = await db
    .select({ at: signInAttempts.at })
    .from(signInAttempts)
    .where(
      and(
        sql`lower(${signInAttempts.email}) = ${key}`,
        eq(signInAttempts.succeeded, false),
        eq(signInAttempts.blocked, false),
        since ? gt(signInAttempts.at, since) : undefined,
      ),
    )
    .orderBy(desc(signInAttempts.at))
    .limit(LOCK_AFTER_FAILURES);
  return lockedUntil(failures.map((f) => f.at));
}

/**
 * Records a failed sign-in. If it is the one that locks the account, writes a "Sign-in locked"
 * audit entry in the same transaction. Returns when the lock ends (null if not locked).
 */
export async function recordSignInFailure(db: Db, email: string, ip: string | null): Promise<Date | null> {
  return db.transaction(async (tx) => {
    await tx.insert(signInAttempts).values({ email, ip, succeeded: false });
    const until = await signInLockedUntil(tx, email);
    // Attempts while locked aren't counted, so a lock found now was made by this failure.
    if (isLocked(until)) {
      await writeAudit(tx, {
        actor: SYSTEM_ACTOR,
        action: AUDIT_ACTIONS.signInLocked,
        reference: email,
        details: { lockedUntil: until.toISOString(), failures: LOCK_AFTER_FAILURES, ...(ip ? { ip } : {}) },
      });
    }
    return until;
  });
}

/** Records an attempt refused because the account is locked. It doesn't count towards a lock. */
export async function recordBlockedSignIn(db: Db, email: string, ip: string | null): Promise<void> {
  await db.insert(signInAttempts).values({ email, ip, succeeded: false, blocked: true });
}
