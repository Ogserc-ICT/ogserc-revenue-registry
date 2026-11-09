import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { demandNotices } from "@/db/schema";
import { lagosToday } from "@/lib/dates";
import { gatePage } from "@/lib/session";
import { getInitialNotices, getReceiptFormData } from "./form-data";
import { ReceiptForm } from "./receipt-form";

export const metadata: Metadata = { title: "New receipt" };

/** ?payer=OGS-P-0001 or ?dn=OGSERC/DN/2026/0001 start the form with that payer (and notice). */
export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ payer?: string; dn?: string }> }) {
  const gate = await gatePage("receipts.record");
  if (!gate.ok) return <NoAccess title="New receipt" />;
  const [data, sp] = await Promise.all([getReceiptFormData(), searchParams]);

  let payerId = data.payers.some((p) => p.payerId === sp.payer) ? sp.payer! : "";
  let dnNo = "";
  let feeCode = "";
  if (sp.dn) {
    const [dn] = await db
      .select({ dnNo: demandNotices.dnNo, payerId: demandNotices.payerId, code: demandNotices.revenueCode, cancelled: demandNotices.cancelled })
      .from(demandNotices)
      .where(eq(demandNotices.dnNo, sp.dn));
    if (dn && !dn.cancelled && data.payers.some((p) => p.payerId === dn.payerId)) {
      payerId = dn.payerId;
      dnNo = dn.dnNo;
      feeCode = data.fees.some((f) => f.code === dn.code) ? dn.code : "";
    }
  }

  const initialNotices = await getInitialNotices(payerId);

  return (
    <>
      <PageHeader
        title="New receipt"
        description="Record a payment received. It goes to the Register as Pending Confirmation until Finance confirms it."
      />
      <ReceiptForm
        mode="new"
        {...data}
        initialNotices={initialNotices}
        initial={{
          receiptDate: lagosToday(),
          payerId,
          feeCode,
          dnNo,
          period: "",
          quantity: "1",
          overrideDue: "",
          amountPaid: "",
          channel: "",
          collectingAccount: "",
          paymentRef: "",
          valueDate: "",
          remarks: "",
        }}
      />
    </>
  );
}
