import type { PGlite } from "@electric-sql/pglite";
import { count, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import {
  auditLog,
  demandNotices,
  feeHeads,
  licenceFeeBands,
  lists,
  payers,
  receipts,
  revenueBudget,
  serials,
  settings,
} from "@/db/schema";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { allocateSerial, peekSerial, raiseSerial, SerialLowerError } from "@/lib/numbering";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
});

afterAll(async () => {
  await client.close();
});

const rowCount = async (table: PgTable) =>
  Number((await db.select({ n: count() }).from(table))[0]?.n ?? 0);

/** Drizzle wraps the Postgres error; the message we raise is on `cause`. */
async function expectDbError(p: Promise<unknown>, pattern: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the query to fail").toBeTruthy();
  const e = err as { message?: string; cause?: { message?: string } };
  expect(`${e.message} ${e.cause?.message ?? ""}`).toMatch(pattern);
}

describe("seed (with sample data)", () => {
  it("splits the signatory into name and designation, and retires the Remita account", async () => {
    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({ signatoryName: "[Name]", signatoryDesignation: "Head, Finance & Accounts", paymentAccounts: [] });
    expect(row!.dnPaymentInstructions).not.toMatch(/Remita/);
    const accounts = await db.select().from(lists).where(eq(lists.listName, "Collecting accounts"));
    expect(accounts.map((a) => [a.value, a.active])).toEqual([
      ["Ogun State TSA - Remita", false],
      ["OGSERC Revenue Account - [Bank 1]", true],
      ["OGSERC Revenue Account - [Bank 2]", true],
    ]);
  });

  it("uses the full Schedule 3 wording where the workbook cut 'Applies to' short", async () => {
    const rows = await db.select({ code: feeHeads.code, appliesTo: feeHeads.appliesTo }).from(feeHeads).where(sql`${feeHeads.code} in ('REG-F', 'REG-I')`).orderBy(feeHeads.code);
    expect(rows).toEqual([
      { code: "REG-F", appliesTo: "Distribution licensees other than successor distribution companies; trading and bulk supply" },
      { code: "REG-I", appliesTo: "Own-use generation notification under paragraph 3(4) (200 kW to below 1 MW)" },
    ]);
  });

  it("loads 78 fee heads, 76 licence bands and 46 payers", async () => {
    expect(await rowCount(feeHeads)).toBe(78);
    expect(await rowCount(licenceFeeBands)).toBe(76);
    expect(await rowCount(payers)).toBe(46);
    expect(await rowCount(demandNotices)).toBe(7);
    expect(await rowCount(receipts)).toBe(17);
  });

  it("keeps the FY2026 budget at full precision, so totals match the workbook", async () => {
    const [fy] = await db
      .select({ total: sql<string>`round(sum(${revenueBudget.amount}), 2)::text` })
      .from(revenueBudget)
      .where(eq(revenueBudget.financialYear, 2026));
    expect(fy?.total).toBe("3330525875.87");
    const [toDate] = await db
      .select({ total: sql<string>`round(sum(${revenueBudget.amount}), 2)::text` })
      .from(revenueBudget)
      .where(sql`${revenueBudget.financialYear} = 2026 and ${revenueBudget.month} <= 11`);
    expect(toDate?.total).toBe("2838653215.12");
  });

  it("derives the DN due date from issue date + payment terms", async () => {
    const [dn] = await db
      .select({ due: demandNotices.dueDate, terms: demandNotices.paymentTermsDays })
      .from(demandNotices)
      .where(eq(demandNotices.dnNo, "OGSERC/DN/2026/0001"));
    expect(dn).toEqual({ due: "2026-02-14", terms: 30 });
  });

  it("parses the reversal out of the sample remarks", async () => {
    const [r] = await db
      .select()
      .from(receipts)
      .where(eq(receipts.receiptNo, "OGSERC/RCT/2026/00014"));
    expect(r?.status).toBe("Reversed");
    expect(r?.reverseReason).toBe("wrong revenue head");
    expect(r?.reversedAt?.toISOString()).toBe("2026-09-12T11:00:00.000Z");
  });

  it("sets serials per BUILD_SPEC 6 and is safe to re-run", async () => {
    expect(await peekSerial(db, "receipt")).toBe(18);
    expect(await peekSerial(db, "dn")).toBe(8);
    expect(await peekSerial(db, "payer")).toBe(47);
    await seedDatabase(db, { withSample: true });
    expect(await rowCount(payers)).toBe(46);
    expect(await peekSerial(db, "receipt")).toBe(18);
    const [s] = await db.select().from(settings);
    expect(s?.asAtDate).toBe("2026-11-02");
    expect(s?.autoConfirm).toBe(false);
  });
});

describe("serial allocation", () => {
  it("hands out consecutive numbers and never repeats under concurrency", async () => {
    const got = await Promise.all(
      Array.from({ length: 10 }, () => db.transaction((tx) => allocateSerial(tx, "dn"))),
    );
    expect(new Set(got).size).toBe(10);
    expect(Math.min(...got)).toBe(8);
    expect(Math.max(...got)).toBe(17);
  });

  it("does not consume a number when the transaction rolls back", async () => {
    const before = await peekSerial(db, "payer");
    await expect(
      db.transaction(async (tx) => {
        await allocateSerial(tx, "payer");
        throw new Error("insert failed");
      }),
    ).rejects.toThrow("insert failed");
    expect(await peekSerial(db, "payer")).toBe(before);
  });

  it("allows raising but refuses lowering", async () => {
    await db.transaction((tx) => raiseSerial(tx, "receipt", 100));
    expect(await peekSerial(db, "receipt")).toBe(100);
    await expect(db.transaction((tx) => raiseSerial(tx, "receipt", 50))).rejects.toBeInstanceOf(
      SerialLowerError,
    );
    await expect(db.transaction((tx) => raiseSerial(tx, "receipt", 100))).rejects.toBeInstanceOf(
      SerialLowerError,
    );
    const [row] = await db.select().from(serials).where(eq(serials.key, "receipt"));
    expect(row?.nextValue).toBe(100);
  });
});

describe("audit log", () => {
  it("commits the entry with the change, and rolls it back with a failed change", async () => {
    const actor = { id: null, name: "Test" };
    await db.transaction((tx) =>
      writeAudit(tx, { actor, action: AUDIT_ACTIONS.settingsChanged, reference: "ok" }),
    );
    await expect(
      db.transaction(async (tx) => {
        await writeAudit(tx, { actor, action: AUDIT_ACTIONS.settingsChanged, reference: "rolled-back" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const refs = (await db.select({ r: auditLog.reference }).from(auditLog)).map((x) => x.r);
    expect(refs).toContain("ok");
    expect(refs).not.toContain("rolled-back");
  });

  it("is append-only: UPDATE, DELETE and TRUNCATE are blocked", async () => {
    await expectDbError(db.update(auditLog).set({ action: "tampered" }), /append-only/);
    await expectDbError(db.delete(auditLog), /append-only/);
    await expectDbError(db.execute(sql`truncate audit_log`), /append-only/);
  });
});

describe("no hard deletes", () => {
  it("blocks deleting receipts, demand notices and payers", async () => {
    await expectDbError(db.delete(receipts), /cannot be deleted/);
    await expectDbError(db.delete(demandNotices), /cannot be deleted/);
    await expectDbError(db.delete(payers), /cannot be deleted/);
  });
});

describe("receipt payment ref", () => {
  it("is unique (case-insensitive) among receipts that are not reversed", async () => {
    const [base] = await db.select().from(receipts).where(eq(receipts.receiptNo, "OGSERC/RCT/2026/00001"));
    const { id: _id, ...copy } = base!;
    await expect(
      db.insert(receipts).values({ ...copy, receiptNo: "TEST/1", paymentRef: "sample-rrr-0001" }),
    ).rejects.toThrow();
    // The reversed receipt's ref can be used again.
    await db.insert(receipts).values({
      ...copy,
      receiptNo: "TEST/2",
      paymentRef: "SAMPLE-RRR-0014",
      status: "Pending Confirmation",
    });
  });
});

describe("seed without sample data", () => {
  it("loads only the 36 real payers and starts receipts and DNs at 1", async () => {
    const fresh = await createTestDb();
    try {
      const result = await seedDatabase(fresh.db, { withSample: false });
      expect(result.payers).toBe(36);
      expect(result.samplePayers).toBe(0);
      expect(await peekSerial(fresh.db, "receipt")).toBe(1);
      expect(await peekSerial(fresh.db, "dn")).toBe(1);
      expect(await peekSerial(fresh.db, "payer")).toBe(47);
      const [s] = await fresh.db.select().from(settings);
      expect(s?.asAtDate).toBeNull();
    } finally {
      await fresh.client.close();
    }
  });
});

describe("migration 0003 on an existing database", () => {
  it("copies the old one-line signatory into name and designation, and retires Remita", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFileSync } = await import("node:fs");
    const pg = new PGlite();
    const run = async (file: string) => {
      for (const stmt of readFileSync(`src/db/migrations/${file}`, "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) await pg.exec(stmt);
      }
    };
    try {
      for (const f of ["0000_init.sql", "0001_audit_append_only.sql", "0002_band_rate_nullable.sql"]) await run(f);
      await pg.exec(`
        insert into settings (id, org_name, financial_year, dn_signatory) values (1, 'OGSERC', 2026, 'A. Bello, Head, Finance & Accounts');
        insert into lists (list_name, value) values ('Collecting accounts', 'Ogun State TSA - Remita'), ('Collecting accounts', 'OGSERC Revenue Account - [Bank 1]');
      `);
      await run("0003_receiver_details.sql");
      await run("0004_drop_dn_signatory.sql");
      const s = await pg.query<{ signatory_name: string; signatory_designation: string }>("select signatory_name, signatory_designation from settings");
      expect(s.rows[0]).toEqual({ signatory_name: "A. Bello", signatory_designation: "Head, Finance & Accounts" });
      const l = await pg.query<{ value: string; active: boolean }>("select value, active from lists order by value");
      expect(l.rows).toEqual([
        { value: "OGSERC Revenue Account - [Bank 1]", active: true },
        { value: "Ogun State TSA - Remita", active: false },
      ]);
    } finally {
      await pg.close();
    }
  });
});
