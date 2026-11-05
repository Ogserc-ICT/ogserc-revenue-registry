"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { saveBudgetLine } from "@/lib/fees-service";
import { actorOf, requireAction } from "@/lib/session";
import { budgetLineEditSchema } from "@/lib/validation";

/** Admin only. Saves the changed months of one budget line for one FY. */
export async function saveBudgetLineAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("budget.edit");
    const v = budgetLineEditSchema.parse({
      financialYear: formData.get("financialYear"),
      budgetLineId: String(formData.get("budgetLineId") ?? ""),
      months: Array.from({ length: 12 }, (_, i) => String(formData.get(`m${i + 1}`) ?? "").trim() || "0"),
    });
    const r = await saveBudgetLine(db, actorOf(user), v.financialYear, v.budgetLineId, v.months as string[]);
    revalidatePath("/revenue-budget");
    return {
      ok: true,
      message:
        r.changed === 0
          ? "No changes to save"
          : `${v.budgetLineId} FY${v.financialYear} saved (${r.changed} ${r.changed === 1 ? "month" : "months"})`,
    };
  } catch (err) {
    const result = toActionError(err);
    // months.3 -> m4, so the error shows under the right month.
    if (!result.ok && result.fieldErrors) {
      const mapped = Object.fromEntries(
        Object.entries(result.fieldErrors).map(([k, m]) => {
          const hit = /^months\.(\d+)$/.exec(k);
          return [hit ? `m${Number(hit[1]) + 1}` : k, m];
        }),
      );
      return { ...result, fieldErrors: mapped };
    }
    return result;
  }
}
