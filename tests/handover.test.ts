import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { count, desc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { auditLog, handoverBatches, handoverLines } from "@/db/schema";
import type { AuditActor } from "@/lib/audit";
import { handoverChecksum, HandoverFileError, parseHandover, previousBatchNo } from "@/lib/handover";
import { importHandover, listHandoverLines } from "@/lib/handover-service";
import { readHandoverWorkbook } from "@/lib/handover-xlsx";
import { createTestDb } from "./helpers/db";

/*
 * R&E payment handover (REVENUE-REGISTRY-CONTRACT.md §5 and §9), against R&E's sample files.
 * The samples are made up and marked SAMPLE.
 */

const DIR = "tests/fixtures/handover";
const sample = (n: 1 | 2) => new Uint8Array(readFileSync(`${DIR}/OGSERC-EXP-2026-000${n}.xlsx`));
const file = (n: 1 | 2, bytes: Uint8Array = sample(n)) => ({ name: `OGSERC-EXP-2026-000${n}.xlsx`, bytes });
const actor: AuditActor = { id: null, name: "Test Finance" };

/** Loads a sample, lets the test change it, and writes it back. `recompute` refreshes the Batch sheet. */
async function variant(n: 1 | 2, change: (wb: ExcelJS.Workbook) => void, recompute = false): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(sample(n).buffer as ArrayBuffer);
  change(wb);
  if (recompute) {
    const ws = wb.getWorksheet("Payments")!;
    const lines: { lineId: string; type: string; kobo: number }[] = [];
    ws.eachRow((row, i) => {
      if (i > 1) lines.push({ lineId: String(row.getCell(1).value), type: String(row.getCell(2).value), kobo: Number(row.getCell(8).value) });
    });
    const set = (field: string, value: string | number) => {
      wb.getWorksheet("Batch")!.eachRow((row) => {
        if (row.getCell(1).value === field) row.getCell(2).value = value;
      });
    };
    const sum = (t: string) => lines.filter((l) => l.type === t).reduce((a, l) => a + l.kobo, 0);
    set("Batch no.", String(ws.getRow(2).getCell(4).value));
    set("Payment lines", lines.filter((l) => l.type === "Payment").length);
    set("Reversal lines", lines.filter((l) => l.type === "Reversal").length);
    set("Payment total (kobo)", sum("Payment"));
    set("Reversal total (kobo)", sum("Reversal"));
    set("Net total (kobo)", sum("Payment") + sum("Reversal"));
    set("Checksum (SHA-256)", handoverChecksum(lines.map((l) => ({ lineId: l.lineId, amountKobo: String(l.kobo) }))));
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Sets a Payments cell by header name on a data row (row 2 = first line). */
function setCell(wb: ExcelJS.Workbook, row: number, header: string, value: ExcelJS.CellValue) {
  const ws = wb.getWorksheet("Payments")!;
  let col = 0;
  ws.getRow(1).eachCell((c, i) => {
    if (c.value === header) col = i;
  });
  ws.getRow(row).getCell(col).value = value;
}

const parse = async (bytes: Uint8Array, name = "x.xlsx") => parseHandover(await readHandoverWorkbook(name, bytes));
async function refusal(p: Promise<unknown>): Promise<HandoverFileError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HandoverFileError);
  return err as HandoverFileError;
}
const allText = (e: HandoverFileError) => [e.message, ...e.problems].join(" ");

describe("reading a handover file (contract §4, §5 steps 1-3)", () => {
  it("reads sample batch 1: four payments, net ₦775,000.00, checksum as on the Batch sheet", async () => {
    const { batch, lines, ignoredColumns } = await parse(sample(1));
    expect(batch).toMatchObject({
      batchNo: "OGSERC/EXP/2026/0001",
      formatVersion: 1,
      paymentLines: 4,
      reversalLines: 0,
      paymentTotal: "775000.00",
      netTotal: "775000.00",
      confirmedFrom: "2026-11-17",
      checksum: "71e11af0c1e993cb1abb8e8c449da1eacea12db2ce0f58796115e431e85c18ec",
    });
    expect(lines.map((l) => [l.lineId, l.amount])).toEqual([
      ["OGSERC/PAY/2026/00001:P", "500000.00"],
      ["OGSERC/PAY/2026/00002:P", "25000.00"],
      ["OGSERC/PAY/2026/00003:P", "150000.00"],
      ["OGSERC/PAY/2026/00004:P", "100000.00"],
    ]);
    expect(lines[0]).toMatchObject({ rrr: "290012345678", category: "D", purpose: "Registration fee", revenueCode: null });
    expect(ignoredColumns).toEqual([]);
  });

  it("reads sample batch 2: a reversal (negative) and a payment, net ₦350,000.00", async () => {
    const { batch, lines } = await parse(sample(2));
    expect(batch).toMatchObject({ reversalLines: 1, reversalTotal: "-150000.00", netTotal: "350000.00", checksum: expect.stringMatching(/^7884d722/) });
    expect(lines[0]).toMatchObject({ lineType: "Reversal", amount: "-150000.00", reversedOn: "2026-11-19", reversalReason: "Transfer recalled by the bank" });
  });

  it("refuses the CSV copy, which has no Batch sheet", async () => {
    const e = await refusal(readHandoverWorkbook("OGSERC-EXP-2026-0001.csv", new Uint8Array(readFileSync(`${DIR}/OGSERC-EXP-2026-0001.csv`))));
    expect(allText(e)).toMatch(/Upload the \.xlsx file.*no Batch sheet/);
  });

  it("refuses a file that isn't a workbook", async () => {
    await refusal(readHandoverWorkbook("x.xlsx", new TextEncoder().encode("not a workbook")));
  });

  it("refuses an edited amount as incomplete or altered", async () => {
    const bytes = await variant(2, (wb) => {
      setCell(wb, 3, "Amount (NGN)", 400000);
      setCell(wb, 3, "Amount (kobo)", 40000000);
    });
    const e = await refusal(parse(bytes));
    expect(e.message).toMatch(/incomplete or has been altered/);
    expect(allText(e)).toMatch(/checksum doesn't match/);
  });

  it("checks each line: naira × 100 = kobo, Line ID, sign, batch number and text dates", async () => {
    const bytes = await variant(1, (wb) => {
      setCell(wb, 2, "Amount (NGN)", 500001);
      setCell(wb, 3, "Line ID", "OGSERC/PAY/2026/00099:P");
      setCell(wb, 4, "Batch no.", "OGSERC/EXP/2026/0009");
      setCell(wb, 5, "Date received", new Date("2026-11-16T00:00:00Z"));
    });
    const e = await refusal(parse(bytes));
    const t = allText(e);
    expect(t).toMatch(/Row 2: Amount \(NGN\) 500001\.00 × 100 isn't Amount \(kobo\) 50000000/);
    expect(t).toMatch(/Row 3: Line ID OGSERC\/PAY\/2026\/00099:P doesn't match/);
    expect(t).toMatch(/Row 4: Batch no\. OGSERC\/EXP\/2026\/0009 isn't this batch/);
    expect(t).toMatch(/Row 5: Date received must be text in the form YYYY-MM-DD, not an Excel date/);
  });

  it("refuses a positive reversal and another format version", async () => {
    const e = await refusal(parse(await variant(2, (wb) => {
      setCell(wb, 2, "Amount (NGN)", 150000);
      setCell(wb, 2, "Amount (kobo)", 15000000);
    })));
    expect(allText(e)).toMatch(/A Reversal line's amount must be below zero/);
    const v2 = await variant(1, (wb) => {
      wb.getWorksheet("Batch")!.eachRow((row) => {
        if (row.getCell(1).value === "Format version") row.getCell(2).value = 2;
      });
    });
    expect(allText(await refusal(parse(v2)))).toMatch(/format version 2/);
  });

  it("refuses a missing column and ignores an unknown one at the end", async () => {
    const missing = await variant(1, (wb) => {
      wb.getWorksheet("Payments")!.getRow(1).getCell(12).value = "Remita ref";
    });
    expect(allText(await refusal(parse(missing)))).toMatch(/missing the column "RRR"/);
    const extra = await variant(1, (wb) => {
      const ws = wb.getWorksheet("Payments")!;
      ws.getRow(1).getCell(26).value = "Branch";
      ws.getRow(2).getCell(26).value = "Abeokuta";
    });
    expect((await parse(extra)).ignoredColumns).toEqual(["Branch"]);
  });

  it("works out the previous batch number for the missed-file warning", () => {
    expect(previousBatchNo("OGSERC/EXP/2026/0007")).toBe("OGSERC/EXP/2026/0006");
    expect(previousBatchNo("OGSERC/EXP/2026/0010")).toBe("OGSERC/EXP/2026/0009");
    expect(previousBatchNo("OGSERC/EXP/2026/0001")).toBeNull();
  });
});

describe("importing (contract §5 steps 4-8 and the §9 test plan)", () => {
  let db: Db;
  let client: PGlite;
  beforeAll(async () => {
    ({ db, client } = await createTestDb());
  });
  afterAll(async () => {
    await client.close();
  });
  const lineCount = async () => Number((await db.select({ n: count() }).from(handoverLines))[0]!.n);
  const lastAudit = async () => (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0];

  it("refuses batch 2 before batch 1: import the earlier batch first", async () => {
    const e = await refusal(importHandover(db, actor, file(2), { dryRun: false }));
    expect(e.message).toBe("Import the earlier batch first.");
    expect(e.problems[0]).toMatch(/OGSERC\/PAY\/2026\/00003:R reverses OGSERC\/PAY\/2026\/00003/);
    expect(await lineCount()).toBe(0);
  });

  it("previews batch 1 without writing anything", async () => {
    const r = await importHandover(db, actor, file(1), { dryRun: true });
    expect(r).toMatchObject({ status: "new", added: 4, skipped: 0, netTotal: "775000.00", warnings: [] });
    expect(await lineCount()).toBe(0);
    expect(await lastAudit()).toBeUndefined();
  });

  it("imports batch 1: four lines, the batch record with the file, and one audit entry", async () => {
    const r = await importHandover(db, actor, file(1), { dryRun: false });
    expect(r).toMatchObject({ status: "new", added: 4 });
    expect(await lineCount()).toBe(4);
    const [b] = await db.select().from(handoverBatches);
    expect(b).toMatchObject({ batchNo: "OGSERC/EXP/2026/0001", netTotal: "775000.00", linesAdded: 4, linesSkipped: 0, importedBy: "Test Finance", fileName: "OGSERC-EXP-2026-0001.xlsx" });
    expect(Buffer.from(b!.fileBytes).equals(Buffer.from(sample(1)))).toBe(true);
    expect(await lastAudit()).toMatchObject({ action: "R&E handover imported", reference: "OGSERC/EXP/2026/0001", userName: "Test Finance" });
  });

  it("says 'already imported' for batch 1 again, and changes nothing", async () => {
    const auditBefore = (await lastAudit())!.id;
    const r = await importHandover(db, actor, file(1), { dryRun: false });
    expect(r).toMatchObject({ status: "already-imported", added: 0, skipped: 4 });
    expect((await lastAudit())!.id).toBe(auditBefore);
  });

  it("refuses the same batch number with different contents", async () => {
    const bytes = await variant(1, (wb) => {
      setCell(wb, 5, "Amount (NGN)", 90000);
      setCell(wb, 5, "Amount (kobo)", 9000000);
    }, true);
    const e = await refusal(importHandover(db, actor, file(1, bytes), { dryRun: false }));
    expect(e.message).toMatch(/already imported with different contents/);
  });

  it("imports batch 2: the reversal is accepted as its own negative line", async () => {
    const r = await importHandover(db, actor, file(2), { dryRun: false });
    expect(r).toMatchObject({ status: "new", added: 2, skipped: 0, warnings: [] });
    const { rows, totals } = await listHandoverLines(db, { page: 1 });
    expect(totals).toMatchObject({ count: 6, payments: "1275000.00", reversals: "-150000.00", net: "1125000.00" });
    // 77,500,000 + 35,000,000 kobo, as both sides should agree (contract §9 step 3).
    expect(rows.find((x) => x.lineId === "OGSERC/PAY/2026/00003:P")).toMatchObject({ reversed: true, amount: "150000.00" });
    expect(rows.find((x) => x.lineId === "OGSERC/PAY/2026/00001:P")).toMatchObject({ reversed: false });
  });

  it("refuses an edited copy of batch 2 (one amount changed)", async () => {
    const bytes = await variant(2, (wb) => {
      setCell(wb, 3, "Amount (NGN)", 450000);
      setCell(wb, 3, "Amount (kobo)", 45000000);
    });
    expect((await refusal(importHandover(db, actor, file(2, bytes), { dryRun: false }))).message).toMatch(/incomplete or has been altered/);
  });

  it("skips lines already held with the same amount, refuses a different amount, and warns about a missed batch", async () => {
    // A batch 4 that repeats 00005:P (held from batch 2) and adds 00006:P; batch 3 was never imported.
    const batch4 = (kobo: number) =>
      variant(2, (wb) => {
        const ws = wb.getWorksheet("Payments")!;
        ws.spliceRows(2, 1); // drop the reversal; row 2 is now 00005:P
        ws.getRow(2).getCell(8).value = kobo;
        ws.getRow(2).getCell(7).value = kobo / 100;
        const copy = ws.getRow(2).values as ExcelJS.CellValue[];
        const r3 = ws.getRow(3);
        copy.forEach((v, i) => {
          if (i > 0) r3.getCell(i).value = v;
        });
        r3.getCell(1).value = "OGSERC/PAY/2026/00006:P";
        r3.getCell(3).value = "OGSERC/PAY/2026/00006";
        ws.eachRow((row, i) => {
          if (i > 1) row.getCell(4).value = "OGSERC/EXP/2026/0004";
        });
      }, true);

    const conflict = await refusal(importHandover(db, actor, { name: "b4.xlsx", bytes: await batch4(60000000) }, { dryRun: false }));
    expect(conflict.problems[0]).toMatch(/OGSERC\/PAY\/2026\/00005:P is held from OGSERC\/EXP\/2026\/0002 with a different amount/);

    const r = await importHandover(db, actor, { name: "b4.xlsx", bytes: await batch4(50000000) }, { dryRun: false });
    expect(r).toMatchObject({ added: 1, skipped: 1 });
    expect(r.lines.map((l) => [l.lineId, l.outcome])).toEqual([
      ["OGSERC/PAY/2026/00005:P", "held"],
      ["OGSERC/PAY/2026/00006:P", "add"],
    ]);
    expect(r.warnings[0]).toMatch(/OGSERC\/EXP\/2026\/0003, hasn't been imported/);
  });

  it("keeps lines and batches append-only", async () => {
    await expect(db.update(handoverLines).set({ payer: "Changed" }).where(eq(handoverLines.lineId, "OGSERC/PAY/2026/00001:P"))).rejects.toThrow();
    await expect(db.delete(handoverBatches).where(eq(handoverBatches.batchNo, "OGSERC/EXP/2026/0001"))).rejects.toThrow();
  });
});
