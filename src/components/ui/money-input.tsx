"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { caretAfterFormat, formatTyping } from "@/lib/money-input";
import { cn } from "./cn";
import { Input } from "./field";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type"> & {
  /** Decimal places allowed: 2 for naira, 6 for rates, 4 for quantities. */
  dp?: number;
  /** Controlled use: the current text (commas allowed). */
  value?: string;
  /** Controlled use: receives the formatted text. Callers strip the commas before using it. */
  onValueChange?: (formatted: string) => void;
  /** Uncontrolled use, e.g. a form read with FormData. */
  defaultValue?: string;
};

/**
 * An amount field that adds thousands separators as you type ("1,250,000.50"), keeping the
 * caret in place. Works controlled (value + onValueChange) or uncontrolled (defaultValue); the
 * field still submits under `name`, and the server ignores the commas.
 */
export function MoneyInput({ dp = 2, value, onValueChange, defaultValue, className, ...rest }: Props) {
  const controlled = value !== undefined;
  const [own, setOwn] = useState(() => formatTyping(defaultValue ?? "", dp));
  const shown = controlled ? formatTyping(value, dp) : own;
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingCaret.current !== null && ref.current && document.activeElement === ref.current) {
      ref.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    }
    pendingCaret.current = null;
  });

  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      className={cn("money", className)}
      value={shown}
      onChange={(e) => {
        const typed = e.target.value;
        const next = formatTyping(typed, dp);
        pendingCaret.current = caretAfterFormat(typed, e.target.selectionStart ?? typed.length, next);
        if (controlled) onValueChange?.(next);
        else setOwn(next);
      }}
      {...rest}
    />
  );
}
