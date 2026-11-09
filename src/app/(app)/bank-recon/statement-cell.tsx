"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage, Input } from "@/components/ui/field";
import { Naira } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { formatAmount } from "@/lib/money";
import { saveStatementAction } from "./actions";

/** A statement total in the recon grid; Finance can click it to enter or change it. */
export function StatementCell({
  financialYear,
  month,
  monthLabel,
  account,
  value,
  register,
  canEnter,
}: {
  financialYear: number;
  month: number;
  monthLabel: string;
  account: string;
  value: string | null;
  register: string;
  canEnter: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const shown = value === null ? <span className="text-muted">Not entered</span> : <Naira value={formatAmount(value)} />;
  if (!canEnter) return shown;
  return (
    <>
      <button
        type="button"
        className="group inline-flex items-center gap-1.5 rounded-control px-1 hover:bg-surface-raised"
        aria-label={`${value === null ? "Enter" : "Change"} the ${monthLabel} statement total for ${account}`}
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
      >
        {shown}
        <Pencil aria-hidden className="size-3 text-muted opacity-60 group-hover:opacity-100" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${monthLabel} ${financialYear} statement`}
        description={`${account}. Per register: ₦${formatAmount(register)} (value date, not reversed).`}
      >
        <StatementForm key={key} financialYear={financialYear} month={month} account={account} value={value} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function StatementForm({
  financialYear,
  month,
  account,
  value,
  onDone,
}: {
  financialYear: number;
  month: number;
  account: string;
  value: string | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useFormAction(saveStatementAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Saved");
      onDone();
    }
  }, [state, toast, onDone]);
  const hint = "Exactly as on the bank or TSA statement. Leave blank to clear it.";
  return (
    <form onSubmit={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="financialYear" value={financialYear} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="collectingAccount" value={account} />
      <Field label={"Statement total (₦)"} htmlFor="statementTotal" hint={hint} error={e?.statementTotal}>
        <Input
          id="statementTotal"
          name="statementTotal"
          defaultValue={value ?? ""}
          inputMode="decimal"
          className="money"
          data-autofocus
          {...describedBy("statementTotal", e?.statementTotal, hint)}
        />
      </Field>
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save statement total"}
        </Button>
      </div>
    </form>
  );
}
