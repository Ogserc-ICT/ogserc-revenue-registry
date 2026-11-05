import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Card, Naira, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { budgetCellValue, MONTH_LABELS, sumAmounts } from "@/lib/budget";
import { type BudgetLineRow, getBudget } from "@/lib/fees-service";
import { abbreviateNaira, formatAmount } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getSettings, getViewingYear } from "@/lib/settings-server";
import { EditBudgetLineButton } from "./budget-dialog";

export const metadata: Metadata = { title: "Revenue budget" };

export default async function RevenueBudgetPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const gate = await gatePage("fees.view");
  if (!gate.ok) return <NoAccess title="Revenue budget" />;
  const canEdit = can(gate.user.roles, "budget.edit");

  const [viewingYear, settings] = await Promise.all([getViewingYear(), getSettings()]);
  // ?fy= lets an Admin open a year the FY chip doesn't list yet (no budget or receipts so far).
  const requested = Number((await searchParams).fy);
  const fy = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : viewingYear;
  const lines = await getBudget(db, fy);
  const fyTotal = sumAmounts(lines.flatMap((l) => l.months));
  const monthTotals = MONTH_LABELS.map((_, i) => sumAmounts(lines.map((l) => l.months[i])));
  const hasBudget = fyTotal.gt(0);
  const groups = [...new Set(lines.map((l) => l.groupName))].map((name) => ({
    name,
    lines: lines.filter((l) => l.groupName === name),
  }));

  const columns: Column<BudgetLineRow>[] = [
    {
      key: "line",
      header: "Budget line",
      mobile: true,
      className: "min-w-56",
      cell: (r) => (
        <div>
          <p className="font-medium">
            <span className="money mr-2">{r.id}</span>
            {r.name}
          </p>
        </div>
      ),
    },
    ...MONTH_LABELS.map(
      (m, i): Column<BudgetLineRow> => ({
        key: m,
        header: m,
        align: "right",
        className: "text-sm",
        cell: (r) => <span className={isZero(r.months[i]) ? "text-muted" : undefined}>{shortAmount(r.months[i])}</span>,
      }),
    ),
    {
      key: "total",
      header: `FY${fy}`,
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(sumAmounts(r.months))} className="font-medium" />,
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            header: "",
            mobile: true,
            cell: (r: BudgetLineRow) => (
              <EditBudgetLineButton
                financialYear={fy}
                lineId={r.id}
                lineName={r.name}
                months={r.months.map((v) => budgetCellValue(v))}
              />
            ),
          } satisfies Column<BudgetLineRow>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Revenue budget"
        description={`Monthly phased budget per budget line for FY${fy}. Change the year with the FY chip at the top.`}
        actions={
          canEdit ? (
            <ButtonLink variant="secondary" href={`/revenue-budget?fy=${fy + 1}`}>
              FY{fy + 1} budget
            </ButtonLink>
          ) : undefined
        }
      />
      {fy !== viewingYear && (
        <p className="-mt-4 mb-6 text-sm text-muted">
          Showing FY{fy}, which isn&apos;t the year selected in the FY chip.{" "}
          <Link href="/revenue-budget" className="text-text underline underline-offset-2">
            Back to FY{viewingYear}
          </Link>
        </p>
      )}

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted">Annual budget, FY{fy}</p>
          <p className="mt-2 text-lg font-semibold" title={`₦${formatAmount(fyTotal)}`}>
            <Naira value={formatAmount(fyTotal)} />
          </p>
          <p className="mt-1 text-sm text-muted">{settings.budgetVersionLabel || "No version label set"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Lines with a budget</p>
          <p className="money mt-2 text-lg font-semibold">
            {lines.filter((l) => sumAmounts(l.months).gt(0)).length} of {lines.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Largest month</p>
          <p className="mt-2 text-lg font-semibold">
            {hasBudget ? (
              (() => {
                const max = monthTotals.reduce((best, v, i) => (v.gt(monthTotals[best]!) ? i : best), 0);
                return (
                  <>
                    {MONTH_LABELS[max]} <span className="text-base font-normal text-muted">{abbreviateNaira(monthTotals[max])}</span>
                  </>
                );
              })()
            ) : (
              <span className="text-base font-normal text-muted">No budget yet</span>
            )}
          </p>
        </Card>
      </div>

      {!hasBudget && (
        <p className="mb-6 rounded-card border border-dashed border-border bg-surface p-4 text-base text-muted">
          No budget for FY{fy} yet.{" "}
          {canEdit ? "Use Edit on each line to enter its months." : "An Admin can enter it line by line."}
        </p>
      )}

      <div className="flex flex-col gap-10">
        {groups.map((g) => (
          <section key={g.name}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-md font-semibold">{g.name}</h2>
              <p className="text-sm text-muted">
                Subtotal <Naira value={formatAmount(sumAmounts(g.lines.flatMap((l) => l.months)))} className="text-text" />
              </p>
            </div>
            <DataTable caption={g.name} columns={columns} rows={g.lines} rowKey={(r) => r.id} />
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-md font-semibold">All lines by month</h2>
          <div className="rounded-card border border-border bg-surface">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-4 lg:grid-cols-6">
              {MONTH_LABELS.map((m, i) => (
                <div key={m} className="flex justify-between gap-2">
                  <dt className="text-muted">{m}</dt>
                  <dd className="money" title={`₦${formatAmount(monthTotals[i])}`}>
                    {abbreviateNaira(monthTotals[i])}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="flex justify-between border-t border-border px-4 py-3 text-base">
              <span className="font-medium">FY{fy} total</span>
              <Naira value={formatAmount(fyTotal)} className="font-semibold" />
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

const isZero = (v: string | undefined) => !v || Number(v) === 0;

/** Month cells: full figures are too wide for 12 columns, so show 2 dp without the sign. */
function shortAmount(v: string | undefined) {
  return isZero(v) ? "0" : formatAmount(v);
}
