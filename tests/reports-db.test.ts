import type { PGlite } from "@electric-sql/pglite";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import { auditLog, bankStatementTotals, payers, serials } from "@/db/schema";
import { UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, type AuditActor } from "@/lib/audit";
import { parseCsv, toCsv } from "@/lib/csv";
import { importPayers } from "@/lib/payer-import";
import { bankRecon, lineStatus, saveStatementTotal } from "@/lib/reports-service";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;
const actor: AuditActor = { id: null, name: "Test Admin" };

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
});

afterAll(async () => {
  await client.close();
});

const lastAudit = async () => (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0]!;
const payerSerial = async () => (await db.select().from(serials).where(eq(serials.key, "payer")))[0]!.nextValue;

describe("csv", () => {
  it("reads quotes, commas, embedded newlines, CRLF and a BOM", () => {
    const text = '﻿name,notes\r\n"Acme, Ltd","said ""hi""\nthen left"\r\nPlain,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Acme, Ltd", 'said "hi"\nthen left'],
      ["Plain", ""],
    ]);
  });

  it("writes what it reads", () => {
    const rows = [["a,b", 'q"t', "x"], ["1", "", "line\nbreak"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("budget line status (BUILD_SPEC 4.8 order)", () => {
  it("checks unbudgeted, no budget, not phased, then the achieved bands", () => {
    expect(lineStatus(0, 0, 0, 5)).toBe("Unbudgeted receipts");
    expect(lineStatus(0, 0, 0, 0)).toBe("No budget set");
    expect(lineStatus(100, 0, 0, 0)).toBe("Not yet phased");
    expect(lineStatus(100, 50, 50, 50)).toBe("On / above budget");
    expect(lineStatus(100, 100, 75, 75)).toBe("Slightly behind");
    expect(lineStatus(100, 100, 74.99, 74.99)).toBe("Behind budget");
  });
});

describe("bank statement totals", () => {
  const tsa = "Ogun State TSA - Remita";
  it("enters, changes and clears a statement total, auditing each change", async () => {
    await saveStatementTotal(db, actor, { financialYear: 2026, month: 2, collectingAccount: tsa, statementTotal: "41000000" });
    let r = await bankRecon(db, 2026);
    expect(r.months[1]![tsa]).toEqual({ register: "41000000.00", statement: "41000000.00", difference: "0.00" });
    expect((await lastAudit()).action).toBe(AUDIT_ACTIONS.statementTotalEntered);

    await saveStatementTotal(db, actor, { financialYear: 2026, month: 2, collectingAccount: tsa, statementTotal: "40500000" });
    r = await bankRecon(db, 2026);
    expect(r.months[1]![tsa]!.difference).toBe("-500000.00");
    expect((await lastAudit()).details).toEqual({ changes: { statementTotal: { old: "41000000.00", new: "40500000.00" } } });

    const before = (await db.select().from(auditLog)).length;
    expect((await saveStatementTotal(db, actor, { financialYear: 2026, month: 2, collectingAccount: tsa, statementTotal: "40500000.00" })).changed).toBe(false);
    expect((await db.select().from(auditLog)).length).toBe(before);

    await saveStatementTotal(db, actor, { financialYear: 2026, month: 2, collectingAccount: tsa, statementTotal: null });
    r = await bankRecon(db, 2026);
    expect(r.months[1]![tsa]).toEqual({ register: "41000000.00", statement: null, difference: null });
    expect(await db.select().from(bankStatementTotals)).toHaveLength(0);
  });
});

describe("payer CSV import (BUILD_SPEC 6)", () => {
  const csv = toCsv([
    ["Payer name", "Payer category", "LGA", "Schedule 3 category (A-K)", "Email", "Shoe size", "Address", "Capacity (MW)"],
    ["Brand New Grid Ltd", "Mini-Grid Developer", "Abeokuta South", "E", "ops@bng.ng", "44", "1 Grid Road", "2.5"],
    ["CCETC Taihu Distribution Ltd", "Independent Distribution Licensee", "", "F", "", "", "2 Taihu Way", "0"],
    ["ccetc taihu", "", "", "", "", "", "3 Road", "0"],
    ["Bad Email Co", "", "", "", "not-an-email", "", "4 Road", "0"],
    ["Second New Grid Ltd", "Atlantis Category", "", "", "", "", "5 Road", "0"],
    ["brand new grid limited", "", "", "", "", "", "6 Road", "0"],
    ["No Address Ltd", "", "", "", "", "", "", ""],
  ]);

  it("previews without writing anything, and shows the IDs it would assign", async () => {
    const before = { count: (await db.select().from(payers)).length, serial: await payerSerial(), audits: (await db.select().from(auditLog)).length };
    const r = await importPayers(db, actor, csv, { dryRun: true, includeNearDuplicates: false });
    expect(r.unknownHeaders).toEqual(["Shoe size"]);
    expect(r.rows.map((x) => [x.line, x.outcome])).toEqual([
      [2, "add"],
      [3, "near-duplicate"],
      [4, "skip"],
      [5, "skip"],
      [6, "skip"],
      [7, "near-duplicate"],
      [8, "skip"],
    ]);
    expect(r.rows[0]!.payerId).toBe("OGS-P-0047");
    expect(r.rows[1]!.messages[0]).toMatch(/CCETC TAIHU/);
    expect(r.rows[2]!.messages[0]).toMatch(/already has this name/);
    expect(r.rows[3]!.messages[0]).toMatch(/valid email/);
    expect(r.rows[4]!.messages[0]).toMatch(/payer categories list/);
    // Row 7 matches row 2 of the same file.
    expect(r.rows[5]!.messages[0]).toMatch(/Brand New Grid Ltd/);
    expect(r.rows[6]!.messages.join(" ")).toMatch(/Enter the address/);
    expect(r.rows[6]!.messages.join(" ")).toMatch(/capacity in MW/);
    expect({ count: (await db.select().from(payers)).length, serial: await payerSerial(), audits: (await db.select().from(auditLog)).length }).toEqual(before);
  });

  it("imports in one transaction, with near duplicates only when asked", async () => {
    const r = await importPayers(db, actor, csv, { dryRun: false, includeNearDuplicates: true });
    expect([r.added, r.nearDuplicates, r.skipped]).toEqual([3, 2, 4]);
    const [row] = await db.select().from(payers).where(eq(payers.payerId, "OGS-P-0047"));
    expect(row!.name).toBe("Brand New Grid Ltd");
    expect(row!.lga).toBe("Abeokuta South");
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.payerAdded);
    expect(audit.details).toMatchObject({ source: "CSV import" });
  });

  it("refuses a file with no name column or no rows", async () => {
    await expect(importPayers(db, actor, "Category\nOther", { dryRun: true, includeNearDuplicates: false })).rejects.toThrow(UserFacingError);
    await expect(importPayers(db, actor, "Payer name\n", { dryRun: true, includeNearDuplicates: false })).rejects.toThrow(/no payer rows/);
  });
});
