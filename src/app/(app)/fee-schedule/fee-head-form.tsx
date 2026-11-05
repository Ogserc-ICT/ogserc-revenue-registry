"use client";

import { Link2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox, describedBy, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { BASIS_HINTS, basisHasRate, CURRENCIES, FEE_BASES, type Currency, type FeeBasis, REVENUE_TYPES } from "@/lib/fees";
import { saveFeeHeadAction } from "./actions";

export interface FeeHeadFormValues {
  code: string;
  head: string;
  category: string;
  appliesTo: string;
  basis: FeeBasis;
  currency: Currency;
  /** Shown as typed: a percentage for "% of Revenue". */
  publishedRate: string;
  publishedRateText: string;
  capNgn: string;
  unitBasis: string;
  frequency: string;
  revenueType: "IGR" | "Non-IGR";
  budgetLineId: string;
  legalBasis: string;
  ncoaCode: string;
  rateStatus: string;
  notes: string;
  active: boolean;
}

export interface FeeHeadFormOptions {
  categories: string[];
  frequencies: string[];
  budgetLines: [string, string][];
  rateStatuses: string[];
}

export function FeeHeadForm({
  mode,
  initial,
  options,
  schedule3Linked,
}: {
  mode: "new" | "edit";
  initial: FeeHeadFormValues;
  options: FeeHeadFormOptions;
  /** The rate comes from the Schedule 3 tables and is edited there. */
  schedule3Linked: boolean;
}) {
  const [state, action, pending] = useFormAction(saveFeeHeadAction);
  const toast = useToast();
  const router = useRouter();
  const [basis, setBasis] = useState<FeeBasis>(initial.basis);
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const e = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) {
      toast(state.message ?? "Fee head saved");
      router.push("/fee-schedule");
    }
  }, [state, toast, router]);

  const text = (name: keyof FeeHeadFormValues, hint?: string) => ({
    id: name,
    name,
    defaultValue: String(initial[name] ?? ""),
    ...describedBy(name, e?.[name], hint),
  });

  const locked = schedule3Linked;
  const rateLabel =
    basis === "% of Revenue" ? "Rate (%)" : currency === "USD" ? "Rate (US$)" : basis === "Per Day" ? "Rate per day (₦)" : "Rate (₦)";
  const rateHint =
    basis === "% of Revenue"
      ? "Type the percentage: 1.5 means 1.5% of the payer's revenue."
      : currency === "USD"
        ? "Converted to naira at the exchange rate in Settings."
        : "Leave blank if the rate isn't set yet.";

  return (
    <form onSubmit={action} className="flex max-w-3xl flex-col gap-10" noValidate>
      <input type="hidden" name="mode" value={mode} />
      {mode === "edit" && <input type="hidden" name="code" value={initial.code} />}

      <section>
        <SectionHeading title="Revenue head" description="How it appears on forms, receipts and reports." />
        <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
          <Field
            label="Code"
            htmlFor="code"
            required
            hint={mode === "new" ? "e.g. APP-11. Can't change later." : "Codes never change."}
            error={e?.code}
          >
            <Input
              id="code"
              name={mode === "new" ? "code" : undefined}
              defaultValue={initial.code}
              disabled={mode === "edit"}
              className="money uppercase"
              autoComplete="off"
              data-autofocus={mode === "new" ? true : undefined}
              {...describedBy("code", e?.code, "hint")}
            />
          </Field>
          <Field label="Revenue head" htmlFor="head" required error={e?.head}>
            <Input {...text("head")} autoComplete="off" data-autofocus={mode === "edit" ? true : undefined} />
          </Field>
          <Field label="Revenue category" htmlFor="category" required className="sm:col-span-2" error={e?.category}>
            <Select {...text("category")}>
              <option value="">Pick a category</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Applies to" htmlFor="appliesTo" className="sm:col-span-2" error={e?.appliesTo}>
            <Input {...text("appliesTo")} autoComplete="off" />
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading title="Rate" description={BASIS_HINTS[basis]} />
        {locked && (
          <p className="mb-5 flex items-start gap-2 rounded-control border border-border bg-surface-raised p-3 text-sm text-muted">
            <Link2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              This rate is set by Schedule 3. Change it on{" "}
              <Link href="/registration-fees" className="text-text underline underline-offset-2">
                Registration fees
              </Link>
              , which updates this head too.
            </span>
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Charging basis" htmlFor="basis" required error={e?.basis}>
            <Select
              id="basis"
              name="basis"
              value={basis}
              disabled={locked}
              onChange={(ev) => setBasis(ev.target.value as FeeBasis)}
              {...describedBy("basis", e?.basis)}
            >
              {FEE_BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            {locked && <input type="hidden" name="basis" value={basis} />}
          </Field>
          <Field label="Currency" htmlFor="currency" required error={e?.currency}>
            <Select
              id="currency"
              name="currency"
              value={currency}
              disabled={locked}
              onChange={(ev) => setCurrency(ev.target.value as Currency)}
              {...describedBy("currency", e?.currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c === "NGN" ? "Naira (₦)" : "US dollars (US$)"}
                </option>
              ))}
            </Select>
            {locked && <input type="hidden" name="currency" value={currency} />}
          </Field>
          {basisHasRate(basis) && (
            <Field label={rateLabel} htmlFor="publishedRate" hint={rateHint} error={e?.publishedRate}>
              <Input {...text("publishedRate", rateHint)} inputMode="decimal" className="money" readOnly={locked} />
            </Field>
          )}
          {basis === "Per Day" && (
            <Field
              label={"Cap on daily charges (₦)"}
              htmlFor="capNgn"
              hint="Charges stop growing at this amount. Leave blank for no cap."
              error={e?.capNgn}
            >
              <Input
                {...text("capNgn", "Charges stop growing at this amount. Leave blank for no cap.")}
                inputMode="decimal"
                className="money"
                readOnly={locked}
              />
            </Field>
          )}
          <Field
            label="Rate as published"
            htmlFor="publishedRateText"
            hint="Optional wording from the source, e.g. a range."
            className="sm:col-span-2"
            error={e?.publishedRateText}
          >
            <Input {...text("publishedRateText", "Optional wording from the source, e.g. a range.")} autoComplete="off" />
          </Field>
          <Field
            label="Unit basis"
            htmlFor="unitBasis"
            hint="What the quantity means, e.g. per licence or days late."
            error={e?.unitBasis}
          >
            <Input {...text("unitBasis", "What the quantity means, e.g. per licence or days late.")} autoComplete="off" />
          </Field>
          <Field label="Frequency" htmlFor="frequency" error={e?.frequency}>
            <Select {...text("frequency")}>
              <option value="">Not set</option>
              {options.frequencies.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Rate status"
            htmlFor="rateStatus"
            hint="e.g. Approved, or Draft until management approves the rate."
            className="sm:col-span-2"
            error={e?.rateStatus}
          >
            <Input {...text("rateStatus", "e.g. Approved, or Draft until management approves the rate.")} list="rate-statuses" autoComplete="off" />
            <datalist id="rate-statuses">
              {options.rateStatuses.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        </div>
      </section>

      <section>
        <SectionHeading title="Reporting" description="Where receipts under this head are counted." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Revenue type" htmlFor="revenueType" required error={e?.revenueType}>
            <Select {...text("revenueType")}>
              {REVENUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget line" htmlFor="budgetLineId" error={e?.budgetLineId}>
            <Select {...text("budgetLineId")}>
              <option value="">Not mapped</option>
              {options.budgetLines.map(([id, name]) => (
                <option key={id} value={id}>
                  {id}: {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Legal basis" htmlFor="legalBasis" error={e?.legalBasis}>
            <Input {...text("legalBasis")} autoComplete="off" />
          </Field>
          <Field label="NCOA economic code" htmlFor="ncoaCode" error={e?.ncoaCode}>
            <Input {...text("ncoaCode")} autoComplete="off" className="money" />
          </Field>
          <Field label="Notes" htmlFor="notes" className="sm:col-span-2" error={e?.notes}>
            <Textarea {...text("notes")} rows={3} />
          </Field>
        </div>
        <div className="mt-6">
          <Checkbox
            id="active"
            name="active"
            defaultChecked={initial.active}
            label="Active"
            hint="Untick to stop offering this head on new receipts and notices. History stays."
          />
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : mode === "new" ? "Add fee head" : "Save fee head"}
        </Button>
        <ButtonLink variant="secondary" href="/fee-schedule">
          Cancel
        </ButtonLink>
        {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      </div>
    </form>
  );
}
