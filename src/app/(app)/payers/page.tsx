import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { RegistrationPill } from "@/components/registration-pill";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Naira, PageHeader, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { getListValues } from "@/lib/lists-server";
import { formatAmount } from "@/lib/money";
import { listPayers, PAYERS_PAGE_SIZE, type PayerSummary } from "@/lib/payers-service";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { payerFilterSchema, SCH3_CATEGORY_VALUES } from "@/lib/validation";

export const metadata: Metadata = { title: "Payers" };

type Search = Record<string, string | string[] | undefined>;

const REG_STATUSES = ["Registered", "Part-paid", "Not registered", "Fee not set"] as const;

export default async function PayersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("payers.view");
  if (!gate.ok) return <NoAccess title="Payers" />;
  const canEdit = can(gate.user.roles, "payers.edit");

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = payerFilterSchema.parse({
    q: one("q"),
    category: one("category"),
    reg: one("reg"),
    sch3: one("sch3"),
    show: one("show"),
    page: one("page"),
  });

  const [{ rows, total }, categories] = await Promise.all([listPayers(db, f), getListValues("Payer categories")]);
  const pageCount = Math.max(1, Math.ceil(total / PAYERS_PAGE_SIZE));
  const filtered = Boolean(f.q || f.category || f.reg || f.sch3 || f.show !== "active");

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ q: f.q, category: f.category, reg: f.reg, sch3: f.sch3 })) {
    if (v) params.set(k, v);
  }
  if (f.show !== "active") params.set("show", f.show);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/payers?${qs}` : "/payers";
  };

  const columns: Column<PayerSummary>[] = [
    {
      key: "payer",
      header: "Payer",
      mobile: true,
      cell: (r) => (
        <div className={r.active ? undefined : "text-muted"}>
          <Link href={`/payers/${encodeURIComponent(r.payerId)}`} className="font-medium underline-offset-2 hover:underline">
            {r.name}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            <span className="money">{r.payerId}</span>
            {r.isSample && <StatusPill tone="sky">Sample</StatusPill>}
            {!r.active && <StatusPill tone="slate">Inactive</StatusPill>}
          </p>
        </div>
      ),
    },
    { key: "category", header: "Category", mobile: true, cell: (r) => <span className="text-sm">{r.category ?? "—"}</span> },
    {
      key: "registration",
      header: "Registration",
      mobile: true,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <RegistrationPill status={r.registrationStatus} />
          <span className="text-xs text-muted">{r.sch3Category ? `Category ${r.sch3Category}` : "No Schedule 3 category"}</span>
        </div>
      ),
    },
    {
      key: "billed",
      header: "Billed",
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(r.totalBilled)} />,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      mobile: true,
      cell: (r) => (
        <div>
          <Naira value={formatAmount(r.outstanding)} />
          {r.openNotices > 0 && (
            <p className="text-xs text-muted">
              {r.openNotices} open {r.openNotices === 1 ? "notice" : "notices"}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "paid",
      header: "Confirmed paid",
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(r.totalPaid)} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Payers"
        description="Licensees and other payers, with what they have been billed, owe and have paid (all years)."
        actions={
          canEdit ? (
            <ButtonLink href="/payers/new">
              <Plus aria-hidden className="size-4" /> Add payer
            </ButtonLink>
          ) : undefined
        }
      />

      <form
        method="get"
        className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto]"
      >
        <Field label="Name, ID or licence no." htmlFor="f-q">
          <Input id="f-q" name="q" type="search" defaultValue={f.q ?? ""} placeholder="e.g. Taihu or OGS-P-0032" />
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
        <Field label="Schedule 3" htmlFor="f-sch3">
          <Select id="f-sch3" name="sch3" defaultValue={f.sch3 ?? ""}>
            <option value="">Any</option>
            {SCH3_CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>
                Category {c}
              </option>
            ))}
            <option value="none">Not set</option>
          </Select>
        </Field>
        <Field label="Registration" htmlFor="f-reg">
          <Select id="f-reg" name="reg" defaultValue={f.reg ?? ""}>
            <option value="">Any</option>
            {REG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Show" htmlFor="f-show">
          <Select id="f-show" name="show" defaultValue={f.show}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={buttonClass("primary")}>
            Filter
          </button>
          {filtered && (
            <Link href="/payers" className={buttonClass("ghost")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden className="size-6" />}
          message={
            filtered
              ? "No payers match these filters. Try a shorter search or clear the filters."
              : "No payers yet. Add the first one."
          }
          action={
            !filtered && canEdit ? <ButtonLink href="/payers/new">Add payer</ButtonLink> : undefined
          }
        />
      ) : (
        <>
          <DataTable caption="Payers" columns={columns} rows={rows} rowKey={(r) => r.payerId} />
          <Pagination page={f.page} pageCount={pageCount} total={total} href={pageHref} />
        </>
      )}
    </>
  );
}
