import { asc, eq } from "drizzle-orm";
import { Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { TweenNaira } from "@/components/tween-naira";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Pagination } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { feeHeads, receipts } from "@/db/schema";
import { getListValues } from "@/lib/lists-server";
import { can } from "@/lib/permissions";
import { listReceipts, RECEIPTS_PAGE_SIZE } from "@/lib/receipt-service";
import { gatePage } from "@/lib/session";
import { receiptFilterSchema } from "@/lib/validation";
import { RegisterTable } from "./register-table";

export const metadata: Metadata = { title: "Register" };

type Search = Record<string, string | string[] | undefined>;

const STATUS_LABELS = { pending: "Pending confirmation", confirmed: "Confirmed", reversed: "Reversed" } as const;

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("receipts.view");
  if (!gate.ok) return <NoAccess title="Register" />;
  const roles = gate.user.roles;
  const canAct = can(roles, "receipts.confirm") || can(roles, "receipts.reverse");
  const canRecord = can(roles, "receipts.record");

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = receiptFilterSchema.parse({
    q: one("q"),
    status: one("status"),
    payer: one("payer"),
    code: one("code"),
    account: one("account"),
    from: one("from"),
    to: one("to"),
    page: one("page"),
  });

  const [{ rows, totals }, payerOptions, heads, accounts] = await Promise.all([
    listReceipts(db, f),
    db.selectDistinct({ payerId: receipts.payerId, name: receipts.payerName }).from(receipts).orderBy(asc(receipts.payerName)),
    db
      .selectDistinct({ code: feeHeads.code, head: feeHeads.head })
      .from(feeHeads)
      .innerJoin(receipts, eq(receipts.revenueCode, feeHeads.code))
      .orderBy(asc(feeHeads.code)),
    getListValues("Collecting accounts"),
  ]);
  const pageCount = Math.max(1, Math.ceil(totals.count / RECEIPTS_PAGE_SIZE));
  const filtered = Boolean(f.q || f.status || f.payer || f.code || f.account || f.from || f.to);

  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q: f.q, status: f.status, payer: f.payer, code: f.code, account: f.account, from: f.from, to: f.to, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/register?${qs}` : "/register";
  };
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-pill border px-3 text-sm whitespace-nowrap",
      active ? "border-emerald-400 bg-emerald-400/12 font-medium text-text" : "border-border text-muted hover:text-text",
    );

  return (
    <>
      <PageHeader
        title="Register"
        description="Every receipt recorded. Finance confirms receipts against the bank or TSA statement; only confirmed receipts count as revenue."
        actions={
          canRecord ? (
            <ButtonLink href="/new-receipt">
              <Plus aria-hidden className="size-4" /> New receipt
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm text-muted">Receipts</p>
          <p className="money mt-2 text-lg font-semibold">{totals.count}</p>
          <p className="mt-1 text-sm text-muted">{totals.reversedCount} reversed</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Confirmed</p>
          <p className="mt-2 text-lg font-semibold">
            <TweenNaira value={totals.confirmed} />
          </p>
          <p className="mt-1 text-sm text-muted">Counts as revenue</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Pending confirmation</p>
          <p className="mt-2 text-lg font-semibold text-amber-text">
            <TweenNaira value={totals.pending} />
          </p>
          <p className="mt-1 text-sm text-muted">
            {totals.pendingCount} {totals.pendingCount === 1 ? "receipt" : "receipts"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Recorded, not reversed</p>
          <p className="mt-2 text-lg font-semibold">
            <TweenNaira value={totals.paid} />
          </p>
          <p className="mt-1 text-sm text-muted">Confirmed + pending</p>
        </Card>
      </div>

      <nav aria-label="Quick filters" className="mb-4 flex flex-wrap gap-2">
        <Link href={keep({ status: undefined })} className={chip(!f.status)}>
          All
        </Link>
        <Link href={keep({ status: "pending" })} className={chip(f.status === "pending")}>
          Pending only
        </Link>
      </nav>

      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Receipt no., payer or ref" htmlFor="f-q">
          <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ""} placeholder="e.g. 2026/00013 or RRR" />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={f.status ?? ""}>
            <option value="">Any</option>
            {Object.entries(STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Payer" htmlFor="f-payer">
          <Select id="f-payer" name="payer" defaultValue={f.payer ?? ""}>
            <option value="">All payers</option>
            {payerOptions.map((p) => (
              <option key={`${p.payerId}-${p.name}`} value={p.payerId}>
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
        <Field label="Collecting account" htmlFor="f-account">
          <Select id="f-account" name="account" defaultValue={f.account ?? ""}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Receipt date from" htmlFor="f-from">
          <Input id="f-from" name="from" type="date" defaultValue={f.from ?? ""} />
        </Field>
        <Field label="Receipt date to" htmlFor="f-to">
          <Input id="f-to" name="to" type="date" defaultValue={f.to ?? ""} />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Filter
          </button>
          {filtered && (
            <Link href="/register" className={buttonClass("ghost")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden className="size-6" />}
          message={filtered ? "No receipts match these filters. Widen the dates or clear the filters." : "No receipts yet. Record the first one."}
          action={!filtered && canRecord ? <ButtonLink href="/new-receipt">New receipt</ButtonLink> : undefined}
        />
      ) : (
        <>
          <RegisterTable
            canAct={canAct}
            rows={rows.map((r) => ({
              id: r.id,
              receiptNo: r.receiptNo,
              receiptDate: r.receiptDate,
              payerId: r.payerId,
              payerName: r.payerName,
              revenueCode: r.revenueCode,
              revenueHead: r.revenueHead,
              dnNo: r.dnNo,
              amountPaid: r.amountPaid,
              channel: r.channel,
              collectingAccount: r.collectingAccount,
              paymentRef: r.paymentRef,
              status: r.status,
              recordedBy: r.recordedBy,
              mine: r.recordedById === gate.user.id,
              duplicateRef: r.duplicateRef,
            }))}
          />
          <Pagination page={f.page} pageCount={pageCount} total={totals.count} href={(p) => keep({ page: p > 1 ? String(p) : undefined })} />
        </>
      )}
    </>
  );
}
