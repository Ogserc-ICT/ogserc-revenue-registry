"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { updateBandRate } from "@/lib/fees-service";
import { actorOf, requireAction } from "@/lib/session";
import { bandRateSchema } from "@/lib/validation";

/** Admin only. Changes one MW band's rate; blank clears it (officers then use an override). */
export async function saveBandRateAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("fees.edit");
    const v = bandRateSchema.parse({
      id: formData.get("id"),
      publishedRate: String(formData.get("publishedRate") ?? ""),
    });
    const r = await updateBandRate(db, actorOf(user), v.id, v.publishedRate);
    revalidatePath("/licence-fee-tables");
    return { ok: true, message: r.changed ? `${r.row.code} ${r.row.bandLabel} saved` : "No changes to save" };
  } catch (err) {
    return toActionError(err);
  }
}
