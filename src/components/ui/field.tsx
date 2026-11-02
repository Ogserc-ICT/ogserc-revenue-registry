import { cn } from "./cn";

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** Label, control, then either the error (rose) or the hint (muted). Required = small dot. */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-medium text-text">
        {label}
        {required && (
          <span aria-hidden className="size-1.5 rounded-pill bg-emerald-400" title="Required" />
        )}
        {required && <span className="sr-only">(required)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-rose-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="max-w-[80ch] text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria wiring for a control inside <Field>. */
export function describedBy(id: string, error?: string, hint?: string) {
  return {
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  };
}

const control = "field-control w-full px-3 text-base";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-10 pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

export function Checkbox({
  label,
  hint,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded accent-[var(--emerald-600)]"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      <div>
        <label htmlFor={id} className="text-base text-text">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="max-w-[80ch] text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Form-level error or success line, announced to screen readers. */
export function FormMessage({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn("text-sm", tone === "error" ? "text-rose-text" : "text-emerald-text")}
    >
      {children}
    </p>
  );
}
