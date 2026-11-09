"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { MONTH_LABELS } from "@/lib/budget";
import { saveStatementTotal } from "@/lib/reports-service";
import { actorOf, requireAction } from "@/lib/session";
import { statementTotalSchema } from "@/lib/validation";

/** Finance Officers and Admins enter (or clear) a month's statement total for an account. */
export async function saveStatementAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("bankRecon.enter");
    const v = statementTotalSchema.parse({
      financialYear: formData.get("financialYear"),
      month: formData.get("month"),
      collectingAccount: String(formData.get("collectingAccount") ?? ""),
      statementTotal: String(formData.get("statementTotal") ?? ""),
    });
    const r = await saveStatementTotal(db, actorOf(user), v);
    revalidatePath("/bank-recon");
    const label = `${MONTH_LABELS[v.month - 1]} ${v.financialYear}, ${v.collectingAccount}`;
    return {
      ok: true,
      message: !r.changed ? "No changes to save" : v.statementTotal === null ? `Statement total cleared for ${label}` : `Statement total saved for ${label}`,
    };
  } catch (err) {
    return toActionError(err);
  }
}
