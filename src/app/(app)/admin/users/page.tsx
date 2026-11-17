import { asc, desc } from "drizzle-orm";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { type Column, DataTable } from "@/components/ui/data-table";
import { PageHeader, StatusPill } from "@/components/ui/misc";
import { db } from "@/db";
import { users } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { isLocked } from "@/lib/lockout";
import { signInLockedUntil } from "@/lib/lockout-server";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { gatePage } from "@/lib/session";
import { CreateUserButton, UserRowActions } from "./user-dialogs";

export const metadata: Metadata = { title: "Users" };

interface Row {
  id: string;
  name: string;
  email: string;
  roles: (typeof ROLES)[number][];
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  /** Set while too many failed sign-ins keep the account locked (BUILD_SPEC 7.2). */
  lockedUntil: Date | null;
}

export default async function UsersPage() {
  const gate = await gatePage("users.manage");
  if (!gate.ok) return <NoAccess title="Users" />;
  const me = gate.user.id;

  const list = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roles: users.roles,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(desc(users.active), asc(users.name));
  // A handful of staff accounts, so one small query each is fine.
  const rows: Row[] = await Promise.all(
    list.map(async (u) => {
      const until = u.active ? await signInLockedUntil(db, u.email) : null;
      return { ...u, lockedUntil: isLocked(until) ? until : null };
    }),
  );

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      mobile: true,
      cell: (r) => (
        <div className={r.active ? undefined : "text-muted"}>
          <p className="font-medium">
            {r.name}
            {r.id === me && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
          </p>
          <p className="text-sm text-muted">{r.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      mobile: true,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {ROLES.filter((role) => r.roles.includes(role)).map((role) => (
            <StatusPill key={role} tone={role === "admin" ? "gold" : "muted"}>
              {ROLE_LABELS[role]}
            </StatusPill>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      mobile: true,
      cell: (r) =>
        !r.active ? (
          <StatusPill tone="slate">Deactivated</StatusPill>
        ) : r.lockedUntil ? (
          <div>
            <StatusPill tone="rose">Locked</StatusPill>
            <p className="mt-1 text-xs text-muted">Until {formatDateTime(r.lockedUntil)}. Reset the password to unlock now.</p>
          </div>
        ) : r.mustChangePassword ? (
          <StatusPill tone="amber">Temporary password</StatusPill>
        ) : (
          <StatusPill tone="emerald">Active</StatusPill>
        ),
    },
    {
      key: "last",
      header: "Last sign-in",
      mobile: true,
      cell: (r) => <span className="text-sm text-muted">{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Never"}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      mobile: true,
      cell: (r) => (
        <UserRowActions
          user={{ id: r.id, name: r.name, email: r.email, roles: r.roles, active: r.active }}
          isSelf={r.id === me}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff accounts. New users get a one-time temporary password and must change it when they first sign in."
        actions={<CreateUserButton />}
      />
      <DataTable caption="Users" columns={columns} rows={rows} rowKey={(r) => r.id} />
    </>
  );
}
