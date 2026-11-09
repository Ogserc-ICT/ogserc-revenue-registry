"use client";

import { AnimatePresence, motion } from "motion/react";
import { StatusPill } from "./ui/misc";

export type ReceiptStatusValue = "Pending Confirmation" | "Confirmed" | "Reversed";

const TONE = { "Pending Confirmation": "amber", Confirmed: "emerald", Reversed: "slate" } as const;

/**
 * Receipt status pill. With `celebrate`, a change to Confirmed cross-fades from amber to emerald
 * and a check mark draws in over 300 ms (DESIGN.md 5). MotionConfig reducedMotion="user" turns
 * the motion off for people who ask for that.
 */
export function ReceiptStatusPill({ status, celebrate = false }: { status: ReceiptStatusValue; celebrate?: boolean }) {
  return (
    <span className="relative inline-grid">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status}
          className="col-start-1 row-start-1"
          initial={celebrate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <StatusPill tone={TONE[status]}>
            {status === "Confirmed" && celebrate && (
              <svg aria-hidden viewBox="0 0 12 12" className="-ml-0.5 size-3 text-emerald-text">
                <motion.path
                  d="M2.5 6.5 5 9l4.5-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: "easeOut", delay: 0.05 }}
                />
              </svg>
            )}
            {status}
          </StatusPill>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
