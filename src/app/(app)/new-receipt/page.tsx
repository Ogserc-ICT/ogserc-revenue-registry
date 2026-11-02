import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "New receipt" };

export default function NewreceiptPage() {
  return (
    <PlaceholderPage
      title="New receipt"
      description="Record a payment received from a payer, ready for Finance to confirm."
      capability="receipts.record"
      message="Receipt entry arrives in Phase 4. Until then, keep recording receipts in the workbook."
    />
  );
}
