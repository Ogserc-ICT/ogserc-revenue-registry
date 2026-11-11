/** Renders an audit entry's details: old -> new for changes, then any other fields. */
export function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-muted">-</span>;
  const { changes, ...rest } = details as { changes?: Record<string, { old: unknown; new: unknown }> };
  const restEntries = Object.entries(rest);

  return (
    <details className="group max-w-md text-sm">
      <summary className="cursor-pointer text-muted select-none hover:text-text">
        {changes ? `${Object.keys(changes).length} field(s) changed` : `${restEntries.length} detail(s)`}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {changes &&
          Object.entries(changes).map(([field, c]) => (
            <div key={field} className="contents">
              <dt className="text-muted">{humanise(field)}</dt>
              <dd className="min-w-0 break-words">
                <span className="text-muted line-through decoration-slate">{show(c.old)}</span>
                <span aria-hidden className="mx-1.5 text-muted">
                  {"→"}
                </span>
                <span className="sr-only">changed to</span>
                <span>{show(c.new)}</span>
              </dd>
            </div>
          ))}
        {restEntries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{humanise(k)}</dt>
            <dd className="min-w-0 break-words">{show(v)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const LABELS: Record<string, string> = {
  usdNgnRate: "Exchange rate (₦ per US$)",
  asAtDate: "Report as-at date",
  dnPrefix: "Demand notice prefix",
  payerPrefix: "Payer ID prefix",
  dnPaymentInstructions: "Demand notice payment instructions",
  dnSignatory: "Demand notice signatory",
  signatoryName: "Signatory name",
  signatoryDesignation: "Signatory designation",
  orgPhone: "Phone",
  orgEmail: "Email",
  addressLine: "Address",
  paymentAccounts: "Bank accounts",
  defaultTermsDays: "Default payment terms (days)",
  autoConfirm: "Auto-confirm receipts",
  budgetToDateRule: "Budget to date",
};

function humanise(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(blank)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  // Stored decimals come back padded ("1500.000000"); show them as typed.
  if (typeof v === "string" && /^-?\d+\.\d+$/.test(v)) return v.replace(/\.?0+$/, "");
  return String(v);
}
