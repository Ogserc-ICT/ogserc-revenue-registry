import { asc, eq } from "drizzle-orm";
import { Download, FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Pagination } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, Naira, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { demandNotices, feeHeads } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { DN_PAGE_SIZE, listDemandNotices } from "@/lib/dn-service";
import { shareOf } from "@/lib/fees";
import { formatAmount } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getAsAt } from "@/lib/settings-server";
import { DN_BUCKET_FILTERS, DN_STATUS_FILTERS, dnFilterSchema } from "@/lib/validation";
import { DnTable } from "./dn-table";

export const metadata: Metadata = { title: "Demand notices" };

type Search = Record<string, string | string[] | undefined>;

export default async function DemandNoticesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("dn.view");
  if (!gate.ok) return <NoAccess title="Demand notices" />;
  const canCancel = can(gate.user.roles, "dn.cancel");
  const canIssue = can(gate.user.roles, "dn.issue");

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = dnFilterSchema.parse({
    q: one("q"),
    status: one("status"),
    bucket: one("bucket"),
    payer: one("payer"),
    code: one("code"),
    from: one("from"),
    to: one("to"),
    page: one("page"),
  });

  const asAt = await getAsAt();
  const [{ rows, totals }, billedPayers, heads] = await Promise.all([
    listDemandNotices(db, f, asAt),
    db
      .selectDistinct({ payerId: demandNotices.payerId, name: demandNotices.payerName })
      .from(demandNotices)
      .orderBy(asc(demandNotices.payerName)),
    db
      .selectDistinct({ code: feeHeads.code, head: feeHeads.head })
      .from(feeHeads)
      .innerJoin(demandNotices, eq(demandNotices.revenueCode, feeHeads.code))
      .orderBy(asc(feeHeads.code)),
  ]);
  const pageCount = Math.max(1, Math.ceil(totals.count / DN_PAGE_SIZE));
  const filtered = Boolean(f.q || f.status || f.bucket || f.payer || f.code || f.from || f.to);

  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q: f.q, status: f.status, bucket: f.bucket, payer: f.payer, code: f.code, from: f.from, to: f.to, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/demand-notices?${qs}` : "/demand-notices";
  };
  const pageHref = (p: number) => keep({ page: p > 1 ? String(p) : undefined });
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-pill border px-3 text-sm whitespace-nowrap",
      active ? "border-emerald-400 bg-emerald-400/12 font-medium text-text" : "border-border text-muted hover:text-text",
    );

  return (
    <>
      <PageHeader
        title="Demand notices"
        description={`Every notice issued, with what has been paid against it and how overdue it is, as at ${formatDate(asAt)}.`}
        actions={
          <>
            <ButtonLink href={`/export/demand-notices.xlsx${keep({}).replace("/demand-notices", "")}`} variant="secondary" prefetch={false}>
              <Download aria-hidden className="size-4" /> Excel
            </ButtonLink>
            {canIssue && (
              <ButtonLink href="/new-demand-notice">
                <Plus aria-hidden className="size-4" /> Issue demand notice
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label={filtered ? "Billed (matching, not cancelled)" : "Billed (not cancelled)"} value={totals.billed} note={`${totals.count} ${totals.count === 1 ? "notice" : "notices"}`} />
        <Summary label="Paid against notices" value={totals.paid} note="Confirmed receipts only" />
        <Summary label="Outstanding" value={totals.outstanding} note={`${totals.openCount} open`} />
        <Card className="p-4">
          <p className="text-sm text-muted">Collection rate</p>
          <p className="money mt-2 text-lg font-semibold">
            {shareOf(totals.paid, totals.billed) !== null ? `${shareOf(totals.paid, totals.billed)}%` : "—"}
          </p>
          <p className="mt-1 text-sm text-muted">Paid ÷ billed</p>
        </Card>
      </div>

      <nav aria-label="Quick filters" className="mb-4 flex flex-wrap gap-2">
        <Link href={keep({ status: undefined, bucket: undefined })} className={chip(!f.status && !f.bucket)}>
          All
        </Link>
        <Link href={keep({ status: "open", bucket: undefined })} className={chip(f.status === "open")}>
          Open only
        </Link>
        <Link href={keep({ status: undefined, bucket: "Over 90 days" })} className={chip(f.bucket === "Over 90 days")}>
          Over 90 days
        </Link>
      </nav>

      <form
        method="get"
        className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Field label="Notice no. or payer" htmlFor="f-q">
          <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ""} placeholder="e.g. 2026/0001 or IBEDC" />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            {DN_STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "open" ? "Open (anything outstanding)" : s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ageing" htmlFor="f-bucket">
          <Select id="f-bucket" name="bucket" defaultValue={f.bucket ?? ""}>
            <option value="">Any</option>
            {DN_BUCKET_FILTERS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payer" htmlFor="f-payer">
          <Select id="f-payer" name="payer" defaultValue={f.payer ?? ""}>
            <option value="">All payers</option>
            {billedPayers.map((p) => (
              <option key={p.payerId} value={p.payerId}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Revenue head" htmlFor="f-code">
          <Select id="f-code" name="code" defaultValue={f.code ?? ""}>
            <option value="">All heads</option>
            {heads.map((h) => (
              <option key={h.code} value={h.code}>
                {h.code} — {h.head}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Issued from" htmlFor="f-from">
          <Input id="f-from" name="from" type="date" defaultValue={f.from ?? ""} />
        </Field>
        <Field label="Issued to" htmlFor="f-to">
          <Input id="f-to" name="to" type="date" defaultValue={f.to ?? ""} />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Filter
          </button>
          {filtered && (
            <Link href="/demand-notices" className={buttonClass("ghost")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText aria-hidden className="size-6" />}
          message={
            filtered
              ? "No demand notices match these filters. Widen the dates or clear the filters."
              : "No demand notices yet. Issue the first one."
          }
          action={!filtered && canIssue ? <ButtonLink href="/new-demand-notice">Issue demand notice</ButtonLink> : undefined}
        />
      ) : (
        <>
          <DnTable
            canCancel={canCancel}
            rows={rows.map((r) => ({
              id: r.id,
              dnNo: r.dnNo,
              issueDate: r.issueDate,
              dueDate: r.dueDate,
              payerId: r.payerId,
              payerName: r.payerName,
              revenueCode: r.revenueCode,
              revenueHead: r.revenueHead,
              amountBilled: r.amountBilled,
              paidToDate: r.paidToDate,
              outstanding: r.outstanding,
              daysOverdue: r.daysOverdue,
              agingBucket: r.agingBucket,
              status: r.status,
              cancelled: r.cancelled,
            }))}
          />
          <Pagination page={f.page} pageCount={pageCount} total={totals.count} href={pageHref} />
        </>
      )}
    </>
  );
}

function Summary({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold">
        <Naira value={formatAmount(value)} />
      </p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </Card>
  );
}
