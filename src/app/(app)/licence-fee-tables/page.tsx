import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { cn } from "@/components/ui/cn";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Naira, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { feeHeads, licenceFeeBands } from "@/db/schema";
import { formatPlain } from "@/lib/fees";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getSettings } from "@/lib/settings-server";
import { EditBandButton } from "./band-dialog";

export const metadata: Metadata = { title: "Licence fee tables" };

type Band = typeof licenceFeeBands.$inferSelect;

export default async function LicenceFeeTablesPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const gate = await gatePage("fees.view");
  if (!gate.ok) return <NoAccess title="Licence fee tables" />;
  const canEdit = can(gate.user.roles, "fees.edit");

  const [bands, heads, settings] = await Promise.all([
    db.select().from(licenceFeeBands).orderBy(asc(licenceFeeBands.id)),
    db.select({ code: feeHeads.code, head: feeHeads.head }).from(feeHeads).where(eq(feeHeads.basis, "MW Band")),
    getSettings(),
  ]);
  const codes = [...new Set(bands.map((b) => b.code))];
  const requested = (await searchParams).code;
  const selected = requested && codes.includes(requested) ? requested : undefined;
  const shown = selected ? [selected] : codes;
  const fx = settings.usdNgnRate;

  const columns: Column<Band>[] = [
    { key: "band", header: "Band", mobile: true, cell: (r) => <span className="font-medium">{r.bandLabel}</span> },
    {
      key: "range",
      header: "Capacity",
      mobile: true,
      cell: (r) => (
        <span className="money text-sm text-muted">
          above {formatPlain(r.aboveMw)} MW, up to {toDecimal(r.upToMw).gte(100000) ? "any size" : `${formatPlain(r.upToMw)} MW`}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Published rate",
      align: "right",
      mobile: true,
      cell: (r) =>
        r.publishedRate === null ? (
          <span className="text-sm text-amber-text">No rate: use an override</span>
        ) : r.currency === "USD" ? (
          <span className="money">US${formatPlain(r.publishedRate)}</span>
        ) : (
          <Naira value={formatAmount(r.publishedRate)} />
        ),
    },
    {
      key: "naira",
      header: "In naira",
      align: "right",
      mobile: true,
      cell: (r) =>
        r.publishedRate === null ? (
          <span className="text-muted">—</span>
        ) : (
          <Naira value={formatAmount(r.currency === "USD" ? toDecimal(r.publishedRate).times(fx) : r.publishedRate)} />
        ),
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            header: "",
            mobile: true,
            cell: (r: Band) => (
              <EditBandButton
                id={r.id}
                code={r.code}
                bandLabel={r.bandLabel}
                currency={r.currency}
                publishedRate={r.publishedRate === null ? "" : formatPlain(r.publishedRate).replace(/,/g, "")}
              />
            ),
          } satisfies Column<Band>,
        ]
      : []),
  ];

  const pill = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center rounded-pill border px-3 text-sm whitespace-nowrap",
      active ? "border-emerald-400 bg-emerald-400/12 font-medium text-text" : "border-border text-muted hover:text-text",
    );

  return (
    <>
      <PageHeader
        title="Licence fee tables"
        description={`Rates that depend on capacity. A band covers capacity above its lower limit, up to and including its upper limit. US$ at ₦${formatPlain(fx)}/US$.`}
      />

      <nav aria-label="Fee tables" className="mb-8 flex flex-wrap gap-2">
        <Link href="/licence-fee-tables" className={pill(!selected)} aria-current={!selected ? "page" : undefined}>
          All tables
        </Link>
        {codes.map((c) => (
          <Link
            key={c}
            href={`/licence-fee-tables?code=${encodeURIComponent(c)}`}
            className={pill(selected === c)}
            aria-current={selected === c ? "page" : undefined}
          >
            <span className="money">{c}</span>
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        {shown.map((code) => {
          const rows = bands.filter((b) => b.code === code);
          const first = rows[0]!;
          const head = heads.find((h) => h.code === code);
          return (
            <section key={code}>
              <div className="mb-3">
                <h2 className="text-md font-semibold">
                  <span className="money mr-2">{code}</span>
                  {head?.head ?? first.fee}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {first.fee} · charged in {first.currency === "USD" ? "US$" : "naira"}
                  {first.source ? ` · source: ${first.source}` : ""}
                </p>
              </div>
              <DataTable caption={`${code} bands`} columns={columns} rows={rows} rowKey={(r) => String(r.id)} />
            </section>
          );
        })}
      </div>
    </>
  );
}
