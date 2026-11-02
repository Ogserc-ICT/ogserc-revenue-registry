"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known on the client; render a stable placeholder on the server.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const dark = !mounted || resolvedTheme !== "light";
  const next = dark ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex size-9 items-center justify-center rounded-control border border-border text-muted hover:bg-surface-raised hover:text-text"
    >
      {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  );
}
