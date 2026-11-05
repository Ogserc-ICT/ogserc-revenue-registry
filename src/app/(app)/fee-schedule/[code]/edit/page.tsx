import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { feeHeads } from "@/db/schema";
import { schedule3LinkedCodes } from "@/lib/fees-service";
import { gatePage } from "@/lib/session";
import { FeeHeadForm } from "../../fee-head-form";
import { getFeeHeadFormOptions, toFormValues } from "../../form-options";

export const metadata: Metadata = { title: "Edit fee head" };

export default async function EditFeeHeadPage({ params }: { params: Promise<{ code: string }> }) {
  const gate = await gatePage("fees.edit");
  if (!gate.ok) return <NoAccess title="Edit fee head" />;
  const code = decodeURIComponent((await params).code);
  const [row] = await db.select().from(feeHeads).where(eq(feeHeads.code, code));
  if (!row) notFound();
  const [options, linked] = await Promise.all([getFeeHeadFormOptions(row), schedule3LinkedCodes(db)]);
  return (
    <>
      <PageHeader
        title={`Edit ${row.code}`}
        description="Changes apply to new receipts and notices only. Those already saved keep their rate and head."
      />
      <FeeHeadForm mode="edit" schedule3Linked={linked.has(row.code)} options={options} initial={toFormValues(row)} />
    </>
  );
}
