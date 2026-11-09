import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { NoAccess } from "@/components/placeholder-page";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/db";
import { feeHeads, licenceFeeBands, payers } from "@/db/schema";
import { lagosToday } from "@/lib/dates";
import { peekSerial } from "@/lib/numbering";
import { gatePage } from "@/lib/session";
import { getSettings } from "@/lib/settings-server";
import { DnForm } from "./dn-form";

export const metadata: Metadata = { title: "New demand notice" };

export default async function NewDemandNoticePage({ searchParams }: { searchParams: Promise<{ payer?: string }> }) {
  const gate = await gatePage("dn.issue");
  if (!gate.ok) return <NoAccess title="New demand notice" />;

  const [payerRows, feeRows, bandRows, settings, nextSerial] = await Promise.all([
    db
      .select({
        payerId: payers.payerId,
        name: payers.name,
        category: payers.category,
        licenceNo: payers.licenceNo,
        capacityMw: payers.capacityMw,
        revenueBaseNgn: payers.revenueBaseNgn,
      })
      .from(payers)
      .where(eq(payers.active, true))
      .orderBy(asc(payers.name)),
    db
      .select({
        code: feeHeads.code,
        head: feeHeads.head,
        basis: feeHeads.basis,
        currency: feeHeads.currency,
        publishedRate: feeHeads.publishedRate,
        capNgn: feeHeads.capNgn,
        unitBasis: feeHeads.unitBasis,
      })
      .from(feeHeads)
      .where(eq(feeHeads.active, true))
      .orderBy(asc(feeHeads.sortOrder), asc(feeHeads.code)),
    db
      .select({
        code: licenceFeeBands.code,
        aboveMw: licenceFeeBands.aboveMw,
        upToMw: licenceFeeBands.upToMw,
        publishedRate: licenceFeeBands.publishedRate,
        currency: licenceFeeBands.currency,
      })
      .from(licenceFeeBands),
    getSettings(),
    peekSerial(db, "dn"),
  ]);
  const requested = (await searchParams).payer;

  return (
    <>
      <PageHeader
        title="New demand notice"
        description="Bill a licensee or permit holder. The amount is worked out from the fee schedule; use Override for anything else."
      />
      <DnForm
        payers={payerRows}
        fees={feeRows}
        bands={bandRows}
        usdNgnRate={settings.usdNgnRate}
        dnPrefix={settings.dnPrefix}
        nextSerial={nextSerial}
        defaultTermsDays={settings.defaultTermsDays}
        today={lagosToday()}
        initialPayerId={payerRows.some((p) => p.payerId === requested) ? requested : undefined}
      />
    </>
  );
}
