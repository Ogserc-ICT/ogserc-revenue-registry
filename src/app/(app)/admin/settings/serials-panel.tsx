"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDnNo, formatPayerId, formatReceiptNo } from "@/lib/number-format";
import { raiseSerialAction } from "./actions";

type Key = "receipt" | "dn" | "payer";

const ROWS: { key: Key; label: string; description: string }[] = [
  { key: "receipt", label: "Receipts", description: "Assigned when a receipt is saved." },
  { key: "dn", label: "Demand notices", description: "Assigned when a demand notice is issued." },
  { key: "payer", label: "Payer IDs", description: "Assigned when a payer is added." },
];

export function SerialsPanel({
  year,
  prefixes,
  next,
}: {
  year: number;
  prefixes: Record<Key, string>;
  next: Record<Key, number>;
}) {
  const [editing, setEditing] = useState<Key | null>(null);
  const preview = (key: Key, n: number) =>
    key === "receipt"
      ? formatReceiptNo(prefixes.receipt, year, n)
      : key === "dn"
        ? formatDnNo(prefixes.dn, year, n)
        : formatPayerId(prefixes.payer, n);

  return (
    <div className="max-w-3xl">
      <p className="mb-6 max-w-[80ch] text-base text-muted">
        One running serial per number type, never reset. Numbers are never reused, even after a
        reversal or cancellation. You can raise a serial to skip numbers, but never lower it.
      </p>
      <ul className="divide-y divide-border rounded-card border border-border bg-surface">
        {ROWS.map((r) => (
          <li key={r.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{r.label}</p>
              <p className="text-sm text-muted">{r.description}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted">Next number</p>
                <p className="money font-medium">{preview(r.key, next[r.key])}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEditing(r.key)}>
                Raise
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <RaiseDialog
          key={editing}
          serialKey={editing}
          label={ROWS.find((r) => r.key === editing)!.label}
          current={next[editing]}
          preview={(n) => preview(editing, n)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RaiseDialog({
  serialKey,
  label,
  current,
  preview,
  onClose,
}: {
  serialKey: Key;
  label: string;
  current: number;
  preview: (n: number) => string;
  onClose: () => void;
}) {
  const [state, action, pending] = useFormAction(raiseSerialAction);
  const [value, setValue] = useState(String(current + 1));
  const toast = useToast();
  const n = Number(value);
  const valid = Number.isInteger(n) && n > current;
  const error = state && !state.ok ? (state.fieldErrors?.nextValue ?? state.error) : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Serial raised");
      onClose();
    }
  }, [state, toast, onClose]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Raise the ${label.toLowerCase()} serial`}
      description={`The next number is currently ${preview(current)}.`}
    >
      <form onSubmit={action} className="flex flex-col gap-4">
        <input type="hidden" name="key" value={serialKey} />
        <Field
          label="New next serial"
          htmlFor="nextValue"
          required
          hint={valid ? `The next number will be ${preview(n)}. ${n - current} number(s) will be skipped.` : undefined}
          error={error}
        >
          <Input
            id="nextValue"
            name="nextValue"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            data-autofocus
            {...describedBy("nextValue", error, "hint")}
          />
        </Field>
        {!valid && !error && value !== "" && (
          <FormMessage tone="error">Enter a whole number above {current}.</FormMessage>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || pending}>
            {pending ? "Raising…" : valid ? `Raise to ${n}` : "Raise"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
