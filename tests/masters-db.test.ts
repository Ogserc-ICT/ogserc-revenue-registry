import type { PGlite } from "@electric-sql/pglite";
import Decimal from "decimal.js";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import { auditLog, feeHeads, payers, revenueBudget, sch3LateCharges, sch3RegistrationFees } from "@/db/schema";
import { UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, type AuditActor } from "@/lib/audit";
import {
  getBudget,
  saveBudgetLine,
  schedule3LinkedCodes,
  updateBandRate,
  updateFeeHead,
  updateSchedule3Fee,
  updateSchedule3Group,
} from "@/lib/fees-service";
import {
  createPayer,
  getPayerSummary,
  listPayerNotices,
  listPayers,
  NearDuplicateError,
  updatePayer,
} from "@/lib/payers-service";
import { payerFilterSchema, payerSchema, type PayerValues } from "@/lib/validation";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;
const actor: AuditActor = { id: null, name: "Test Officer" };

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
});

afterAll(async () => {
  await client.close();
});

const filters = (f: Record<string, unknown> = {}) => payerFilterSchema.parse(f);
const blankPayer = (overrides: Partial<Record<keyof PayerValues, string>>): PayerValues =>
  payerSchema.parse({
    name: "",
    category: "",
    licenceNo: "",
    licenceStatus: "",
    capacityMw: "0",
    revenueBaseNgn: "",
    lga: "",
    address: "1 Test Road, Abeokuta",
    contactPerson: "",
    phone: "",
    email: "",
    dateRegistered: "",
    sch3Category: "",
    expectedRegMonth: "",
    notes: "",
    ...overrides,
  });

async function lastAudit() {
  const [row] = await db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(1);
  return row!;
}

describe("payer derived fields (BUILD_SPEC 4.6)", () => {
  it("matches the workbook's billed, outstanding and confirmed totals", async () => {
    const { rows, total } = await listPayers(db, filters({ show: "all" }), 1000);
    expect(total).toBe(46);
    const sum = (k: "totalBilled" | "outstanding" | "totalPaid") =>
      rows.reduce((acc, r) => acc.plus(r[k]), new Decimal(0)).toFixed(2);
    expect(sum("totalBilled")).toBe("88550000.00");
    expect(sum("outstanding")).toBe("31050000.00");
    expect(sum("totalPaid")).toBe("111100000.00");
    expect(rows.reduce((n, r) => n + r.openNotices, 0)).toBe(4);
  });

  it("shows IBEDC's DN-0001 balance and the top payers", async () => {
    const ibedc = await getPayerSummary(db, "OGS-P-0001");
    expect(new Decimal(ibedc!.outstanding).gte(15_000_000)).toBe(true);
    expect(new Decimal(ibedc!.totalPaid).toFixed(2)).toBe("46000000.00");
    const govt = await getPayerSummary(db, "OGS-P-0010");
    expect(new Decimal(govt!.totalPaid).toFixed(2)).toBe("50000000.00");
  });

  it("shows each notice's own confirmed paid-to-date (DN-0001: billed 60m, paid 45m)", async () => {
    const notices = await listPayerNotices(db, "OGS-P-0001");
    const dn1 = notices.find((n) => n.dnNo === "OGSERC/DN/2026/0001")!;
    expect(new Decimal(dn1.amountBilled).toFixed(2)).toBe("60000000.00");
    expect(new Decimal(dn1.paid).toFixed(2)).toBe("45000000.00");
    // Each notice only counts receipts against itself.
    const others = notices.filter((n) => n.dnNo !== dn1.dnNo);
    expect(others.every((n) => new Decimal(n.paid).lte(n.amountBilled))).toBe(true);
  });

  it("derives the registration status from Schedule 3", async () => {
    const consultant = await getPayerSummary(db, "OGS-P-0009");
    expect(consultant!.sch3Category).toBeNull();
    expect(consultant!.registrationStatus).toBe("Fee not set");
    const powerHorse = await getPayerSummary(db, "OGS-P-0046");
    expect(new Decimal(powerHorse!.registrationFee!).toFixed(2)).toBe("500000.00");
    expect(powerHorse!.registrationStatus).toBe("Not registered");
    // The filter uses the same derived column.
    const notSet = await listPayers(db, filters({ show: "all", reg: "Fee not set" }), 1000);
    expect(notSet.rows.every((r) => r.registrationStatus === "Fee not set")).toBe(true);
    expect(notSet.total).toBe(notSet.rows.length);
  });

  it("searches by name, ID or licence and pages on the server", async () => {
    const hit = await listPayers(db, filters({ q: "taihu" }));
    expect(hit.rows.map((r) => r.payerId)).toEqual(["OGS-P-0005", "OGS-P-0014", "OGS-P-0016", "OGS-P-0032"]);
    const page2 = await listPayers(db, filters({ show: "all", page: "2" }), 20);
    expect(page2.total).toBe(46);
    expect(page2.rows[0]!.payerId).toBe("OGS-P-0021");
  });
});

describe("adding and editing payers", () => {
  it("blocks an exact duplicate name, ignoring case", async () => {
    await expect(createPayer(db, actor, blankPayer({ name: "ccetc taihu" }), { acknowledgeNearDuplicates: true })).rejects.toThrow(
      UserFacingError,
    );
  });

  it("warns about a near duplicate, then adds it with the next ID once confirmed", async () => {
    const values = blankPayer({ name: "CCETC Taihu Distribution Ltd", category: "Independent Distribution Licensee", sch3Category: "F" });
    const err = await createPayer(db, actor, values, { acknowledgeNearDuplicates: false }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NearDuplicateError);
    expect((err as NearDuplicateError).matches.map((m) => m.name)).toContain("CCETC TAIHU");

    const created = await createPayer(db, actor, values, { acknowledgeNearDuplicates: true });
    expect(created.payerId).toBe("OGS-P-0047");
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.payerAdded);
    expect(audit.reference).toBe("OGS-P-0047");
    expect(JSON.stringify(audit.details)).toContain("OGS-P-0032 CCETC TAIHU");
  });

  it("rejects a value that isn't in the dropdown list", async () => {
    const err = await createPayer(db, actor, blankPayer({ name: "Brand New Energy", lga: "Atlantis" }), {
      acknowledgeNearDuplicates: false,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect((err as UserFacingError).fieldErrors?.lga).toBeDefined();
  });

  it("audits only the changed fields, and deactivates instead of deleting", async () => {
    const values = blankPayer({ name: "CCETC Taihu Distribution Ltd", category: "Independent Distribution Licensee", sch3Category: "F", phone: "0800 000 0000" });
    const r = await updatePayer(db, actor, "OGS-P-0047", { ...values, active: false }, { acknowledgeNearDuplicates: false });
    expect(r.changed).toBe(2);
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.payerEdited);
    expect(audit.details).toEqual({ changes: { phone: { old: null, new: "0800 000 0000" }, active: { old: true, new: false } } });
    const [row] = await db.select().from(payers).where(eq(payers.payerId, "OGS-P-0047"));
    expect(row!.active).toBe(false);
    // Inactive payers drop out of the default list but stay in "all".
    expect((await listPayers(db, filters({ q: "Distribution Ltd" }))).total).toBe(0);
    expect((await listPayers(db, filters({ q: "Distribution Ltd", show: "all" }))).total).toBe(1);
  });

  it("refuses a rename to another payer's name", async () => {
    await expect(
      updatePayer(db, actor, "OGS-P-0047", { ...blankPayer({ name: "RENEW POWER LTD" }), active: true }, { acknowledgeNearDuplicates: true }),
    ).rejects.toThrow(UserFacingError);
  });
});

describe("fee schedule and Schedule 3", () => {
  const editValues = (row: typeof feeHeads.$inferSelect) => ({
    head: row.head,
    category: row.category,
    appliesTo: row.appliesTo,
    basis: row.basis,
    currency: row.currency,
    publishedRate: row.publishedRate,
    publishedRateText: row.publishedRateText,
    capNgn: row.capNgn,
    unitBasis: row.unitBasis,
    frequency: row.frequency,
    revenueType: row.revenueType,
    budgetLineId: row.budgetLineId,
    legalBasis: row.legalBasis,
    ncoaCode: row.ncoaCode,
    rateStatus: row.rateStatus,
    notes: row.notes,
    active: row.active,
  });

  it("knows which heads take their rate from Schedule 3", async () => {
    const linked = await schedule3LinkedCodes(db);
    expect(linked.size).toBe(17);
    expect(linked.has("REG-F")).toBe(true);
    expect(linked.has("LRC-04")).toBe(true);
    expect(linked.has("GEN-02")).toBe(false);
  });

  it("audits a rate change with old and new values", async () => {
    const [row] = await db.select().from(feeHeads).where(eq(feeHeads.code, "PXL-02"));
    await updateFeeHead(db, actor, "PXL-02", { ...editValues(row!), publishedRate: "125000", rateStatus: "Approved" });
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.feeHeadChanged);
    expect(audit.details).toEqual({
      changes: {
        publishedRate: { old: "120000.000000", new: "125000" },
        rateStatus: { old: "Draft - Budget V2 (LASERC benchmark)", new: "Approved" },
      },
    });
  });

  it("keeps a Schedule 3 head's rate even if one is submitted", async () => {
    const [row] = await db.select().from(feeHeads).where(eq(feeHeads.code, "REG-F"));
    await updateFeeHead(db, actor, "REG-F", { ...editValues(row!), publishedRate: "1", notes: "Checked" });
    const [after] = await db.select().from(feeHeads).where(eq(feeHeads.code, "REG-F"));
    expect(new Decimal(after!.publishedRate!).toFixed(2)).toBe("500000.00");
    expect(after!.notes).toBe("Checked");
  });

  it("copies a Schedule 3 change into the linked fee heads in the same transaction", async () => {
    await updateSchedule3Fee(db, actor, "K", "150000");
    const [k] = await db.select().from(sch3RegistrationFees).where(eq(sch3RegistrationFees.category, "K"));
    const [regK] = await db.select().from(feeHeads).where(eq(feeHeads.code, "REG-K"));
    expect(new Decimal(k!.feeNgn).toFixed(2)).toBe("150000.00");
    expect(new Decimal(regK!.publishedRate!).toFixed(2)).toBe("150000.00");
    expect((await lastAudit()).action).toBe(AUDIT_ACTIONS.schedule3Changed);

    await updateSchedule3Group(db, actor, "LR-3", { initialNgn: "100000", dailyNgn: "15000", dailyCapNgn: "2500000" });
    const [lr3] = await db.select().from(sch3LateCharges).where(eq(sch3LateCharges.group, "LR-3"));
    const [lrc06] = await db.select().from(feeHeads).where(eq(feeHeads.code, "LRC-06"));
    expect(new Decimal(lr3!.dailyNgn).toFixed(2)).toBe("15000.00");
    expect(new Decimal(lrc06!.publishedRate!).toFixed(2)).toBe("15000.00");
    expect(new Decimal(lrc06!.capNgn!).toFixed(2)).toBe("2500000.00");
    expect((await lastAudit()).details).toMatchObject({ feeHeadsUpdated: ["LRC-03", "LRC-06"] });
  });

  it("edits a licence band rate, including clearing it", async () => {
    const r = await updateBandRate(db, actor, 1, null);
    expect(r.changed).toBe(1);
    expect((await lastAudit()).action).toBe(AUDIT_ACTIONS.licenceBandChanged);
    const again = await updateBandRate(db, actor, 1, null);
    expect(again.changed).toBe(0);
  });
});

describe("revenue budget editor", () => {
  const fyTotal = async () =>
    (await getBudget(db, 2026)).flatMap((l) => l.months).reduce((a, v) => a.plus(v), new Decimal(0));

  it("saves only changed months, so untouched full-precision figures don't drift", async () => {
    expect((await fyTotal()).toFixed(2)).toBe("3330525875.87");
    const a2 = (await getBudget(db, 2026)).find((l) => l.id === "BL-A2")!;
    const shown = a2.months.map((m) => new Decimal(m).toFixed(2));
    expect((await saveBudgetLine(db, actor, 2026, "BL-A2", shown)).changed).toBe(0);

    const a1 = (await getBudget(db, 2026)).find((l) => l.id === "BL-A1")!;
    const edited = a1.months.map((m) => new Decimal(m).toFixed(2));
    edited[0] = "1000.00";
    expect((await saveBudgetLine(db, actor, 2026, "BL-A1", edited)).changed).toBe(1);
    expect((await fyTotal()).toFixed(2)).toBe("3330526875.87");
    const audit = await lastAudit();
    expect(audit.action).toBe(AUDIT_ACTIONS.budgetChanged);
    expect(audit.reference).toBe("FY2026 BL-A1");
  });

  it("creates a new year's budget row by row", async () => {
    const months = Array.from({ length: 12 }, () => "0.00");
    months[5] = "250000.00";
    await saveBudgetLine(db, actor, 2027, "BL-C1", months);
    const rows = await db
      .select()
      .from(revenueBudget)
      .where(and(eq(revenueBudget.financialYear, 2027), eq(revenueBudget.budgetLineId, "BL-C1")));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.month).toBe(6);
  });
});
