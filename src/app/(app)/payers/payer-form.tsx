"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, describedBy, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { NEAR_MATCH_LABELS } from "@/lib/payer-names";
import { savePayerAction } from "./actions";

export interface PayerFormValues {
  payerId: string | null;
  name: string;
  category: string;
  licenceNo: string;
  licenceStatus: string;
  capacityMw: string;
  revenueBaseNgn: string;
  lga: string;
  address: string;
  contactPerson: string;
  phone: string;
  email: string;
  dateRegistered: string;
  sch3Category: string;
  expectedRegMonth: string;
  notes: string;
  active: boolean;
}

export interface PayerFormOptions {
  categories: string[];
  licenceStatuses: string[];
  lgas: string[];
  /** Schedule 3 categories with a short description, e.g. ["F", "Independent distribution ..."]. */
  sch3: [string, string][];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PayerForm({
  initial,
  options,
  nextPayerId,
}: {
  initial: PayerFormValues;
  options: PayerFormOptions;
  /** Preview of the ID a new payer will get. Assigned for real on save. */
  nextPayerId?: string;
}) {
  const [state, action, pending] = useFormAction(savePayerAction);
  const toast = useToast();
  const router = useRouter();
  const isNew = initial.payerId === null;
  const e = state && !state.ok ? state.fieldErrors : undefined;
  const near = state && !state.ok && "nearDuplicates" in state ? state.nearDuplicates : null;

  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Payer saved");
      if (state.data?.payerId) router.push(`/payers/${encodeURIComponent(state.data.payerId)}`);
    }
  }, [state, toast, router]);

  const text = (name: keyof PayerFormValues, hint?: string) => ({
    id: name,
    name,
    defaultValue: String(initial[name] ?? ""),
    ...describedBy(name, e?.[name], hint),
  });

  const select = (name: keyof PayerFormValues, values: string[], blank: string) => (
    <Select {...text(name)}>
      <option value="">{blank}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  );

  return (
    <form onSubmit={action} className="flex max-w-3xl flex-col gap-10" noValidate>
      {initial.payerId && <input type="hidden" name="payerId" value={initial.payerId} />}

      <section>
        <SectionHeading
          title="Payer"
          description={
            isNew
              ? `The payer ID is assigned when you save${nextPayerId ? `; the next one is ${nextPayerId}` : ""}.`
              : `Payer ID ${initial.payerId}. IDs never change.`
          }
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Payer name"
            htmlFor="name"
            required
            className="sm:col-span-2"
            hint="The registered company name. It must be unique."
            error={e?.name}
          >
            <Input {...text("name", "The registered company name. It must be unique.")} autoComplete="off" data-autofocus required />
          </Field>
          <Field label="Payer category" htmlFor="category" error={e?.category}>
            {select("category", options.categories, "Not set")}
          </Field>
          <Field label="Licence status" htmlFor="licenceStatus" error={e?.licenceStatus}>
            {select("licenceStatus", options.licenceStatuses, "Not set")}
          </Field>
          <Field label="Licence number" htmlFor="licenceNo" error={e?.licenceNo}>
            <Input {...text("licenceNo")} autoComplete="off" />
          </Field>
          <Field label="Date registered" htmlFor="dateRegistered" error={e?.dateRegistered}>
            <Input {...text("dateRegistered")} type="date" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Registration and charging"
          description="Used to work out registration fees, MW band rates and the 1.5% levy."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Schedule 3 category"
            htmlFor="sch3Category"
            hint="Sets the registration fee and late-charge group."
            error={e?.sch3Category}
          >
            <Select {...text("sch3Category", "Sets the registration fee and late-charge group.")}>
              <option value="">Not set</option>
              {options.sch3.map(([cat, label]) => (
                <option key={cat} value={cat}>
                  {cat}: {label.length > 60 ? `${label.slice(0, 57)}…` : label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Expected registration month"
            htmlFor="expectedRegMonth"
            hint="For the budget pipeline. Even = spread across the year."
            error={e?.expectedRegMonth}
          >
            <Select {...text("expectedRegMonth", "For the budget pipeline. Even = spread across the year.")}>
              <option value="">Not set</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
              <option value="Even">Even</option>
            </Select>
          </Field>
          <Field
            label="Capacity (MW)"
            htmlFor="capacityMw"
            hint="Picks the band for MW band fees. Up to 3 decimal places."
            error={e?.capacityMw}
          >
            <Input {...text("capacityMw", "Picks the band for MW band fees. Up to 3 decimal places.")} inputMode="decimal" />
          </Field>
          <Field
            label={"Revenue base (₦)"}
            htmlFor="revenueBaseNgn"
            hint="Annual revenue for % of revenue fees."
            error={e?.revenueBaseNgn}
          >
            <MoneyInput {...text("revenueBaseNgn", "Annual revenue for % of revenue fees.")} />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading title="Contact" description="Printed on demand notices." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact person" htmlFor="contactPerson" error={e?.contactPerson}>
            <Input {...text("contactPerson")} autoComplete="off" />
          </Field>
          <Field label="Phone" htmlFor="phone" error={e?.phone}>
            <Input {...text("phone")} type="tel" autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="email" error={e?.email}>
            <Input {...text("email")} type="email" autoComplete="off" />
          </Field>
          <Field label="LGA" htmlFor="lga" error={e?.lga}>
            {select("lga", options.lgas, "Not set")}
          </Field>
          <Field label="Address" htmlFor="address" className="sm:col-span-2" error={e?.address}>
            <Input {...text("address")} autoComplete="off" />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2" error={e?.notes}>
            <Textarea {...text("notes")} rows={3} />
          </Field>
        </div>
        {!isNew && (
          <div className="mt-6">
            <Checkbox
              id="active"
              name="active"
              defaultChecked={initial.active}
              label="Active"
              hint="Untick to hide this payer from new receipts and notices. Its history stays."
            />
          </div>
        )}
      </section>

      {near && near.length > 0 && (
        <div role="alert" className="rounded-card border border-amber/40 bg-amber/10 p-4">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert aria-hidden className="size-4 text-amber-text" />
            Possible duplicate
          </p>
          <p className="mt-1 text-sm text-muted">
            Check these payers first. If one of them is the same company, open it instead.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-base">
            {near.map((m) => (
              <li key={m.payerId}>
                <Link href={`/payers/${encodeURIComponent(m.payerId)}`} className="font-medium underline-offset-2 hover:underline" target="_blank">
                  {m.payerId} {m.name}
                </Link>
                <span className="text-sm text-muted"> ({NEAR_MATCH_LABELS[m.reason]})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        {near && near.length > 0 ? (
          <Button type="submit" name="acknowledge" value="1" disabled={pending}>
            {pending ? "Saving…" : isNew ? "It's a different payer: add it" : "It's a different payer: save"}
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isNew ? "Add payer" : "Save payer"}
          </Button>
        )}
        <ButtonLink
          variant="secondary"
          href={initial.payerId ? `/payers/${encodeURIComponent(initial.payerId)}` : "/payers"}
        >
          Cancel
        </ButtonLink>
        {state && !state.ok && !near && <FormMessage tone="error">{state.error}</FormMessage>}
      </div>
    </form>
  );
}
