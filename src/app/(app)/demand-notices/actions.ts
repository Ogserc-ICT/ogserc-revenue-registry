"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { cancelDemandNotices } from "@/lib/dn-service";
import { actorOf, requireAction } from "@/lib/session";
import { cancelDnSchema } from "@/lib/validation";

/** Finance Officers and Admins. A reason is required; already-cancelled notices are skipped. */
export async function cancelDnAction(ids: string[], reason: string): Promise<ActionResult<{ cancelled: number; skipped: number }>> {
  try {
    const user = await requireAction("dn.cancel");
    const v = cancelDnSchema.parse({ ids, reason });
    const r = await cancelDemandNotices(db, actorOf(user), v.ids, v.reason);
    revalidatePath("/demand-notices");
    revalidatePath("/payers");
    const noun = (n: number) => `${n} ${n === 1 ? "notice" : "notices"}`;
    return {
      ok: true,
      message: r.skipped ? `${noun(r.cancelled)} cancelled, ${r.skipped} skipped (already cancelled)` : `${noun(r.cancelled)} cancelled`,
      data: r,
    };
  } catch (err) {
    return toActionError(err);
  }
}
