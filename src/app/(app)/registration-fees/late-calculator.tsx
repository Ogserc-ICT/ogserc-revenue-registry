"use client";

import { useId, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Field, Input } from "@/components/ui/field";
import { Naira } from "@/components/ui/misc";
import { isIsoDate } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { lateRegistration, type Sch3Category, type Sch3LateGroup } from "@/lib/registration";

/** Late registration calculator (BUILD_SPEC 4.9). Nothing is saved; it only works out the amounts. */
export function LateCalculator({
  categories,
  groups,
  defaultAssessed,
}: {
  categories: (Sch3Category & { registrant: string })[];
  groups: Sch3LateGroup[];
  defaultAssessed: string;
}) {
  const id = useId();
  const [category, setCategory] = useState(categories[0]?.category ?? "A");
  const [deadline, setDeadline] = useState("");
  const [assessed, setAssessed] = useState(defaultAssessed);

  const cat = categories.find((c) => c.category === category);
  const ready = cat && isIsoDate(deadline) && isIsoDate(assessed);
  const r = ready ? lateRegistration(cat, groups, deadline, assessed) : null;
  const group = r?.chargeGroup ? groups.find((g) => g.group === r.chargeGroup) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-5 sm:grid-cols-2">
        <Field label="Schedule 3 category" htmlFor={`${id}-cat`} className="sm:col-span-2">
          <Combobox
            id={`${id}-cat`}
            name="category"
            value={category}
            onChange={setCategory}
            placeholder="Search by letter or description"
            // The full description, not cut short, so each category can be told apart.
            options={categories.map((c) => ({ value: c.category, label: `${c.category} — ${c.registrant}` }))}
          />
        </Field>
        <Field label="Registration deadline" htmlFor={`${id}-deadline`} hint="The date registration was due.">
          <Input
            id={`${id}-deadline`}
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            aria-describedby={`${id}-deadline-hint`}
          />
        </Field>
        <Field label="Assessment date" htmlFor={`${id}-assessed`} hint="Usually today, or the date of payment.">
          <Input
            id={`${id}-assessed`}
            type="date"
            value={assessed}
            onChange={(e) => setAssessed(e.target.value)}
            aria-describedby={`${id}-assessed-hint`}
          />
        </Field>
      </div>

      <aside aria-live="polite" className="rounded-card border border-border bg-surface-raised p-5 lg:sticky lg:top-20 lg:self-start">
        <h3 className="mb-4 text-base font-semibold">Amount payable</h3>
        {!r ? (
          <p className="text-sm text-muted">Enter the deadline and assessment date to work out the charges.</p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-base">
            <dt className="text-muted">Days late</dt>
            <dd className="money text-right">{r.daysLate}</dd>
            <dt className="text-muted">Registration fee</dt>
            <dd className="text-right">
              <Naira value={formatAmount(r.registrationFee)} />
            </dd>
            <dt className="text-muted">Charge group</dt>
            <dd className="text-right">{r.chargeGroup ?? "None"}</dd>
            <dt className="text-muted">Initial charge</dt>
            <dd className="text-right">
              <Naira value={formatAmount(r.initialCharge)} />
            </dd>
            <dt className="text-muted">Daily charges</dt>
            <dd className="text-right">
              <Naira value={formatAmount(r.dailyCharges)} />
            </dd>
            <dt className="text-muted">Total admin charges</dt>
            <dd className="text-right">
              <Naira value={formatAmount(r.totalAdminCharges)} />
            </dd>
            <dt className="mt-2 border-t border-border pt-3 font-semibold">Total payable</dt>
            <dd className="mt-2 border-t border-border pt-3 text-right text-lg font-semibold">
              <Naira value={formatAmount(r.totalPayable)} />
            </dd>
          </dl>
        )}
        {r && (
          <p className="mt-4 text-sm text-muted">
            {!r.chargeGroup
              ? `Category ${category} has no late registration charge.`
              : r.daysLate === 0
                ? "Not late, so no late charges apply."
                : group
                  ? `Daily charges = MIN(${r.daysLate} × ₦${formatAmount(group.dailyNgn)}, ₦${formatAmount(group.dailyCapNgn)})${r.dailyCapped ? ": the cap applies." : "."}`
                  : null}
          </p>
        )}
      </aside>
    </div>
  );
}
