"use client";

import { animate, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { abbreviateNaira, formatAmount, toDecimal } from "@/lib/money";

const INTRO_KEY = "ogsrr:dash-intro";

/** Has the dashboard intro already played this session? If storage is unavailable, don't animate. */
function takeIntro(): boolean {
  try {
    if (sessionStorage.getItem(INTRO_KEY) === "1") return false;
    sessionStorage.setItem(INTRO_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * The Dashboard's signature card (DESIGN.md 3): the only gradient background on the page, the
 * confirmed figure in gold, the IGR/Non-IGR split, and progress against the full-year budget
 * with a gold marker at budget to date. On the first visit of a session the figure counts up
 * from 0 and the bar fills over 900 ms (DESIGN.md 5); never with reduced motion. The server
 * and first render show the exact figure; the count-up writes to the element directly.
 */
export function SignatureCard(p: {
  financialYear: number;
  confirmedFy: string;
  igr: string;
  nonIgr: string;
  annualBudget: string;
  budgetToDate: string;
  achievedToDate: string | null;
  achievedFy: string | null;
  budgetToDateShare: string | null;
  monthsElapsed: number;
}) {
  const reduce = useReducedMotion();
  const wholeRef = useRef<HTMLSpanElement>(null);
  const koboRef = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const exact = formatAmount(p.confirmedFy);
  const [whole, kobo] = exact.split(".");

  // Layout effect: set the starting frame before the browser paints, so nothing flashes.
  useLayoutEffect(() => {
    if (reduce || !takeIntro()) return;
    const show = (n: number) => {
      const [w, k] = formatAmount(n.toFixed(2)).split(".");
      if (wholeRef.current) wholeRef.current.textContent = w ?? "0";
      if (koboRef.current) koboRef.current.textContent = `.${k ?? "00"}`;
    };
    show(0);
    const counter = animate(0, Number(p.confirmedFy), {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: show,
      onComplete: () => {
        if (wholeRef.current) wholeRef.current.textContent = whole ?? "0";
        if (koboRef.current) koboRef.current.textContent = `.${kobo}`;
      },
    });
    const fill = bar.current ? animate(bar.current, { scaleX: [0, 1] }, { duration: 0.9, ease: "easeOut" }) : null;
    return () => {
      counter.stop();
      fill?.stop();
    };
  }, [reduce, p.confirmedFy, whole, kobo]);

  const total = toDecimal(p.igr).plus(p.nonIgr);
  const igrShare = total.isZero() ? 0 : toDecimal(p.igr).div(total).times(100).toNumber();
  const fyFill = Math.min(100, Number(p.achievedFy ?? 0));
  const marker = p.budgetToDateShare === null ? null : Math.min(100, Number(p.budgetToDateShare));

  return (
    <section className="bg-grad-signature rounded-shell border border-border p-6 sm:p-8" aria-labelledby="sig-title">
      <p id="sig-title" className="text-base text-muted">
        Confirmed revenue, FY {p.financialYear}
      </p>
      <p className="signature-figure money mt-2 text-[34px] leading-tight font-semibold sm:text-signature" title={`₦${exact}`}>
        <span className="text-[0.8em]">₦</span>
        <span ref={wholeRef}>{whole}</span>
        <span ref={koboRef} className="text-[0.5em]">
          .{kobo}
        </span>
      </p>

      <div className="mt-6">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>
            <span aria-hidden className="mr-1.5 inline-block size-2 rounded-pill bg-emerald-400" />
            IGR <span className="money font-medium">{abbreviateNaira(p.igr)}</span>
          </span>
          <span>
            <span aria-hidden className="mr-1.5 inline-block size-2 rounded-pill bg-sky" />
            Non-IGR <span className="money font-medium">{abbreviateNaira(p.nonIgr)}</span>
          </span>
        </div>
        <div
          className="mt-2 flex h-2 overflow-hidden rounded-pill bg-surface-raised"
          role="img"
          aria-label={`IGR ${igrShare.toFixed(1)}% of confirmed revenue, Non-IGR ${(100 - igrShare).toFixed(1)}%`}
        >
          <div className="h-full bg-emerald-400" style={{ width: `${igrShare}%` }} />
          <div className="h-full flex-1 bg-sky" />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">
            Budget to date ({p.monthsElapsed} {p.monthsElapsed === 1 ? "month" : "months"}){" "}
            <span className="money text-text">{abbreviateNaira(p.budgetToDate)}</span>
          </span>
          <span>
            Achieved vs budget to date{" "}
            <span className="money font-semibold">{p.achievedToDate === null ? "—" : `${p.achievedToDate}%`}</span>
          </span>
        </div>
        <div
          className="relative mt-2 h-2.5 rounded-pill bg-surface-raised"
          role="img"
          aria-label={`${p.achievedFy ?? 0}% of the full-year budget collected; budget to date is ${p.budgetToDateShare ?? 0}% of the year`}
        >
          <div className="absolute inset-y-0 left-0 overflow-hidden rounded-pill" style={{ width: `${fyFill}%` }}>
            <div ref={bar} className="bg-grad-brand h-full w-full origin-left" />
          </div>
          {marker !== null && (
            <span
              aria-hidden
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-gold-500"
              style={{ left: `${marker}%` }}
              title="Budget to date"
            />
          )}
        </div>
        <p className="mt-3 text-sm text-muted">
          Full-year budget <span className="money text-text">{abbreviateNaira(p.annualBudget)}</span> · Achieved vs full-year
          budget <span className="money font-semibold text-text">{p.achievedFy === null ? "—" : `${p.achievedFy}%`}</span>
        </p>
      </div>
    </section>
  );
}
