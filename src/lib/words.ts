import Decimal from "decimal.js";
import { type MoneyInput, toDecimal } from "./money";

/**
 * Amount in words, ported line for line from the workbook's VBA AmountInWords / NumWords /
 * Hundreds (BUILD_SPEC 4.10):
 *   1000000.5  -> "One Million Naira, Fifty Kobo Only"
 *   0          -> "Zero Naira Only"
 *   105        -> "One Hundred and Five Naira Only"   ("and" only inside a hundreds group)
 *   1021       -> "One Thousand Twenty-One Naira Only"
 * Money is NUMERIC(18,2), so the VBA's rounding step only matters for odd inputs; it rounds
 * half up here (VBA's Round is banker's rounding, which never differs on 2 dp amounts).
 */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", " Thousand", " Million", " Billion", " Trillion"];

function hundreds(n: number): string {
  const h = Math.floor(n / 100);
  const t = n % 100;
  let s = h > 0 ? `${ONES[h]} Hundred` : "";
  if (t > 0) {
    if (s !== "") s += " and ";
    if (t < 20) s += ONES[t];
    else {
      s += TENS[Math.floor(t / 10)];
      if (t % 10 > 0) s += `-${ONES[t % 10]}`;
    }
  }
  return s;
}

function numWords(value: Decimal): string {
  let n = value;
  let parts = "";
  for (let i = 0; n.gt(0) && i < SCALES.length; i++) {
    const rest = n.div(1000).floor();
    const chunk = n.minus(rest.times(1000)).toNumber();
    if (chunk > 0) {
      const w = hundreds(chunk) + SCALES[i];
      parts = parts === "" ? w : `${w} ${parts}`;
    }
    n = rest;
  }
  return parts;
}

export function amountInWords(value: MoneyInput): string {
  const amt = toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let naira = amt.floor();
  let kobo = amt.minus(naira).times(100).toDecimalPlaces(0).toNumber();
  if (kobo >= 100) {
    naira = naira.plus(1);
    kobo = 0;
  }
  let s = naira.isZero() ? "Zero Naira" : `${numWords(naira)} Naira`;
  if (kobo > 0) s += `, ${numWords(new Decimal(kobo))} Kobo`;
  return `${s} Only`;
}
