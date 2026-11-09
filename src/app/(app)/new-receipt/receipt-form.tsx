"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Combobox } from "@/components/ui/combobox";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Naira, SectionHeading } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { useFormAction } from "@/components/ui/use-form-action";
import {
  type AmountBand,
  type AmountFee,
  computeAmount,
  paymentCheckLine,
  RECEIPT_QUANTITY_HINT_EMPTY,
  receiptAmountDue,
  receiptFormStatus,
} from "@/lib/amount";
import { formatDate, isIsoDate } from "@/lib/dates";
import { formatPlain } from "@/lib/fees";
import { formatAmount, toDecimal } from "@/lib/money";
import { formatReceiptNo } from "@/lib/number-format";
import { sumAmounts } from "@/lib/budget";
import { checkRefAction, type OpenNotice, openNoticesAction, saveReceiptAction } from "./actions";

export interface ReceiptPayerOption {
  payerId: string;
  name: string;
  category: string | null;
  licenceNo: string | null;
  capacityMw: string | null;
  revenueBaseNgn: string | null;
}

export interface ReceiptFeeOption extends AmountFee {
  head: string;
  category: string;
  revenueType: string;
}

export interface ReceiptFormValues {
  receiptDate: string;
  payerId: string;
  feeCode: string;
  dnNo: string;
  period: string;
  quantity: string;
  overrideDue: string;
  amountPaid: string;
  channel: string;
  collectingAccount: string;
  paymentRef: string;
  valueDate: string;
  remarks: string;
}

export interface ReceiptFormProps {
  mode: "new" | "edit";
  /** Edit mode: the receipt being edited and its number. */
  receiptId?: string;
  receiptNo?: string;
  initial: ReceiptFormValues;
  /** Edit mode: the receipt's own notice, offered even if it is no longer open. */
  currentNotice?: OpenNotice;
  /** Open notices for the payer the form starts with (empty when there is none). */
  initialNotices: OpenNotice[];
  payers: ReceiptPayerOption[];
  fees: ReceiptFeeOption[];
  bands: AmountBand[];
  channels: string[];
  accounts: string[];
  usdNgnRate: string;
  receiptPrefix: string;
  nextSerial: number;
  autoConfirm: boolean;
}

const clean = (v: string) => v.replace(/[,\s₦]/g, "");

export function ReceiptForm(props: ReceiptFormProps) {
  const { mode, payers, fees, bands, channels, accounts, usdNgnRate } = props;
  const [state, action, pending] = useFormAction(saveReceiptAction);
  const toast = useToast();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [v, setV] = useState<ReceiptFormValues>(props.initial);
  const set = (k: keyof ReceiptFormValues) => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const [notices, setNotices] = useState<OpenNotice[]>(props.initialNotices);
  const [loadingNotices, startNotices] = useTransition();
  const [refHit, setRefHit] = useState<string | null>(null);
  const e = state && !state.ok ? state.fieldErrors : undefined;
  const mismatch = state && !state.ok && "mismatch" in state ? state.mismatch : null;

  useEffect(() => {
    if (state?.ok && state.data) {
      toast(state.message ?? "Receipt saved");
      router.push(state.data.print ? `/print/receipts/${state.data.id}` : `/register/${state.data.id}`);
    }
  }, [state, toast, router]);

  // A payer's open notices. The page sends them for the payer the form starts with; picking
  // another payer fetches theirs. When editing, the receipt's own notice is offered even if it
  // has since closed.
  const loadNotices = (payerId: string) => {
    if (!payerId) return setNotices([]);
    startNotices(async () => {
      const list = await openNoticesAction(payerId);
      const current = props.currentNotice;
      const keepCurrent = current && payerId === props.initial.payerId && !list.some((n) => n.dnNo === current.dnNo);
      setNotices(keepCurrent ? [current, ...list] : list);
    });
  };

  const payer = payers.find((p) => p.payerId === v.payerId);
  const fee = fees.find((f) => f.code === v.feeCode);
  const notice = notices.find((n) => n.dnNo === v.dnNo);
  const result = useMemo(
    () =>
      computeAmount({
        fee: fee ?? null,
        bands,
        usdNgnRate,
        payerCapacityMw: payer?.capacityMw ?? null,
        payerRevenueBaseNgn: payer?.revenueBaseNgn ?? null,
        quantity: clean(v.quantity),
        override: clean(v.overrideDue),
        form: "receipt",
      }),
    [fee, bands, usdNgnRate, payer, v.quantity, v.overrideDue],
  );
  const paid = clean(v.amountPaid);
  const paidOk = /^\d+(\.\d{1,2})?$/.test(paid);
  const due = receiptAmountDue({ result, dnSelected: Boolean(notice), dnOutstanding: notice?.outstanding ?? null, amountPaid: null });
  const check = paymentCheckLine(due, paidOk ? paid : "");
  const status = receiptFormStatus({
    payerChosen: Boolean(payer),
    feeChosen: Boolean(fee),
    amountPaid: paidOk ? paid : "",
    channel: v.channel,
    account: v.collectingAccount,
    paymentRef: v.paymentRef,
    refInRegister: Boolean(refHit),
  });
  const payerOutstanding = sumAmounts(notices.map((n) => n.outstanding));
  const year = isIsoDate(v.receiptDate) ? Number(v.receiptDate.slice(0, 4)) : new Date().getFullYear();
  const dueSource =
    result.source === "override" ? "override" : notice ? `balance of ${notice.dnNo}` : result.computed ? "computed" : null;

  const checkRef = (ref: string) => {
    if (!ref.trim()) return setRefHit(null);
    void checkRefAction(ref, props.receiptId).then((hit) => setRefHit(hit?.receiptNo ?? null));
  };

  const clear = () => {
    setV({ ...props.initial, payerId: "", feeCode: "", dnNo: "" });
    setNotices([]);
    setRefHit(null);
    setFormKey((k) => k + 1);
  };

  const errorList = e ? Object.values(e) : [];

  return (
    <form key={formKey} onSubmit={action} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" noValidate>
      {props.receiptId && <input type="hidden" name="receiptId" value={props.receiptId} />}
      <div className="flex min-w-0 flex-col gap-10">
        <section>
          <SectionHeading title="Receipt" />
          <Field label="Receipt date" htmlFor="receiptDate" required className="max-w-xs" error={e?.receiptDate}>
            <Input
              id="receiptDate"
              name="receiptDate"
              type="date"
              value={v.receiptDate}
              onChange={(ev) => set("receiptDate")(ev.target.value)}
              {...describedBy("receiptDate", e?.receiptDate)}
            />
          </Field>
        </section>

        <section>
          <SectionHeading title="Payer" description="Not listed? Add the payer on Payers first." />
          <Field label="Payer" htmlFor="payer" required error={e?.payerId}>
            <Combobox
              id="payer"
              name="payerId"
              value={v.payerId}
              onChange={(id) => {
                setV((s) => ({ ...s, payerId: id, dnNo: "" }));
                loadNotices(id);
              }}
              placeholder="Search by name or payer ID"
              invalid={Boolean(e?.payerId)}
              describedById={e?.payerId ? "payer-error" : undefined}
              options={payers.map((p) => ({ value: p.payerId, label: p.name, hint: [p.payerId, p.category].filter(Boolean).join(" · ") }))}
            />
          </Field>
        </section>

        <section>
          <SectionHeading title="What is being paid for" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Demand notice (optional)"
              htmlFor="dnNo"
              className="sm:col-span-2"
              hint="If paying against a demand notice, pick it: the amount due becomes its outstanding balance."
              error={e?.dnNo}
            >
              <Select
                id="dnNo"
                name="dnNo"
                value={v.dnNo}
                disabled={!v.payerId || loadingNotices}
                onChange={(ev) => {
                  const dn = ev.target.value;
                  const picked = notices.find((n) => n.dnNo === dn);
                  // Picking a notice fills in its revenue head if none is chosen yet.
                  setV((s) => ({ ...s, dnNo: dn, feeCode: s.feeCode || picked?.revenueCode || "" }));
                }}
                {...describedBy("dnNo", e?.dnNo, "hint")}
              >
                <option value="">
                  {!v.payerId ? "Pick the payer first" : loadingNotices ? "Loading…" : notices.length ? "Not against a notice" : "No open notices for this payer"}
                </option>
                {notices.map((n) => (
                  <option key={n.dnNo} value={n.dnNo}>
                    {n.dnNo} · {n.revenueCode} · ₦{formatAmount(n.outstanding)} outstanding
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Revenue head" htmlFor="fee" required className="sm:col-span-2" error={e?.feeCode}>
              <Combobox
                id="fee"
                name="feeCode"
                value={v.feeCode}
                onChange={set("feeCode")}
                placeholder="Search by code or name, e.g. REG-F"
                invalid={Boolean(e?.feeCode)}
                describedById={e?.feeCode ? "fee-error" : undefined}
                options={fees.map((f) => ({ value: f.code, label: `${f.code} — ${f.head}`, hint: `${f.category} · ${f.revenueType}` }))}
              />
            </Field>
            {notice && fee && notice.revenueCode !== fee.code && (
              <p className="flex items-start gap-2 rounded-control border border-amber/40 bg-amber/10 p-3 text-sm sm:col-span-2">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-text" />
                {notice.dnNo} was issued for {notice.revenueCode}, not {fee.code}. You will be asked to confirm before saving.
              </p>
            )}
            <Field label="Basis quantity" htmlFor="quantity" hint={fee ? result.quantityHint : RECEIPT_QUANTITY_HINT_EMPTY} error={e?.quantity}>
              <Input
                id="quantity"
                name="quantity"
                value={v.quantity}
                onChange={(ev) => set("quantity")(ev.target.value)}
                inputMode="decimal"
                className="money"
                {...describedBy("quantity", e?.quantity, "hint")}
              />
            </Field>
            <Field label="Period covered" htmlFor="period" hint="e.g. FY2026, Q3 2026, Jan-2026." error={e?.period}>
              <Input
                id="period"
                name="period"
                value={v.period}
                onChange={(ev) => set("period")(ev.target.value)}
                autoComplete="off"
                {...describedBy("period", e?.period, "hint")}
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionHeading title="Payment" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={"Amount paid (₦)"} htmlFor="amountPaid" required hint="Exactly as shown on the bank / Remita evidence." error={e?.amountPaid}>
              <Input
                id="amountPaid"
                name="amountPaid"
                value={v.amountPaid}
                onChange={(ev) => set("amountPaid")(ev.target.value)}
                inputMode="decimal"
                className="money"
                {...describedBy("amountPaid", e?.amountPaid, "hint")}
              />
            </Field>
            <Field label={"Override amount due (₦)"} htmlFor="overrideDue" hint="Use only when the computed amount does not apply." error={e?.overrideDue}>
              <Input
                id="overrideDue"
                name="overrideDue"
                value={v.overrideDue}
                onChange={(ev) => set("overrideDue")(ev.target.value)}
                inputMode="decimal"
                className="money"
                {...describedBy("overrideDue", e?.overrideDue, "hint")}
              />
            </Field>
            <Field label="Payment channel" htmlFor="channel" required error={e?.channel}>
              <Select id="channel" name="channel" value={v.channel} onChange={(ev) => set("channel")(ev.target.value)} {...describedBy("channel", e?.channel)}>
                <option value="">Select the channel</option>
                {channels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bank / collecting account" htmlFor="collectingAccount" required error={e?.collectingAccount}>
              <Select
                id="collectingAccount"
                name="collectingAccount"
                value={v.collectingAccount}
                onChange={(ev) => set("collectingAccount")(ev.target.value)}
                {...describedBy("collectingAccount", e?.collectingAccount)}
              >
                <option value="">Select the account</option>
                {accounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Payment reference / RRR"
              htmlFor="paymentRef"
              required
              hint="Remita RRR, transfer reference or draft number. Duplicates are blocked."
              error={e?.paymentRef ?? (refHit ? `Already in the register on ${refHit} (possible duplicate).` : undefined)}
            >
              <Input
                id="paymentRef"
                name="paymentRef"
                value={v.paymentRef}
                onChange={(ev) => {
                  set("paymentRef")(ev.target.value);
                  setRefHit(null);
                }}
                onBlur={(ev) => checkRef(ev.target.value)}
                autoComplete="off"
                className="money"
                {...describedBy("paymentRef", e?.paymentRef ?? (refHit ? "dup" : undefined), "hint")}
              />
            </Field>
            <Field label="Value date (bank)" htmlFor="valueDate" hint="Date funds reached the account. Blank = receipt date." error={e?.valueDate}>
              <Input
                id="valueDate"
                name="valueDate"
                type="date"
                value={v.valueDate}
                onChange={(ev) => set("valueDate")(ev.target.value)}
                {...describedBy("valueDate", e?.valueDate, "hint")}
              />
            </Field>
            <Field label="Remarks" htmlFor="remarks" className="sm:col-span-2" error={e?.remarks}>
              <Textarea id="remarks" name="remarks" rows={2} value={v.remarks} onChange={(ev) => set("remarks")(ev.target.value)} />
            </Field>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-card border border-border bg-surface p-5" aria-live="polite">
          {mode === "new" ? (
            <>
              <p className="text-sm text-muted">Next receipt</p>
              <p className="money mt-0.5 font-medium">{formatReceiptNo(props.receiptPrefix, year, props.nextSerial)}</p>
              <p className="text-xs text-muted">Assigned when you save.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Editing receipt</p>
              <p className="money mt-0.5 font-medium">{props.receiptNo}</p>
              <p className="text-xs text-muted">Pending confirmation. Every change is audited.</p>
            </>
          )}

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Payer ID</dt>
            <dd className="money text-right">{payer?.payerId ?? "—"}</dd>
            <dt className="text-muted">Category</dt>
            <dd className="text-right">{payer?.category ?? "—"}</dd>
            <dt className="text-muted">Licence no.</dt>
            <dd className="text-right">{payer?.licenceNo ?? "—"}</dd>
            <dt className="text-muted">On open notices</dt>
            <dd className="text-right">{payer ? <Naira value={formatAmount(payerOutstanding)} /> : "—"}</dd>
            <dt className="text-muted">Revenue type</dt>
            <dd className="text-right">{fee?.revenueType ?? "—"}</dd>
          </dl>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-muted">Rate</p>
            <p className={cn("mt-0.5 text-sm", result.rateText.startsWith("⚠") && "text-amber-text")}>
              {result.rateText || "Pick a revenue head."}
            </p>
            {payer?.capacityMw && toDecimal(payer.capacityMw).gt(0) && fee?.basis === "MW Band" && (
              <p className="text-xs text-muted">Payer capacity {formatPlain(payer.capacityMw)} MW</p>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
            <dt className="text-muted">Amount due</dt>
            <dd className="text-right">
              {due ? <Naira value={formatAmount(due)} /> : "—"}
              {dueSource && <span className="block text-xs text-muted">{dueSource}</span>}
            </dd>
            <dt className="mt-1 text-base font-semibold">Amount paid</dt>
            <dd className="mt-1 text-right text-lg font-semibold">{paidOk && toDecimal(paid).gt(0) ? <Naira value={formatAmount(paid)} /> : "—"}</dd>
            <dt className="text-muted">Value date</dt>
            <dd className="text-right">{formatDate(v.valueDate || v.receiptDate) || "—"}</dd>
          </dl>

          {check.text && (
            <p
              className={cn(
                "mt-3 rounded-control px-3 py-2 text-sm",
                check.kind === "match" ? "bg-emerald-400/10 text-emerald-text" : "bg-amber/10 text-amber-text",
              )}
            >
              {check.text}
            </p>
          )}

          <p
            className={cn(
              "mt-3 flex items-start gap-2 rounded-control px-3 py-2 text-sm",
              status.ready ? "bg-emerald-400/10 text-emerald-text" : "bg-surface-raised text-muted",
            )}
          >
            {status.ready ? <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" /> : <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />}
            {status.message}
          </p>
          {mode === "new" && (
            <p className="mt-3 text-xs text-muted">
              {props.autoConfirm
                ? "Auto-confirm is on: the receipt saves as Confirmed."
                : "Saves as Pending Confirmation until Finance confirms it against the bank / TSA statement."}
            </p>
          )}
        </div>

        {errorList.length > 0 && (
          <div role="alert" className="mt-4 rounded-card border border-rose/40 bg-rose/10 p-4 text-sm">
            <p className="font-medium text-rose-text">{state && !state.ok ? state.error : ""}</p>
            <ul className="mt-2 list-disc pl-5">
              {errorList.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {mismatch && (
          <div role="alert" className="mt-4 rounded-card border border-amber/40 bg-amber/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert aria-hidden className="size-4 text-amber-text" /> Different revenue head
            </p>
            <p className="mt-1">{state && !state.ok ? state.error : ""}</p>
          </div>
        )}
        {state && !state.ok && !mismatch && errorList.length === 0 && (
          <p role="alert" className="mt-4 text-sm text-rose-text">
            {state.error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {mismatch ? (
            <Button type="submit" name="acknowledge" value="1" disabled={pending}>
              {pending ? "Saving…" : "It's the right notice: save"}
            </Button>
          ) : (
            <>
              <Button type="submit" name="intent" value="save" disabled={pending || !status.ready}>
                {pending ? "Saving…" : mode === "new" ? "Save receipt" : "Save changes"}
              </Button>
              {mode === "new" && (
                <Button type="submit" name="intent" value="print" variant="secondary" disabled={pending || !status.ready}>
                  Save & print
                </Button>
              )}
            </>
          )}
          {mode === "new" ? (
            <Button variant="ghost" onClick={clear} disabled={pending}>
              Clear
            </Button>
          ) : (
            <ButtonLink variant="ghost" href={`/register/${props.receiptId}`}>
              Cancel
            </ButtonLink>
          )}
        </div>
      </aside>
    </form>
  );
}
