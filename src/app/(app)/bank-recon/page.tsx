import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Bank recon" };

export default function BankreconPage() {
  return (
    <PlaceholderPage
      title="Bank recon"
      description="Register totals against bank and TSA statements, by month and account."
      capability="bankRecon.view"
      message="Bank reconciliation arrives in Phase 5."
    />
  );
}
