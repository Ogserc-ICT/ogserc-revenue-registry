import { toDecimal } from "./money";

/** Fixed wording on printed documents (workbook Receipt sheet). */
export const RECEIPT_VALIDITY_NOTE =
  "This receipt is valid only when the payment status is CONFIRMED. Verify any receipt with the OGSERC Finance & Accounts Department, quoting the receipt number.";

/** Purpose of payment on a demand notice, from the revenue head and period. */
export function purposeOfPayment(revenueHead: string, period: string | null | undefined): string {
  const p = period?.trim();
  return p ? `${revenueHead} for ${p}` : revenueHead;
}

/**
 * The short note under a notice's billed and outstanding figures. `asAt` is already formatted.
 * The notice doesn't list payments (owner's decision, Nov 2026), so the note says why the two differ.
 */
export function billedOutstandingNote(billed: string, outstanding: string, asAt: string): string {
  const b = toDecimal(billed);
  const o = toDecimal(outstanding);
  if (o.lte(0)) return `The amount billed has been paid in full, as confirmed by OGSERC up to ${asAt}.`;
  if (o.lt(b)) return `The amount outstanding is the amount billed less payments confirmed by OGSERC up to ${asAt}.`;
  return `No payment against this notice had been confirmed by OGSERC as at ${asAt}.`;
}

/** "Tel: 0803 … · Email: …" for the letterhead; blank parts are left out. */
export function contactLine(phone: string, email: string): string {
  return [phone.trim() && `Tel: ${phone.trim()}`, email.trim() && `Email: ${email.trim()}`].filter(Boolean).join("  ·  ");
}
