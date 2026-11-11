import { type DescribedFee, feeHeadInfo } from "@/lib/fees";

/**
 * Read-only panel under a revenue head picker: what the head stands for and the amount to be paid,
 * both from the fee schedule. Renders nothing until a head is picked.
 */
export function FeeHeadInfo({ fee, usdNgnRate, className }: { fee: DescribedFee | null | undefined; usdNgnRate: string; className?: string }) {
  if (!fee) return null;
  const info = feeHeadInfo(fee, usdNgnRate);
  return (
    <dl aria-live="polite" className={`grid gap-3 rounded-control border border-border bg-surface-raised p-3 text-sm sm:grid-cols-2 ${className ?? ""}`}>
      <div>
        <dt className="text-xs font-medium text-muted">What it stands for</dt>
        <dd className="mt-0.5">{info.standsFor}</dd>
        {info.legalBasis && <dd className="mt-0.5 text-xs text-muted">{info.legalBasis}</dd>}
      </div>
      <div>
        <dt className="text-xs font-medium text-muted">Amount to be paid</dt>
        <dd className="mt-0.5 money">{info.feeToPay}</dd>
      </div>
    </dl>
  );
}
