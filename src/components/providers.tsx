"use client";

import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { ToastProvider } from "./ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="ogsrr:theme"
      disableTransitionOnChange
    >
      {/* reducedMotion="user": prefers-reduced-motion turns motion animations off */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
