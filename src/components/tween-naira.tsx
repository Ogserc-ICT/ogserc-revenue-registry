"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Naira } from "./ui/misc";
import { formatAmount } from "@/lib/money";

/**
 * A naira figure that tweens to a new value over 400 ms when it changes (DESIGN.md 5, after
 * confirming receipts). The in-between frames are display only; the final figure is the exact
 * decimal string. No animation on first render or with reduced motion.
 */
export function TweenNaira({ value, className }: { value: string; className?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(() => formatAmount(value));
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value || reduce) {
      setShown(formatAmount(value));
      return;
    }
    const controls = animate(Number(from), Number(value), {
      duration: 0.4,
      ease: "easeOut",
      onUpdate: (n) => setShown(formatAmount(n.toFixed(2))),
      onComplete: () => setShown(formatAmount(value)),
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <Naira value={shown} className={className} />;
}
