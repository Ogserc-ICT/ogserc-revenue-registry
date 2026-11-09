"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { issueDemandNotice } from "@/lib/dn-service";
import { formatAmount } from "@/lib/money";
import { actorOf, requireAction } from "@/lib/session";
import { issueDnSchema } from "@/lib/validation";

const FIELDS = ["payerId", "feeCode", "issueDate", "period", "quantity", "override", "paymentTermsDays", "remarks"] as const;

/** Revenue Officers and Admins. The amount is recomputed on the server; the form's figure is only a preview. */
export async function issueDnAction(
  _prev: ActionResult<{ id: string; dnNo: string; print: boolean }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; dnNo: string; print: boolean }>> {
  try {
    const user = await requireAction("dn.issue");
    const values = issueDnSchema.parse(Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])));
    const dn = await issueDemandNotice(db, actorOf(user), values);
    revalidatePath("/demand-notices");
    revalidatePath("/payers");
    return {
      ok: true,
      message: `Demand notice ${dn.dnNo} issued for ₦${formatAmount(dn.amountBilled)}`,
      data: { id: dn.id, dnNo: dn.dnNo, print: formData.get("intent") === "print" },
    };
  } catch (err) {
    return toActionError(err);
  }
}
