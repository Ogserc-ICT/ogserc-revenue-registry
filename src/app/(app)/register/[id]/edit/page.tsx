import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { computeAmount } from "@/lib/amount";
import { getReceipt } from "@/lib/receipt-service";
import { gatePage } from "@/lib/session";
import { getInitialNotices, getReceiptFormData } from "../../../new-receipt/form-data";
import { ReceiptForm } from "../../../new-receipt/receipt-form";

export const metadata: Metadata = { title: "Edit receipt" };

/** Numeric columns come back with trailing zeros; show them as typed. */
const plain = (v: string | null) => (v === null ? "" : v.includes(".") ? v.replace(/\.?0+$/, "") : v);

export default async function EditReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("receipts.record");
  if (!gate.ok) return <NoAccess title="Edit receipt" />;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const r = await getReceipt(db, id.data);
  if (!r) notFound();

  // The server enforces these too; this just explains why the form isn't offered.
  const reason =
    r.status !== "Pending Confirmation"
      ? `${r.receiptNo} is ${r.status.toLowerCase()}, so it can't be edited. A confirmed receipt can only be reversed.`
      : r.recordedById !== gate.user.id
        ? `Only ${r.recordedBy}, who recorded ${r.receiptNo}, can edit it.`
        : null;
  if (reason) {
    return (
      <>
        <PageHeader title={`Edit ${r.receiptNo}`} description="Pending receipts can be edited by the person who recorded them." />
        <EmptyState message={reason} action={<ButtonLink href={`/register/${r.id}`} variant="secondary">Back to the receipt</ButtonLink>} />
      </>
    );
  }

  const data = await getReceiptFormData({
    payerId: r.payerId,
    revenueCode: r.revenueCode,
    channel: r.channel,
    collectingAccount: r.collectingAccount,
  });
  // The override itself isn't stored. If the saved amount due isn't what the head computes
  // (and no notice set it), it came from an override or the "due = paid" fallback: keep it, so
  // editing another field doesn't silently change the amount due.
  const fee = data.fees.find((f) => f.code === r.revenueCode);
  const payer = data.payers.find((p) => p.payerId === r.payerId);
  const computed = computeAmount({
    fee: fee ?? null,
    bands: data.bands,
    usdNgnRate: data.usdNgnRate,
    payerCapacityMw: payer?.capacityMw ?? null,
    payerRevenueBaseNgn: payer?.revenueBaseNgn ?? null,
    quantity: r.basisQty ?? "1",
    override: "",
    form: "receipt",
  });
  const keepDue = !r.dnNo && !(computed.amount && computed.amount.eq(r.amountDue));
  const currentNotice = r.dnNo
    ? { dnNo: r.dnNo, revenueCode: r.revenueCode, revenueHead: r.revenueHead, issueDate: r.receiptDate, outstanding: r.amountDue }
    : undefined;
  const initialNotices = await getInitialNotices(r.payerId, currentNotice);
  return (
    <>
      <PageHeader
        title={`Edit ${r.receiptNo}`}
        description="You can change this receipt until Finance confirms it. Every change is audited with old and new values."
      />
      <ReceiptForm
        mode="edit"
        receiptId={r.id}
        receiptNo={r.receiptNo}
        currentNotice={currentNotice}
        initialNotices={initialNotices}
        {...data}
        initial={{
          receiptDate: r.receiptDate,
          payerId: r.payerId,
          feeCode: r.revenueCode,
          dnNo: r.dnNo ?? "",
          period: r.period ?? "",
          quantity: plain(r.basisQty) || "1",
          overrideDue: keepDue ? plain(r.amountDue) : "",
          amountPaid: plain(r.amountPaid),
          channel: r.channel,
          collectingAccount: r.collectingAccount,
          paymentRef: r.paymentRef,
          valueDate: r.valueDate === r.receiptDate ? "" : r.valueDate,
          remarks: r.remarks ?? "",
        }}
      />
    </>
  );
}
