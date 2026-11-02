import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Data import & export" };

export default function DataimportexportPage() {
  return (
    <PlaceholderPage
      title="Data import & export"
      description="Export every table to Excel, and import payers from CSV."
      capability="data.manage"
      message="Import and export arrive in Phase 5."
    />
  );
}
