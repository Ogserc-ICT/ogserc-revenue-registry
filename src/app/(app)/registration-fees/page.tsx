import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Naira, PageHeader, SectionHeading } from "@/components/ui/misc";
import { db } from "@/db";
import { payers, sch3LateCharges, sch3RegistrationFees } from "@/db/schema";
import { collectedByCode } from "@/lib/fees-service";
import { formatAmount, toDecimal } from "@/lib/money";
import { can } from "@/lib/permissions";
import { gatePage } from "@/lib/session";
import { getAsAt, getViewingYear } from "@/lib/settings-server";
import { EditFeeButton, EditGroupButton } from "./edit-dialogs";
import { LateCalculator } from "./late-calculator";

export const metadata: Metadata = { title: "Registration fees" };

export default async function RegistrationFeesPage() {
  const gate = await gatePage("fees.view");
  if (!gate.ok) return <NoAccess title="Registration fees" />;
  const canEdit = can(gate.user.roles, "fees.edit");

  const [fy, asAt] = await Promise.all([getViewingYear(), getAsAt()]);
  const [partA, partB, payerCounts, collected] = await Promise.all([
    db.select().from(sch3RegistrationFees).orderBy(asc(sch3RegistrationFees.category)),
    db.select().from(sch3LateCharges).orderBy(asc(sch3LateCharges.group)),
    db
      .select({ category: payers.sch3Category, n: count() })
      .from(payers)
      .where(and(eq(payers.active, true), isNotNull(payers.sch3Category)))
      .groupBy(payers.sch3Category),
    collectedByCode(db, fy),
  ]);
  const payersIn = (cat: string) => Number(payerCounts.find((p) => p.category === cat)?.n ?? 0);
  const got = (code: string) => collected.get(code) ?? "0";

  type A = (typeof partA)[number];
  type B = (typeof partB)[number];

  const aColumns: Column<A>[] = [
    {
      key: "cat",
      header: "Category",
      mobile: true,
      cell: (r) => (
        <div className="flex gap-3">
          <span className="money text-md font-semibold">{r.category}</span>
          <span className="text-sm">{r.registrant}</span>
        </div>
      ),
    },
    { key: "fee", header: "Fee", align: "right", mobile: true, cell: (r) => <Naira value={formatAmount(r.feeNgn)} /> },
    {
      key: "late",
      header: "Late charges",
      mobile: true,
      cell: (r) => <span className="text-sm">{r.lateGroup ?? <span className="text-muted">None</span>}</span>,
    },
    {
      key: "code",
      header: "Code",
      mobile: true,
      cell: (r) => <span className="money text-sm whitespace-nowrap">{r.revenueCode}</span>,
    },
    {
      key: "payers",
      header: "Payers",
      align: "right",
      mobile: true,
      cell: (r) => (
        <Link
          href={`/payers?sch3=${r.category}`}
          className="money underline-offset-2 hover:underline"
          aria-label={`${payersIn(r.category)} active payers in Category ${r.category}`}
        >
          {payersIn(r.category)}
        </Link>
      ),
    },
    {
      key: "fy",
      header: `Confirmed FY${fy}`,
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(got(r.revenueCode))} />,
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            header: "",
            mobile: true,
            cell: (r: A) => <EditFeeButton category={r.category} feeNgn={plain(r.feeNgn)} revenueCode={r.revenueCode} />,
          } satisfies Column<A>,
        ]
      : []),
  ];

  const groupPayers = (g: string) =>
    partA.filter((a) => a.lateGroup === g).reduce((n, a) => n + payersIn(a.category), 0);

  const bColumns: Column<B>[] = [
    {
      key: "group",
      header: "Group",
      mobile: true,
      cell: (r) => (
        <div>
          <p className="money font-semibold">{r.group}</p>
          <p className="text-sm text-muted">Categories {r.categories}</p>
        </div>
      ),
    },
    {
      key: "initial",
      header: "Initial charge",
      align: "right",
      mobile: true,
      cell: (r) => (
        <div>
          <Naira value={formatAmount(r.initialNgn)} />
          <p className="money text-xs text-muted">{r.initialCode}</p>
        </div>
      ),
    },
    {
      key: "daily",
      header: "Per day late",
      align: "right",
      mobile: true,
      cell: (r) => (
        <div>
          <Naira value={formatAmount(r.dailyNgn)} />
          <p className="money text-xs text-muted">{r.dailyCode}</p>
        </div>
      ),
    },
    {
      key: "cap",
      header: "Daily charges cap",
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(r.dailyCapNgn)} />,
    },
    { key: "payers", header: "Payers", align: "right", mobile: true, cell: (r) => <span className="money">{groupPayers(r.group)}</span> },
    {
      key: "fy",
      header: `Confirmed FY${fy}`,
      align: "right",
      mobile: true,
      cell: (r) => <Naira value={formatAmount(toDecimal(got(r.initialCode)).plus(got(r.dailyCode)))} />,
    },
    ...(canEdit
      ? [
          {
            key: "edit",
            header: "",
            mobile: true,
            cell: (r: B) => (
              <EditGroupButton
                group={r.group}
                initialNgn={plain(r.initialNgn)}
                dailyNgn={plain(r.dailyNgn)}
                dailyCapNgn={plain(r.dailyCapNgn)}
                initialCode={r.initialCode}
                dailyCode={r.dailyCode}
              />
            ),
          } satisfies Column<B>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Registration fees"
        description="Schedule 3 registration fees and late registration charges, with a calculator for late registrations."
      />

      <section className="mb-12">
        <SectionHeading
          title="Part A: registration fees"
          description={`Payers counts active payers in each category. Confirmed FY${fy} is by receipt date.`}
        />
        <DataTable caption="Schedule 3 Part A registration fees" columns={aColumns} rows={partA} rowKey={(r) => r.category} />
      </section>

      <section className="mb-12">
        <SectionHeading
          title="Part B: late registration charges"
          description="An initial charge, plus a daily charge that stops at the cap. Category I has no late charge."
        />
        <DataTable caption="Schedule 3 Part B late registration charges" columns={bColumns} rows={partB} rowKey={(r) => r.group} />
      </section>

      <section>
        <SectionHeading
          title="Late registration calculator"
          description="Works out what a late registrant owes. Nothing is saved."
        />
        <LateCalculator
          defaultAssessed={asAt}
          categories={partA.map((a) => ({
            category: a.category,
            registrant: a.registrant,
            feeNgn: a.feeNgn,
            lateGroup: a.lateGroup,
          }))}
          groups={partB.map((b) => ({
            group: b.group,
            initialNgn: b.initialNgn,
            dailyNgn: b.dailyNgn,
            dailyCapNgn: b.dailyCapNgn,
          }))}
        />
      </section>
    </>
  );
}

/** "500000.00" -> "500000" for an edit field. */
const plain = (v: string) => v.replace(/\.00$/, "");
