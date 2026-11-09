import { Download, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { type Column, DataTable } from "@/components/ui/data-table";
import { EmptyState, Naira, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { formatDate } from "@/lib/dates";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { arrears, type ArrearsRow, OPEN_BUCKETS } from "@/lib/reports-service";
import { gatePage } from "@/lib/session";
import { getAsAt } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Arrears" };

const amount = (v: string) => (toDecimal(v).isZero() ? <span className="text-muted">0.00</span> : <Naira value={formatAmount(v)} />);

export default async function ArrearsPage() {
  const gate = await gatePage("reports.view");
  if (!gate.ok) return <NoAccess title="Arrears" />;
  const canPayers = can(gate.user.roles, "payers.view");
  const asAt = await getAsAt();
  const { rows, total } = await arrears(db, asAt);

  const columns: Column<ArrearsRow>[] = [
    {
      key: "payer",
      header: "Payer",
      mobile: true,
      cell: (r) => (
        <div className="min-w-44">
          {canPayers && r.payerId ? (
            <Link href={`/payers/${encodeURIComponent(r.payerId)}`} className="font-medium underline-offset-2 hover:underline">
              {r.name}
            </Link>
          ) : (
            <span className="font-medium">{r.name}</span>
          )}
          <p className="text-sm text-muted">{[r.payerId, r.category].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "billed", header: "Billed", align: "right", mobile: true, cell: (r) => amount(r.billed) },
    { key: "paid", header: "Paid vs notices", align: "right", mobile: true, cell: (r) => amount(r.paid) },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      mobile: true,
      cell: (r) => <span className="font-semibold">{amount(r.outstanding)}</span>,
    },
    ...OPEN_BUCKETS.map(
      (b): Column<ArrearsRow> => ({
        key: b,
        header: b,
        align: "right",
        mobile: b === "Over 90 days",
        className: cn(b === "Over 90 days" && "text-rose-text"),
        cell: (r) => amount(r.buckets[b]),
      }),
    ),
    { key: "open", header: "Open notices", align: "right", mobile: true, cell: (r) => <span className="money">{r.openNotices}</span> },
    {
      key: "rate",
      header: "Collection rate",
      align: "right",
      mobile: true,
      cell: (r) => <span className="money">{r.collectionRate === null ? "—" : `${r.collectionRate}%`}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Arrears"
        description={`Outstanding demand notice balances by payer, aged to ${formatDate(asAt)}. Cancelled notices are left out.`}
        actions={
          <ButtonLink href="/export/arrears.xlsx" variant="secondary" prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </ButtonLink>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={<Hourglass aria-hidden className="size-6" />} message="No demand notices yet, so nothing is in arrears." />
      ) : (
        <DataTable
          caption="Arrears by payer, with the all-payers total first"
          columns={columns}
          rows={[total, ...rows]}
          rowKey={(r) => r.payerId || "total"}
          rowClassName={(r) => (r.payerId === "" ? "bg-surface-raised font-semibold" : undefined)}
        />
      )}
    </>
  );
}
