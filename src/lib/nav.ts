import type { Capability } from "./permissions";

export type NavIcon =
  | "dashboard"
  | "receipt"
  | "register"
  | "notice"
  | "notices"
  | "payers"
  | "summary"
  | "budget"
  | "arrears"
  | "bank"
  | "audit"
  | "fees"
  | "registration"
  | "licence"
  | "revenueBudget"
  | "settings"
  | "receiver"
  | "users"
  | "data"
  | "guide";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  capability: Capability;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", capability: "reports.view" }],
  },
  {
    label: "Daily work",
    items: [
      { href: "/new-receipt", label: "New receipt", icon: "receipt", capability: "receipts.record" },
      { href: "/register", label: "Register", icon: "register", capability: "receipts.view" },
      { href: "/new-demand-notice", label: "New demand notice", icon: "notice", capability: "dn.issue" },
      { href: "/demand-notices", label: "Demand notices", icon: "notices", capability: "dn.view" },
      { href: "/payers", label: "Payers", icon: "payers", capability: "payers.view" },
    ],
  },
  {
    label: "Reports & control",
    items: [
      { href: "/monthly-summary", label: "Monthly summary", icon: "summary", capability: "reports.view" },
      { href: "/budget-vs-actual", label: "Budget vs actual", icon: "budget", capability: "reports.view" },
      { href: "/arrears", label: "Arrears", icon: "arrears", capability: "reports.view" },
      { href: "/bank-recon", label: "Bank recon", icon: "bank", capability: "bankRecon.view" },
      { href: "/audit-log", label: "Audit log", icon: "audit", capability: "audit.view" },
    ],
  },
  {
    label: "Fees & budget",
    items: [
      { href: "/fee-schedule", label: "Fee schedule", icon: "fees", capability: "fees.view" },
      { href: "/registration-fees", label: "Registration fees", icon: "registration", capability: "fees.view" },
      { href: "/licence-fee-tables", label: "Licence fee tables", icon: "licence", capability: "fees.view" },
      { href: "/revenue-budget", label: "Revenue budget", icon: "revenueBudget", capability: "fees.view" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/settings", label: "Settings & lists", icon: "settings", capability: "settings.manage" },
      { href: "/admin/receiver-details", label: "Receiver details", icon: "receiver", capability: "receiver.edit" },
      { href: "/admin/users", label: "Users", icon: "users", capability: "users.manage" },
      { href: "/admin/data", label: "Data import & export", icon: "data", capability: "data.manage" },
    ],
  },
  {
    label: "Help",
    items: [{ href: "/guide", label: "Guide", icon: "guide", capability: "reports.view" }],
  },
];

/** Groups and items the given capability check allows; empty groups are dropped. */
export function visibleNav(allowed: (c: Capability) => boolean): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i.capability)) })).filter(
    (g) => g.items.length > 0,
  );
}

/** The nav item a path belongs to (longest matching prefix). */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV.flatMap((g) => g.items)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
