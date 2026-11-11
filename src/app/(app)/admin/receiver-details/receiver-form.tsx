"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { MAX_PAYMENT_ACCOUNTS } from "@/lib/validation";
import { saveReceiverAction } from "./actions";

interface Account {
  bank: string;
  accountName: string;
  accountNumber: string;
}

export interface ReceiverFormValues {
  orgName: string;
  addressLine: string;
  orgPhone: string;
  orgEmail: string;
  paymentAccounts: Account[];
  dnPaymentInstructions: string;
  latePaymentNote: string;
  signatoryName: string;
  signatoryDesignation: string;
}

type TextKey = Exclude<keyof ReceiverFormValues, "paymentAccounts">;

export function ReceiverForm({ initial }: { initial: ReceiverFormValues }) {
  const [state, action, pending] = useFormAction(saveReceiverAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;

  // Each row keeps a stable key so typed values survive removing a row above it.
  const nextKey = useRef(initial.paymentAccounts.length);
  const [accounts, setAccounts] = useState(() => initial.paymentAccounts.map((a, i) => ({ ...a, key: i })));

  useEffect(() => {
    if (state?.ok && state.message) toast(state.message);
  }, [state, toast]);

  const text = (name: TextKey, hint?: string) => ({
    id: name,
    name,
    defaultValue: initial[name],
    ...describedBy(name, e?.[name], hint),
  });

  const removeRow = (key: number) => setAccounts((rows) => rows.filter((r) => r.key !== key));
  const addRow = () =>
    setAccounts((rows) => [...rows, { bank: "", accountName: "", accountNumber: "", key: nextKey.current++ }]);

  return (
    <form onSubmit={action} className="flex max-w-3xl flex-col gap-10" noValidate>
      <section>
        <SectionHeading title="Organisation" description="The letterhead on demand notices and receipts." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Organisation name" htmlFor="orgName" required className="sm:col-span-2" error={e?.orgName}>
            <Input {...text("orgName")} required />
          </Field>
          <Field label="Office address" htmlFor="addressLine" className="sm:col-span-2" error={e?.addressLine}>
            <Input {...text("addressLine")} autoComplete="off" />
          </Field>
          <Field label="Phone" htmlFor="orgPhone" error={e?.orgPhone}>
            <Input {...text("orgPhone")} type="tel" autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="orgEmail" error={e?.orgEmail}>
            <Input {...text("orgEmail")} type="email" autoComplete="off" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Bank accounts for payment"
          description="Printed on every demand notice under the payment instructions. List each account payers may pay into."
        />
        <div className="flex flex-col gap-4">
          {accounts.length === 0 && (
            <p className="text-sm text-muted">No accounts yet. Notices print the payment instructions only.</p>
          )}
          {accounts.map((a, i) => {
            const id = (f: keyof Account) => `paymentAccounts.${i}.${f}`;
            const input = (f: keyof Account) => ({
              id: id(f),
              name: id(f),
              defaultValue: a[f],
              autoComplete: "off",
              ...describedBy(id(f), e?.[id(f)]),
            });
            return (
              <fieldset
                key={a.key}
                className="grid gap-4 rounded-control border border-border p-4 sm:grid-cols-[1fr_1fr_12rem_auto] sm:items-start"
              >
                <legend className="px-1 text-sm font-medium">Account {i + 1}</legend>
                <Field label="Bank" htmlFor={id("bank")} required error={e?.[id("bank")]}>
                  <Input {...input("bank")} />
                </Field>
                <Field label="Account name" htmlFor={id("accountName")} required error={e?.[id("accountName")]}>
                  <Input {...input("accountName")} />
                </Field>
                <Field label="Account number" htmlFor={id("accountNumber")} required error={e?.[id("accountNumber")]}>
                  <Input {...input("accountNumber")} inputMode="numeric" className="money" />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:mt-7"
                  aria-label={`Remove account ${i + 1}`}
                  onClick={() => removeRow(a.key)}
                >
                  <Trash2 aria-hidden className="size-4" />
                  <span className="sm:sr-only">Remove</span>
                </Button>
              </fieldset>
            );
          })}
          {e?.paymentAccounts && <FormMessage tone="error">{e.paymentAccounts}</FormMessage>}
          <div>
            <Button type="button" variant="secondary" disabled={accounts.length >= MAX_PAYMENT_ACCOUNTS} onClick={addRow}>
              <Plus aria-hidden className="size-4" />
              Add account
            </Button>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Demand notice text" description="Printed at the foot of every demand notice." />
        <div className="grid gap-5">
          <Field label="Payment instructions" htmlFor="dnPaymentInstructions" error={e?.dnPaymentInstructions}>
            <Textarea {...text("dnPaymentInstructions")} rows={3} />
          </Field>
          <Field label="Late payment note" htmlFor="latePaymentNote" error={e?.latePaymentNote}>
            <Textarea {...text("latePaymentNote")} rows={3} />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Signatory"
          description="Signs demand notices and official receipts. Printed as a signature line, then the name, the designation, and “For:” with the organisation name."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Name" htmlFor="signatoryName" error={e?.signatoryName}>
            <Input {...text("signatoryName")} autoComplete="off" />
          </Field>
          <Field
            label="Designation"
            htmlFor="signatoryDesignation"
            hint="e.g. Head, Finance & Accounts"
            error={e?.signatoryDesignation}
          >
            <Input {...text("signatoryDesignation", "e.g. Head, Finance & Accounts")} autoComplete="off" />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save receiver details"}
        </Button>
        {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      </div>
    </form>
  );
}
