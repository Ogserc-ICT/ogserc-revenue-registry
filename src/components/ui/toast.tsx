"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "./cn";

type Tone = "success" | "error";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** Toasts name the result ("Settings saved"). Bottom-right, slide up and fade, 5 s auto-dismiss. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, tone: Tone = "success") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-border bg-surface-raised px-4 py-3 text-base text-text shadow-popover"
          >
            {t.tone === "success" ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-text" />
            ) : (
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-rose-text" />
            )}
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className={cn("rounded text-muted hover:text-text")}
              aria-label="Dismiss"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
