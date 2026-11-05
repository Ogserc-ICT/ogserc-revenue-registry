import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sch3RegistrationFees } from "@/db/schema";
import { getListValues, withCurrent } from "@/lib/lists-server";
import type { PayerFormOptions } from "./payer-form";

export async function getPayerFormOptions(current?: {
  category: string | null;
  licenceStatus: string | null;
  lga: string | null;
}): Promise<PayerFormOptions> {
  const [categories, licenceStatuses, lgas, sch3] = await Promise.all([
    getListValues("Payer categories"),
    getListValues("Licence status"),
    getListValues("LGAs"),
    db
      .select({ category: sch3RegistrationFees.category, registrant: sch3RegistrationFees.registrant })
      .from(sch3RegistrationFees)
      .orderBy(asc(sch3RegistrationFees.category)),
  ]);
  return {
    categories: withCurrent(categories, current?.category),
    licenceStatuses: withCurrent(licenceStatuses, current?.licenceStatus),
    lgas: withCurrent(lgas, current?.lga),
    sch3: sch3.map((r) => [r.category, r.registrant]),
  };
}
