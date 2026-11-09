import { eq } from "drizzle-orm";
import { Download, Pencil, Printer, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoAccess } from "@/components/placeholder-page";
import { ReceiptStatusPill } from "@/components/receipt-status-pill";
import { ButtonLink } from "@/components/ui/button";
import { Card, Naira, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { demandNotices } from "@/db/schema";
import { paymentCheckLine } from "@/lib/amount";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatPlain } from "@/lib/fees";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getReceipt } from "@/lib/receipt-service";
import { gatePage } from "@/lib/session";
import { ConfirmButton, ReverseButton } from "./receipt-actions";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("receipts.view");
  if (!gate.ok) return <NoAccess title="Receipt" />;
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const r = await getReceipt(db, id.data);
  if (!r) notFound();

  const roles = gate.user.roles;
  const mine = r.recordedById === gate.user.id;
  const isPending = r.status === "Pending Confirmation";
  const canEdit = isPending && mine && can(roles, "receipts.record");
  const canConfirm = isPending && !mine && can(roles, "receipts.confirm");
  const canReverse = r.status !== "Reversed" && can(roles, "receipts.reverse");
  const dn = r.dnNo
    ? (await db.select({ id: demandNotices.id }).from(demandNotices).where(eq(demandNotices.dnNo, r.dnNo)))[0]
    : undefined;
  const check = paymentCheckLine(toDecimal(r.amountDue), r.amountPaid);

  const details: [string, React.ReactNode][] = [
    [
      "Payer",
      <Link key="p" href={`/payers/${encodeURIComponent(r.payerId)}`} className="underline-offset-2 hover:underline">
        {`${r.payerName} (${r.payerId})`}
      </Link>,
    ],
    ["Payer category", r.payerCategory],
    ["Revenue head", `${r.revenueCode} — ${r.revenueHead}`],
    ["Revenue category", r.revenueCategory],
    ["Revenue type · budget line", `${r.revenueType} · ${r.budgetLineId ?? "Not mapped"}`],
    [
      "Demand notice",
      r.dnNo ? (
        dn && can(roles, "dn.view") ? (
          <Link key="dn" href={`/demand-notices/${dn.id}`} className="money underline-offset-2 hover:underline">
            {r.dnNo}
          </Link>
        ) : (
          <span className="money">{r.dnNo}</span>
        )
      ) : null,
    ],
    ["Period covered", r.period],
    ["Basis quantity", r.basisQty !== null ? formatPlain(r.basisQty) : null],
    ["Rate used", r.rateUsed !== null ? <Naira key="rate" value={formatAmount(r.rateUsed)} /> : null],
    ["Exchange rate used", r.fxUsed !== null ? `₦${formatPlain(r.fxUsed)}/US$` : null],
    ["Payment channel", r.channel],
    ["Bank / collecting account", r.collectingAccount],
    [
      "Payment reference / RRR",
      <span key="ref" className={r.duplicateRef ? "money font-medium text-rose-text" : "money"}>
        {r.paymentRef}
        {r.duplicateRef ? " (also used on another receipt)" : ""}
      </span>,
    ],
    ["Receipt date", formatDate(r.receiptDate)],
    ["Value date", formatDate(r.valueDate)],
    ["Recorded by", `${r.recordedBy}, ${formatDateTime(r.createdAt)}`],
    ["Confirmed by", r.confirmedBy ? [r.confirmedBy, r.confirmedAt ? formatDateTime(r.confirmedAt) : null].filter(Boolean).join(", ") : null],
    ["Remarks", r.remarks],
  ];
  if (r.status === "Reversed") {
    details.push(
      ["Reversed by", [r.reversedBy, r.reversedAt ? formatDateTime(r.reversedAt) : null].filter(Boolean).join(", ") || null],
      ["Reason for reversing", r.reverseReason],
    );
  }

  return (
    <>
      <PageHeader
        title={r.receiptNo}
        description={`${r.payerName} · ${r.revenueCode} — ${r.revenueHead}`}
        actions={
          <>
            <ButtonLink href={`/print/receipts/${r.id}`} variant="secondary">
              <Printer aria-hidden className="size-4" /> Print
            </ButtonLink>
            <ButtonLink href={`/print/receipts/${r.id}/pdf`} variant="secondary" prefetch={false}>
              <Download aria-hidden className="size-4" /> PDF
            </ButtonLink>
            {canEdit && (
              <ButtonLink href={`/register/${r.id}/edit`} variant="secondary">
                <Pencil aria-hidden className="size-4" /> Edit
              </ButtonLink>
            )}
            {canReverse && <ReverseButton id={r.id} receiptNo={r.receiptNo} />}
            {canConfirm && <ConfirmButton id={r.id} />}
          </>
        }
      />
      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-2">
        <ReceiptStatusPill status={r.status} />
        {isPending && mine && can(roles, "receipts.confirm") && (
          <span className="text-sm text-muted">You recorded this receipt, so someone else must confirm it.</span>
        )}
        {r.isSample && <StatusPill tone="sky">Sample data</StatusPill>}
      </div>

      {r.duplicateRef && (
        <p className="mb-6 flex items-start gap-2 rounded-card border border-rose/40 bg-rose/10 p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-rose-text" />
          The payment reference {r.paymentRef} is also on another receipt. Check it isn&apos;t the same payment recorded twice.
        </p>
      )}

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Figure label="Amount paid" value={r.amountPaid} struck={r.status === "Reversed"} />
        <Figure label="Amount due" value={r.amountDue} />
        <Card className="p-4">
          <p className="text-sm text-muted">Payment vs amount due</p>
          <p className="mt-2 text-base font-medium">{check.text || "—"}</p>
          {r.status === "Reversed" && <p className="mt-1 text-sm text-muted">Reversed: not counted in any total.</p>}
        </Card>
      </div>

      <section>
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
    </>
  );
}

function Figure({ label, value, struck }: { label: string; value: string; struck?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={struck ? "mt-2 text-lg font-semibold text-slate line-through" : "mt-2 text-lg font-semibold"}>
        <Naira value={formatAmount(value)} />
      </p>
    </Card>
  );
}
