import type { PGlite } from "@electric-sql/pglite";
import { desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { auditLog, signInAttempts, users } from "@/db/schema";
import { isLocked, LOCK_MINUTES, lockedUntil } from "@/lib/lockout";
import { recordBlockedSignIn, recordSignInFailure, signInLockedUntil } from "@/lib/lockout-server";
import { createTestDb } from "./helpers/db";

const min = (m: number) => new Date(Date.UTC(2026, 10, 17, 9, 0) + m * 60_000);

describe("lockout rule (BUILD_SPEC 7.2)", () => {
  it("locks after 5 failures within 15 minutes, for 15 minutes from the last", () => {
    expect(lockedUntil([min(0), min(1), min(2), min(3)])).toBeNull();
    expect(lockedUntil([min(0), min(1), min(2), min(3), min(4)])).toEqual(min(4 + LOCK_MINUTES));
    expect(lockedUntil([min(4), min(0), min(3), min(1), min(2)])).toEqual(min(19));
  });

  it("doesn't lock when the 5 failures are spread over 15 minutes or more", () => {
    expect(lockedUntil([min(0), min(4), min(8), min(12), min(15)])).toBeNull();
    expect(lockedUntil([min(0), min(4), min(8), min(12), min(14)])).toEqual(min(29));
  });

  it("is locked only before the end time", () => {
    expect(isLocked(min(19), min(18))).toBe(true);
    expect(isLocked(min(19), min(19))).toBe(false);
    expect(isLocked(null, min(0))).toBe(false);
  });
});

describe("lockout in the database", () => {
  let db: Db;
  let client: PGlite;
  beforeAll(async () => {
    ({ db, client } = await createTestDb());
    await db.insert(users).values({ name: "Ada Officer", email: "ada@ogsrr.test", passwordHash: "x", roles: ["revenue_officer"], mustChangePassword: false });
  });
  afterAll(async () => {
    await client.close();
  });
  const fail = (email: string, n: number) => Promise.all(Array.from({ length: n }, () => recordSignInFailure(db, email, "10.0.0.1"))).then((r) => r.at(-1) ?? null);

  it("locks on the fifth wrong password and audits it once, in the same transaction", async () => {
    expect(isLocked(await fail("ada@ogsrr.test", 4))).toBe(false);
    const until = await recordSignInFailure(db, "ADA@ogsrr.test", "10.0.0.1");
    expect(isLocked(until)).toBe(true);
    const locks = await db.select().from(auditLog).where(eq(auditLog.action, "Sign-in locked"));
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({ userName: "System", reference: "ADA@ogsrr.test" });
  });

  it("doesn't let tries while locked extend the lock", async () => {
    const before = await signInLockedUntil(db, "ada@ogsrr.test");
    await recordBlockedSignIn(db, "ada@ogsrr.test", null);
    await recordBlockedSignIn(db, "ada@ogsrr.test", null);
    expect(await signInLockedUntil(db, "ada@ogsrr.test")).toEqual(before);
  });

  it("unlocks when an Admin resets the password", async () => {
    await db.update(users).set({ passwordChangedAt: sql`now() + interval '1 second'` }).where(eq(users.email, "ada@ogsrr.test"));
    await new Promise((r) => setTimeout(r, 1100));
    expect(await signInLockedUntil(db, "ada@ogsrr.test")).toBeNull();
  });

  it("starts the count again after a successful sign-in", async () => {
    await fail("bo@ogsrr.test", 4);
    await db.insert(signInAttempts).values({ email: "bo@ogsrr.test", succeeded: true, at: sql`now() + interval '1 second'` });
    await db.insert(signInAttempts).values({ email: "bo@ogsrr.test", succeeded: false, at: sql`now() + interval '2 seconds'` });
    expect(await signInLockedUntil(db, "bo@ogsrr.test")).toBeNull();
  });

  it("locks an email with no account the same way, so the message reveals nothing", async () => {
    expect(isLocked(await fail("nobody@ogsrr.test", 5))).toBe(true);
  });

  it("ends 15 minutes after the last failure", async () => {
    const past = (m: number) => sql`now() - make_interval(mins => ${m})`;
    for (const m of [30, 29, 28, 27, 16]) {
      await db.insert(signInAttempts).values({ email: "cy@ogsrr.test", succeeded: false, at: past(m) });
    }
    // The fifth failure was 16 minutes ago: the 15-minute lock is over.
    expect(isLocked(await signInLockedUntil(db, "cy@ogsrr.test"))).toBe(false);
    const [last] = await db.select().from(signInAttempts).orderBy(desc(signInAttempts.id)).limit(1);
    expect(last!.blocked).toBe(false);
  });
});
