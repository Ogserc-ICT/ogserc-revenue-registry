"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Combobox } from "@/components/ui/combobox";
import { describedBy, Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { Naira, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import { type AmountBand, type AmountFee, computeAmount, formStatus } from "@/lib/amount";
import { addDays, formatDate, isIsoDate } from "@/lib/dates";
import { formatPlain } from "@/lib/fees";
import { formatAmount, toDecimal } from "@/lib/money";
import { formatDnNo } from "@/lib/number-format";
import { issueDnAction } from "./actions";

export interface DnPayerOption {
  payerId: string;
  name: string;
  category: string | null;
  licenceNo: string | null;
  capacityMw: string | null;
  revenueBaseNgn: string | null;
}

export interface DnFeeOption extends AmountFee {
  head: string;
}

export interface DnFormProps {
  payers: DnPayerOption[];
  fees: DnFeeOption[];
  bands: AmountBand[];
  usdNgnRate: string;
  dnPrefix: string;
  nextSerial: number;
  defaultTermsDays: number;
  today: string;
  /** Payer to start with, e.g. from "Issue demand notice" on a payer's page. */
  initialPayerId?: string;
}

export function DnForm(props: DnFormProps) {
  const { payers, fees, bands, usdNgnRate, dnPrefix, nextSerial, defaultTermsDays, today } = props;
  const [state, action, pending] = useFormAction(issueDnAction);
  const toast = useToast();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [payerId, setPayerId] = useState(props.initialPayerId ?? "");
  const [feeCode, setFeeCode] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [quantity, setQuantity] = useState("1");
  const [override, setOverride] = useState("");
  const [terms, setTerms] = useState(String(defaultTermsDays));
  const e = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok && state.data) {
      toast(state.message ?? "Demand notice issued");
      router.push(state.data.print ? `/print/demand-notices/${state.data.id}` : `/demand-notices/${state.data.id}`);
    }
  }, [state, toast, router]);

  const payer = payers.find((p) => p.payerId === payerId);
  const fee = fees.find((f) => f.code === feeCode);
  const result = useMemo(
    () =>
      computeAmount({
        fee: fee ?? null,
        bands,
        usdNgnRate,
        payerCapacityMw: payer?.capacityMw ?? null,
        payerRevenueBaseNgn: payer?.revenueBaseNgn ?? null,
        quantity: quantity.replace(/[,\s]/g, ""),
        override: override.replace(/[,\s₦]/g, ""),
      }),
    [fee, bands, usdNgnRate, payer, quantity, override],
  );
  const status = formStatus({ payerChosen: Boolean(payer), feeChosen: Boolean(fee), result });
  const termsDays = Number(terms);
  const dueDate = isIsoDate(issueDate) && Number.isInteger(termsDays) && termsDays >= 0 ? addDays(issueDate, termsDays) : null;
  const year = isIsoDate(issueDate) ? Number(issueDate.slice(0, 4)) : Number(today.slice(0, 4));

  // One-click quantity from the payer, as the workbook's hint suggests.
  const suggestion =
    fee && payer
      ? fee.basis === "Per MW" && payer.capacityMw && toDecimal(payer.capacityMw).gt(0)
        ? { label: `Use ${formatPlain(payer.capacityMw)} MW`, value: toDecimal(payer.capacityMw).toString() }
        : fee.basis === "% of Revenue" && payer.revenueBaseNgn && toDecimal(payer.revenueBaseNgn).gt(0)
          ? { label: `Use ₦${formatAmount(payer.revenueBaseNgn)}`, value: toDecimal(payer.revenueBaseNgn).toFixed(2) }
          : null
      : null;

  const clear = () => {
    setPayerId("");
    setFeeCode("");
    setIssueDate(today);
    setQuantity("1");
    setOverride("");
    setTerms(String(defaultTermsDays));
    setFormKey((k) => k + 1);
  };

  return (
    <form key={formKey} onSubmit={action} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
      <div className="flex min-w-0 flex-col gap-10">
        <section>
          <SectionHeading title="Payer" description="Not listed? Add the payer on Payers first." />
          <Field label="Payer" htmlFor="payer" required error={e?.payerId}>
            <Combobox
              id="payer"
              name="payerId"
              value={payerId}
              onChange={setPayerId}
              placeholder="Search by name or payer ID"
              invalid={Boolean(e?.payerId)}
              describedById={e?.payerId ? "payer-error" : undefined}
              options={payers.map((p) => ({
                value: p.payerId,
                label: p.name,
                hint: [p.payerId, p.category].filter(Boolean).join(" · "),
              }))}
            />
          </Field>
        </section>

        <section>
          <SectionHeading title="Charge" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Revenue head" htmlFor="fee" required className="sm:col-span-2" error={e?.feeCode}>
              <Combobox
                id="fee"
                name="feeCode"
                value={feeCode}
                onChange={setFeeCode}
                placeholder="Search by code or name, e.g. GEN-02"
                invalid={Boolean(e?.feeCode)}
                describedById={e?.feeCode ? "fee-error" : undefined}
                options={fees.map((f) => ({ value: f.code, label: `${f.code} — ${f.head}`, hint: f.basis }))}
              />
            </Field>
            <Field
              label="Basis quantity"
              htmlFor="quantity"
              hint={result.quantityHint || "Usually 1"}
              error={e?.quantity}
            >
              <Input
                id="quantity"
                name="quantity"
                value={quantity}
                onChange={(ev) => setQuantity(ev.target.value)}
                inputMode="decimal"
                className="money"
                disabled={fee?.basis === "Variable"}
                {...describedBy("quantity", e?.quantity, "hint")}
              />
              {suggestion && (
                <button
                  type="button"
                  className="self-start text-sm text-emerald-text underline underline-offset-2"
                  onClick={() => setQuantity(suggestion.value)}
                >
                  {suggestion.label}
                </button>
              )}
            </Field>
            <Field label="Period" htmlFor="period" hint="e.g. FY2025 operating levy, Q2 2026." error={e?.period}>
              <Input id="period" name="period" autoComplete="off" {...describedBy("period", e?.period, "hint")} />
            </Field>
            {fee?.basis === "Variable" && <input type="hidden" name="quantity" value="1" />}
          </div>
        </section>

        <section>
          <SectionHeading title="Amount and terms" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={"Override amount (₦)"}
              htmlFor="override"
              hint="Optional. Required for Variable heads such as penalties. It replaces the computed amount."
              error={e?.override}
            >
              <Input
                id="override"
                name="override"
                value={override}
                onChange={(ev) => setOverride(ev.target.value)}
                inputMode="decimal"
                className="money"
                {...describedBy("override", e?.override, "hint")}
              />
            </Field>
            <Field label="Issue date" htmlFor="issueDate" required error={e?.issueDate}>
              <Input
                id="issueDate"
                name="issueDate"
                type="date"
                value={issueDate}
                onChange={(ev) => setIssueDate(ev.target.value)}
                {...describedBy("issueDate", e?.issueDate)}
              />
            </Field>
            <Field
              label="Payment terms (days)"
              htmlFor="paymentTermsDays"
              required
              hint={dueDate ? `Due ${formatDate(dueDate)}` : undefined}
              error={e?.paymentTermsDays}
            >
              <Input
                id="paymentTermsDays"
                name="paymentTermsDays"
                value={terms}
                onChange={(ev) => setTerms(ev.target.value)}
                inputMode="numeric"
                {...describedBy("paymentTermsDays", e?.paymentTermsDays, dueDate ? "hint" : undefined)}
              />
            </Field>
            <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2" error={e?.remarks}>
              <Textarea id="remarks" name="remarks" rows={2} {...describedBy("remarks", e?.remarks)} />
            </Field>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-card border border-border bg-surface p-5" aria-live="polite">
          <p className="text-sm text-muted">Next demand notice</p>
          <p className="money mt-0.5 font-medium">{formatDnNo(dnPrefix, year, nextSerial)}</p>
          <p className="text-xs text-muted">Assigned when you issue.</p>

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Payer ID</dt>
            <dd className="money text-right">{payer?.payerId ?? "—"}</dd>
            <dt className="text-muted">Capacity</dt>
            <dd className="money text-right">
              {payer?.capacityMw && toDecimal(payer.capacityMw).gt(0) ? `${formatPlain(payer.capacityMw)} MW` : "—"}
            </dd>
            <dt className="text-muted">Revenue base</dt>
            <dd className="text-right">
              {payer?.revenueBaseNgn ? <Naira value={formatAmount(payer.revenueBaseNgn)} /> : "—"}
            </dd>
            <dt className="text-muted">Basis</dt>
            <dd className="text-right">{fee?.basis ?? "—"}</dd>
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-muted">Rate</p>
            <p className={cn("mt-0.5 text-sm", result.rateText.startsWith("⚠") && "text-amber-text")}>
              {result.rateText || "Pick a revenue head."}
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Computed</dt>
            <dd className="text-right">
              {result.computed ? <Naira value={formatAmount(result.computed)} /> : "—"}
              {result.capped && <span className="block text-xs text-muted">cap applied</span>}
            </dd>
            {result.source === "override" && (
              <>
                <dt className="text-muted">Override</dt>
                <dd className="text-right">
                  <Naira value={formatAmount(result.amount)} />
                </dd>
              </>
            )}
            <dt className="mt-1 text-base font-semibold">Amount billed</dt>
            <dd className="mt-1 text-right text-lg font-semibold">
              {result.amount ? <Naira value={formatAmount(result.amount)} /> : "—"}
            </dd>
            <dt className="text-muted">Due date</dt>
            <dd className="text-right">{dueDate ? formatDate(dueDate) : "—"}</dd>
          </dl>

          <p
            className={cn(
              "mt-4 flex items-start gap-2 rounded-control px-3 py-2 text-sm",
              status.ready ? "bg-emerald-400/10 text-emerald-text" : "bg-surface-raised text-muted",
            )}
          >
            {status.ready ? (
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            )}
            {status.message}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="issue" disabled={pending || !status.ready}>
            {pending ? "Issuing…" : "Issue demand notice"}
          </Button>
          <Button type="submit" name="intent" value="print" variant="secondary" disabled={pending || !status.ready}>
            Issue & print
          </Button>
          <Button variant="ghost" onClick={clear} disabled={pending}>
            Clear
          </Button>
        </div>
        {state && !state.ok && (
          <div className="mt-3">
            <FormMessage tone="error">{state.error}</FormMessage>
          </div>
        )}
      </aside>
    </form>
  );
}
