"use client";

import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { setViewingYearAction } from "@/app/actions/session";
import { findNavItem } from "@/lib/nav";
import { ThemeToggle } from "./theme-toggle";

export interface TopBarProps {
  viewingYear: number;
  years: number[];
  asAtLabel: string;
  /** null = this user's roles don't see the pending badge */
  pendingCount: number | null;
}

const EXTRA_TITLES: Record<string, string> = {
  "/change-password": "Change password",
};

export function TopBar({ viewingYear, years, asAtLabel, pendingCount, onMenu }: TopBarProps & { onMenu: () => void }) {
  const pathname = usePathname();
  const title = findNavItem(pathname)?.label ?? EXTRA_TITLES[pathname] ?? "Revenue Register";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="-ml-1 inline-flex size-9 items-center justify-center rounded-control text-muted hover:bg-surface-raised hover:text-text md:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-md font-medium">{title}</p>

        <div className="flex items-center gap-2 sm:gap-3">
          <FyChip viewingYear={viewingYear} years={years} />
          <p className="hidden text-sm text-muted lg:block">As at {asAtLabel}</p>
          {pendingCount !== null && pendingCount > 0 && (
            <Link
              href="/register?status=pending"
              className="inline-flex h-7 items-center gap-1.5 rounded-pill border border-amber/40 bg-amber/15 px-2.5 text-xs font-medium text-text hover:brightness-110"
              title="Open the Register filtered to Pending confirmation"
            >
              <span aria-hidden className="size-1.5 rounded-pill bg-amber" />
              {pendingCount} pending
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function FyChip({ viewingYear, years }: { viewingYear: number; years: number[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="relative inline-flex h-7 items-center rounded-pill border border-border bg-surface px-2.5 text-xs font-medium hover:bg-surface-raised">
      <span className="sr-only">Financial year</span>
      <span aria-hidden>FY {viewingYear}</span>
      <ChevronDown aria-hidden className="ml-1 size-3.5 text-muted" />
      <select
        value={viewingYear}
        disabled={pending}
        onChange={(e) => {
          const y = Number(e.target.value);
          startTransition(async () => {
            await setViewingYearAction(y);
            router.refresh();
          });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            FY {y}
          </option>
        ))}
      </select>
    </label>
  );
}
