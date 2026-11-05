import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { formatPayerId, peekSerial } from "@/lib/numbering";
import { gatePage } from "@/lib/session";
import { getSettings } from "@/lib/settings-server";
import { getPayerFormOptions } from "../form-options";
import { PayerForm } from "../payer-form";

export const metadata: Metadata = { title: "Add payer" };

export default async function NewPayerPage() {
  const gate = await gatePage("payers.edit");
  if (!gate.ok) return <NoAccess title="Add payer" />;
  const [options, settings, next] = await Promise.all([getPayerFormOptions(), getSettings(), peekSerial(db, "payer")]);

  return (
    <>
      <PageHeader
        title="Add payer"
        description="A licensee or other payer that can be billed and issued receipts. Check the list first to avoid duplicates."
      />
      <PayerForm
        nextPayerId={formatPayerId(settings.payerPrefix, next)}
        options={options}
        initial={{
          payerId: null,
          name: "",
          category: "",
          licenceNo: "",
          licenceStatus: "",
          capacityMw: "",
          revenueBaseNgn: "",
          lga: "",
          address: "",
          contactPerson: "",
          phone: "",
          email: "",
          dateRegistered: "",
          sch3Category: "",
          expectedRegMonth: "",
          notes: "",
          active: true,
        }}
      />
    </>
  );
}
