import { describe, expect, it } from "vitest";
import { type DescribedFee, feeHeadInfo } from "@/lib/fees";

const base: DescribedFee = {
  head: "Registration fee - Category F",
  appliesTo: "Distribution licensees other than successor distribution companies",
  legalBasis: "Schedule 3, Part A (para. 17)",
  basis: "Fixed",
  currency: "NGN",
  publishedRate: "500000",
  capNgn: null,
  unitBasis: "per registration",
  frequency: "One-off",
};

describe("revenue head info panel", () => {
  it("states what a head stands for and a one-off fixed fee", () => {
    expect(feeHeadInfo(base, "1500")).toEqual({
      standsFor: "Registration fee - Category F: Distribution licensees other than successor distribution companies",
      legalBasis: "Schedule 3, Part A (para. 17)",
      feeToPay: "₦500,000.00 per registration (one-off)",
    });
  });

  it("shows US$ fees with the naira equivalent", () => {
    const info = feeHeadInfo({ ...base, head: "Licence fee", appliesTo: null, currency: "USD", publishedRate: "120000", unitBasis: "per licence" }, "1500");
    expect(info.standsFor).toBe("Licence fee");
    expect(info.feeToPay).toBe("US$120,000 (₦180,000,000.00 @ ₦1,500/US$) per licence (one-off)");
  });

  it("doesn't repeat the unit for a per-day fee, and shows the cap", () => {
    const info = feeHeadInfo(
      { ...base, basis: "Per Day", publishedRate: "200000", capNgn: "20000000", unitBasis: "per day late (quantity = days)", frequency: "Per day" },
      "1500",
    );
    expect(info.feeToPay).toBe("₦200,000.00 per day, capped at ₦20,000,000.00");
  });

  it("points to the band table for MW band heads and says when no rate is set", () => {
    expect(feeHeadInfo({ ...base, basis: "MW Band", publishedRate: null, frequency: "Per application" }, "1500").feeToPay).toBe(
      "By MW band (see Licence fee tables)",
    );
    expect(feeHeadInfo({ ...base, publishedRate: null, legalBasis: " " }, "1500")).toMatchObject({ feeToPay: "Rate not set (one-off)", legalBasis: null });
  });
});
