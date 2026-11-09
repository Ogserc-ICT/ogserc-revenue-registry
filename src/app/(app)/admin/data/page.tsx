import { Download } from "lucide-react";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { ButtonLink } from "@/components/ui/button";
import { Card, PageHeader, SectionHeading } from "@/components/ui/misc";
import { gatePage } from "@/lib/session";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Data import & export" };

export default async function DataPage() {
  const gate = await gatePage("data.manage");
  if (!gate.ok) return <NoAccess title="Data import & export" />;
  return (
    <>
      <PageHeader title="Data import & export" description="Download every table to Excel, and add payers in bulk from a CSV file." />

      <section className="mb-10">
        <SectionHeading
          title="Export everything"
          description="One Excel workbook with a sheet per table: settings, lists, fee schedule, payers, notices, receipts, budget and the audit log. Passwords are never included."
        />
        <Card className="flex flex-col items-start gap-3 p-5">
          <ButtonLink href="/export/everything.xlsx" prefetch={false}>
            <Download aria-hidden className="size-4" /> Export everything
          </ButtonLink>
          <p className="max-w-[80ch] text-sm text-muted">
            Download this weekly and keep it on an OGSERC drive, alongside the nightly database backup. Every export is recorded in the
            audit log.
          </p>
        </Card>
      </section>

      <section>
        <SectionHeading
          title="Import payers from CSV"
          description="Use the template's columns. You'll see a preview first: nothing is saved until you choose Import, and the import is all or nothing."
        />
        <Card className="p-5">
          <ImportPanel />
        </Card>
      </section>
    </>
  );
}
