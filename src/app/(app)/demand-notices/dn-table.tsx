"use client";

import { Ban } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DnStatusPill } from "@/components/dn-status-pill";
import { Button } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Naira } from "@/components/ui/misc";
import { sumAmounts } from "@/lib/budget";
import { formatDate } from "@/lib/dates";
import type { AgingBucket, DnStatus } from "@/lib/demandNotice";
import { formatAmount } from "@/lib/money";
import { CancelDialog } from "./cancel-dialog";

/** What the register sends to the browser for each row (plain values only). */
export interface DnTableRow {
  id: string;
  dnNo: string;
  issueDate: string;
  dueDate: string | null;
  payerId: string;
  payerName: string;
  revenueCode: string;
  revenueHead: string;
  amountBilled: string;
  paidToDate: string;
  outstanding: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
  status: DnStatus;
  cancelled: boolean;
}

export function DnTable({ rows, canCancel }: { rows: DnTableRow[]; canCancel: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  const chosen = rows.filter((r) => selected.has(r.id));

  const columns: Column<DnTableRow>[] = [
    {
      key: "dn",
      header: "Notice",
      mobile: true,
      cell: (r) => (
        <div>
          <Link href={`/demand-notices/${r.id}`} className="money font-medium whitespace-nowrap underline-offset-2 hover:underline">
            {r.dnNo}
          </Link>
          <p className="text-sm text-muted">{formatDate(r.issueDate)}</p>
        </div>
      ),
    },
    {
      key: "payer",
      header: "Payer",
      mobile: true,
      cell: (r) => (
        <div className="min-w-40">
          <p>{r.payerName}</p>
          <p className="money text-sm text-muted">{r.payerId}</p>
        </div>
      ),
    },
    {
      key: "head",
      header: "Revenue head",
      mobile: true,
      cell: (r) => (
        <div className="min-w-40">
          <p className="money text-sm font-medium">{r.revenueCode}</p>
          <p className="text-sm text-muted">{r.revenueHead}</p>
        </div>
      ),
    },
    { key: "billed", header: "Billed", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.amountBilled)} /> },
    { key: "paid", header: "Paid", align: "right", cell: (r) => <Naira value={formatAmount(r.paidToDate)} /> },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(r.outstanding)} />,
    },
    {
      key: "due",
      header: "Due",
      mobile: true,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <p className="text-sm">{r.dueDate ? formatDate(r.dueDate) : "—"}</p>
          <p className={r.daysOverdue > 90 ? "text-sm text-rose-text" : "text-sm text-muted"}>
            {r.daysOverdue > 0 ? `${r.daysOverdue} days overdue` : r.agingBucket === "Not yet due" ? "Not yet due" : ""}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", mobile: true, cell: (r) => <DnStatusPill status={r.status} /> },
  ];

  return (
    <>
      <DataTable
        caption="Demand notices"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.cancelled ? "text-muted" : undefined)}
        selection={
          canCancel
            ? {
                selected,
                onChange: setSelected,
                isSelectable: (r) => !r.cancelled,
                label: (r) => `Select ${r.dnNo}`,
              }
            : undefined
        }
      />

      {/* Bulk action bar: slides up when rows are selected (DESIGN.md 4 and 5). */}
      <AnimatePresence>
        {chosen.length > 0 && (
          <motion.div
            role="region"
            aria-label="Selected demand notices"
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-popover sm:bottom-6"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <p className="text-base">
              {chosen.length} selected
              <span className="text-sm text-muted">
                {" "}
                · <Naira value={formatAmount(sumAmounts(chosen.map((r) => r.outstanding)))} /> outstanding
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
                <Ban aria-hidden className="size-3.5" /> Cancel {chosen.length} {chosen.length === 1 ? "notice" : "notices"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CancelDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        ids={chosen.map((r) => r.id)}
        title={chosen.length === 1 ? `Cancel ${chosen[0]!.dnNo}?` : `Cancel ${chosen.length} demand notices?`}
        onDone={() => {
          setConfirming(false);
          setSelected(new Set());
          router.refresh();
        }}
      />
    </>
  );
}
