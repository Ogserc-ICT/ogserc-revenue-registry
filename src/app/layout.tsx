import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Revenue Register", template: "%s · Revenue Register" },
  description: "OGSERC receipts, billing & collections",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06110C" },
    { media: "(prefers-color-scheme: light)", color: "#F4F8F5" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={GeistSans.variable} suppressHydrationWarning>
      <body className="min-h-dvh">
        {/* Very faint brand glow fixed behind the whole app (DESIGN.md --grad-page-glow) */}
        <div aria-hidden className="bg-page-glow pointer-events-none fixed inset-0 -z-10" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
