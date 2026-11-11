"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { Checkbox, describedBy, Field, FormMessage, Input, Select } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { saveSettingsAction } from "./actions";

export interface SettingsFormValues {
  financialYear: string;
  receiptPrefix: string;
  dnPrefix: string;
  payerPrefix: string;
  defaultTermsDays: string;
  asAtDate: string;
  autoConfirm: boolean;
  usdNgnRate: string;
  budgetVersionLabel: string;
  budgetToDateRule: "including_current_month" | "completed_months_only";
}

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const [state, action, pending] = useFormAction(saveSettingsAction);
  const toast = useToast();
  const e = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok && state.message) toast(state.message);
  }, [state, toast]);

  // Text inputs share this wiring: name, id, default value and aria.
  const text = (name: keyof SettingsFormValues, hint?: string) => ({
    id: name,
    name,
    defaultValue: String(initial[name] ?? ""),
    ...describedBy(name, e?.[name], hint),
  });

  return (
    <form onSubmit={action} className="flex max-w-3xl flex-col gap-10" noValidate>
      <p className="flex flex-wrap items-center gap-x-2 rounded-control border border-border bg-surface-raised p-3 text-sm text-muted">
        The organisation name, address, bank accounts, demand notice text and signatory are in
        <Link href="/admin/receiver-details" className="font-medium text-text underline underline-offset-2">
          Receiver details
        </Link>
        , which Finance can also edit.
      </p>

      <section>
        <SectionHeading title="Reporting" description="Which year and date the reports use." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Financial year" htmlFor="financialYear" required error={e?.financialYear}>
            <Input {...text("financialYear")} inputMode="numeric" required />
          </Field>
          <Field
            label="Report as-at date"
            htmlFor="asAtDate"
            hint="Leave blank to use today (Lagos time)."
            error={e?.asAtDate}
          >
            <Input {...text("asAtDate", "Leave blank to use today (Lagos time).")} type="date" />
          </Field>
          <Field
            label="Budget to date"
            htmlFor="budgetToDateRule"
            hint="On 2 Nov, the first option counts 11 months; the second counts 10."
            error={e?.budgetToDateRule}
          >
            <Select
              id="budgetToDateRule"
              name="budgetToDateRule"
              defaultValue={initial.budgetToDateRule}
              {...describedBy("budgetToDateRule", e?.budgetToDateRule, "hint")}
            >
              <option value="including_current_month">Include the current month (as the workbook did)</option>
              <option value="completed_months_only">Completed months only</option>
            </Select>
          </Field>
          <Field
            label={"Exchange rate (₦ per US$)"}
            htmlFor="usdNgnRate"
            required
            hint="Converts US$ fees to naira."
            error={e?.usdNgnRate}
          >
            <MoneyInput {...text("usdNgnRate", "Converts US$ fees to naira.")} dp={6} required />
          </Field>
          <Field
            label="Revenue budget version"
            htmlFor="budgetVersionLabel"
            hint="Shown next to budget figures."
            error={e?.budgetVersionLabel}
            className="sm:col-span-2"
          >
            <Input {...text("budgetVersionLabel", "Shown next to budget figures.")} />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Receipts and demand notices"
          description="Prefix changes apply to new numbers only. Existing numbers never change."
        />
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Receipt prefix" htmlFor="receiptPrefix" required error={e?.receiptPrefix}>
            <Input {...text("receiptPrefix")} required />
          </Field>
          <Field label="Demand notice prefix" htmlFor="dnPrefix" required error={e?.dnPrefix}>
            <Input {...text("dnPrefix")} required />
          </Field>
          <Field label="Payer ID prefix" htmlFor="payerPrefix" required error={e?.payerPrefix}>
            <Input {...text("payerPrefix")} required />
          </Field>
          <Field
            label="Default payment terms (days)"
            htmlFor="defaultTermsDays"
            required
            error={e?.defaultTermsDays}
          >
            <Input {...text("defaultTermsDays")} inputMode="numeric" required />
          </Field>
        </div>
        <div className="mt-6">
          <Checkbox
            id="autoConfirm"
            name="autoConfirm"
            defaultChecked={initial.autoConfirm}
            label="Confirm receipts automatically when they are saved"
            hint={'Normally off, so Finance confirms each receipt. When on, receipts save as Confirmed by "<recorder> (auto)".'}
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-4 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      </div>
    </form>
  );
}
