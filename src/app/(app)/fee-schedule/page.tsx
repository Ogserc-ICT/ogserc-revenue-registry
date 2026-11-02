import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Fee schedule" };

export default function FeeschedulePage() {
  return (
    <PlaceholderPage
      title="Fee schedule"
      description="Every revenue head, its rate, basis and budget line."
      capability="fees.view"
      message="The fee schedule arrives in Phase 2."
    />
  );
}
