/**
 * As-you-type formatting for amount fields: "1250000.5" shows as "1,250,000.5". Pure functions,
 * safe in client components. The server strips the commas again (validation.ts), so what is
 * stored is always the plain decimal.
 */

/** Formats what a person has typed so far: thousands separators, at most `dp` decimals. */
export function formatTyping(raw: string, dp: number): string {
  const kept = raw.replace(/[^\d.]/g, "");
  if (kept === "") return "";
  const firstDot = kept.indexOf(".");
  let whole = firstDot === -1 ? kept : kept.slice(0, firstDot);
  let frac = firstDot === -1 ? null : kept.slice(firstDot + 1).replace(/\./g, "");
  if (dp === 0) frac = null;
  if (frac !== null) frac = frac.slice(0, dp);
  // No leading zeros ("007" -> "7"), but keep "0" before a decimal point ("0.5").
  whole = whole.replace(/^0+(?=\d)/, "");
  if (whole === "" && frac !== null) whole = "0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === null ? grouped : `${grouped}.${frac}`;
}

/** A stored or typed value without the separators: "1,250,000.50" -> "1250000.50". */
export const unformat = (v: string) => v.replace(/,/g, "");

/**
 * Where the caret should go after reformatting: just after the same number of digits (and
 * decimal point) that were before it, so typing in the middle of a number doesn't jump.
 */
export function caretAfterFormat(typed: string, caret: number, formatted: string): number {
  const significant = typed.slice(0, caret).replace(/[^\d.]/g, "").length;
  if (significant === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.]/.test(formatted[i]!)) seen++;
    if (seen === significant) return i + 1;
  }
  return formatted.length;
}
