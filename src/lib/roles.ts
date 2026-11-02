import type { Role } from "@/db/schema";

export const ROLES: readonly Role[] = ["admin", "revenue_officer", "finance_officer", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  revenue_officer: "Revenue Officer",
  finance_officer: "Finance Officer",
  viewer: "Viewer",
};

export function hasAnyRole(userRoles: readonly Role[], allowed: readonly Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

/** Highest-privilege role first, for the user card. */
export function primaryRoleLabel(userRoles: readonly Role[]): string {
  const first = ROLES.find((r) => userRoles.includes(r));
  return first ? ROLE_LABELS[first] : "No role";
}

export function rolesLabel(userRoles: readonly Role[]): string {
  return ROLES.filter((r) => userRoles.includes(r))
    .map((r) => ROLE_LABELS[r])
    .join(", ");
}
