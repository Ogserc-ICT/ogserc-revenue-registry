import { asc, eq } from "drizzle-orm";
import { Download, Printer, ReceiptText } from "lucide-react";
import { ReceiptStatusPill } from "@/components/receipt-status-pill";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DnStatusPill } from "@/components/dn-status-pill";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Card, Naira, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/dates";
import { getDemandNotice } from "@/lib/dn-service";
import { formatPlain } from "@/lib/fees";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getAsAt } from "@/lib/settings-server";
import { CancelButton } from "./cancel-button";

export const metadata: Metadata = { title: "Demand notice" };

export default async function DemandNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("dn.view");
  if (!gate.ok) return <NoAccess title="Demand notice" />;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const asAt = await getAsAt();
  const dn = await getDemandNotice(db, id.data, asAt);
  if (!dn) notFound();
  const linked = await db
    .select({
      id: receipts.id,
      receiptNo: receipts.receiptNo,
      receiptDate: receipts.receiptDate,
      amountPaid: receipts.amountPaid,
      status: receipts.status,
      paymentRef: receipts.paymentRef,
    })
    .from(receipts)
    .where(eq(receipts.dnNo, dn.dnNo))
    .orderBy(asc(receipts.receiptDate));

  type Linked = (typeof linked)[number];
  const receiptColumns: Column<Linked>[] = [
    {
      key: "no",
      header: "Receipt",
      mobile: true,
      cell: (r) => (
        <div className={r.status === "Reversed" ? "text-muted line-through" : undefined}>
          <Link href={`/register/${r.id}`} className="money font-medium underline-offset-2 hover:underline">
            {r.receiptNo}
          </Link>
          <p className="text-sm text-muted">{formatDate(r.receiptDate)}</p>
        </div>
      ),
    },
    { key: "ref", header: "Payment ref", mobile: true, cell: (r) => <span className="money text-sm">{r.paymentRef}</span> },
    { key: "paid", header: "Amount paid", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.amountPaid)} /> },
    { key: "status", header: "Status", mobile: true, cell: (r) => <ReceiptStatusPill status={r.status} /> },
  ];

  const details: [string, React.ReactNode][] = [
    ["Payer", <Link key="p" href={`/payers/${encodeURIComponent(dn.payerId)}`} className="underline-offset-2 hover:underline">{`${dn.payerName} (${dn.payerId})`}</Link>],
    ["Revenue head", `${dn.revenueCode} — ${dn.revenueHead}`],
    ["Period", dn.period],
    ["Issue date", formatDate(dn.issueDate)],
    ["Payment terms", `${dn.paymentTermsDays} days`],
    ["Due date", dn.dueDate ? formatDate(dn.dueDate) : null],
    ["Basis quantity", dn.basisQty !== null ? formatPlain(dn.basisQty) : null],
    ["Rate used", dn.rateUsed !== null ? <Naira key="r" value={formatAmount(dn.rateUsed)} /> : null],
    ["Exchange rate used", dn.fxUsed !== null ? `₦${formatPlain(dn.fxUsed)}/US$` : null],
    ["Issued by", `${dn.issuedBy}, ${formatDateTime(dn.createdAt)}`],
    ["Remarks", dn.remarks],
  ];
  if (dn.cancelled) {
    details.push(
      ["Cancelled by", [dn.cancelledBy, dn.cancelledAt ? formatDateTime(dn.cancelledAt) : null].filter(Boolean).join(", ") || null],
      ["Reason for cancelling", dn.cancelReason],
    );
  }

  return (
    <>
      <PageHeader
        title={dn.dnNo}
        description={`${dn.payerName} · ${dn.revenueCode} — ${dn.revenueHead}`}
        actions={
          <>
            <ButtonLink href={`/print/demand-notices/${dn.id}`} variant="secondary">
              <Printer aria-hidden className="size-4" /> Print
            </ButtonLink>
            <ButtonLink href={`/print/demand-notices/${dn.id}/pdf`} variant="secondary" prefetch={false}>
              <Download aria-hidden className="size-4" /> PDF
            </ButtonLink>
            {!dn.cancelled && toDecimal(dn.outstanding).gt(0) && can(gate.user.roles, "receipts.record") && (
              <ButtonLink href={`/new-receipt?dn=${encodeURIComponent(dn.dnNo)}`} variant="secondary">
                <ReceiptText aria-hidden className="size-4" /> Record receipt
              </ButtonLink>
            )}
            {!dn.cancelled && can(gate.user.roles, "dn.cancel") && <CancelButton id={dn.id} dnNo={dn.dnNo} />}
          </>
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2">
        <DnStatusPill status={dn.status} />
        <span className="text-sm text-muted">
          {dn.agingBucket}
          {dn.daysOverdue > 0 ? ` · ${dn.daysOverdue} days overdue` : ""} · as at {formatDate(asAt)}
        </span>
        {dn.isSample && <StatusPill tone="sky">Sample data</StatusPill>}
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Figure label="Amount billed" value={dn.amountBilled} />
        <Figure label="Paid to date" value={dn.paidToDate} note="Confirmed receipts against this notice" />
        <Figure label="Outstanding" value={dn.outstanding} note={dn.cancelled ? "Cancelled, so nothing is owed" : undefined} />
      </div>

      <section className="mb-10">
        <SectionHeading title="Details" />
        <dl className="grid gap-x-8 gap-y-3 rounded-card border border-border bg-surface p-5 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-0.5 break-words">{value ?? <span className="text-muted">Not set</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <SectionHeading
          title="Receipts against this notice"
          description="Only confirmed receipts count towards paid to date."
        />
        {linked.length === 0 ? (
          <p className="text-base text-muted">No receipts have been recorded against this notice yet.</p>
        ) : (
          <DataTable caption="Receipts against this notice" columns={receiptColumns} rows={linked} rowKey={(r) => r.receiptNo} />
        )}
      </section>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">
        <Naira value={formatAmount(value)} />
      </p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </Card>
  );
}
