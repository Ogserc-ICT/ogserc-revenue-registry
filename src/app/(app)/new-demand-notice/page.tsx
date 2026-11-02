import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "New demand notice" };

export default function NewdemandnoticePage() {
  return (
    <PlaceholderPage
      title="New demand notice"
      description="Bill a payer for a fee and print the notice."
      capability="dn.issue"
      message="Demand notice entry arrives in Phase 3."
    />
  );
}
