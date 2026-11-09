import { CircleAlert, CircleCheck, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { MONTH_LABELS } from "@/lib/budget";
import { formatAmount, toDecimal } from "@/lib/money";
import { monthlySummary, type SummaryRow } from "@/lib/reports-service";
import { gatePage } from "@/lib/session";
import { getViewingYear } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Monthly summary" };

const th = "border-b border-border px-2.5 py-2 text-xs font-medium text-muted whitespace-nowrap";
const td = "px-2.5 py-2 text-right money whitespace-nowrap";
const cell = (v: string) => (toDecimal(v).isZero() ? <span className="text-muted">0</span> : formatAmount(v));

export default async function MonthlySummaryPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const gate = await gatePage("reports.view");
  if (!gate.ok) return <NoAccess title="Monthly summary" />;
  const fy = await getViewingYear();
  const showAll = (await searchParams).all === "1";
  const m = await monthlySummary(db, fy);

  const categories = m.categories.filter((c) => showAll || !toDecimal(c.total).isZero());
  const headsIn = (category: string) => m.heads.filter((h) => h.category === category && (showAll || !toDecimal(h.total).isZero()));

  const row = (r: SummaryRow, opts: { label: React.ReactNode; className?: string; share?: boolean }) => (
    <tr key={r.key} className={cn("border-b border-border", opts.className)}>
      <th scope="row" className="sticky left-0 z-[1] min-w-60 bg-inherit px-2.5 py-2 text-left text-sm font-normal">
        {opts.label}
      </th>
      {r.months.map((v, i) => (
        <td key={i} className={td}>
          {cell(v)}
        </td>
      ))}
      <td className={cn(td, "font-semibold")}>{formatAmount(r.total)}</td>
      <td className={cn(td, "text-muted")}>{opts.share === false || r.share === null ? "" : `${r.share}%`}</td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Monthly summary"
        description={`Confirmed revenue for FY ${fy} by revenue head and month (receipt date), with category subtotals and the phased budget.`}
        actions={
          <ButtonLink href={`/export/monthly-summary.xlsx?fy=${fy}`} variant="secondary" prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </ButtonLink>
        }
      />

      <div className="-mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <p
          className={cn(
            "flex items-center gap-2 rounded-control px-3 py-2 text-sm",
            m.reconciles ? "bg-emerald-400/10 text-emerald-text" : "bg-rose/10 text-rose-text",
          )}
        >
          {m.reconciles ? <CircleCheck aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
          {m.reconciles ? "Check: category totals equal head totals for every month." : "Check failed: category totals don't equal head totals."}
        </p>
        <Link href={showAll ? "/monthly-summary" : "/monthly-summary?all=1"} className="text-sm text-muted underline underline-offset-2 hover:text-text">
          {showAll ? "Show only heads with collections" : `Show all ${m.heads.length} revenue heads`}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse">
          <caption className="sr-only">Confirmed revenue by revenue head and month</caption>
          <thead className="bg-surface-raised">
            <tr>
              <th scope="col" className={cn(th, "sticky left-0 z-[1] bg-surface-raised text-left")}>
                Revenue head
              </th>
              {MONTH_LABELS.map((mo) => (
                <th key={mo} scope="col" className={cn(th, "text-right")}>
                  {mo}
                </th>
              ))}
              <th scope="col" className={cn(th, "text-right")}>
                Total FY
              </th>
              <th scope="col" className={cn(th, "text-right")}>
                Share
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface">
            {categories.length === 0 && (
              <tr>
                <td colSpan={15} className="px-3 py-6 text-center text-base text-muted">
                  No confirmed receipts in FY {fy} yet.
                </td>
              </tr>
            )}
            {categories.map((c) => (
              <Fragment key={c.key}>
                {headsIn(c.key).map((h) =>
                  row(h, {
                    label: (
                      <>
                        <span className="money mr-2 text-xs font-medium">{h.code}</span>
                        {h.label}
                      </>
                    ),
                  }),
                )}
                {row(c, { label: <span className="font-medium">{c.label}</span>, className: "bg-surface-raised font-medium" })}
              </Fragment>
            ))}
            {m.types.map((t) => row(t, { label: <span className="font-medium">{t.label}</span>, className: "bg-surface" }))}
            {row(m.total, { label: <span className="font-semibold">Total confirmed</span>, className: "bg-surface-raised font-semibold border-t-2" })}
            {row(m.budget, { label: <span className="text-muted">Phased budget</span>, className: "bg-surface", share: false })}
          </tbody>
        </table>
      </div>
    </>
  );
}
