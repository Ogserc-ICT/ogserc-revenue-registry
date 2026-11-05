import { asc } from "drizzle-orm";
import { Pencil, Plus, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { NoAccess } from "@/components/placeholder-page";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Naira, PageHeader, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { feeHeads } from "@/db/schema";
import { describeRate, FEE_BASES, shareOf } from "@/lib/fees";
import { collectedByCode, type FeeHeadRow, schedule3LinkedCodes } from "@/lib/fees-service";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getSettings, getViewingYear } from "@/lib/settings-server";

export const metadata: Metadata = { title: "Fee schedule" };

type Search = Record<string, string | string[] | undefined>;

const filterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.string().max(120).optional().catch(undefined),
  basis: z.enum(FEE_BASES).optional().catch(undefined),
  show: z.enum(["active", "all"]).default("active").catch("active"),
});

interface Row extends FeeHeadRow {
  collected: string;
  share: string | null;
  linked: boolean;
}

export default async function FeeSchedulePage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("fees.view");
  if (!gate.ok) return <NoAccess title="Fee schedule" />;
  const canEdit = can(gate.user.roles, "fees.edit");

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = filterSchema.parse({ q: one("q"), category: one("category"), basis: one("basis"), show: one("show") });

  const fy = await getViewingYear();
  const [heads, collected, linked, settings] = await Promise.all([
    db.select().from(feeHeads).orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code)),
    collectedByCode(db, fy),
    schedule3LinkedCodes(db),
    getSettings(),
  ]);
  const fyTotal = [...collected.values()].reduce((a, v) => a.plus(v), toDecimal(0));

  const q = f.q?.toLowerCase();
  const rows: Row[] = heads
    .filter((h) => f.show === "all" || h.active)
    .filter((h) => !f.category || h.category === f.category)
    .filter((h) => !f.basis || h.basis === f.basis)
    .filter((h) => !q || h.code.toLowerCase().includes(q) || h.head.toLowerCase().includes(q))
    .map((h) => {
      const c = collected.get(h.code) ?? "0";
      return { ...h, collected: c, share: shareOf(c, fyTotal), linked: linked.has(h.code) };
    });
  const categories = [...new Set(heads.map((h) => h.category))];
  const groups = categories
    .map((c) => ({ category: c, rows: rows.filter((r) => r.category === c) }))
    .filter((g) => g.rows.length > 0);
  const filtered = Boolean(f.q || f.category || f.basis || f.show !== "active");

  const columns: Column<Row>[] = [
    {
      key: "head",
      header: "Revenue head",
      mobile: true,
      cell: (r) => (
        <div className={r.active ? undefined : "text-muted"}>
          <p className="font-medium">
            <span className="money mr-2">{r.code}</span>
            {r.head}
          </p>
          {r.appliesTo && <p className="mt-0.5 text-sm text-muted">{r.appliesTo}</p>}
          {!r.active && (
            <span className="mt-1 inline-block">
              <StatusPill tone="slate">Inactive</StatusPill>
            </span>
          )}
        </div>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      mobile: true,
      cell: (r) => (
        <div className="text-sm">
          <p className="money">{describeRate(r, settings.usdNgnRate)}</p>
          <p className="text-muted">
            {r.basis}
            {r.frequency ? ` · ${r.frequency}` : ""}
            {r.linked ? " · Schedule 3" : ""}
          </p>
          {r.publishedRateText && <p className="text-muted">{r.publishedRateText}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Rate status",
      mobile: true,
      cell: (r) =>
        r.rateStatus ? (
          <StatusPill tone={r.rateStatus === "Approved" || r.rateStatus === "Per Schedule 3" ? "emerald" : /draft|placeholder|not set/i.test(r.rateStatus) ? "amber" : "muted"}>
            {r.rateStatus}
          </StatusPill>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "type",
      header: "Type · budget line",
      mobile: true,
      cell: (r) => (
        <span className="text-sm">
          {r.revenueType}
          <span className="text-muted"> · {r.budgetLineId ?? "Not mapped"}</span>
        </span>
      ),
    },
    {
      key: "collected",
      header: `Collected FY${fy}`,
      align: "right",
      mobile: true,
      cell: (r) => (
        <div>
          <Naira value={formatAmount(r.collected)} />
          {r.share !== null && toDecimal(r.collected).gt(0) && <p className="text-xs text-muted">{r.share}% of FY</p>}
        </div>
      ),
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            header: "",
            mobile: true,
            cell: (r: Row) => (
              <Link
                href={`/fee-schedule/${encodeURIComponent(r.code)}/edit`}
                className={buttonClass("ghost", "sm")}
                aria-label={`Edit ${r.code}`}
              >
                <Pencil aria-hidden className="size-3.5" /> Edit
              </Link>
            ),
          } satisfies Column<Row>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Fee schedule"
        description={`Every revenue head, its rate and what it has collected in FY${fy} (confirmed receipts, by receipt date).`}
        actions={
          canEdit ? (
            <ButtonLink href="/fee-schedule/new">
              <Plus aria-hidden className="size-4" /> Add fee head
            </ButtonLink>
          ) : undefined
        }
      />

      <p className="-mt-4 mb-6 text-sm text-muted">
        Total confirmed FY{fy}: <Naira value={formatAmount(fyTotal)} className="text-text" /> · US$ fees at ₦
        {formatAmount(settings.usdNgnRate).replace(/\.00$/, "")}/US$ (Settings).
      </p>

      <form
        method="get"
        className="mb-8 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1fr_auto]"
      >
        <Field label="Code or head" htmlFor="f-q">
          <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ""} placeholder="e.g. REG or levy" />
        </Field>
        <Field label="Category" htmlFor="f-category">
          <Select id="f-category" name="category" defaultValue={f.category ?? ""}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Basis" htmlFor="f-basis">
          <Select id="f-basis" name="basis" defaultValue={f.basis ?? ""}>
            <option value="">Any</option>
            {FEE_BASES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Show" htmlFor="f-show">
          <Select id="f-show" name="show" defaultValue={f.show}>
            <option value="active">Active</option>
            <option value="all">All</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={buttonClass("primary")}>
            Filter
          </button>
          {filtered && (
            <Link href="/fee-schedule" className={buttonClass("ghost")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {groups.length === 0 ? (
        <EmptyState
          icon={<ReceiptText aria-hidden className="size-6" />}
          message="No fee heads match these filters. Clear the filters to see them all."
        />
      ) : (
        <div className="flex flex-col gap-10">
          {groups.map((g) => {
            const subtotal = g.rows.reduce((a, r) => a.plus(r.collected), toDecimal(0));
            return (
              <section key={g.category}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-md font-semibold">{g.category}</h2>
                  <p className="text-sm text-muted">
                    {g.rows.length} {g.rows.length === 1 ? "head" : "heads"} · collected{" "}
                    <Naira value={formatAmount(subtotal)} className="text-text" />
                  </p>
                </div>
                <DataTable caption={g.category} columns={columns} rows={g.rows} rowKey={(r) => r.code} />
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
