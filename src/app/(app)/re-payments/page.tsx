import { Download, FileInput, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { formatDate, formatDateTime, isIsoDate } from "@/lib/dates";
import { HANDOVER_PAGE_SIZE, listHandoverBatches, listHandoverLines } from "@/lib/handover-service";
import { formatAmount } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { handoverFilterSchema } from "@/lib/validation";
import { HandoverImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "R&E payments" };

type Search = Record<string, string | string[] | undefined>;

/** "−₦150,000.00" rather than "₦-150,000.00". */
const signedNaira = (v: string) => (v.trim().startsWith("-") ? `−₦${formatAmount(v.trim().slice(1))}` : `₦${formatAmount(v)}`);
type Line = Awaited<ReturnType<typeof listHandoverLines>>["rows"][number];
type Batch = Awaited<ReturnType<typeof listHandoverBatches>>[number];

/**
 * Payments confirmed in the Registration & Evaluation app and handed over in batches
 * (REVENUE-REGISTRY-CONTRACT.md). Kept as their own register: not counted in revenue reports until
 * Finance assigns revenue codes (owner's decision, Nov 2026).
 */
export default async function RePaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("handover.view");
  if (!gate.ok) return <NoAccess title="R&E payments" />;
  const canImport = can(gate.user.roles, "handover.import");

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = handoverFilterSchema.parse({ q: one("q"), batch: one("batch"), type: one("type"), page: one("page") });
  const [{ rows, totals }, batches] = await Promise.all([listHandoverLines(db, f), listHandoverBatches(db)]);
  const pageCount = Math.max(1, Math.ceil(totals.count / HANDOVER_PAGE_SIZE));
  const filtered = Boolean(f.q || f.batch || f.type);

  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, batch: f.batch, type: f.type, ...over })) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
  };

  const lineColumns: Column<Line>[] = [
    {
      key: "pay",
      header: "PAY no. / batch",
      mobile: true,
      cell: (r) => (
        <>
          <span className="money whitespace-nowrap">{r.payNo}</span>
          <span className="money block text-sm whitespace-nowrap text-muted">{r.batchNo}</span>
        </>
      ),
    },
    {
      key: "type",
      header: "Line",
      mobile: true,
      cell: (r) =>
        r.lineType === "Reversal" ? (
          <StatusPill tone="rose">Reversal</StatusPill>
        ) : r.reversed ? (
          <StatusPill tone="slate">Payment, reversed</StatusPill>
        ) : (
          <StatusPill tone="emerald">Payment</StatusPill>
        ),
    },
    {
      key: "dates",
      header: "Received",
      cell: (r) => (
        <>
          <span className="whitespace-nowrap">{formatDate(r.dateReceived)}</span>
          <span className="block text-sm whitespace-nowrap text-muted">Confirmed {formatDate(r.dateConfirmed)}</span>
        </>
      ),
    },
    {
      key: "payer",
      header: "Payer",
      mobile: true,
      cell: (r) => (
        <>
          {r.payer}
          <span className="block text-sm text-muted">{[r.paidFor, r.category && `Category ${r.category}`].filter(Boolean).join(" · ")}</span>
        </>
      ),
    },
    {
      key: "purpose",
      header: "Purpose",
      cell: (r) => (
        <>
          {r.purpose ?? "—"}
          {r.revenueCode && <span className="money block text-sm text-muted">{r.revenueCode}</span>}
        </>
      ),
    },
    {
      key: "channel",
      header: "Channel / RRR",
      cell: (r) => (
        <>
          {r.channel ?? "—"}
          {r.rrr && <span className="money block text-sm text-muted">{r.rrr}</span>}
        </>
      ),
    },
    {
      key: "amount",
      header: "Amount (₦)",
      align: "right",
      mobile: true,
      cell: (r) => <span className={`money whitespace-nowrap ${r.lineType === "Reversal" ? "text-rose-text" : ""}`}>{formatAmount(r.amount)}</span>,
    },
  ];

  const batchColumns: Column<Batch>[] = [
    {
      key: "batch",
      header: "Batch",
      mobile: true,
      cell: (b) => (
        <Link href={`/re-payments${keep({ batch: b.batchNo, page: undefined })}`} className="money underline underline-offset-2">
          {b.batchNo}
        </Link>
      ),
    },
    {
      key: "prepared",
      header: "Prepared",
      cell: (b) => (
        <>
          {/* Prepared at is ISO text with the Lagos offset; its date part is the Lagos date. */}
          <span className="whitespace-nowrap">{isIsoDate(b.preparedAt?.slice(0, 10) ?? "") ? formatDate(b.preparedAt!.slice(0, 10)) : (b.preparedAt ?? "—")}</span>
          {b.preparedBy && <span className="block text-sm text-muted">{b.preparedBy}</span>}
        </>
      ),
    },
    {
      key: "lines",
      header: "Lines",
      mobile: true,
      cell: (b) => (
        <>
          {b.paymentLines} {b.paymentLines === 1 ? "payment" : "payments"}, {b.reversalLines} {b.reversalLines === 1 ? "reversal" : "reversals"}
          {b.linesSkipped > 0 && <span className="block text-sm text-muted">{b.linesSkipped} already held</span>}
        </>
      ),
    },
    { key: "net", header: "Net (₦)", align: "right", mobile: true, cell: (b) => <span className="money">{formatAmount(b.netTotal)}</span> },
    {
      key: "imported",
      header: "Imported",
      cell: (b) => (
        <>
          <span className="whitespace-nowrap">{formatDateTime(b.importedAt)}</span>
          <span className="block text-sm text-muted">{b.importedBy}</span>
        </>
      ),
    },
    {
      key: "file",
      header: "File",
      cell: (b) => (
        <a href={`/re-payments/file?batch=${encodeURIComponent(b.batchNo)}`} className="inline-flex items-center gap-1 text-sm underline underline-offset-2">
          <Download aria-hidden className="size-3.5" />
          {b.fileName}
        </a>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="R&E payments"
        description="Registration and own-use payments confirmed in the Registration & Evaluation app and handed over in batches. Stored exactly as received."
        actions={
          <ButtonLink href={`/export/re-payments.xlsx${keep({ page: undefined })}`} variant="secondary" prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </ButtonLink>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-control border border-border bg-surface-raised p-3 text-sm text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        These payments are kept apart from receipts. They aren&apos;t counted in the Dashboard, Monthly summary or Budget vs actual
        until Finance assigns their revenue codes.
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Payments{filtered ? " (filtered)" : ""}</p>
          <p className="money mt-2 text-lg font-semibold">₦{formatAmount(totals.payments)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Reversals</p>
          <p className="money mt-2 text-lg font-semibold text-rose-text">{signedNaira(totals.reversals)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Net</p>
          <p className="money mt-2 text-lg font-semibold">{signedNaira(totals.net)}</p>
          <p className="mt-1 text-sm text-muted">
            {totals.count} {totals.count === 1 ? "line" : "lines"}
          </p>
        </Card>
      </div>

      {canImport && (
        <section className="mb-10">
          <SectionHeading
            title="Import a batch"
            description="Upload the batch .xlsx exactly as R&E gave it. You'll see its lines and totals first; nothing is saved until you choose Import. A file that fails any check is refused as a whole."
          />
          <Card className="p-5">
            <HandoverImportPanel />
          </Card>
        </section>
      )}

      <section className="mb-10">
        <SectionHeading title="Batches imported" description="Newest first. Each keeps the file it came from." />
        {batches.length === 0 ? (
          <EmptyState icon={<FileInput aria-hidden className="size-6" />} message="No batches imported yet." />
        ) : (
          <DataTable columns={batchColumns} rows={batches} rowKey={(b) => b.batchNo} caption="Handover batches imported" />
        )}
      </section>

      <section>
        <SectionHeading title="Lines" description="A reversal is its own negative line; the payment it reverses is marked, never changed." />
        <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="PAY no., payer, RRR or ACK" htmlFor="f-q">
            <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ""} placeholder="e.g. PAY/2026/00012" />
          </Field>
          <Field label="Batch" htmlFor="f-batch">
            <Select id="f-batch" name="batch" defaultValue={f.batch ?? ""}>
              <option value="">All batches</option>
              {batches.map((b) => (
                <option key={b.batchNo} value={b.batchNo}>
                  {b.batchNo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Line type" htmlFor="f-type">
            <Select id="f-type" name="type" defaultValue={f.type ?? ""}>
              <option value="">Payments and reversals</option>
              <option value="Payment">Payments</option>
              <option value="Reversal">Reversals</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonClass("primary")}>
              Filter
            </button>
            {filtered && (
              <Link href="/re-payments" className={buttonClass("ghost")}>
                Clear
              </Link>
            )}
          </div>
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={<FileInput aria-hidden className="size-6" />}
            message={filtered ? "No lines match these filters." : canImport ? "No lines yet. Import the first batch above." : "No lines yet."}
          />
        ) : (
          <>
            <DataTable columns={lineColumns} rows={rows} rowKey={(r) => r.lineId} caption="R&E payment lines" />
            <Pagination page={f.page} pageCount={pageCount} total={totals.count} href={(p) => `/re-payments${keep({ page: p > 1 ? String(p) : undefined })}`} />
          </>
        )}
      </section>
    </>
  );
}
