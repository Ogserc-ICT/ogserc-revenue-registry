import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Guide" };

export default function GuidePage() {
  return (
    <PlaceholderPage
      title="Guide"
      description="How to record receipts, issue notices and read the reports."
      capability="reports.view"
      message="The guide arrives in Phase 6."
    />
  );
}
