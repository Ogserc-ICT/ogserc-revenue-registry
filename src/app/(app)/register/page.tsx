import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <PlaceholderPage
      title="Register"
      description="Every receipt recorded, with filters, confirmation and reversal."
      capability="receipts.view"
      message="The receipts register arrives in Phase 4."
    />
  );
}
