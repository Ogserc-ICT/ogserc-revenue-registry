"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/components/ui/use-form-action";
import { Checkbox, describedBy, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { saveSettingsAction } from "./actions";

export interface SettingsFormValues {
  orgName: string;
  addressLine: string;
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
  dnPaymentInstructions: string;
  dnSignatory: string;
  latePaymentNote: string;
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
      <section>
        <SectionHeading title="Organisation" description="Printed on receipts and demand notices." />
        <div className="grid gap-5">
          <Field label="Organisation name" htmlFor="orgName" required error={e?.orgName}>
            <Input {...text("orgName")} required />
          </Field>
          <Field
            label="Address and contact line"
            htmlFor="addressLine"
            hint="Office address, phone and email, on one line."
            error={e?.addressLine}
          >
            <Input {...text("addressLine", "Office address, phone and email, on one line.")} />
          </Field>
        </div>
      </section>

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
            <Input {...text("usdNgnRate", "Converts US$ fees to naira.")} inputMode="decimal" required />
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

      <section>
        <SectionHeading title="Demand notice text" description="Printed at the foot of every demand notice." />
        <div className="grid gap-5">
          <Field label="Payment instructions" htmlFor="dnPaymentInstructions" error={e?.dnPaymentInstructions}>
            <Textarea {...text("dnPaymentInstructions")} rows={3} />
          </Field>
          <Field label="Late payment note" htmlFor="latePaymentNote" error={e?.latePaymentNote}>
            <Textarea {...text("latePaymentNote")} rows={3} />
          </Field>
          <Field
            label="Signatory"
            htmlFor="dnSignatory"
            hint="Name and title, e.g. Head, Finance & Accounts."
            error={e?.dnSignatory}
          >
            <Input {...text("dnSignatory", "Name and title, e.g. Head, Finance & Accounts.")} />
          </Field>
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
