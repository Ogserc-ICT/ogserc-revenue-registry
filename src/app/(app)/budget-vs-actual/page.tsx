import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Budget vs actual" };

export default function BudgetvsactualPage() {
  return (
    <PlaceholderPage
      title="Budget vs actual"
      description="Confirmed revenue against the phased budget, per budget line."
      capability="reports.view"
      message="Budget vs actual arrives in Phase 5."
    />
  );
}
