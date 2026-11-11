import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoAccess } from "@/components/placeholder-page";
import { formatDate } from "@/lib/dates";
import { getDnPrintData } from "@/lib/dn-print";
import { formatAmount } from "@/lib/money";
import { gatePage } from "@/lib/session";
import { PrintToolbar } from "../../print-toolbar";

export const metadata: Metadata = { title: "Print demand notice" };

/**
 * Printable demand notice: A4 portrait, always light, no gradients (DESIGN.md 6). Laid out like
 * the workbook's DN Print sheet. Use the browser's print, or the PDF button.
 */
export default async function PrintDemandNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("dn.view");
  if (!gate.ok) return <NoAccess title="Print demand notice" />;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const data = await getDnPrintData(id.data);
  if (!data) notFound();
  const { dn } = data;

  return (
    <div className="paper min-h-dvh bg-surface-raised text-text print:bg-surface">
      <PrintToolbar backHref={`/demand-notices/${dn.id}`} pdfHref={`/print/demand-notices/${dn.id}/pdf`} />

      <article className="print-sheet mx-auto my-6 w-full max-w-[210mm] bg-surface px-[14mm] py-[14mm] text-[13px] leading-relaxed print:my-0 print:max-w-none print:p-0">
        <header className="flex items-start gap-4 border-b-2 border-text pb-4">
          <Image src="/brand/ogserc-logo.png" alt="OGSERC" width={120} height={65} className="h-[65px] w-[120px] object-contain" priority />
          <div className="min-w-0">
            <p className="text-[17px] font-semibold uppercase">{data.org.name}</p>
            {data.org.address && <p className="text-[12px]">{data.org.address}</p>}
          </div>
        </header>

        <h1 className="mt-5 text-center text-[18px] font-semibold tracking-wide">DEMAND NOTICE</h1>
        {data.banner && (
          <p className="mt-1 text-center text-[13px] font-semibold tracking-wide text-rose-text">{data.banner}</p>
        )}

        <dl className="mt-5 grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1">
          <dt className="font-medium">Demand notice No:</dt>
          <dd className="money">{dn.dnNo}</dd>
          <dt className="font-medium">Date issued:</dt>
          <dd>{formatDate(dn.issueDate)}</dd>
        </dl>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-medium">To:</dt>
          <dd className="font-semibold">{dn.payerName}</dd>
          <dt className="font-medium">Address:</dt>
          <dd>{data.payer.address ?? ""}</dd>
          <dt className="font-medium">Payer ID:</dt>
          <dd>
            <span className="money">{dn.payerId}</span>
            {data.payer.licenceNo && (
              <span>
                {"    "}
                <span className="font-medium">Licence / permit No:</span> {data.payer.licenceNo}
              </span>
            )}
          </dd>
        </dl>

        <p className="mt-5 font-semibold">RE: DEMAND FOR PAYMENT - {dn.revenueHead.toUpperCase()}</p>

        <table className="mt-3 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-y border-text">
              <th className="py-1.5 pr-3 text-left font-semibold">Revenue code</th>
              <th className="py-1.5 pr-3 text-left font-semibold">Description</th>
              <th className="py-1.5 pr-3 text-left font-semibold">Period</th>
              <th className="py-1.5 text-right font-semibold">Amount (₦)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="money py-2 pr-3 align-top">{dn.revenueCode}</td>
              <td className="py-2 pr-3 align-top">{dn.revenueHead}</td>
              <td className="py-2 pr-3 align-top">{dn.period ?? ""}</td>
              <td className="money py-2 text-right align-top">{formatAmount(dn.amountBilled)}</td>
            </tr>
            <tr className="border-y-2 border-text">
              <td colSpan={3} className="py-2 pr-3 font-semibold">
                AMOUNT OUTSTANDING
              </td>
              <td className="money py-2 text-right font-semibold">{formatAmount(dn.outstanding)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="font-medium">Amount in words:</dt>
          <dd className="italic">{data.outstandingWords}</dd>
        </dl>
        <dl className="mt-3 grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-1">
          <dt className="font-medium">Due date:</dt>
          <dd>{dn.dueDate ? formatDate(dn.dueDate) : ""}</dd>
          <dt className="font-medium">Days overdue:</dt>
          <dd className="money">{dn.daysOverdue}</dd>
        </dl>

        {data.paymentInstructions && (
          <section className="mt-5">
            <p className="font-medium">Payment instructions:</p>
            <p className="whitespace-pre-line">{data.paymentInstructions}</p>
          </section>
        )}
        {data.latePaymentNote && <p className="mt-4 whitespace-pre-line">{data.latePaymentNote}</p>}

        <footer className="mt-14">
          <p>______________________________</p>
          <p className="mt-1 font-medium whitespace-pre-line">{data.signatory}</p>
          <p>For: {data.org.name}</p>
        </footer>

        <p className="mt-10 border-t border-border pt-2 text-[10.5px] text-muted">
          Figures as at {formatDate(data.asAt)}.
        </p>
      </article>
    </div>
  );
}
