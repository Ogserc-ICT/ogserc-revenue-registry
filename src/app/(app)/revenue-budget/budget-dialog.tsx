"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";
import { Naira } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { MONTH_LABELS, parseBudgetInput, sumAmounts } from "@/lib/budget";
import { formatAmount } from "@/lib/money";
import { saveBudgetLineAction } from "./actions";

export function EditBudgetLineButton({
  financialYear,
  lineId,
  lineName,
  months,
}: {
  financialYear: number;
  lineId: string;
  lineName: string;
  /** Jan..Dec at 2 dp. */
  months: string[];
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${lineId} for FY${financialYear}`}
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        <Pencil aria-hidden className="size-3.5" /> Edit
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${lineId}: ${lineName}`}
        description={`Monthly budget for FY${financialYear}. Only the months you change are saved.`}
      >
        <BudgetForm key={key} financialYear={financialYear} lineId={lineId} months={months} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function BudgetForm({
  financialYear,
  lineId,
  months,
  onDone,
}: {
  financialYear: number;
  lineId: string;
  months: string[];
  onDone: () => void;
}) {
  const [state, action, pending] = useFormAction(saveBudgetLineAction);
  const toast = useToast();
  const [values, setValues] = useState(months);
  const e = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Budget saved");
      onDone();
    }
  }, [state, toast, onDone]);

  const parsed = values.map(parseBudgetInput);
  const invalid = parsed.some((p) => p === null);
  const total = sumAmounts(parsed.map((p) => p ?? "0"));

  return (
    <form onSubmit={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="financialYear" value={financialYear} />
      <input type="hidden" name="budgetLineId" value={lineId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {MONTH_LABELS.map((m, i) => {
          const name = `m${i + 1}`;
          const err = e?.[name] ?? (parsed[i] === null ? "Use a number with up to 2 decimal places." : undefined);
          return (
            <Field key={m} label={m} htmlFor={name} error={err}>
              <Input
                id={name}
                name={name}
                value={values[i]}
                onChange={(ev) => setValues((v) => v.map((x, j) => (j === i ? ev.target.value : x)))}
                inputMode="decimal"
                className="money text-right"
                data-autofocus={i === 0 || undefined}
                {...describedBy(name, err)}
              />
            </Field>
          );
        })}
      </div>
      <p className="flex items-baseline justify-between border-t border-border pt-3 text-base">
        <span className="text-muted">FY{financialYear} total</span>
        <span className="font-semibold" aria-live="polite">
          <Naira value={formatAmount(total)} />
        </span>
      </p>
      {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || invalid}>
          {pending ? "Saving…" : "Save budget line"}
        </Button>
      </div>
    </form>
  );
}
