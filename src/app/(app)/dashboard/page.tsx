import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { cn } from "@/components/ui/cn";
import { Card, Naira } from "@/components/ui/misc";
import { db } from "@/db";
import { formatDate } from "@/lib/dates";
import { abbreviateNaira, formatAmount } from "@/lib/money";
import { can } from "@/lib/permissions";
import { dashboard } from "@/lib/reports-service";
import { gatePage } from "@/lib/session";
import { getAsAt, getSettings, getViewingYear } from "@/lib/settings-server";
import { CollectionsChart } from "./collections-chart";
import { SignatureCard } from "./signature-card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const gate = await gatePage("reports.view");
  if (!gate.ok) return <NoAccess title="Dashboard" />;
  const roles = gate.user.roles;
  const canNotices = can(roles, "dn.view");
  const canPayers = can(roles, "payers.view");

  const [fy, asAt, settings] = await Promise.all([getViewingYear(), getAsAt(), getSettings()]);
  const d = await dashboard(db, fy, asAt, settings.budgetToDateRule);
  const a = d.attention;
  const attentionCount = a.stalePending.length + a.over90.length + (a.noSch3Count ? 1 : 0) + a.unbudgeted.length + (a.unmappedCount ? 1 : 0);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Dashboard</h1>
        <p className="mt-1 max-w-[80ch] text-base text-muted">
          FY {fy} as at {formatDate(asAt)}. Confirmed receipts only, unless stated.
          {settings.budgetVersionLabel ? ` Budget: ${settings.budgetVersionLabel}.` : ""}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SignatureCard
          financialYear={fy}
          confirmedFy={d.confirmedFy}
          igr={d.igr}
          nonIgr={d.nonIgr}
          annualBudget={d.annualBudget}
          budgetToDate={d.budgetToDate}
          achievedToDate={d.achievedToDate}
          achievedFy={d.achievedFy}
          budgetToDateShare={d.budgetToDateShare}
          monthsElapsed={d.monthsElapsed}
        />
        <div className="grid gap-4">
          <Kpi
            label="Pending confirmation"
            value={d.pendingAmount}
            note={`${d.pendingCount} ${d.pendingCount === 1 ? "receipt" : "receipts"} awaiting Finance`}
            href="/register?status=pending"
            tone="amber"
          />
          <Kpi
            label="Outstanding notices"
            value={d.dnOutstanding}
            note={`${d.dnOpenCount} open`}
            href={canNotices ? "/demand-notices?status=open" : undefined}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Over 90 days"
          value={d.over90Amount}
          note={`${d.over90Count} ${d.over90Count === 1 ? "notice" : "notices"}: escalate for enforcement`}
          tone="rose"
          href={canNotices ? "/demand-notices?bucket=Over+90+days" : undefined}
        />
        <Card className="p-4">
          <p className="text-sm text-muted">Receipts (FY)</p>
          <p className="money mt-2 text-lg font-semibold">{d.receiptsFy}</p>
          <p className="mt-1 text-sm text-muted">{d.reversedFy} reversed (not counted)</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted">Notice collection rate</p>
          <p className="money mt-2 text-lg font-semibold">{d.collectionRate === null ? "—" : `${d.collectionRate}%`}</p>
          <p className="mt-1 text-sm text-muted">Confirmed payments ÷ amounts billed</p>
        </Card>
        <Kpi label="Annual budget" value={d.annualBudget} note={settings.budgetVersionLabel || `FY ${fy}`} href="/budget-vs-actual" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <CollectionsChart data={d.monthly} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-md font-semibold">Needs attention</h2>
          {attentionCount === 0 ? (
            <p className="text-base text-muted">Nothing needs attention.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {a.stalePending.map((r) => (
                <AttentionItem key={r.id} href={`/register/${r.id}`} tone="amber">
                  <span className="money">{r.receiptNo}</span> pending since {formatDate(r.receiptDate)} ·{" "}
                  <Naira value={formatAmount(r.amountPaid)} />
                </AttentionItem>
              ))}
              {a.over90.map((n) => (
                <AttentionItem key={n.id} href={canNotices ? `/demand-notices/${n.id}` : undefined} tone="rose">
                  <span className="money">{n.dnNo}</span> {n.payerName}: {n.daysOverdue} days, <Naira value={formatAmount(n.outstanding)} />
                </AttentionItem>
              ))}
              {a.noSch3Count > 0 && (
                <AttentionItem href={canPayers ? "/payers?sch3=none" : undefined} tone="muted">
                  {a.noSch3Count} active {a.noSch3Count === 1 ? "payer has" : "payers have"} no Schedule 3 category
                </AttentionItem>
              )}
              {a.unbudgeted.map((l) => (
                <AttentionItem key={l.id} href="/budget-vs-actual" tone="gold">
                  {l.id} {l.name}: <Naira value={formatAmount(l.actualFy)} /> received with no budget
                </AttentionItem>
              ))}
              {a.unmappedCount > 0 && (
                <AttentionItem href="/budget-vs-actual" tone="gold">
                  {a.unmappedCount} confirmed {a.unmappedCount === 1 ? "receipt has" : "receipts have"} no budget line
                </AttentionItem>
              )}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-md font-semibold">Top 5 payers (confirmed, FY {fy})</h2>
          {d.topPayers.length === 0 ? (
            <p className="text-base text-muted">No confirmed receipts this year yet.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Top five payers by confirmed revenue this year</caption>
              <tbody>
                {d.topPayers.map((p, i) => (
                  <tr key={p.payerId} className="border-t border-border first:border-t-0">
                    <td className="money w-6 py-2 text-muted">{i + 1}</td>
                    <th scope="row" className="py-2 text-left font-normal">
                      {canPayers ? (
                        <Link href={`/payers/${encodeURIComponent(p.payerId)}`} className="underline-offset-2 hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        p.name
                      )}
                    </th>
                    <td className="py-2 text-right">
                      <Naira value={formatAmount(p.amount)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-md font-semibold">Demand notice ageing (outstanding)</h2>
          <table className="w-full text-sm">
            <caption className="sr-only">Outstanding demand notice balances by age</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1.5 text-left font-medium">
                  Bucket
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Notices
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {d.ageing.map((b) => (
                <tr key={b.bucket} className="border-t border-border">
                  <th scope="row" className={cn("py-2 text-left font-normal", b.bucket === "Over 90 days" && "text-rose-text")}>
                    {b.bucket}
                  </th>
                  <td className="money py-2 text-right">{b.count}</td>
                  <td className="py-2 text-right">
                    <Naira value={formatAmount(b.amount)} />
                  </td>
                  <td className="money py-2 text-right">{b.share === null ? "—" : `${b.share}%`}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-medium">
                <th scope="row" className="py-2 text-left">
                  Total
                </th>
                <td className="money py-2 text-right">{d.dnOpenCount}</td>
                <td className="py-2 text-right">
                  <Naira value={formatAmount(d.dnOutstanding)} />
                </td>
                <td className="money py-2 text-right">{d.dnOpenCount ? "100.00%" : "—"}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 text-md font-semibold">Revenue by category (confirmed, FY {fy})</h2>
        {d.categoryMix.length === 0 ? (
          <p className="text-base text-muted">No confirmed receipts this year yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.categoryMix.map((c) => (
              <li key={c.category}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>{c.category}</span>
                  <span>
                    <Naira value={formatAmount(c.amount)} /> <span className="money text-muted">({c.share}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-pill bg-surface-raised" aria-hidden>
                  <div className="h-full rounded-pill bg-emerald-600" style={{ width: `${Math.max(1, Number(c.share ?? 0))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          Revenue is counted only after Finance confirms the receipt against the bank or TSA statement. Pending and reversed receipts are
          excluded from every chart.
        </p>
      </Card>
    </>
  );
}

/** Flat KPI card: abbreviated figure with the full figure as a tooltip (DESIGN.md 2). */
function Kpi({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  href?: string;
  tone?: "rose" | "amber";
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p
        className={cn("money mt-2 text-lg font-semibold", tone === "rose" && "text-rose-text", tone === "amber" && "text-amber-text")}
        title={`₦${formatAmount(value)}`}
      >
        {abbreviateNaira(value)}
      </p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-card border border-border bg-surface p-4 hover:bg-surface-raised">
      {body}
    </Link>
  ) : (
    <Card className="p-4">{body}</Card>
  );
}

function AttentionItem({ href, tone, children }: { href?: string; tone: "rose" | "amber" | "gold" | "muted"; children: React.ReactNode }) {
  const dot = { rose: "bg-rose", amber: "bg-amber", gold: "bg-gold-500", muted: "bg-muted" }[tone];
  const inner = (
    <span className="flex items-start gap-2">
      <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-pill", dot)} />
      <span className="min-w-0 flex-1">{children}</span>
      {href && <ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />}
    </span>
  );
  return <li className="py-2">{href ? <Link href={href} className="block hover:text-text">{inner}</Link> : inner}</li>;
}
