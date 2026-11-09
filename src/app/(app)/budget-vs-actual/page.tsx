import { CircleAlert, CircleCheck, Download } from "lucide-react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { type PillTone, Naira, PageHeader, SectionHeading, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { MONTH_LABELS } from "@/lib/budget";
import { formatDate } from "@/lib/dates";
import { formatAmount, toDecimal } from "@/lib/money";
import { budgetVsActual, type BvaFigures, type LineStatus } from "@/lib/reports-service";
import { gatePage } from "@/lib/session";
import { getAsAt, getSettings, getViewingYear } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Budget vs actual" };

const STATUS_TONE: Record<LineStatus, PillTone> = {
  "On / above budget": "emerald",
  "Slightly behind": "gold",
  "Behind budget": "rose",
  "Not yet phased": "muted",
  "No budget set": "slate",
  "Unbudgeted receipts": "amber",
};

// Headers wrap and figures are 13px so every column, including Status, fits at desktop width.
const th = "border-b border-border px-2.5 py-2.5 text-xs font-medium text-muted align-bottom";
const td = "px-2.5 py-2.5 align-top";

/** "−2,289,119,881.78" with a proper minus sign. */
const formatSigned = (v: string) => {
  const f = formatAmount(v);
  return f.startsWith("-") ? `−${f.slice(1)}` : f;
};

export default async function BudgetVsActualPage() {
  const gate = await gatePage("reports.view");
  if (!gate.ok) return <NoAccess title="Budget vs actual" />;
  const [fy, asAt, settings] = await Promise.all([getViewingYear(), getAsAt(), getSettings()]);
  const b = await budgetVsActual(db, fy, asAt, settings.budgetToDateRule);
  const ruleText =
    b.rule === "including_current_month" ? "counting the current month as complete, as the workbook did" : "counting completed months only";

  // Money columns say "(₦)" in the header and show plain figures, so the table fits at desktop width.
  const money = (v: string, extra?: string) => (
    <td className={cn(td, "money text-right whitespace-nowrap", extra)}>{formatSigned(v)}</td>
  );
  const figureCells = (f: BvaFigures) => (
    <>
      {money(f.budgetFy)}
      {money(f.budgetToDate)}
      {money(f.actualToDate)}
      {money(f.variance, toDecimal(f.variance).lt(0) ? "text-rose-text" : undefined)}
      <td className={cn(td, "money text-right")}>{f.achievedToDate === null ? "—" : `${f.achievedToDate}%`}</td>
      {money(f.actualFy)}
      <td className={cn(td, "money text-right")}>{f.achievedFy === null ? "—" : `${f.achievedFy}%`}</td>
    </>
  );
  const figureHeads = (
    <>
      <th scope="col" className={cn(th, "text-right")}>Budget FY (₦)</th>
      <th scope="col" className={cn(th, "text-right")}>Budget to date (₦)</th>
      <th scope="col" className={cn(th, "text-right")}>Actual to date (₦)</th>
      <th scope="col" className={cn(th, "text-right")}>Variance to date (₦)</th>
      <th scope="col" className={cn(th, "text-right")}>Achieved vs budget to date</th>
      <th scope="col" className={cn(th, "text-right")}>Actual FY</th>
      <th scope="col" className={cn(th, "text-right")}>Achieved vs full-year budget</th>
    </>
  );

  return (
    <>
      <PageHeader
        title="Budget vs actual"
        description={`Confirmed collections against the phased budget for FY ${fy}, as at ${formatDate(asAt)}.`}
        actions={
          <ButtonLink href={`/export/budget-vs-actual.xlsx?fy=${fy}`} variant="secondary" prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </ButtonLink>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-muted">
        {b.monthsElapsed} {b.monthsElapsed === 1 ? "month" : "months"} of FY {fy} elapsed, {ruleText} (change this in Settings).
        {settings.budgetVersionLabel ? ` Budget: ${settings.budgetVersionLabel}.` : ""}
      </p>

      <p
        className={cn(
          "mb-8 flex items-start gap-2 rounded-card border p-3 text-sm",
          b.unmappedCount === 0 ? "border-emerald-400/30 bg-emerald-400/10" : "border-amber/40 bg-amber/10",
        )}
      >
        {b.unmappedCount === 0 ? (
          <>
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-text" /> Every confirmed receipt this year maps to a
            budget line.
          </>
        ) : (
          <>
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-text" /> {b.unmappedCount} confirmed{" "}
            {b.unmappedCount === 1 ? "receipt" : "receipts"} (<Naira value={formatAmount(b.unmappedAmount)} />) {b.unmappedCount === 1 ? "has" : "have"} no budget
            line. Map their revenue heads to a budget line on the Fee schedule.
          </>
        )}
      </p>

      <section className="mb-10">
        <SectionHeading title="By budget line" />
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Budget against actual by budget line</caption>
            <thead className="bg-surface-raised">
              <tr>
                <th scope="col" className={cn(th, "text-left")}>Budget line</th>
                {figureHeads}
                <th scope="col" className={cn(th, "text-left")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-surface-raised">
                  <th scope="row" className={cn(td, "min-w-40 text-left font-normal")}>
                    <span className="money mr-2 font-medium">{l.id}</span>
                    {l.name}
                  </th>
                  {figureCells(l)}
                  <td className={td}>
                    <StatusPill tone={STATUS_TONE[l.status]}>{l.status}</StatusPill>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-border bg-surface-raised font-semibold">
                <th scope="row" className={cn(td, "text-left")}>Total</th>
                {figureCells(b.total)}
                <td className={td} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10">
        <SectionHeading title="By budget group" />
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Budget against actual by budget group</caption>
            <thead className="bg-surface-raised">
              <tr>
                <th scope="col" className={cn(th, "text-left")}>Group</th>
                {figureHeads}
              </tr>
            </thead>
            <tbody>
              {b.groups.map((g) => (
                <tr key={g.name} className="border-b border-border last:border-b-0">
                  <th scope="row" className={cn(td, "min-w-40 text-left font-normal")}>{g.name}</th>
                  {figureCells(g)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading title="Confirmed actual by month" description="By receipt date, against each line's full-year budget." />
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Confirmed actual by budget line and month</caption>
            <thead className="bg-surface-raised">
              <tr>
                <th scope="col" className={cn(th, "text-left")}>Budget line</th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} scope="col" className={cn(th, "text-right")}>{m}</th>
                ))}
                <th scope="col" className={cn(th, "text-right")}>Actual FY</th>
                <th scope="col" className={cn(th, "text-right")}>Budget FY</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-b-0">
                  <th scope="row" className={cn(td, "money text-left font-medium")} title={l.name}>
                    {l.id}
                  </th>
                  {l.monthly.map((m, i) => (
                    <td key={i} className={cn(td, "money text-right", toDecimal(m).isZero() && "text-muted")}>
                      {toDecimal(m).isZero() ? "0" : formatAmount(m)}
                    </td>
                  ))}
                  <td className={cn(td, "text-right font-medium")}>
                    <Naira value={formatAmount(l.actualFy)} />
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Naira value={formatAmount(l.budgetFy)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
