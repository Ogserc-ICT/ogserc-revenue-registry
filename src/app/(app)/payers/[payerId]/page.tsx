import { desc, eq } from "drizzle-orm";
import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/placeholder-page";
import { RegistrationPill } from "@/components/registration-pill";
import { ButtonLink } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Card, Naira, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { formatPlain } from "@/lib/fees";
import { formatAmount } from "@/lib/money";
import { getPayerSummary, listPayerNotices } from "@/lib/payers-service";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";

export const metadata: Metadata = { title: "Payer" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RECENT = 10;

export default async function PayerPage({ params }: { params: Promise<{ payerId: string }> }) {
  const gate = await gatePage("payers.view");
  if (!gate.ok) return <NoAccess title="Payer" />;
  const payerId = decodeURIComponent((await params).payerId);
  const p = await getPayerSummary(db, payerId);
  if (!p) notFound();

  const [notices, recentReceipts] = await Promise.all([
    listPayerNotices(db, payerId, RECENT),
    db
      .select({
        receiptNo: receipts.receiptNo,
        receiptDate: receipts.receiptDate,
        revenueCode: receipts.revenueCode,
        revenueHead: receipts.revenueHead,
        amountPaid: receipts.amountPaid,
        status: receipts.status,
      })
      .from(receipts)
      .where(eq(receipts.payerId, payerId))
      .orderBy(desc(receipts.receiptDate), desc(receipts.receiptNo))
      .limit(RECENT),
  ]);

  type Notice = (typeof notices)[number];
  type Receipt = (typeof recentReceipts)[number];

  const noticeColumns: Column<Notice>[] = [
    {
      key: "dn",
      header: "Notice",
      mobile: true,
      cell: (r) => (
        <div className={r.cancelled ? "text-muted line-through" : undefined}>
          <p className="money font-medium">{r.dnNo}</p>
          <p className="text-sm text-muted">{formatDate(r.issueDate)}</p>
        </div>
      ),
    },
    { key: "head", header: "Revenue head", mobile: true, cell: (r) => <HeadCell code={r.revenueCode} head={r.revenueHead} /> },
    { key: "billed", header: "Billed", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.amountBilled)} /> },
    { key: "paid", header: "Paid", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.paid)} /> },
    {
      key: "state",
      header: "",
      mobile: true,
      cell: (r) => (r.cancelled ? <StatusPill tone="slate">Cancelled</StatusPill> : null),
    },
  ];

  const receiptColumns: Column<Receipt>[] = [
    {
      key: "no",
      header: "Receipt",
      mobile: true,
      cell: (r) => (
        <div className={r.status === "Reversed" ? "text-muted line-through" : undefined}>
          <p className="money font-medium">{r.receiptNo}</p>
          <p className="text-sm text-muted">{formatDate(r.receiptDate)}</p>
        </div>
      ),
    },
    { key: "head", header: "Revenue head", mobile: true, cell: (r) => <HeadCell code={r.revenueCode} head={r.revenueHead} /> },
    { key: "paid", header: "Amount paid", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.amountPaid)} /> },
    {
      key: "status",
      header: "Status",
      mobile: true,
      cell: (r) => (
        <StatusPill tone={r.status === "Confirmed" ? "emerald" : r.status === "Reversed" ? "slate" : "amber"}>
          {r.status}
        </StatusPill>
      ),
    },
  ];

  const details: [string, React.ReactNode][] = [
    ["Category", p.category],
    ["Licence number", p.licenceNo],
    ["Licence status", p.licenceStatus],
    ["Capacity", p.capacityMw !== null ? `${formatPlain(p.capacityMw)} MW` : null],
    ["Revenue base", p.revenueBaseNgn !== null ? <Naira key="rb" value={formatAmount(p.revenueBaseNgn)} /> : null],
    ["Date registered", p.dateRegistered ? formatDate(p.dateRegistered) : null],
    [
      "Expected registration",
      p.expectedRegMonth ? (p.expectedRegMonth === "Even" ? "Even (spread)" : MONTHS[Number(p.expectedRegMonth) - 1]) : null,
    ],
    ["Contact person", p.contactPerson],
    ["Phone", p.phone],
    ["Email", p.email],
    ["Address", p.address],
    ["LGA", p.lga],
    ["Notes", p.notes],
    ["Added by", p.createdBy],
  ];

  return (
    <>
      <PageHeader
        title={p.name}
        description={[p.payerId, p.category].filter(Boolean).join(" · ")}
        actions={
          can(gate.user.roles, "payers.edit") ? (
            <ButtonLink href={`/payers/${encodeURIComponent(p.payerId)}/edit`} variant="secondary">
              <Pencil aria-hidden className="size-4" /> Edit payer
            </ButtonLink>
          ) : undefined
        }
      />
      {(!p.active || p.isSample) && (
        <div className="-mt-4 mb-6 flex gap-2">
          {!p.active && <StatusPill tone="slate">Inactive</StatusPill>}
          {p.isSample && <StatusPill tone="sky">Sample data</StatusPill>}
        </div>
      )}

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Confirmed paid (all years)" value={p.totalPaid} />
        <Figure label="Billed (not cancelled)" value={p.totalBilled} />
        <Figure
          label="Outstanding on notices"
          value={p.outstanding}
          note={`${p.openNotices} open ${p.openNotices === 1 ? "notice" : "notices"}`}
        />
        <Card className="p-4">
          <p className="text-sm text-muted">Registration (Schedule 3)</p>
          <div className="mt-2">
            <RegistrationPill status={p.registrationStatus} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {p.sch3Category ? (
              <>
                Category {p.sch3Category}: paid <Naira value={formatAmount(p.registrationPaid)} /> of{" "}
                <Naira value={formatAmount(p.registrationFee)} />
              </>
            ) : (
              "No Schedule 3 category set."
            )}
          </p>
        </Card>
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

      <section className="mb-10">
        <SectionHeading
          title="Demand notices"
          description={`The latest ${RECENT}. Paid counts confirmed receipts only.`}
        />
        {notices.length === 0 ? (
          <p className="text-base text-muted">No demand notices for this payer yet.</p>
        ) : (
          <DataTable caption="Demand notices" columns={noticeColumns} rows={notices} rowKey={(r) => r.dnNo} />
        )}
      </section>

      <section>
        <SectionHeading title="Receipts" description={`The latest ${RECENT}, including pending and reversed.`} />
        {recentReceipts.length === 0 ? (
          <p className="text-base text-muted">No receipts for this payer yet.</p>
        ) : (
          <DataTable caption="Receipts" columns={receiptColumns} rows={recentReceipts} rowKey={(r) => r.receiptNo} />
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

function HeadCell({ code, head }: { code: string; head: string }) {
  return (
    <div>
      <p className="money text-sm font-medium">{code}</p>
      <p className="text-sm text-muted">{head}</p>
    </div>
  );
}
