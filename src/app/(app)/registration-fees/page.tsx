import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Registration fees" };

export default function RegistrationfeesPage() {
  return (
    <PlaceholderPage
      title="Registration fees"
      description="Schedule 3 registration fees, late charges and the late registration calculator."
      capability="fees.view"
      message="Registration fees and the late registration calculator arrive in Phase 2."
    />
  );
}
