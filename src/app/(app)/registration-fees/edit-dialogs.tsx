"use client";

import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, FormMessage } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import type { ActionResult } from "@/lib/action-result";
import { saveSch3FeeAction, saveSch3GroupAction } from "./actions";

function useCloseOnSuccess(state: ActionResult | null, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Saved");
      close();
    }
  }, [state, toast, close]);
}

export function EditFeeButton({ category, feeNgn, revenueCode }: { category: string; feeNgn: string; revenueCode: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit the Category ${category} fee`}
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
        title={`Category ${category} registration fee`}
        description={`Also updates the ${revenueCode} fee head. Receipts already saved keep their amounts.`}
      >
        <FeeForm key={key} category={category} feeNgn={feeNgn} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function FeeForm({ category, feeNgn, onDone }: { category: string; feeNgn: string; onDone: () => void }) {
  const [state, action, pending] = useFormAction(saveSch3FeeAction);
  useCloseOnSuccess(state, onDone);
  const e = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form onSubmit={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="category" value={category} />
      <Field label={"Registration fee (₦)"} htmlFor="feeNgn" required error={e?.feeNgn}>
        <MoneyInput
          id="feeNgn"
          name="feeNgn"
          defaultValue={feeNgn}
          data-autofocus
          {...describedBy("feeNgn", e?.feeNgn)}
        />
      </Field>
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save fee"}
        </Button>
      </div>
    </form>
  );
}

interface GroupValues {
  group: string;
  initialNgn: string;
  dailyNgn: string;
  dailyCapNgn: string;
  initialCode: string;
  dailyCode: string;
}

export function EditGroupButton(props: GroupValues) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit the ${props.group} charges`}
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
        title={`${props.group} late registration charges`}
        description={`Also updates the ${props.initialCode} and ${props.dailyCode} fee heads.`}
      >
        <GroupForm key={key} {...props} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function GroupForm({ group, initialNgn, dailyNgn, dailyCapNgn, onDone }: GroupValues & { onDone: () => void }) {
  const [state, action, pending] = useFormAction(saveSch3GroupAction);
  useCloseOnSuccess(state, onDone);
  const e = state && !state.ok ? state.fieldErrors : undefined;
  const field = (name: "initialNgn" | "dailyNgn" | "dailyCapNgn", label: string, value: string, autofocus = false) => (
    <Field label={label} htmlFor={name} required error={e?.[name]}>
      <MoneyInput
        id={name}
        name={name}
        defaultValue={value}
        data-autofocus={autofocus || undefined}
        {...describedBy(name, e?.[name])}
      />
    </Field>
  );
  return (
    <form onSubmit={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="group" value={group} />
      {field("initialNgn", "Initial charge (₦)", initialNgn, true)}
      {field("dailyNgn", "Daily charge (₦)", dailyNgn)}
      {field("dailyCapNgn", "Cap on daily charges (₦)", dailyCapNgn)}
      {state && !state.ok && !e && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save charges"}
        </Button>
      </div>
    </form>
  );
}
