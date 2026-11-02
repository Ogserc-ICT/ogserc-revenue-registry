import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Arrears" };

export default function ArrearsPage() {
  return (
    <PlaceholderPage
      title="Arrears"
      description="What each payer owes on demand notices, by age."
      capability="reports.view"
      message="The arrears report arrives in Phase 5."
    />
  );
}
