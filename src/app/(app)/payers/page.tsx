import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Payers" };

export default function PayersPage() {
  return (
    <PlaceholderPage
      title="Payers"
      description="Licensees and other payers, with what they owe and have paid."
      capability="payers.view"
      message="The payers list arrives in Phase 2."
    />
  );
}
