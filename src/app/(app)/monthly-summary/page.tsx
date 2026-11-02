import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Monthly summary" };

export default function MonthlysummaryPage() {
  return (
    <PlaceholderPage
      title="Monthly summary"
      description="Confirmed revenue by revenue head and month, with category totals."
      capability="reports.view"
      message="The monthly summary arrives in Phase 5."
    />
  );
}
