import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { gatePage } from "@/lib/session";
import { getSettings } from "@/lib/settings-server";
import { ReceiverForm } from "./receiver-form";

export const metadata: Metadata = { title: "Receiver details" };

export default async function ReceiverDetailsPage() {
  const gate = await gatePage("receiver.edit");
  if (!gate.ok) return <NoAccess title="Receiver details" />;
  const s = await getSettings();
  return (
    <>
      <PageHeader
        title="Receiver details"
        description="OGSERC's details as printed on demand notices and receipts: who to pay, where, and who signs. Every change is audited."
      />
      <ReceiverForm
        initial={{
          orgName: s.orgName,
          addressLine: s.addressLine,
          orgPhone: s.orgPhone,
          orgEmail: s.orgEmail,
          paymentAccounts: s.paymentAccounts,
          dnPaymentInstructions: s.dnPaymentInstructions,
          latePaymentNote: s.latePaymentNote,
          signatoryName: s.signatoryName,
          signatoryDesignation: s.signatoryDesignation,
        }}
      />
    </>
  );
}
