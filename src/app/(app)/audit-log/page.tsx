import { and, asc, count, desc, eq, gte, ilike, isNull, lt, or, type SQL } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { buttonClass } from "@/components/ui/button";
import { type Column, DataTable, Pagination } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { type AuditEntry, auditLog, users } from "@/db/schema";
import { addDays, formatDateTime, lagosDayStart } from "@/lib/dates";
import { gatePage } from "@/lib/session";
import { auditFilterSchema } from "@/lib/validation";
import { AuditDetails } from "./audit-details";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
type Search = Record<string, string | string[] | undefined>;

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
  const gate = await gatePage("audit.view");
  if (!gate.ok) return <NoAccess title="Audit log" />;

  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) || undefined;
  const f = auditFilterSchema.parse({
    user: one("user"),
    action: one("action"),
    from: one("from"),
    to: one("to"),
    q: one("q"),
    page: one("page"),
  });

  const where: SQL[] = [];
  if (f.user === "system") where.push(isNull(auditLog.userId));
  else if (f.user) where.push(eq(auditLog.userId, f.user));
  if (f.action) where.push(eq(auditLog.action, f.action));
  // Dates are Lagos calendar days.
  if (f.from) where.push(gte(auditLog.at, lagosDayStart(f.from)));
  if (f.to) where.push(lt(auditLog.at, lagosDayStart(addDays(f.to, 1))));
  if (f.q) {
    const term = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(auditLog.reference, term), ilike(auditLog.userName, term))!);
  }
  const condition = where.length ? and(...where) : undefined;

  const [[totalRow], rows, people, actions] = await Promise.all([
    db.select({ n: count() }).from(auditLog).where(condition),
    db
      .select()
      .from(auditLog)
      .where(condition)
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)),
    db.selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(asc(auditLog.action)),
  ]);
  const total = Number(totalRow?.n ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = where.length > 0;

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ user: f.user, action: f.action, from: f.from, to: f.to, q: f.q })) {
    if (v) params.set(k, v);
  }
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/audit-log?${qs}` : "/audit-log";
  };

  const columns: Column<AuditEntry>[] = [
    {
      key: "at",
      header: "When",
      mobile: true,
      className: "whitespace-nowrap",
      cell: (r) => <span className="money text-sm">{formatDateTime(r.at)}</span>,
    },
    { key: "user", header: "User", mobile: true, cell: (r) => r.userName },
    { key: "action", header: "Action", mobile: true, cell: (r) => <span className="font-medium">{r.action}</span> },
    {
      key: "reference",
      header: "Reference",
      mobile: true,
      cell: (r) => <span className="break-all text-muted">{r.reference ?? ""}</span>,
    },
    { key: "details", header: "Details", mobile: true, cell: (r) => <AuditDetails details={r.details} /> },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made in the Revenue Register, newest first. Entries can't be edited or deleted."
      />

      <form method="get" className="mb-6 grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_1fr_auto]">
        <Field label="User" htmlFor="f-user">
          <Select id="f-user" name="user" defaultValue={f.user ?? ""}>
            <option value="">All users</option>
            <option value="system">System (seed and scripts)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Action" htmlFor="f-action">
          <Select id="f-action" name="action" defaultValue={f.action ?? ""}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.action}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="f-from">
          <Input id="f-from" name="from" type="date" defaultValue={f.from ?? ""} />
        </Field>
        <Field label="To" htmlFor="f-to">
          <Input id="f-to" name="to" type="date" defaultValue={f.to ?? ""} />
        </Field>
        <Field label="Reference or name contains" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={f.q ?? ""} placeholder="e.g. OGSERC/RCT/2026" />
        </Field>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
          <button type="submit" className={buttonClass("primary")}>
            Filter
          </button>
          {filtered && (
            <a href="/audit-log" className={buttonClass("ghost")}>
              Clear
            </a>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText aria-hidden className="size-6" />}
          message={
            filtered
              ? "No entries match these filters. Widen the dates or clear the filters."
              : "No entries yet. Changes appear here as soon as they are made."
          }
        />
      ) : (
        <>
          <DataTable caption="Audit log entries" columns={columns} rows={rows} rowKey={(r) => String(r.id)} />
          <Pagination page={f.page} pageCount={pageCount} total={total} href={pageHref} />
        </>
      )}
    </>
  );
}

