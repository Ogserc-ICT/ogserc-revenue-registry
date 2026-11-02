"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { cn } from "@/components/ui/cn";
import { describedBy, Input } from "@/components/ui/field";
import { Card, StatusPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { addListValueAction, moveListValueAction, toggleListValueAction } from "./actions";

interface ListGroup {
  name: string;
  hint: string;
  values: { id: number; value: string; active: boolean }[];
}

export function ListsEditor({ groups }: { groups: ListGroup[] }) {
  return (
    <div>
      <p className="mb-6 max-w-[80ch] text-base text-muted">
        Values can be added, reordered, or deactivated. Deactivated values stop appearing in
        dropdowns, but records that already use them keep them. To rename a value, add the new one
        and deactivate the old one.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {groups.map((g) => (
          <ListCard key={g.name} group={g} />
        ))}
      </div>
    </div>
  );
}

function ListCard({ group }: { group: ListGroup }) {
  const toast = useToast();
  const [busy, startTransition] = useTransition();
  const [state, addAction, adding] = useFormAction(addListValueAction);
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = `add-${group.name.replace(/\W+/g, "-").toLowerCase()}`;
  const error = state && !state.ok ? (state.fieldErrors?.value ?? state.error) : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Value added");
      formRef.current?.reset();
    }
  }, [state, toast]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "That didn't work. Try again.", "error");
      else if (r.message) toast(r.message);
    });

  const activeCount = group.values.filter((v) => v.active).length;

  return (
    <Card className="flex flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-md font-semibold">{group.name}</h2>
        <p className="text-sm text-muted">
          {group.hint} {activeCount} active
          {group.values.length > activeCount ? `, ${group.values.length - activeCount} inactive` : ""}.
        </p>
      </div>
      <ul className={cn("divide-y divide-border", busy && "opacity-70")} aria-busy={busy}>
        {group.values.map((v, i) => (
          <li key={v.id} className="flex items-center gap-2 px-4 py-2">
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={i === 0 || busy}
                onClick={() => run(() => moveListValueAction({ id: v.id, direction: "up" }))}
                aria-label={`Move ${v.value} up`}
                className="rounded p-0.5 text-muted hover:text-text disabled:opacity-30"
              >
                <ArrowUp aria-hidden className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={i === group.values.length - 1 || busy}
                onClick={() => run(() => moveListValueAction({ id: v.id, direction: "down" }))}
                aria-label={`Move ${v.value} down`}
                className="rounded p-0.5 text-muted hover:text-text disabled:opacity-30"
              >
                <ArrowDown aria-hidden className="size-3.5" />
              </button>
            </div>
            <span className={cn("min-w-0 flex-1 break-words", !v.active && "text-muted")}>{v.value}</span>
            {!v.active && <StatusPill tone="slate">Inactive</StatusPill>}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => run(() => toggleListValueAction({ id: v.id, active: !v.active }))}
            >
              {v.active ? "Deactivate" : "Reactivate"}
            </Button>
          </li>
        ))}
      </ul>
      <form ref={formRef} onSubmit={addAction} className="mt-auto border-t border-border p-4">
        <input type="hidden" name="listName" value={group.name} />
        <label htmlFor={inputId} className="sr-only">
          New value for {group.name}
        </label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            name="value"
            placeholder="New value"
            required
            {...describedBy(inputId, error)}
          />
          <Button type="submit" variant="secondary" disabled={adding}>
            Add value
          </Button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-rose-text">
            {error}
          </p>
        )}
      </form>
    </Card>
  );
}
