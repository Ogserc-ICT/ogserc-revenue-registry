import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Revenue budget" };

export default function RevenuebudgetPage() {
  return (
    <PlaceholderPage
      title="Revenue budget"
      description="The phased monthly revenue budget for each budget line."
      capability="fees.view"
      message="The revenue budget editor arrives in Phase 2."
    />
  );
}
