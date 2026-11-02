import { count, eq } from "drizzle-orm";
import { AppShell } from "@/components/shell/app-shell";
import { db } from "@/db";
import { receipts } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { visibleNav } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { primaryRoleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/session";
import { getAsAt, getAvailableYears, getViewingYear } from "@/lib/settings-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showPending = can(user.roles, "pending.view");

  const [asAt, years, viewingYear, pending] = await Promise.all([
    getAsAt(),
    getAvailableYears(),
    getViewingYear(),
    showPending
      ? db.select({ n: count() }).from(receipts).where(eq(receipts.status, "Pending Confirmation"))
      : Promise.resolve(null),
  ]);

  return (
    <AppShell
      groups={visibleNav((c) => can(user.roles, c))}
      user={{ name: user.name, roleLabel: primaryRoleLabel(user.roles) }}
      topBar={{
        viewingYear,
        years,
        asAtLabel: formatDate(asAt),
        pendingCount: pending ? Number(pending[0]?.n ?? 0) : null,
      }}
    >
      {children}
    </AppShell>
  );
}
