/**
 * BUILD_SPEC section 10: load the seed with sample data, as at 2 Nov 2026, FY 2026. The app must
 * reproduce the workbook exactly. Each `it` is one row of the acceptance table.
 */
import type { PGlite } from "@electric-sql/pglite";
import Decimal from "decimal.js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { seedDatabase } from "@/db/seed";
import { feeHeads, licenceFeeBands, sch3LateCharges, sch3RegistrationFees } from "@/db/schema";
import { computeAmount } from "@/lib/amount";
import { getDemandNotice, listDemandNotices } from "@/lib/dn-service";
import { lateRegistration } from "@/lib/registration";
import { arrears, bankRecon, budgetVsActual, dashboard, monthlySummary } from "@/lib/reports-service";
import { dnFilterSchema } from "@/lib/validation";
import { createTestDb } from "./helpers/db";

let db: Db;
let client: PGlite;
const AS_AT = "2026-11-02";
const FY = 2026;
const RULE = "including_current_month" as const;
const money = (v: Decimal.Value) => new Decimal(v).toFixed(2);

beforeAll(async () => {
  ({ db, client } = await createTestDb());
  await seedDatabase(db, { withSample: true });
});

afterAll(async () => {
  await client.close();
});

describe("BUILD_SPEC 10 acceptance checks (as at 2 Nov 2026, FY 2026)", () => {
  it("Confirmed revenue FY2026: ₦111,100,000.00 (IGR ₦61,100,000 · Non-IGR ₦50,000,000)", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(money(d.confirmedFy)).toBe("111100000.00");
    expect(money(d.igr)).toBe("61100000.00");
    expect(money(d.nonIgr)).toBe("50000000.00");
  });

  it("Pending confirmation: ₦7,750,000.00 across 2 receipts", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(money(d.pendingAmount)).toBe("7750000.00");
    expect(d.pendingCount).toBe(2);
  });

  it("Receipts recorded (FY): 16 on the Dashboard (excludes reversed) + 1 reversed = 17 rows", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(d.receiptsFy).toBe(16);
    expect(d.reversedFy).toBe(1);
  });

  it("DNs billed (not cancelled): ₦88,550,000.00", async () => {
    const a = await arrears(db, AS_AT);
    expect(money(a.total.billed)).toBe("88550000.00");
  });

  it("DN outstanding: ₦31,050,000.00 across 4 open notices", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(money(d.dnOutstanding)).toBe("31050000.00");
    expect(d.dnOpenCount).toBe(4);
  });

  it("Over 90 days: ₦31,000,000.00 across 3 notices; 31-60 days ₦50,000", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(money(d.over90Amount)).toBe("31000000.00");
    expect(d.over90Count).toBe(3);
    expect(money(d.ageing.find((b) => b.bucket === "31-60 days")!.amount)).toBe("50000.00");
  });

  it("DN collection rate: 64.94%", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(d.collectionRate).toBe("64.94");
  });

  it("Annual budget: ₦3,330,525,875.87", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(money(d.annualBudget)).toBe("3330525875.87");
  });

  it("Budget to date (11 months): ₦2,838,653,215.12", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(d.monthsElapsed).toBe(11);
    expect(money(d.budgetToDate)).toBe("2838653215.12");
  });

  it("Achieved vs budget to date: 3.91%; achieved vs FY budget: 3.34%", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(d.achievedToDate).toBe("3.91");
    expect(d.achievedFy).toBe("3.34");
  });

  it("Top payer: Ogun State Government (Subvention) ₦50m; then IBEDC ₦46m; then EKEDC ₦10m", async () => {
    const d = await dashboard(db, FY, AS_AT, RULE);
    expect(d.topPayers.slice(0, 3).map((p) => [p.name, money(p.amount)])).toEqual([
      ["Ogun State Government (Subvention)", "50000000.00"],
      ["Ibadan Electricity Distribution Plc (IBEDC)", "46000000.00"],
      ["Eko Electricity Distribution Plc (EKEDC)", "10000000.00"],
    ]);
  });

  it("DN-0001 (IBEDC): billed ₦60m, paid ₦45m, outstanding ₦15m, 261 days, Part-paid (overdue)", async () => {
    const { rows } = await listDemandNotices(db, dnFilterSchema.parse({ q: "DN/2026/0001" }), AS_AT);
    const dn = (await getDemandNotice(db, rows[0]!.id, AS_AT))!;
    expect([money(dn.amountBilled), money(dn.paidToDate), money(dn.outstanding), dn.daysOverdue, dn.status]).toEqual([
      "60000000.00",
      "45000000.00",
      "15000000.00",
      261,
      "Part-paid (overdue)",
    ]);
  });

  it("Bank Recon, TSA – Remita: Feb per register ₦41,000,000; TSA FY total ₦117,750,000", async () => {
    const r = await bankRecon(db, FY);
    const tsa = "Ogun State TSA - Remita";
    expect(money(r.months[1]![tsa]!.register)).toBe("41000000.00");
    expect(money(r.totals[tsa]!.register)).toBe("117750000.00");
    expect(r.pendingCount).toBe(2);
    expect(money(r.pendingAmount)).toBe("7750000.00");
  });

  it("Budget vs Actual BL-A2: budget to date ₦2,344,119,881.78, actual ₦55,000,000, Behind budget", async () => {
    const b = await budgetVsActual(db, FY, AS_AT, RULE);
    const a2 = b.lines.find((l) => l.id === "BL-A2")!;
    expect(money(a2.budgetToDate)).toBe("2344119881.78");
    expect(money(a2.actualToDate)).toBe("55000000.00");
    expect(a2.status).toBe("Behind budget");
    expect(b.unmappedCount).toBe(0);
  });

  it("Amount calc: EMG-01 for a 1.5 MW payer = ₦50,000 (band rate); GEN-02 for 25 MW = ₦45,000,000", async () => {
    const calc = async (code: string, mw: string) => {
      const [fee] = await db.select().from(feeHeads).where(eq(feeHeads.code, code));
      const bands = await db.select().from(licenceFeeBands).where(eq(licenceFeeBands.code, code));
      return computeAmount({ fee: fee!, bands, usdNgnRate: "1500", payerCapacityMw: mw, payerRevenueBaseNgn: null, quantity: "1", override: "" });
    };
    const emg = await calc("EMG-01", "1.5");
    expect(money(emg.amount!)).toBe("50000.00");
    expect(emg.rateText).toContain("(band rate)");
    const gen = await calc("GEN-02", "25");
    expect(money(gen.amount!)).toBe("45000000.00");
    expect(gen.rateText).toContain("US$ fee @ ₦1,500/US$");
  });

  it("Late reg calc: Cat F, 31 days = ₦7,700,000 total payable", async () => {
    const [f] = await db.select().from(sch3RegistrationFees).where(eq(sch3RegistrationFees.category, "F"));
    const groups = await db.select().from(sch3LateCharges);
    const r = lateRegistration(f!, groups, "2026-06-30", "2026-07-31");
    expect(r.daysLate).toBe(31);
    expect(money(r.totalPayable)).toBe("7700000.00");
  });
});

describe("report consistency", () => {
  it("Monthly Summary: category subtotals equal head totals, and the total is ₦111,100,000", async () => {
    const m = await monthlySummary(db, FY);
    expect(m.reconciles).toBe(true);
    expect(money(m.total.total)).toBe("111100000.00");
    expect(money(m.types.find((t) => t.key === "IGR")!.total)).toBe("61100000.00");
    expect(money(m.budget.total)).toBe("3330525875.87");
  });

  it("Arrears: the all-payers row adds up to the dashboard's outstanding and buckets", async () => {
    const a = await arrears(db, AS_AT);
    expect(money(a.total.outstanding)).toBe("31050000.00");
    expect(money(a.total.buckets["Over 90 days"])).toBe("31000000.00");
    expect(a.total.openNotices).toBe(4);
    expect(a.total.collectionRate).toBe("64.94");
    const ibedc = a.rows.find((r) => r.payerId === "OGS-P-0001")!;
    expect(money(ibedc.outstanding)).toBe("15000000.00");
  });

  it("Budget to date can count completed months only (BUILD_SPEC 4.8 option)", async () => {
    const b = await budgetVsActual(db, FY, AS_AT, "completed_months_only");
    expect(b.monthsElapsed).toBe(10);
  });
});
