import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { getPayerSummary } from "@/lib/payers-service";
import { gatePage } from "@/lib/session";
import { getPayerFormOptions } from "../../form-options";
import { PayerForm } from "../../payer-form";

export const metadata: Metadata = { title: "Edit payer" };

/** Numeric columns come back with trailing zeros ("25.000"); show them as typed. */
const plain = (v: string | null) => (v === null ? "" : v.includes(".") ? v.replace(/\.?0+$/, "") : v);

export default async function EditPayerPage({ params }: { params: Promise<{ payerId: string }> }) {
  const gate = await gatePage("payers.edit");
  if (!gate.ok) return <NoAccess title="Edit payer" />;
  const payerId = decodeURIComponent((await params).payerId);
  const p = await getPayerSummary(db, payerId);
  if (!p) notFound();
  const options = await getPayerFormOptions(p);

  return (
    <>
      <PageHeader
        title={`Edit ${p.name}`}
        description="Changes apply from now on. Receipts and notices already issued keep the details they were saved with."
      />
      <PayerForm
        options={options}
        initial={{
          payerId: p.payerId,
          name: p.name,
          category: p.category ?? "",
          licenceNo: p.licenceNo ?? "",
          licenceStatus: p.licenceStatus ?? "",
          capacityMw: plain(p.capacityMw),
          revenueBaseNgn: plain(p.revenueBaseNgn),
          lga: p.lga ?? "",
          address: p.address ?? "",
          contactPerson: p.contactPerson ?? "",
          phone: p.phone ?? "",
          email: p.email ?? "",
          dateRegistered: p.dateRegistered ?? "",
          sch3Category: p.sch3Category ?? "",
          expectedRegMonth: p.expectedRegMonth ?? "",
          notes: p.notes ?? "",
          active: p.active,
        }}
      />
    </>
  );
}
