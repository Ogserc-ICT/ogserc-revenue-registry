"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "./cn";

export interface ComboOption {
  value: string;
  label: string;
  /** Second line, e.g. the payer ID and category. Also searched. */
  hint?: string;
}

const MAX_SHOWN = 60;

/**
 * Searchable dropdown (BUILD_SPEC 5): type to filter, arrow keys to move, Enter to pick,
 * Esc to close. Posts its value through a hidden input named `name`.
 */
export function Combobox({
  id,
  name,
  options,
  value,
  onChange,
  placeholder,
  invalid,
  describedById,
  emptyText = "Nothing matches. Try fewer letters.",
}: {
  id: string;
  name: string;
  options: readonly ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedById?: string;
  emptyText?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = words.length
      ? options.filter((o) => {
          const hay = `${o.label} ${o.hint ?? ""} ${o.value}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
      : options;
    return hits.slice(0, MAX_SHOWN);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (o: ComboOption) => {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && matches[active]) {
        e.preventDefault();
        pick(matches[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setQuery("");
      }
    }
  };

  const activeId = open && matches[active] ? `${listId}-${active}` : undefined;

  return (
    <div ref={wrap} className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={invalid || undefined}
          aria-describedby={describedById}
          autoComplete="off"
          className="field-control h-10 w-full pr-16 pl-3 text-base"
          placeholder={selected ? undefined : placeholder}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-muted">
          {value && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Clear selection"
              className="rounded p-1 hover:text-text"
              onClick={() => {
                onChange("");
                setQuery("");
              }}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
          {/* The arrow opens and closes the list, like a normal dropdown. Mouse only: the
              field itself opens on focus, and the keyboard uses the arrow keys. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Hide options" : "Show options"}
            className="rounded p-1 hover:text-text"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery("");
              } else {
                input.current?.focus();
                setOpen(true);
              }
            }}
          >
            <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
          </button>
        </div>
      </div>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-control border border-border bg-surface-raised py-1 shadow-popover"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          ) : (
            matches.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                className={cn(
                  "flex cursor-pointer items-start gap-2 px-3 py-2 text-base",
                  i === active && "bg-surface",
                )}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
              >
                <Check
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0 text-emerald-text", o.value === value ? "opacity-100" : "opacity-0")}
                />
                <span className="min-w-0">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
                </span>
              </li>
            ))
          )}
          {matches.length === MAX_SHOWN && (
            <li className="px-3 py-1.5 text-xs text-muted">Showing the first {MAX_SHOWN}. Type more to narrow it down.</li>
          )}
        </ul>
      )}
    </div>
  );
}
