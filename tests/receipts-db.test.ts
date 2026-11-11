import type { PGlite } from "@electric-sql/pglite";
import Decimal from "decimal.js";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import { auditLog, receipts, serials, settings, users } from "@/db/schema";
import { UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, type AuditActor } from "@/lib/audit";
import { getDemandNotice, listDemandNotices } from "@/lib/dn-service";
import {
  CodeMismatchError,
  confirmReceipts,
  getReceipt,
  listReceipts,
  recordReceipt,
  reverseReceipts,
  updatePendingReceipt,
} from "@/lib/receipt-service";
import { dnFilterSchema, receiptFilterSchema, receiptSchema } from "@/lib/validation";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;
let officer: AuditActor;
let finance: AuditActor;

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
  const [o, f] = await db
    .insert(users)
    .values([
      { name: "Revenue Officer", email: "ro@test", passwordHash: "x", roles: ["revenue_officer"] },
      { name: "Finance Officer", email: "fo@test", passwordHash: "x", roles: ["finance_officer"] },
    ])
    .returning({ id: users.id, name: users.name });
  officer = { id: o!.id, name: o!.name };
  finance = { id: f!.id, name: f!.name };
});

afterAll(async () => {
  await client.close();
});

const values = (o: Record<string, string>) =>
  receiptSchema.parse({
    receiptDate: "2026-11-02",
    payerId: "OGS-P-0046",
    feeCode: "PER-05",
    dnNo: "",
    period: "",
    quantity: "1",
    overrideDue: "",
    amountPaid: "500000",
    channel: "Remita (TSA)",
    collectingAccount: "Ogun State TSA - Remita",
    paymentRef: "",
    valueDate: "",
    remarks: "",
    ...o,
  });
const filters = (f: Record<string, unknown> = {}) => receiptFilterSchema.parse(f);
const lastAudit = async () => (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0]!;
const serial = async () => (await db.select().from(serials).where(eq(serials.key, "receipt")))[0]!.nextValue;
const fieldErrors = async (p: Promise<unknown>) => {
  const e = await p.catch((err: unknown) => err);
  expect(e).toBeInstanceOf(UserFacingError);
  return (e as UserFacingError).fieldErrors ?? {};
};

describe("register (sample data)", () => {
  it("has 17 receipts: 16 live and 1 reversed, with 2 pending worth ₦7,750,000", async () => {
    const { totals } = await listReceipts(db, filters());
    expect(totals.count).toBe(17);
    expect(totals.reversedCount).toBe(1);
    expect(totals.pendingCount).toBe(2);
    expect(new Decimal(totals.pending).toFixed(2)).toBe("7750000.00");
    expect(new Decimal(totals.confirmed).toFixed(2)).toBe("111100000.00");
  });

  it("filters Pending only, by payer, head, account and receipt date", async () => {
    const pending = await listReceipts(db, filters({ status: "pending" }));
    expect(pending.rows.every((r) => r.status === "Pending Confirmation")).toBe(true);
    expect(pending.totals.count).toBe(2);
    const ibedc = await listReceipts(db, filters({ payer: "OGS-P-0001" }));
    expect(ibedc.rows.every((r) => r.payerId === "OGS-P-0001")).toBe(true);
    const feb = await listReceipts(db, filters({ from: "2026-02-01", to: "2026-02-28" }));
    expect(feb.rows.every((r) => r.receiptDate.startsWith("2026-02"))).toBe(true);
  });
});

describe("recording receipts (BUILD_SPEC 4.3)", () => {
  it("lists every problem at once", async () => {
    const errs = await fieldErrors(
      recordReceipt(db, officer, values({ payerId: "NOPE", feeCode: "NOPE", channel: "Pigeon", collectingAccount: "Mattress", paymentRef: "X1" }), {
        acknowledgeCodeMismatch: false,
      }),
    );
    expect(Object.keys(errs).sort()).toEqual(["channel", "collectingAccount", "feeCode", "payerId"]);
  });

  it("saves as Pending with snapshots, the next number, value date = receipt date, and an audit entry", async () => {
    const before = await serial();
    const r = await recordReceipt(db, officer, values({ feeCode: "REG-F", paymentRef: "RRR-NEW-0001" }), { acknowledgeCodeMismatch: false });
    expect(r.receiptNo).toBe(`OGSERC/RCT/2026/${String(before).padStart(5, "0")}`);
    expect(r.status).toBe("Pending Confirmation");
    const row = (await getReceipt(db, r.id))!;
    expect(row.payerName).toBe("POWER HORSE LINES LIMITED");
    expect(row.revenueHead).toBe("Registration fee - Category F");
    expect(row.revenueCategory).toBe("A. Registration (Schedule 3)");
    expect(row.revenueType).toBe("IGR");
    expect(row.budgetLineId).toBe("BL-C1");
    expect(row.valueDate).toBe("2026-11-02");
    expect(new Decimal(row.amountDue).toFixed(2)).toBe("500000.00");
    expect(row.recordedById).toBe(officer.id);
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.receiptRecorded);
    expect(audit.details).toMatchObject({ code: "REG-F", amountPaid: "500000.00", status: "Pending Confirmation" });
  });

  it("blocks a duplicate payment ref (any case) among receipts that aren't reversed, without using a number", async () => {
    const before = await serial();
    const errs = await fieldErrors(recordReceipt(db, officer, values({ feeCode: "REG-F", paymentRef: "rrr-new-0001" }), { acknowledgeCodeMismatch: false }));
    expect(errs.paymentRef).toMatch(/possible duplicate/);
    expect(await serial()).toBe(before);
  });

  it("uses the notice's outstanding balance as the amount due", async () => {
    const r = await recordReceipt(
      db,
      officer,
      values({ payerId: "OGS-P-0001", feeCode: "LEV-01", dnNo: "OGSERC/DN/2026/0001", amountPaid: "5000000", paymentRef: "RRR-DN-0001" }),
      { acknowledgeCodeMismatch: false },
    );
    expect(new Decimal((await getReceipt(db, r.id))!.amountDue).toFixed(2)).toBe("15000000.00");
    expect(r.overpaysNotice).toBeNull();
  });

  it("checks the notice: exists, same payer, not cancelled", async () => {
    const missing = await fieldErrors(
      recordReceipt(db, officer, values({ dnNo: "OGSERC/DN/2026/9999", paymentRef: "RRR-X1" }), { acknowledgeCodeMismatch: false }),
    );
    expect(missing.dnNo).toMatch(/was not found/);
    const otherPayer = await fieldErrors(
      recordReceipt(db, officer, values({ dnNo: "OGSERC/DN/2026/0001", paymentRef: "RRR-X2" }), { acknowledgeCodeMismatch: false }),
    );
    expect(otherPayer.dnNo).toMatch(/different payer/);
  });

  it("asks for confirmation when the notice is for a different revenue head", async () => {
    const v = values({ payerId: "OGS-P-0001", feeCode: "APP-01", dnNo: "OGSERC/DN/2026/0001", amountPaid: "100", paymentRef: "RRR-MISMATCH" });
    const err = await recordReceipt(db, officer, v, { acknowledgeCodeMismatch: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodeMismatchError);
    expect((err as CodeMismatchError).dnCode).toBe("LEV-01");
    await recordReceipt(db, officer, v, { acknowledgeCodeMismatch: true });
    expect((await lastAudit()).details).toMatchObject({ revenueCodeDiffersFromNotice: true });
  });

  it("warns, but doesn't block, when the payment exceeds the notice's balance", async () => {
    const r = await recordReceipt(
      db,
      officer,
      values({ payerId: "OGS-P-0003", feeCode: "LEV-01", dnNo: "OGSERC/DN/2026/0003", amountPaid: "16000000", paymentRef: "RRR-OVER" }),
      { acknowledgeCodeMismatch: false },
    );
    expect(r.overpaysNotice).toBe("1000000.00");
  });

  it("auto-confirms as '<user> (auto)' when the setting is on", async () => {
    await db.update(settings).set({ autoConfirm: true });
    const r = await recordReceipt(db, officer, values({ paymentRef: "RRR-AUTO" }), { acknowledgeCodeMismatch: false });
    await db.update(settings).set({ autoConfirm: false });
    const row = (await getReceipt(db, r.id))!;
    expect(row.status).toBe("Confirmed");
    expect(row.confirmedBy).toBe("Revenue Officer (auto)");
  });
});

describe("registration is a one-off payment", () => {
  const reg = (payerId: string, paid: string, ref: string) =>
    recordReceipt(db, officer, values({ payerId, feeCode: "REG-F", amountPaid: paid, paymentRef: ref }), { acknowledgeCodeMismatch: false });

  it("blocks a second registration receipt once the fee is covered, and says who has paid", async () => {
    // OGS-P-0046 paid REG-F (₦500,000) in the first recording test above.
    const errs = await fieldErrors(reg("OGS-P-0046", "500000", "RRR-REG-AGAIN"));
    expect(errs.feeCode).toMatch(/has already registered: ₦500,000.00 paid on OGSERC\/RCT\/2026\/\d{5}/);
    expect(errs.feeCode).toMatch(/one-off payment/);
  });

  it("counts confirmed sample registrations too", async () => {
    // Green Power Distribution Company has a confirmed REG-F receipt in the sample data.
    const errs = await fieldErrors(reg("OGS-P-0004", "500000", "RRR-REG-GP"));
    expect(errs.feeCode).toMatch(/already registered/);
  });

  it("allows part payments until the fee is covered, and again after a reversal", async () => {
    await reg("OGS-P-0045", "200000", "RRR-REG-P1");
    const second = await reg("OGS-P-0045", "300000", "RRR-REG-P2");
    expect((await fieldErrors(reg("OGS-P-0045", "1", "RRR-REG-P3"))).feeCode).toMatch(/already registered: ₦500,000.00/);
    await reverseReceipts(db, finance, [second.id], "Wrong amount");
    await expect(reg("OGS-P-0045", "300000", "RRR-REG-P4")).resolves.toMatchObject({ status: "Pending Confirmation" });
  });

  it("doesn't count the receipt being edited against itself", async () => {
    const [own] = (await listReceipts(db, filters({ q: "RRR-REG-P4" }))).rows;
    const out = await updatePendingReceipt(
      db,
      officer,
      own!.id,
      values({ payerId: "OGS-P-0045", feeCode: "REG-F", amountPaid: "300000", paymentRef: "RRR-REG-P4", remarks: "Checked" }),
      { acknowledgeCodeMismatch: false },
    );
    expect(out.changed).toBe(1);
  });
});

describe("confirming (BUILD_SPEC 4.4) and the self-confirmation block", () => {
  it("never lets a user confirm a receipt they recorded", async () => {
    const r = await recordReceipt(db, finance, values({ paymentRef: "RRR-SELF" }), { acknowledgeCodeMismatch: false });
    const result = await confirmReceipts(db, finance, [r.id]);
    expect(result).toMatchObject({ confirmed: 0, ownReceipts: 1 });
    expect((await getReceipt(db, r.id))!.status).toBe("Pending Confirmation");
  });

  it("confirms only Pending receipts, reports the rest as skipped, and audits each", async () => {
    const r = await recordReceipt(db, officer, values({ paymentRef: "RRR-CONF" }), { acknowledgeCodeMismatch: false });
    const { rows } = await listReceipts(db, filters({ status: "confirmed" }));
    const before = (await db.select().from(auditLog)).length;
    const result = await confirmReceipts(db, finance, [r.id, rows[0]!.id]);
    expect(result).toMatchObject({ confirmed: 1, notPending: 1, ownReceipts: 0 });
    expect((await db.select().from(auditLog)).length).toBe(before + 1);
    const row = (await getReceipt(db, r.id))!;
    expect(row.status).toBe("Confirmed");
    expect(row.confirmedBy).toBe("Finance Officer");
    expect(row.confirmedAt).toBeInstanceOf(Date);
    expect((await lastAudit()).action).toBe(AUDIT_ACTIONS.receiptConfirmed);
  });

  it("counts a confirmed receipt against its notice", async () => {
    const { rows } = await listDemandNotices(db, dnFilterSchema.parse({ q: "DN/2026/0001" }), "2026-11-02");
    const pending = (await listReceipts(db, filters({ q: "RRR-DN-0001" }))).rows[0]!;
    await confirmReceipts(db, finance, [pending.id]);
    const dn = await getDemandNotice(db, rows[0]!.id, "2026-11-02");
    expect(new Decimal(dn!.outstanding).toFixed(2)).toBe("10000000.00");
  });
});

describe("reversing (BUILD_SPEC 4.4)", () => {
  it("reverses with a reason, drops the receipt out of the totals, and frees the payment ref", async () => {
    const before = await listReceipts(db, filters());
    const target = (await listReceipts(db, filters({ q: "RRR-CONF" }))).rows[0]!;
    const result = await reverseReceipts(db, finance, [target.id], "Wrong revenue head");
    expect(result).toMatchObject({ reversed: 1, skipped: 0 });
    const row = (await getReceipt(db, target.id))!;
    expect(row.status).toBe("Reversed");
    expect(row.reverseReason).toBe("Wrong revenue head");
    expect(row.reversedBy).toBe("Finance Officer");
    expect((await lastAudit()).details).toMatchObject({ reason: "Wrong revenue head", previousStatus: "Confirmed" });

    const after = await listReceipts(db, filters());
    expect(new Decimal(before.totals.confirmed).minus(after.totals.confirmed).toFixed(2)).toBe("500000.00");
    expect(after.totals.reversedCount).toBe(before.totals.reversedCount + 1);

    // The reference can be used again once the receipt is reversed; both are flagged on the register.
    const again = await recordReceipt(db, officer, values({ paymentRef: "RRR-CONF" }), { acknowledgeCodeMismatch: false });
    const flagged = await listReceipts(db, filters({ q: "RRR-CONF" }));
    expect(flagged.rows.map((r) => r.duplicateRef)).toEqual([true, true]);
    expect(again.status).toBe("Pending Confirmation");
    expect((await reverseReceipts(db, finance, [target.id], "again")).skipped).toBe(1);
  });
});

describe("editing pending receipts (BUILD_SPEC 4.4)", () => {
  it("lets the recorder edit before confirmation, and audits the changes", async () => {
    const r = await recordReceipt(db, officer, values({ paymentRef: "RRR-EDIT", amountPaid: "400000" }), { acknowledgeCodeMismatch: false });
    const out = await updatePendingReceipt(db, officer, r.id, values({ paymentRef: "RRR-EDIT", amountPaid: "450000", remarks: "Corrected" }), {
      acknowledgeCodeMismatch: false,
    });
    expect(out.changed).toBe(2);
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.receiptEdited);
    expect(audit.details).toMatchObject({ changes: { amountPaid: { old: "400000.00", new: "450000.00" } } });
  });

  it("refuses edits by anyone else, after confirmation, or that move the receipt to another year", async () => {
    const r = await recordReceipt(db, officer, values({ paymentRef: "RRR-LOCK" }), { acknowledgeCodeMismatch: false });
    await expect(updatePendingReceipt(db, finance, r.id, values({ paymentRef: "RRR-LOCK" }), { acknowledgeCodeMismatch: false })).rejects.toThrow(
      /Only the person who recorded/,
    );
    const yearErr = await fieldErrors(
      updatePendingReceipt(db, officer, r.id, values({ paymentRef: "RRR-LOCK", receiptDate: "2027-01-02" }), { acknowledgeCodeMismatch: false }),
    );
    expect(yearErr.receiptDate).toMatch(/2026/);
    await confirmReceipts(db, finance, [r.id]);
    await expect(updatePendingReceipt(db, officer, r.id, values({ paymentRef: "RRR-LOCK" }), { acknowledgeCodeMismatch: false })).rejects.toThrow(
      /can only be reversed/,
    );
    expect((await db.select().from(receipts).where(eq(receipts.id, r.id)))[0]!.status).toBe("Confirmed");
  });
});
