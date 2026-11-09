import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payers } from "@/db/schema";
import { getReceipt, type ReceiptRecord } from "./receipt-service";
import { getSettings } from "./settings-server";
import { amountInWords } from "./words";

export interface ReceiptPrintData {
  r: ReceiptRecord;
  org: { name: string; address: string };
  licenceNo: string | null;
  /** The workbook's line under the title, by status. */
  banner: string | null;
  /** DESIGN.md 6: PROVISIONAL until confirmed, REVERSED once reversed. */
  watermark: "PROVISIONAL" | "REVERSED" | null;
  amountWords: string;
}

/** Everything the printable receipt and its PDF show (workbook Receipt sheet, BUILD_SPEC 4.10). */
export async function getReceiptPrintData(id: string): Promise<ReceiptPrintData | null> {
  const r = await getReceipt(db, id);
  if (!r) return null;
  const [s, payer] = await Promise.all([
    getSettings(),
    db.select({ licenceNo: payers.licenceNo }).from(payers).where(eq(payers.payerId, r.payerId)).then((x) => x[0]),
  ]);
  return {
    r,
    org: { name: s.orgName, address: s.addressLine },
    licenceNo: payer?.licenceNo ?? null,
    banner:
      r.status === "Pending Confirmation"
        ? "PROVISIONAL - AWAITING FINANCE CONFIRMATION"
        : r.status === "Reversed"
          ? "*** REVERSED - NOT VALID ***"
          : null,
    watermark: r.status === "Pending Confirmation" ? "PROVISIONAL" : r.status === "Reversed" ? "REVERSED" : null,
    amountWords: amountInWords(r.amountPaid),
  };
}
