import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Licence fee tables" };

export default function LicencefeetablesPage() {
  return (
    <PlaceholderPage
      title="Licence fee tables"
      description="Capacity-band rates for generation, embedded and captive licences."
      capability="fees.view"
      message="The licence fee tables arrive in Phase 2."
    />
  );
}
