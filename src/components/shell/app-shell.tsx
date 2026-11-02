"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "@/lib/nav";
import { type ShellUser, Sidebar } from "./sidebar";
import { TopBar, type TopBarProps } from "./top-bar";

export function AppShell({
  groups,
  user,
  topBar,
  children,
}: {
  groups: NavGroup[];
  user: ShellUser;
  topBar: TopBarProps;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile sheet after navigating.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only rounded-control bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>

      {/* Desktop sidebar (264px) and icon rail (768-1023px) */}
      <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 border-r border-border bg-surface md:block lg:w-[264px]">
        <Sidebar groups={groups} user={user} mode="responsive" scope="desktop" />
      </aside>

      {/* Mobile slide-over */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-bg/80"
              onClick={() => setMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute inset-y-0 left-0 w-[min(288px,86vw)] border-r border-border bg-surface"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="absolute top-6 right-3 z-10 inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-surface-raised hover:text-text"
              >
                <X aria-hidden className="size-4" />
              </button>
              <Sidebar groups={groups} user={user} mode="full" scope="mobile" />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar {...topBar} onMenu={() => setMenuOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
