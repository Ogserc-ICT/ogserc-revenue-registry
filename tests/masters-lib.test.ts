import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { changedMonths, monthsElapsed, parseBudgetInput, sumAmounts } from "@/lib/budget";
import { describeRate, fractionToPercent, percentToFraction, rateInNaira, shareOf } from "@/lib/fees";
import { findNearDuplicates, isSameName, nearMatchReason, normaliseName } from "@/lib/payer-names";
import { lateRegistration, registrationStatus, suggestSch3Category } from "@/lib/registration";

const seedPayers = (
  JSON.parse(readFileSync("seed/payers.json", "utf8")) as { payer_id: string; name: string }[]
).map((p) => ({ payerId: p.payer_id, name: p.name }));

describe("payer names", () => {
  it("normalises case, punctuation and words like Limited", () => {
    expect(normaliseName("Green Power Distribution Company")).toBe("greenpowerdistribution");
    expect(normaliseName("GREEN POWER DISTRIBUTION NIGERIA LIMITED")).toBe("greenpowerdistribution");
    expect(normaliseName("Sample Embedded Generation Co. Ltd")).toBe("sampleembeddedgeneration");
    expect(isSameName("  ccetc taihu ", "CCETC TAIHU")).toBe(true);
  });

  it("flags the BUILD_SPEC 4.6 examples from the current data", () => {
    expect(nearMatchReason("CCETC TAIHU", "CCETC Taihu Distribution")).toBe("contains");
    expect(nearMatchReason("Green Power Distribution Company", "GREEN POWER DISTRIBUTION NIGERIA LIMITED")).toBe(
      "same-words",
    );
  });

  it("warns when adding CCETC Taihu Distribution Ltd (kickoff check)", () => {
    const matches = findNearDuplicates("CCETC Taihu Distribution Ltd", seedPayers).map((m) => m.name);
    expect(matches).toContain("CCETC TAIHU");
    expect(matches).toContain("CCETC Taihu Distribution");
  });

  it("catches near spellings but not different companies", () => {
    expect(nearMatchReason("ELECTRIFY MICRGRID LIMITED", "Electrify Microgrid Ltd")).toBe("spelling");
    expect(nearMatchReason("TWENTY 4ELECTRICS LIMITED", "Twenty4 Electrics")).toBe("same-words");
    expect(nearMatchReason("CENTUM OTA ENERGY SERVICES", "CENTUM ABEOKUTA ENERGY SERVICES")).toBeNull();
    expect(nearMatchReason("TETRACORE POWER COMPANY LIMITED", "TETRACORE CNG SOLUTIONS LIMITED")).toBeNull();
    expect(nearMatchReason("DECENTRAPOWER LIMITED", "DECENTRAGRID LIMITED")).toBeNull();
    // One shared word is not enough.
    expect(nearMatchReason("POWERGEN NIGERIA", "POWERGEN SOLAR ENERGY")).toBeNull();
  });

  it("leaves out exact duplicates and the payer being edited", () => {
    const list = [
      { payerId: "P1", name: "CCETC TAIHU" },
      { payerId: "P2", name: "CCETC Taihu Distribution" },
    ];
    expect(findNearDuplicates("CCETC TAIHU", list).map((m) => m.payerId)).toEqual(["P2"]);
    expect(findNearDuplicates("CCETC Taihu Distribution", list, "P2").map((m) => m.payerId)).toEqual(["P1"]);
  });
});

const CATEGORIES = JSON.parse(readFileSync("seed/schedule3_registration_fees.json", "utf8")) as {
  category: string;
  fee_ngn: number;
  late_group: string;
}[];
const GROUPS = (
  JSON.parse(readFileSync("seed/schedule3_late_charges.json", "utf8")) as {
    group: string;
    initial_ngn: number;
    daily_ngn: number;
    daily_cap_ngn: number;
  }[]
).map((g) => ({
  group: g.group,
  initialNgn: String(g.initial_ngn),
  dailyNgn: String(g.daily_ngn),
  dailyCapNgn: String(g.daily_cap_ngn),
}));
const cat = (c: string) => {
  const row = CATEGORIES.find((r) => r.category === c)!;
  return { category: c, feeNgn: String(row.fee_ngn), lateGroup: row.late_group.startsWith("LR-") ? row.late_group : null };
};

describe("late registration calculator", () => {
  it("Cat F, 30 Jun -> 31 Jul 2026 is 31 days late and ₦7,700,000 payable (BUILD_SPEC 4.9)", () => {
    const r = lateRegistration(cat("F"), GROUPS, "2026-06-30", "2026-07-31");
    expect(r.daysLate).toBe(31);
    expect(r.chargeGroup).toBe("LR-1");
    expect(r.registrationFee.toFixed(2)).toBe("500000.00");
    expect(r.initialCharge.toFixed(2)).toBe("1000000.00");
    expect(r.dailyCharges.toFixed(2)).toBe("6200000.00");
    expect(r.totalAdminCharges.toFixed(2)).toBe("7200000.00");
    expect(r.totalPayable.toFixed(2)).toBe("7700000.00");
  });

  it("caps the daily charges", () => {
    const r = lateRegistration(cat("F"), GROUPS, "2026-01-01", "2026-12-31");
    expect(r.dailyCharges.toFixed(2)).toBe("20000000.00");
    expect(r.dailyCapped).toBe(true);
  });

  it("charges nothing when on time, and nothing ever for Category I", () => {
    const onTime = lateRegistration(cat("F"), GROUPS, "2026-06-30", "2026-06-30");
    expect(onTime.daysLate).toBe(0);
    expect(onTime.totalPayable.toFixed(2)).toBe("500000.00");
    const early = lateRegistration(cat("F"), GROUPS, "2026-06-30", "2026-06-01");
    expect(early.daysLate).toBe(0);
    const i = lateRegistration(cat("I"), GROUPS, "2026-01-01", "2026-12-31");
    expect(i.chargeGroup).toBeNull();
    expect(i.totalAdminCharges.toFixed(2)).toBe("0.00");
    expect(i.totalPayable.toFixed(2)).toBe("100000.00");
  });
});

describe("registration status", () => {
  it("follows BUILD_SPEC 4.6 in order", () => {
    expect(registrationStatus(null, 100)).toBe("Fee not set");
    expect(registrationStatus("0", 0)).toBe("Fee not set");
    expect(registrationStatus("500000", "500000")).toBe("Registered");
    expect(registrationStatus("500000", "600000")).toBe("Registered");
    expect(registrationStatus("500000", "0.01")).toBe("Part-paid");
    expect(registrationStatus("500000", null)).toBe("Not registered");
  });
});

describe("fee rates", () => {
  const fx = "1500";
  it("describes each basis", () => {
    expect(describeRate({ basis: "Fixed", currency: "NGN", publishedRate: "1000000", capNgn: null }, fx)).toBe(
      "₦1,000,000.00",
    );
    expect(describeRate({ basis: "Fixed", currency: "USD", publishedRate: "120000.000000", capNgn: null }, fx)).toBe(
      "US$120,000 (₦180,000,000.00 @ ₦1,500/US$)",
    );
    expect(describeRate({ basis: "Per Day", currency: "NGN", publishedRate: "200000", capNgn: "20000000" }, fx)).toBe(
      "₦200,000.00 per day, capped at ₦20,000,000.00",
    );
    expect(describeRate({ basis: "% of Revenue", currency: "NGN", publishedRate: "0.015", capNgn: null }, fx)).toBe(
      "1.5% of revenue",
    );
    expect(describeRate({ basis: "MW Band", currency: "USD", publishedRate: null, capNgn: null }, fx)).toMatch(/band/);
    expect(describeRate({ basis: "Fixed", currency: "NGN", publishedRate: null, capNgn: null }, fx)).toBe("Rate not set");
  });

  it("converts US$ rates and percentages without float drift", () => {
    expect(rateInNaira({ basis: "Fixed", currency: "USD", publishedRate: "0.1", capNgn: null }, "1500.5")?.toString()).toBe(
      "150.05",
    );
    expect(percentToFraction("1.5")).toBe("0.015");
    expect(fractionToPercent("0.015000")).toBe("1.5");
    expect(shareOf("1", "3")).toBe("33.33");
    expect(shareOf("1", "0")).toBeNull();
  });
});

describe("budget helpers", () => {
  it("parses typed amounts", () => {
    expect(parseBudgetInput("1,000,000")).toBe("1000000.00");
    expect(parseBudgetInput(" ₦2,500.5 ")).toBe("2500.50");
    expect(parseBudgetInput("")).toBe("0");
    expect(parseBudgetInput("-5")).toBeNull();
    expect(parseBudgetInput("1.234")).toBeNull();
    expect(parseBudgetInput("abc")).toBeNull();
  });

  it("only reports months that really changed at 2 dp", () => {
    const stored = ["218860489.656086", "0", ...Array(10).fill("0")];
    const shown = ["218860489.66", "0", ...Array(10).fill("0.00")];
    expect(changedMonths(stored, shown)).toEqual([]);
    const edited = [...shown];
    edited[1] = "5000.00";
    expect(changedMonths(stored, edited)).toEqual([{ month: 2, old: "0", new: "5000.00" }]);
  });

  it("sums without float drift", () => {
    expect(sumAmounts(["0.1", "0.2", null]).toString()).toBe("0.3");
  });

  it("counts months elapsed (BUILD_SPEC 4.8)", () => {
    expect(monthsElapsed(2026, "2026-11-02")).toBe(11);
    expect(monthsElapsed(2026, "2026-11-02", "completed_months_only")).toBe(10);
    expect(monthsElapsed(2026, "2025-12-31")).toBe(0);
    expect(monthsElapsed(2026, "2027-01-01")).toBe(12);
  });
});

describe("Schedule 3 suggestion from the payer category", () => {
  it("maps categories that have one Schedule 3 category", () => {
    expect(suggestSch3Category("Successor DisCo (legacy)", "0")).toBe("A");
    expect(suggestSch3Category("Supply / Trading Licensee", "")).toBe("F");
    expect(suggestSch3Category("Mini-Grid Developer", "0.5")).toBe("E");
    expect(suggestSch3Category("Contractor / Consultant", "50")).toBeNull();
  });
  it("uses capacity for generation, with commas allowed", () => {
    expect(suggestSch3Category("Independent Generation Licensee", "1,200")).toBe("C");
    expect(suggestSch3Category("Embedded Generator", "10")).toBe("C");
    expect(suggestSch3Category("Embedded Generator", "9.999")).toBe("D");
    expect(suggestSch3Category("Legacy GenCo", "1")).toBe("D");
    expect(suggestSch3Category("Embedded Generator", "0.5")).toBe("K");
    expect(suggestSch3Category("Captive Power Plant", "0.5")).toBe("I");
    expect(suggestSch3Category("Captive Power Plant", "0.1")).toBeNull();
    expect(suggestSch3Category("Captive Power Plant", "0")).toBeNull();
    expect(suggestSch3Category("Captive Power Plant", "abc")).toBeNull();
  });
});
