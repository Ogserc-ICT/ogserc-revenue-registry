"use client";

import { Check, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ReceiptStatusPill, type ReceiptStatusValue } from "@/components/receipt-status-pill";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { Naira } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { sumAmounts } from "@/lib/budget";
import { formatDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { confirmReceiptsAction, reverseReceiptsAction } from "./actions";

export interface RegisterRow {
  id: string;
  receiptNo: string;
  receiptDate: string;
  payerId: string;
  payerName: string;
  revenueCode: string;
  revenueHead: string;
  dnNo: string | null;
  amountPaid: string;
  channel: string;
  collectingAccount: string;
  paymentRef: string;
  status: ReceiptStatusValue;
  recordedBy: string;
  /** The signed-in user recorded it, so they can't confirm it. */
  mine: boolean;
  duplicateRef: boolean;
}

export function RegisterTable({ rows, canAct }: { rows: RegisterRow[]; canAct: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [justConfirmed, setJustConfirmed] = useState<Set<string>>(new Set());
  const [justReversed, setJustReversed] = useState<Set<string>>(new Set());
  const [reversing, setReversing] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const chosen = rows.filter((r) => selected.has(r.id));
  const confirmable = chosen.filter((r) => r.status === "Pending Confirmation" && !r.mine);
  const ownPending = chosen.filter((r) => r.status === "Pending Confirmation" && r.mine).length;

  const confirm = () =>
    startTransition(async () => {
      const r = await confirmReceiptsAction(chosen.map((c) => c.id));
      if (!r.ok) return toast(r.error, "error");
      toast(r.message ?? "Confirmed");
      setJustConfirmed(new Set(r.data?.confirmedIds));
      setSelected(new Set());
      router.refresh();
      window.setTimeout(() => setJustConfirmed(new Set()), 1200);
    });

  const columns: Column<RegisterRow>[] = [
    {
      key: "receipt",
      header: "Receipt",
      mobile: true,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <Struck on={r.status === "Reversed"} animate={justReversed.has(r.id)}>
            <Link href={`/register/${r.id}`} className="money font-medium underline-offset-2 hover:underline">
              {r.receiptNo}
            </Link>
          </Struck>
          <p className="text-sm text-muted">{formatDate(r.receiptDate)}</p>
        </div>
      ),
    },
    {
      key: "payer",
      header: "Payer",
      mobile: true,
      cell: (r) => (
        <div className="min-w-32">
          <Struck on={r.status === "Reversed"} animate={justReversed.has(r.id)}>
            {r.payerName}
          </Struck>
          <p className="money text-sm text-muted">{r.payerId}</p>
        </div>
      ),
    },
    {
      key: "head",
      header: "Revenue head",
      mobile: true,
      cell: (r) => (
        <div className="min-w-32">
          <p className="money text-sm font-medium">{r.revenueCode}</p>
          <p className="text-sm text-muted">{r.revenueHead}</p>
          {r.dnNo && <p className="money text-xs text-muted">{r.dnNo}</p>}
        </div>
      ),
    },
    {
      key: "paid",
      header: "Amount paid",
      align: "right",
      mobile: true,
      cell: (r) => (
        <Struck on={r.status === "Reversed"} animate={justReversed.has(r.id)}>
          <Naira value={formatAmount(r.amountPaid)} />
        </Struck>
      ),
    },
    {
      key: "ref",
      header: "Payment",
      mobile: true,
      cell: (r) => (
        <div className="min-w-32 text-sm">
          <p className={cn("money", r.duplicateRef && "font-medium text-rose-text")}>
            {r.paymentRef}
            {r.duplicateRef && <span className="sr-only"> (reference used on another receipt)</span>}
          </p>
          {r.duplicateRef && <p className="text-xs text-rose-text">Used on another receipt</p>}
          <p className="text-muted">{r.channel}</p>
          <p className="text-muted">{r.collectingAccount}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      mobile: true,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <ReceiptStatusPill status={r.status} celebrate={justConfirmed.has(r.id)} />
          <span className="text-xs text-muted">by {r.recordedBy}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        caption="Receipts"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) =>
          cn(
            r.status === "Reversed" && "text-slate",
            justConfirmed.has(r.id) && "row-flash",
            justReversed.has(r.id) && "row-fade-slate",
          )
        }
        selection={
          canAct
            ? { selected, onChange: setSelected, isSelectable: (r) => r.status !== "Reversed", label: (r) => `Select ${r.receiptNo}` }
            : undefined
        }
      />

      <AnimatePresence>
        {chosen.length > 0 && (
          <motion.div
            role="region"
            aria-label="Selected receipts"
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 shadow-popover sm:bottom-6"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="text-base">
              {chosen.length} selected
              <span className="text-sm text-muted">
                {" "}
                · <Naira value={formatAmount(sumAmounts(chosen.map((r) => r.amountPaid)))} />
              </span>
              {ownPending > 0 && (
                <p className="text-xs text-muted">
                  {ownPending} recorded by you: someone else must confirm {ownPending === 1 ? "it" : "them"}.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <Button variant="danger" size="sm" onClick={() => setReversing(true)} disabled={pending}>
                <Undo2 aria-hidden className="size-3.5" /> Reverse {chosen.length === 1 ? "receipt" : `${chosen.length} receipts`}
              </Button>
              <Button size="sm" onClick={confirm} disabled={pending || confirmable.length === 0}>
                <Check aria-hidden className="size-3.5" />
                {pending ? "Confirming…" : `Confirm ${confirmable.length} ${confirmable.length === 1 ? "receipt" : "receipts"}`}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReverseDialog
        open={reversing}
        onClose={() => setReversing(false)}
        ids={chosen.map((r) => r.id)}
        title={chosen.length === 1 ? `Reverse ${chosen[0]!.receiptNo}?` : `Reverse ${chosen.length} receipts?`}
        onDone={(ids) => {
          setReversing(false);
          setSelected(new Set());
          setJustReversed(new Set(ids));
          router.refresh();
          window.setTimeout(() => setJustReversed(new Set()), 1200);
        }}
      />
    </>
  );
}

/** Reversed receipts are struck through; a fresh reversal draws the line in (DESIGN.md 5). */
function Struck({ on, animate, children }: { on: boolean; animate: boolean; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  if (!animate) return <span className="line-through">{children}</span>;
  return (
    <span className="strike-host">
      {children}
      <span aria-hidden className="strike-line" />
    </span>
  );
}

/** Asks for the reason, then reverses. Shared with the receipt's own page. */
export function ReverseDialog({
  open,
  onClose,
  ids,
  title,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
  title: string;
  onDone: (reversedIds: string[]) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const n = ids.length;

  const submit = () => {
    if (reason.trim().length < 3) {
      setError("Give the reason for reversing.");
      return;
    }
    startTransition(async () => {
      const r = await reverseReceiptsAction(ids, reason);
      if (!r.ok) {
        setError(r.fieldErrors?.reason ?? r.error);
        return;
      }
      toast(r.message ?? "Reversed");
      setReason("");
      setError(null);
      onDone(r.data?.reversedIds ?? []);
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Reversed receipts stay on the register, struck through, and drop out of every total. This can't be undone."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Field label="Reason" htmlFor="reverse-reason" required error={error ?? undefined}>
          <Textarea
            id="reverse-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            data-autofocus
            placeholder="e.g. Wrong revenue head"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "reverse-reason-error" : undefined}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Keep {n === 1 ? "it" : "them"}
          </Button>
          <Button type="submit" variant="danger" disabled={pending}>
            {pending ? "Reversing…" : `Reverse ${n} ${n === 1 ? "receipt" : "receipts"}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
