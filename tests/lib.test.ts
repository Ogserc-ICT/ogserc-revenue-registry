import { describe, expect, it } from "vitest";
import { diffFields } from "@/lib/audit";
import { formatDate, formatDateTime, isIsoDate, lagosToday, resolveAsAt } from "@/lib/dates";
import { abbreviateNaira, formatAmount } from "@/lib/money";
import { findNavItem, visibleNav } from "@/lib/nav";
import { formatDnNo, formatPayerId, formatReceiptNo, parseSerial } from "@/lib/numbering";
import { generateTempPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { can } from "@/lib/permissions";
import { billedOutstandingNote, contactLine, purposeOfPayment } from "@/lib/print-text";
import { changePasswordSchema, fieldErrors, receiverSchema, settingsSchema } from "@/lib/validation";

describe("numbering formats", () => {
  it("matches the workbook formats", () => {
    expect(formatReceiptNo("OGSERC/RCT", 2026, 18)).toBe("OGSERC/RCT/2026/00018");
    expect(formatDnNo("OGSERC/DN", 2026, 8)).toBe("OGSERC/DN/2026/0008");
    expect(formatPayerId("OGS-P-", 47)).toBe("OGS-P-0047");
    expect(parseSerial("OGSERC/DN/2026/0007")).toBe(7);
  });
});

describe("dates (Africa/Lagos)", () => {
  it("uses the Lagos calendar day, not UTC", () => {
    // 23:30 UTC on 1 Nov is 00:30 on 2 Nov in Lagos.
    expect(lagosToday(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
    expect(formatDateTime(new Date("2026-11-01T23:30:00Z"))).toBe("02 Nov 2026, 00:30");
  });
  it("prefers the as-at setting", () => {
    expect(resolveAsAt("2026-11-02", new Date("2027-01-01T12:00:00Z"))).toBe("2026-11-02");
    expect(resolveAsAt(null, new Date("2027-01-01T12:00:00Z"))).toBe("2027-01-01");
  });
  it("formats and validates", () => {
    expect(formatDate("2026-11-02")).toBe("02 Nov 2026");
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });
});

describe("money", () => {
  it("formats without floating-point drift", () => {
    expect(formatAmount("31050000")).toBe("31,050,000.00");
    expect(formatAmount("3330525875.873026")).toBe("3,330,525,875.87");
    expect(formatAmount("0.005")).toBe("0.01");
  });
  it("abbreviates for KPI cards", () => {
    expect(abbreviateNaira("111100000")).toBe("₦111.1m");
    expect(abbreviateNaira("3330525875.87")).toBe("₦3.33bn");
    expect(abbreviateNaira("7750000")).toBe("₦7.75m");
  });
});

describe("permissions and navigation", () => {
  it("lets Viewers see the Register but not the Audit log", () => {
    expect(can(["viewer"], "receipts.view")).toBe(true);
    expect(can(["viewer"], "audit.view")).toBe(false);
    expect(can(["viewer"], "receipts.record")).toBe(false);
  });
  it("reserves admin pages for Admin and combines multiple roles", () => {
    expect(can(["finance_officer"], "settings.manage")).toBe(false);
    expect(can(["revenue_officer", "finance_officer"], "receipts.confirm")).toBe(true);
    const groups = visibleNav((c) => can(["viewer"], c)).map((g) => g.label);
    expect(groups).not.toContain("Admin");
    expect(groups).toContain("Daily work");
  });
  it("matches nested paths to their nav item", () => {
    expect(findNavItem("/admin/users")?.label).toBe("Users");
    expect(findNavItem("/register/abc")?.label).toBe("Register");
  });
});

describe("password policy", () => {
  it("requires 10 characters, a match, and a change", () => {
    const ok = changePasswordSchema.safeParse({
      currentPassword: "Temp-pass-1",
      newPassword: "0123456789",
      confirmPassword: "0123456789",
    });
    expect(ok.success).toBe(true);
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    const short = changePasswordSchema.safeParse({
      currentPassword: "x",
      newPassword: "123456789",
      confirmPassword: "123456789",
    });
    expect(short.success).toBe(false);
    const same = changePasswordSchema.safeParse({
      currentPassword: "0123456789",
      newPassword: "0123456789",
      confirmPassword: "0123456789",
    });
    expect(same.success).toBe(false);
  });
  it("generates temporary passwords that meet the policy", () => {
    const p = generateTempPassword();
    expect(p).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(p.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
  });
});

describe("settings validation and diff", () => {
  const valid = {
    financialYear: "2026",
    receiptPrefix: "OGSERC/RCT",
    dnPrefix: "OGSERC/DN",
    payerPrefix: "OGS-P-",
    defaultTermsDays: "30",
    asAtDate: "",
    autoConfirm: false,
    usdNgnRate: "1500",
    budgetVersionLabel: "",
    budgetToDateRule: "including_current_month",
  };
  it("coerces form values and maps a blank as-at date to null", () => {
    const r = settingsSchema.parse(valid);
    expect(r.financialYear).toBe(2026);
    expect(r.asAtDate).toBeNull();
  });
  it("rejects bad prefixes and rates", () => {
    expect(settingsSchema.safeParse({ ...valid, receiptPrefix: "OGS RCT" }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...valid, usdNgnRate: "0" }).success).toBe(false);
  });
  it("records only changed fields with old and new values", () => {
    const d = diffFields(
      { usdNgnRate: "1500.000000", asAtDate: "2026-11-02" as string | null, orgName: "A" },
      { usdNgnRate: "1500", asAtDate: null, orgName: "B" },
    );
    expect(d).toEqual({
      asAtDate: { old: "2026-11-02", new: null },
      orgName: { old: "A", new: "B" },
    });
  });
});

describe("demand notice wording", () => {
  it("writes the purpose of payment from the head and period", () => {
    expect(purposeOfPayment("Operating levy (1.5%)", "Q3 2026")).toBe("Operating levy (1.5%) for Q3 2026");
    expect(purposeOfPayment("Registration fee - Category F", "  ")).toBe("Registration fee - Category F");
  });

  it("explains billed vs outstanding without listing payments", () => {
    expect(billedOutstandingNote("60000000", "15000000.00", "02-Nov-2026")).toMatch(/less payments confirmed by OGSERC up to 02-Nov-2026/);
    expect(billedOutstandingNote("500000", "500000.00", "02-Nov-2026")).toMatch(/^No payment against this notice/);
    expect(billedOutstandingNote("500000", "0.00", "02-Nov-2026")).toMatch(/paid in full/);
  });

  it("builds the letterhead contact line from what is filled in", () => {
    expect(contactLine(" 0803 000 0000 ", "info@ogserc.og.gov.ng")).toBe("Tel: 0803 000 0000  ·  Email: info@ogserc.og.gov.ng");
    expect(contactLine("", "")).toBe("");
  });
});

describe("receiver details validation", () => {
  const valid = {
    orgName: "OGSERC",
    addressLine: "",
    orgPhone: "",
    orgEmail: "",
    paymentAccounts: [{ bank: "Example Bank", accountName: "OGSERC Revenue Account", accountNumber: "0123 456 789" }],
    dnPaymentInstructions: "",
    latePaymentNote: "",
    signatoryName: "",
    signatoryDesignation: "",
  };
  it("accepts a valid set and blank optional fields", () => {
    expect(receiverSchema.safeParse(valid).success).toBe(true);
  });
  it("flags each bad account field on its own row", () => {
    const r = receiverSchema.safeParse({ ...valid, orgEmail: "nope", paymentAccounts: [valid.paymentAccounts[0], { bank: "", accountName: "X", accountNumber: "12A" }] });
    expect(r.success).toBe(false);
    const errs = fieldErrors(r.error!);
    expect(errs).toMatchObject({ orgEmail: expect.any(String), "paymentAccounts.1.bank": "Enter the bank name.", "paymentAccounts.1.accountNumber": expect.stringMatching(/digits only/) });
  });
});
