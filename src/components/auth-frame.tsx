import Image from "next/image";
import { ThemeToggle } from "./shell/theme-toggle";

/**
 * Centred card for sign-in and change-password, with the logo, product name and tagline above
 * it and a soft aurora behind it (--grad-signature enlarged, blurred, low opacity).
 */
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center overflow-hidden px-4">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/brand/ogserc-mark.png" alt="OGSERC" width={56} height={56} className="size-14" priority />
          <p className="mt-4 text-xl font-semibold tracking-tight">Revenue Register</p>
          <p className="text-base text-muted">Receipts, billing &amp; collections</p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="bg-grad-signature pointer-events-none absolute -inset-16 -z-10 scale-125 rounded-[48px] opacity-70 blur-[60px]"
          />
          <div className="rounded-shell border border-border bg-surface p-6 sm:p-8">{children}</div>
        </div>
      </div>

      <footer className="pb-6 text-center text-sm text-muted">Ogun State Electricity Regulatory Commission</footer>
    </div>
  );
}
