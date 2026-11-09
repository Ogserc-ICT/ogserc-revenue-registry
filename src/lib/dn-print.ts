import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payers } from "@/db/schema";
import { getDemandNotice, type DnRow } from "./dn-service";
import { toDecimal } from "./money";
import { getAsAt, getSettings } from "./settings-server";
import { amountInWords } from "./words";

export interface DnPrintData {
  dn: DnRow;
  asAt: string;
  org: { name: string; address: string };
  payer: { address: string | null; licenceNo: string | null };
  /** "*** CANCELLED - NOT VALID ***" or "SETTLED - NO BALANCE OUTSTANDING", as on the workbook's DN Print. */
  banner: string | null;
  /** Outstanding in words; blank when nothing is outstanding (workbook UpdateDNWords). */
  outstandingWords: string;
  paymentInstructions: string;
  latePaymentNote: string;
  signatory: string;
}

/** Everything the printable demand notice and its PDF show. */
export async function getDnPrintData(id: string): Promise<DnPrintData | null> {
  const [asAt, s] = await Promise.all([getAsAt(), getSettings()]);
  const dn = await getDemandNotice(db, id, asAt);
  if (!dn) return null;
  const [p] = await db
    .select({ address: payers.address, licenceNo: payers.licenceNo })
    .from(payers)
    .where(eq(payers.payerId, dn.payerId));
  const outstanding = toDecimal(dn.outstanding);
  return {
    dn,
    asAt,
    org: { name: s.orgName, address: s.addressLine },
    payer: { address: p?.address ?? null, licenceNo: p?.licenceNo ?? null },
    banner: dn.cancelled
      ? "*** CANCELLED - NOT VALID ***"
      : outstanding.lte(0)
        ? "SETTLED - NO BALANCE OUTSTANDING"
        : null,
    outstandingWords: outstanding.gt(0) ? amountInWords(outstanding) : "",
    paymentInstructions: s.dnPaymentInstructions,
    latePaymentNote: s.latePaymentNote,
    signatory: s.dnSignatory,
  };
}
