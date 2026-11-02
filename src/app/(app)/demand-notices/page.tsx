import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Demand notices" };

export default function DemandnoticesPage() {
  return (
    <PlaceholderPage
      title="Demand notices"
      description="Every notice issued, with what has been paid, what is outstanding and how overdue it is."
      capability="dn.view"
      message="The demand notices register arrives in Phase 3."
    />
  );
}
