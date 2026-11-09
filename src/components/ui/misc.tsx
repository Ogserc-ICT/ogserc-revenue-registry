import { cn } from "./cn";

export type PillTone = "emerald" | "amber" | "rose" | "gold" | "slate" | "muted" | "sky";

const dot: Record<PillTone, string> = {
  emerald: "bg-emerald-400",
  amber: "bg-amber",
  rose: "bg-rose",
  gold: "bg-gold-500",
  slate: "bg-slate",
  muted: "bg-muted",
  sky: "bg-sky",
};

const tint: Record<PillTone, string> = {
  emerald: "bg-emerald-400/12 border-emerald-400/30",
  amber: "bg-amber/12 border-amber/35",
  rose: "bg-rose/12 border-rose/35",
  gold: "bg-gold-500/12 border-gold-500/35",
  slate: "bg-slate/15 border-slate/35",
  muted: "bg-surface-raised border-border",
  sky: "bg-sky/12 border-sky/35",
};

/** Status pill: a coloured dot plus text, so colour never carries status on its own. */
export function StatusPill({
  tone,
  wrap = false,
  children,
}: {
  tone: PillTone;
  /** For long free-text statuses: lets the text wrap on narrow screens instead of overflowing. */
  wrap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs font-medium text-text",
        wrap ? "max-w-full rounded-control whitespace-normal" : "rounded-pill whitespace-nowrap",
        tint[tone],
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", dot[tone])} />
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-1 max-w-[80ch] text-base text-muted">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-card border border-border bg-surface", className)}>{children}</section>
  );
}

/** Section heading inside a page or form; sections are separated by headings, not nested boxes. */
export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-md font-semibold">{title}</h2>
      {description && <p className="mt-0.5 max-w-[80ch] text-sm text-muted">{description}</p>}
    </div>
  );
}

/** Empty state: one line saying what to do, plus the action (DESIGN.md 4). */
export function EmptyState({
  message,
  action,
  icon,
}: {
  message: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-card border border-dashed border-border bg-surface px-6 py-10 sm:items-center sm:text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="max-w-[60ch] text-base text-muted">{message}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-control", className)} />;
}

/** Naira figure: the sign at 0.8em in muted text, tabular figures. */
export function Naira({ value, className }: { value: string; className?: string }) {
  // A negative amount reads "−₦500,000.00": the minus goes before the sign.
  const negative = value.startsWith("-");
  return (
    <span className={cn("money whitespace-nowrap", className)}>
      {negative && "−"}
      <span className="mr-0.5 text-[0.8em] text-muted">{"₦"}</span>
      {negative ? value.slice(1) : value}
    </span>
  );
}
