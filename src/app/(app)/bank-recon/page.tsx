import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Naira, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { MONTH_LABELS } from "@/lib/budget";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { bankRecon, type ReconCell } from "@/lib/reports-service";
import { gatePage } from "@/lib/session";
import { getViewingYear } from "@/lib/settings-server";
import { StatementCell } from "./statement-cell";

export const metadata: Metadata = { title: "Bank recon" };

const th = "border-b border-border px-3 py-2 text-xs font-medium text-muted whitespace-nowrap";
const td = "px-3 py-2 text-right whitespace-nowrap";

function Difference({ cell }: { cell: ReconCell }) {
  if (cell.difference === null) return <span className="text-muted">—</span>;
  const d = toDecimal(cell.difference);
  // Any non-zero difference is highlighted (BUILD_SPEC 4.9), in words as well as colour.
  return d.isZero() ? (
    <span className="text-emerald-text">
      <Naira value="0.00" />
      <span className="sr-only"> (matches)</span>
    </span>
  ) : (
    <span className="rounded-control bg-rose/12 px-1.5 py-0.5 font-medium text-rose-text">
      <Naira value={formatAmount(cell.difference)} />
      <span className="sr-only"> (difference to explain)</span>
    </span>
  );
}

export default async function BankReconPage() {
  const gate = await gatePage("bankRecon.view");
  if (!gate.ok) return <NoAccess title="Bank recon" />;
  const canEnter = can(gate.user.roles, "bankRecon.enter");
  const fy = await getViewingYear();
  const r = await bankRecon(db, fy);

  return (
    <>
      <PageHeader
        title="Bank recon"
        description={`Register receipts for FY ${fy} by value date (pending and confirmed, not reversed) against the bank or TSA statement totals.`}
        actions={
          <ButtonLink href={`/export/bank-recon.xlsx?fy=${fy}`} variant="secondary" prefetch={false}>
            <Download aria-hidden className="size-4" /> Excel
          </ButtonLink>
        }
      />
      <p className="-mt-4 mb-6 text-sm text-muted">
        {canEnter
          ? "Click a statement figure to enter or change it. Explain any difference before confirming pending receipts."
          : "Finance enters the statement totals."}{" "}
        Difference = statement − register.
      </p>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Register against statement by month and collecting account</caption>
          <thead className="bg-surface-raised">
            <tr>
              <th scope="col" rowSpan={2} className={cn(th, "sticky left-0 z-[1] bg-surface-raised text-left align-bottom")}>
                Month
              </th>
              {r.accounts.map((a) => (
                <th key={a} scope="colgroup" colSpan={3} className={cn(th, "border-l text-center text-text")}>
                  {a}
                </th>
              ))}
            </tr>
            <tr>
              {r.accounts.map((a) => (
                <Fragment key={a}>
                  <th scope="col" className={cn(th, "border-l text-right")}>
                    Per register
                  </th>
                  <th scope="col" className={cn(th, "text-right")}>
                    Per statement
                  </th>
                  <th scope="col" className={cn(th, "text-right")}>
                    Difference
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.months.map((m, i) => (
              <tr key={i} className="border-b border-border hover:bg-surface-raised">
                <th scope="row" className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left font-medium">
                  {MONTH_LABELS[i]}
                </th>
                {r.accounts.map((a) => (
                  <Fragment key={a}>
                    <td className={cn(td, "border-l border-border")}>
                      {toDecimal(m[a]!.register).isZero() ? <span className="text-muted">0.00</span> : <Naira value={formatAmount(m[a]!.register)} />}
                    </td>
                    <td className={td}>
                      <StatementCell
                        financialYear={fy}
                        month={i + 1}
                        monthLabel={MONTH_LABELS[i]!}
                        account={a}
                        value={m[a]!.statement}
                        register={m[a]!.register}
                        canEnter={canEnter}
                      />
                    </td>
                    <td className={td}>
                      <Difference cell={m[a]!} />
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-border bg-surface-raised font-semibold">
              <th scope="row" className="sticky left-0 z-[1] bg-surface-raised px-3 py-2 text-left">
                FY {fy}
              </th>
              {r.accounts.map((a) => (
                <Fragment key={a}>
                  <td className={cn(td, "border-l border-border")}>
                    <Naira value={formatAmount(r.totals[a]!.register)} />
                  </td>
                  <td className={td}>{r.totals[a]!.statement === null ? <span className="font-normal text-muted">—</span> : <Naira value={formatAmount(r.totals[a]!.statement!)} />}</td>
                  <td className={td}>
                    <Difference cell={r.totals[a]!} />
                  </td>
                </Fragment>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm">
        Pending receipts to confirm:{" "}
        <Link href="/register?status=pending" className="font-medium underline-offset-2 hover:underline">
          {r.pendingCount}, <Naira value={formatAmount(r.pendingAmount)} />
        </Link>
      </p>
    </>
  );
}
