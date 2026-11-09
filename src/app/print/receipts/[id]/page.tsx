import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoAccess } from "@/components/placeholder-page";
import { cn } from "@/components/ui/cn";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { RECEIPT_VALIDITY_NOTE } from "@/lib/print-text";
import { getReceiptPrintData } from "@/lib/receipt-print";
import { gatePage } from "@/lib/session";
import { PrintToolbar } from "../../print-toolbar";

export const metadata: Metadata = { title: "Print receipt" };

/**
 * Official revenue receipt: A4 portrait, always light, no gradients (DESIGN.md 6), laid out like
 * the workbook's Receipt sheet. PROVISIONAL watermark until confirmed, REVERSED once reversed.
 */
export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("receipts.view");
  if (!gate.ok) return <NoAccess title="Print receipt" />;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getReceiptPrintData(id.data);
  if (!data) notFound();
  const { r } = data;

  const pair = (a: [string, React.ReactNode], b?: [string, React.ReactNode]) => (
    <div className="grid grid-cols-[9.5rem_1fr] gap-x-3 sm:grid-cols-[9.5rem_1fr_9rem_1fr]">
      <dt className="font-medium">{a[0]}</dt>
      <dd>{a[1]}</dd>
      {b && (
        <>
          <dt className="font-medium">{b[0]}</dt>
          <dd>{b[1]}</dd>
        </>
      )}
    </div>
  );

  return (
    <div className="paper min-h-dvh bg-surface-raised text-text print:bg-surface">
      <PrintToolbar backHref={`/register/${r.id}`} pdfHref={`/print/receipts/${r.id}/pdf`} />

      <article className="print-sheet relative mx-auto my-6 w-full max-w-[210mm] overflow-hidden bg-surface px-[14mm] py-[14mm] text-[13px] leading-relaxed print:my-0 print:max-w-none print:p-0">
        {data.watermark && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span
              className={cn(
                "-rotate-[35deg] text-[72px] font-semibold tracking-[0.12em] select-none",
                data.watermark === "REVERSED" ? "text-rose/25" : "text-slate/20",
              )}
            >
              {data.watermark}
            </span>
          </div>
        )}

        <header className="relative flex items-start gap-4 border-b-2 border-text pb-4">
          <Image src="/brand/ogserc-logo.png" alt="OGSERC" width={120} height={65} className="h-[65px] w-[120px] object-contain" priority />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold uppercase">{data.org.name}</p>
            {data.org.address && <p className="text-[12px]">{data.org.address}</p>}
          </div>
        </header>

        <h1 className="relative mt-5 text-center text-[18px] font-semibold tracking-wide">OFFICIAL REVENUE RECEIPT</h1>
        {data.banner && (
          <p className={cn("relative mt-1 text-center text-[13px] font-semibold tracking-wide", r.status === "Reversed" ? "text-rose-text" : "text-muted")}>
            {data.banner}
          </p>
        )}

        <dl className="relative mt-5 flex flex-col gap-1">
          {pair(["Receipt No:", <span key="n" className="money">{r.receiptNo}</span>], ["Date:", formatDate(r.receiptDate)])}
        </dl>

        <dl className="relative mt-4 flex flex-col gap-1">
          {pair(["Received from:", <span key="p" className="font-semibold">{r.payerName}</span>])}
          {pair(["Payer ID:", <span key="id" className="money">{r.payerId}</span>], ["Payer category:", r.payerCategory ?? ""])}
          {data.licenceNo && pair(["Licence / permit No:", data.licenceNo])}
          {pair(["Being payment for:", r.revenueHead])}
          {pair(["Revenue code:", <span key="c" className="money">{r.revenueCode}</span>], ["Revenue category:", r.revenueCategory])}
          {pair(["Period covered:", r.period ?? ""], ["Demand notice ref:", <span key="d" className="money">{r.dnNo ?? ""}</span>])}
        </dl>

        <div className="relative mt-5 border-y-2 border-text py-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-semibold">AMOUNT PAID:</p>
            <p className={cn("money text-[20px] font-semibold", r.status === "Reversed" && "line-through")}>₦{formatAmount(r.amountPaid)}</p>
          </div>
          <p className="mt-1">
            <span className="font-medium">Amount in words: </span>
            <span className="italic">{data.amountWords}</span>
          </p>
        </div>

        <dl className="relative mt-4 flex flex-col gap-1">
          {pair(["Payment channel:", r.channel], ["Bank / account:", r.collectingAccount])}
          {pair(["Payment ref / RRR:", <span key="ref" className="money">{r.paymentRef}</span>], ["Value date:", formatDate(r.valueDate)])}
          {pair(["Status:", r.status], ["Confirmed by:", r.confirmedBy ?? ""])}
          {pair(["Recorded by:", r.recordedBy], ["Confirmation date:", r.confirmedAt ? formatDateTime(r.confirmedAt) : ""])}
        </dl>

        <div className="relative mt-16 grid grid-cols-2 gap-8">
          <div>
            <p>______________________________</p>
            <p className="mt-1">For: Finance &amp; Accounts, OGSERC</p>
          </div>
          <div>
            <p>______________________________</p>
            <p className="mt-1">Payer / Representative</p>
          </div>
        </div>

        <p className="relative mt-10 border-t border-border pt-2 text-[11px] text-muted">{RECEIPT_VALIDITY_NOTE}</p>
      </article>
    </div>
  );
}
