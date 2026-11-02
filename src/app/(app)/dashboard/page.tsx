import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Confirmed revenue, budget progress and what needs attention this year."
      capability="reports.view"
      message="The dashboard arrives in Phase 5, with confirmed revenue, budget progress and ageing."
    />
  );
}
