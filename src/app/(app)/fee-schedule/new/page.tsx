import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { gatePage } from "@/lib/session";
import { FeeHeadForm } from "../fee-head-form";
import { getFeeHeadFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Add fee head" };

export default async function NewFeeHeadPage() {
  const gate = await gatePage("fees.edit");
  if (!gate.ok) return <NoAccess title="Add fee head" />;
  const options = await getFeeHeadFormOptions();
  return (
    <>
      <PageHeader
        title="Add fee head"
        description="A new revenue head for receipts and demand notices. Its code can't be changed once saved."
      />
      <FeeHeadForm
        mode="new"
        schedule3Linked={false}
        options={options}
        initial={{
          code: "",
          head: "",
          category: "",
          appliesTo: "",
          basis: "Fixed",
          currency: "NGN",
          publishedRate: "",
          publishedRateText: "",
          capNgn: "",
          unitBasis: "",
          frequency: "",
          revenueType: "IGR",
          budgetLineId: "",
          legalBasis: "",
          ncoaCode: "",
          rateStatus: "",
          notes: "",
          active: true,
        }}
      />
    </>
  );
}
