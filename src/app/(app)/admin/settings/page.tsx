import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/placeholder-page";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { LIST_HINTS, LIST_NAMES, type ListName } from "@/lib/lists";
import { peekSerial } from "@/lib/numbering";
import { gatePage } from "@/lib/session";
import { getAsAt, getSettings } from "@/lib/settings-server";
import { ListsEditor } from "./lists-editor";
import { SerialsPanel } from "./serials-panel";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings & lists" };

const TABS = [
  { id: "general", label: "Settings" },
  { id: "numbering", label: "Serial numbers" },
  { id: "lists", label: "Dropdown lists" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const gate = await gatePage("settings.manage");
  if (!gate.ok) return <NoAccess title="Settings & lists" />;

  const raw = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.id === raw) ? (raw as Tab) : "general";

  return (
    <>
      <PageHeader
        title="Settings & lists"
        description="Organisation details, numbering, report dates and the values in every dropdown. Every change is audited."
      />

      <nav aria-label="Settings sections" className="mb-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "general" ? "/admin/settings" : `/admin/settings?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-base whitespace-nowrap",
              tab === t.id
                ? "border-emerald-400 font-medium text-text"
                : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "general" && <GeneralTab />}
      {tab === "numbering" && <NumberingTab />}
      {tab === "lists" && <ListsTab />}
    </>
  );
}

async function GeneralTab() {
  const s = await getSettings();
  return (
    <SettingsForm
      initial={{
        financialYear: String(s.financialYear),
        receiptPrefix: s.receiptPrefix,
        dnPrefix: s.dnPrefix,
        payerPrefix: s.payerPrefix,
        defaultTermsDays: String(s.defaultTermsDays),
        asAtDate: s.asAtDate ?? "",
        autoConfirm: s.autoConfirm,
        usdNgnRate: String(Number(s.usdNgnRate)),
        budgetVersionLabel: s.budgetVersionLabel,
        budgetToDateRule: s.budgetToDateRule,
      }}
    />
  );
}

async function NumberingTab() {
  const [s, asAt, receipt, dn, payer] = await Promise.all([
    getSettings(),
    getAsAt(),
    peekSerial(db, "receipt"),
    peekSerial(db, "dn"),
    peekSerial(db, "payer"),
  ]);
  return (
    <SerialsPanel
      year={Number(asAt.slice(0, 4))}
      prefixes={{ receipt: s.receiptPrefix, dn: s.dnPrefix, payer: s.payerPrefix }}
      next={{ receipt, dn, payer }}
    />
  );
}

async function ListsTab() {
  const rows = await db.select().from(lists).orderBy(asc(lists.listName), asc(lists.sortOrder));
  const groups = LIST_NAMES.map((name) => ({
    name,
    hint: LIST_HINTS[name as ListName],
    values: rows
      .filter((r) => r.listName === name)
      .map((r) => ({ id: r.id, value: r.value, active: r.active })),
  }));
  return <ListsEditor groups={groups} />;
}
