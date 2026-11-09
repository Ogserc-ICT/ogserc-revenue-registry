import type { PGlite } from "@electric-sql/pglite";
import Decimal from "decimal.js";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import { auditLog, demandNotices, payers, serials } from "@/db/schema";
import { UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, type AuditActor } from "@/lib/audit";
import { deriveDemandNotice } from "@/lib/demandNotice";
import {
  cancelDemandNotices,
  getDemandNotice,
  issueDemandNotice,
  listDemandNotices,
  openNoticesForPayer,
} from "@/lib/dn-service";
import { dnFilterSchema, issueDnSchema } from "@/lib/validation";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;
const actor: AuditActor = { id: null, name: "Test Officer" };
const AS_AT = "2026-11-02";

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
});

afterAll(async () => {
  await client.close();
});

const filters = (f: Record<string, unknown> = {}) => dnFilterSchema.parse(f);
const issueValues = (o: Record<string, string>) =>
  issueDnSchema.parse({
    payerId: "",
    feeCode: "",
    issueDate: "2026-11-02",
    period: "",
    quantity: "1",
    override: "",
    paymentTermsDays: "30",
    remarks: "",
    ...o,
  });
const lastAudit = async () => (await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1))[0]!;
const dnSerial = async () =>
  (await db.select().from(serials).where(eq(serials.key, "dn")))[0]!.nextValue;

describe("demand notice register (BUILD_SPEC 10 acceptance figures, as at 2 Nov 2026)", () => {
  it("bills ₦88,550,000.00 on live notices with ₦31,050,000.00 outstanding across 4 open", async () => {
    const { totals } = await listDemandNotices(db, filters(), AS_AT);
    expect(totals.count).toBe(7);
    expect(new Decimal(totals.billed).toFixed(2)).toBe("88550000.00");
    expect(new Decimal(totals.outstanding).toFixed(2)).toBe("31050000.00");
    expect(totals.openCount).toBe(4);
    // DN collection rate = paid to date / billed, non-cancelled notices.
    expect(new Decimal(totals.paid).div(totals.billed).times(100).toFixed(2)).toBe("64.94");
  });

  it("has ₦31,000,000 over 90 days across 3 notices, and ₦50,000 at 31-60 days", async () => {
    const over90 = await listDemandNotices(db, filters({ bucket: "Over 90 days" }), AS_AT);
    expect(over90.totals.count).toBe(3);
    expect(new Decimal(over90.totals.outstanding).toFixed(2)).toBe("31000000.00");
    const mid = await listDemandNotices(db, filters({ bucket: "31-60 days" }), AS_AT);
    expect(new Decimal(mid.totals.outstanding).toFixed(2)).toBe("50000.00");
  });

  it("shows DN-0001 (IBEDC) as billed 60m, paid 45m, outstanding 15m, 261 days, Part-paid (overdue)", async () => {
    const { rows } = await listDemandNotices(db, filters({ q: "DN/2026/0001" }), AS_AT);
    const dn = rows[0]!;
    expect(dn.payerId).toBe("OGS-P-0001");
    expect(new Decimal(dn.amountBilled).toFixed(2)).toBe("60000000.00");
    expect(new Decimal(dn.paidToDate).toFixed(2)).toBe("45000000.00");
    expect(new Decimal(dn.outstanding).toFixed(2)).toBe("15000000.00");
    expect(dn.daysOverdue).toBe(261);
    expect(dn.status).toBe("Part-paid (overdue)");
  });

  it("agrees with deriveDemandNotice() on every notice", async () => {
    const { rows } = await listDemandNotices(db, filters(), AS_AT, 100);
    for (const r of rows) {
      const d = deriveDemandNotice({ ...r, dueDate: r.dueDate!, asAt: AS_AT });
      expect([d.outstanding.toFixed(2), d.daysOverdue, d.agingBucket, d.status], r.dnNo).toEqual([
        new Decimal(r.outstanding).toFixed(2),
        r.daysOverdue,
        r.agingBucket,
        r.status,
      ]);
    }
  });

  it("filters by status, payer, head and issue date", async () => {
    const open = await listDemandNotices(db, filters({ status: "open" }), AS_AT);
    expect(open.rows.every((r) => new Decimal(r.outstanding).gt(0))).toBe(true);
    const cancelled = await listDemandNotices(db, filters({ status: "Cancelled" }), AS_AT);
    expect(cancelled.rows.every((r) => r.cancelled)).toBe(true);
    const ibedc = await listDemandNotices(db, filters({ payer: "OGS-P-0001" }), AS_AT);
    expect(ibedc.rows.every((r) => r.payerId === "OGS-P-0001")).toBe(true);
    const lev = await listDemandNotices(db, filters({ code: "LEV-01" }), AS_AT);
    expect(lev.rows.every((r) => r.revenueCode === "LEV-01")).toBe(true);
    const h2 = await listDemandNotices(db, filters({ from: "2026-07-01", to: "2026-12-31" }), AS_AT);
    expect(h2.rows.every((r) => r.issueDate >= "2026-07-01")).toBe(true);
  });

  it("lists a payer's open notices for the receipt form", async () => {
    const open = await openNoticesForPayer(db, "OGS-P-0001", AS_AT);
    expect(open.map((r) => r.dnNo)).toEqual(["OGSERC/DN/2026/0001"]);
  });
});

describe("issuing demand notices", () => {
  it("bills GEN-02 for a 25 MW payer at ₦45,000,000 and stores the rate, FX and quantity", async () => {
    await db.update(payers).set({ capacityMw: "25" }).where(eq(payers.payerId, "OGS-P-0007"));
    const before = await dnSerial();
    const dn = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0007", feeCode: "GEN-02", period: "FY2026" }));
    expect(dn.dnNo).toBe(`OGSERC/DN/2026/${String(before).padStart(4, "0")}`);
    expect(dn.amountBilled).toBe("45000000.00");
    expect(dn.dueDate).toBe("2026-12-02");
    const [row] = await db.select().from(demandNotices).where(eq(demandNotices.dnNo, dn.dnNo));
    expect(new Decimal(row!.rateUsed!).toFixed(2)).toBe("45000000.00");
    expect(new Decimal(row!.fxUsed!).toString()).toBe("1500");
    expect(new Decimal(row!.basisQty!).toString()).toBe("25");
    expect(row!.revenueHead).toBe("Licence fee - Generation (by MW band)");
    expect(row!.payerName).toBe("Sample Embedded Generation Co. Ltd");
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.dnIssued);
    expect(audit.reference).toBe(dn.dnNo);
    expect(audit.details).toMatchObject({ code: "GEN-02", amount: "45000000.00", amountSource: "computed" });
    const fresh = await getDemandNotice(db, dn.id, AS_AT);
    expect(fresh!.status).toBe("Unpaid");
  });

  it("requires an override for Variable heads, and doesn't use up a number when it fails", async () => {
    const before = await dnSerial();
    const err = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0010", feeCode: "GRT-02" })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UserFacingError);
    expect((err as UserFacingError).fieldErrors?.override).toMatch(/Override amount/);
    expect(await dnSerial()).toBe(before);

    const ok = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0010", feeCode: "REG-F", override: "250000" }));
    expect(ok.amountBilled).toBe("250000.00");
    expect((await lastAudit()).details).toMatchObject({ amountSource: "override", computedAmount: "500000.00" });
  });

  it("refuses an inactive or unknown payer or head", async () => {
    await db.update(payers).set({ active: false }).where(eq(payers.payerId, "OGS-P-0046"));
    const err = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0046", feeCode: "NOPE" })).catch(
      (e: unknown) => e,
    );
    expect((err as UserFacingError).fieldErrors).toMatchObject({
      payerId: expect.stringMatching(/inactive/),
      feeCode: expect.stringMatching(/doesn't exist/),
    });
  });
});

describe("cancelling demand notices", () => {
  it("cancels with a reason, skips ones already cancelled, and audits each", async () => {
    const first = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0003", feeCode: "REG-A" }));
    await cancelDemandNotices(db, actor, [first.id], "Duplicate notice");
    const alreadyCancelled = first.id;
    const dn = await issueDemandNotice(db, actor, issueValues({ payerId: "OGS-P-0002", feeCode: "REG-A" }));
    const before = (await db.select().from(auditLog)).length;

    const r = await cancelDemandNotices(db, actor, [dn.id, alreadyCancelled], "Issued to the wrong payer");
    expect(r).toEqual({ cancelled: 1, skipped: 1 });
    expect((await db.select().from(auditLog)).length).toBe(before + 1);
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.dnCancelled);
    expect(audit.details).toMatchObject({ reason: "Issued to the wrong payer" });

    const after = await getDemandNotice(db, dn.id, AS_AT);
    expect(after!.cancelled).toBe(true);
    expect(after!.status).toBe("Cancelled");
    expect(new Decimal(after!.outstanding).toFixed(2)).toBe("0.00");
    expect(after!.cancelReason).toBe("Issued to the wrong payer");
    expect(after!.cancelledBy).toBe("Test Officer");
  });
});
