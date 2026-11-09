"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Naira } from "@/components/ui/misc";
import { MONTH_LABELS } from "@/lib/budget";
import { abbreviateNaira, formatAmount } from "@/lib/money";

/**
 * Collections vs phased budget by month (DESIGN.md 4): confirmed bars in a vertical emerald
 * gradient, budget as a dashed gold line, gridlines in the border colour, tooltips on the raised
 * surface, and a "Show as table" toggle. The chart's numbers are for drawing only; the table and
 * tooltip show the exact decimal figures.
 */
export function CollectionsChart({ data }: { data: { month: number; confirmed: string; budget: string }[] }) {
  const [asTable, setAsTable] = useState(false);
  const rows = data.map((d) => ({ ...d, label: MONTH_LABELS[d.month - 1]!, c: Number(d.confirmed), b: Number(d.budget) }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold">Collections vs budget, by month</h2>
        <button type="button" className="text-sm text-muted underline underline-offset-2 hover:text-text" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Confirmed collections and phased budget by month</caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-1.5 text-left font-medium">
                  Month
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Confirmed
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Phased budget
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-border">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {r.label}
                  </th>
                  <td className="py-1.5 text-right">
                    <Naira value={formatAmount(r.confirmed)} />
                  </td>
                  <td className="py-1.5 text-right">
                    <Naira value={formatAmount(r.budget)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64" role="img" aria-label="Bar chart of confirmed collections by month with the phased budget as a dashed line. Use Show as table for the figures.">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="confirmedBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: "var(--emerald-600)" }} />
                  <stop offset="100%" style={{ stopColor: "var(--emerald-900)" }} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                tickFormatter={(v: number) => abbreviateNaira(String(v))}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-raised)" }}
                contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)" }}
                labelStyle={{ color: "var(--text)" }}
                formatter={(_v, name, item) => {
                  const r = item.payload as (typeof rows)[number];
                  return [`₦${formatAmount(name === "Confirmed" ? r.confirmed : r.budget)}`, name];
                }}
              />
              <Bar dataKey="c" name="Confirmed" fill="url(#confirmedBar)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line
                dataKey="b"
                name="Phased budget"
                type="monotone"
                stroke="var(--gold-500)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          <span aria-hidden className="mr-1.5 inline-block size-2 rounded-sm bg-emerald-600" />
          Confirmed
        </span>
        <span>
          <span aria-hidden className="mr-1.5 inline-block h-0.5 w-4 border-t-2 border-dashed border-gold-500 align-middle" />
          Phased budget
        </span>
      </p>
    </div>
  );
}
