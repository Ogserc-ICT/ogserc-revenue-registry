import { describe, expect, it } from "vitest";
import { caretAfterFormat, formatTyping, unformat } from "@/lib/money-input";

describe("money fields format as you type", () => {
  it("adds thousands separators", () => {
    expect(formatTyping("1250000", 2)).toBe("1,250,000");
    expect(formatTyping("1,250,000.5", 2)).toBe("1,250,000.5");
    expect(formatTyping("999", 2)).toBe("999");
    expect(formatTyping("1000", 2)).toBe("1,000");
  });

  it("keeps a trailing point while typing and limits decimals", () => {
    expect(formatTyping("1250.", 2)).toBe("1,250.");
    expect(formatTyping("1250.567", 2)).toBe("1,250.56");
    expect(formatTyping("0.015", 6)).toBe("0.015");
    // A whole-number field drops the decimals rather than merging them into the number.
    expect(formatTyping("12.5", 0)).toBe("12");
  });

  it("drops anything that isn't part of a number", () => {
    expect(formatTyping("₦ 1 250 000", 2)).toBe("1,250,000");
    expect(formatTyping("12.3.4", 2)).toBe("12.34");
    expect(formatTyping("abc", 2)).toBe("");
    expect(formatTyping("-500", 2)).toBe("500");
  });

  it("handles leading zeros", () => {
    expect(formatTyping("007", 2)).toBe("7");
    expect(formatTyping(".5", 2)).toBe("0.5");
    expect(formatTyping("0", 2)).toBe("0");
  });

  it("removes the separators for saving", () => {
    expect(unformat("1,250,000.50")).toBe("1250000.50");
  });

  it("keeps the caret after the same digit", () => {
    // Typing the 4th digit of "1234": caret after it, past the new comma.
    expect(caretAfterFormat("1234", 4, "1,234")).toBe(5);
    // Typing a digit in the middle: "1,2x50,000" -> caret stays after the typed digit.
    const typed = "1,2950,000";
    const formatted = formatTyping(typed, 2);
    expect(formatted).toBe("12,950,000");
    expect(caretAfterFormat(typed, 4, formatted)).toBe(4);
    expect(caretAfterFormat("", 0, "")).toBe(0);
  });
});
