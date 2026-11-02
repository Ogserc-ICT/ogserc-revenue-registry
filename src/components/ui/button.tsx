import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap select-none " +
  "transition-[filter,background-color,color,border-color] duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

// DESIGN.md: buttons change brightness only on hover; no lift.
const variants: Record<Variant, string> = {
  primary: "bg-grad-brand text-on-brand hover:brightness-110 active:brightness-95",
  secondary: "border border-border text-text hover:bg-surface-raised",
  danger: "border border-rose text-rose-text hover:bg-rose hover:text-on-brand",
  ghost: "text-muted hover:text-text hover:bg-surface-raised",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(base, variants[variant], sizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
