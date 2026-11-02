"use client";

import { KeyRound, LogOut } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/session";
import type { NavGroup } from "@/lib/nav";
import { cn } from "../ui/cn";
import { NavIcon } from "./nav-icon";

export interface ShellUser {
  name: string;
  roleLabel: string;
}

/** `rail` collapses to icons (768-1023px); `full` is the 264px sidebar and the mobile sheet. */
type Mode = "responsive" | "full";

export function Sidebar({
  groups,
  user,
  mode,
  scope,
}: {
  groups: NavGroup[];
  user: ShellUser;
  mode: Mode;
  scope: string;
}) {
  const pathname = usePathname();
  // In responsive mode, labels hide below lg (the icon rail).
  const label = mode === "responsive" ? "hidden lg:inline" : "inline";
  const showWhenFull = mode === "responsive" ? "hidden lg:block" : "block";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/dashboard"
        className={cn(
          "flex items-center gap-3 px-5 pt-6 pb-5",
          mode === "responsive" && "justify-center px-0 lg:justify-start lg:px-5",
        )}
      >
        <Image src="/brand/ogserc-mark.png" alt="OGSERC" width={36} height={36} className="size-9 shrink-0" priority />
        <span className={cn("min-w-0", showWhenFull)}>
          <span className="block text-md leading-tight font-semibold">Revenue Register</span>
          <span className="block text-xs leading-tight text-muted">Receipts, billing &amp; collections</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        <LayoutGroup id={scope}>
          {groups.map((group, gi) => (
            <div key={group.label} className="mt-4 first:mt-1">
              <p className={cn("mb-1 px-3 text-xs text-muted", showWhenFull)}>{group.label}</p>
              {mode === "responsive" && gi > 0 && (
                <hr aria-hidden className="mx-2 mb-3 border-border lg:hidden" />
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={item.label}
                        className={cn(
                          "relative flex h-9 items-center gap-3 rounded-control px-3 text-base transition-colors",
                          mode === "responsive" && "justify-center lg:justify-start",
                          active ? "font-medium text-on-brand" : "text-muted hover:bg-surface-raised hover:text-text",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="nav-pill"
                            aria-hidden
                            className="bg-grad-brand absolute inset-0 rounded-control"
                            transition={{ type: "spring", duration: 0.25, bounce: 0 }}
                          />
                        )}
                        <NavIcon name={item.icon} className="relative z-10 size-4 shrink-0" />
                        <span className={cn("relative z-10 truncate", label)}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </LayoutGroup>
      </nav>

      <UserCard user={user} mode={mode} />
    </div>
  );
}

function UserCard({ user, mode }: { user: ShellUser; mode: Mode }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  const full = mode === "full";
  return (
    <div className="p-3">
      <div className={cn("rounded-card border border-border bg-surface-raised p-3", !full && "lg:p-3 p-2")}>
        <div className={cn("flex items-center gap-3", !full && "justify-center lg:justify-start")}>
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-border bg-surface font-semibold text-emerald-text"
          >
            {initial}
          </span>
          <div className={cn("min-w-0", !full && "hidden lg:block")}>
            <p className="truncate text-base font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.roleLabel}</p>
          </div>
        </div>
        <div
          className={cn(
            "mt-3 flex items-center gap-1 text-sm",
            !full && "flex-col lg:flex-row",
          )}
        >
          <Link
            href="/change-password"
            title="Change password"
            className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-muted hover:bg-surface hover:text-text"
          >
            <KeyRound aria-hidden className="size-3.5" />
            <span className={cn(!full && "sr-only lg:not-sr-only")}>Change password</span>
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-muted hover:bg-surface hover:text-text"
            >
              <LogOut aria-hidden className="size-3.5" />
              <span className={cn(!full && "sr-only lg:not-sr-only")}>Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
