"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { percentToFraction } from "@/lib/fees";
import { createFeeHead, updateFeeHead } from "@/lib/fees-service";
import { actorOf, requireAction } from "@/lib/session";
import { feeCodeSchema, feeHeadSchema } from "@/lib/validation";

const TEXT_FIELDS = [
  "head",
  "category",
  "appliesTo",
  "basis",
  "currency",
  "publishedRate",
  "publishedRateText",
  "capNgn",
  "unitBasis",
  "frequency",
  "revenueType",
  "budgetLineId",
  "legalBasis",
  "ncoaCode",
  "rateStatus",
  "notes",
] as const;

/** Adds a fee head (mode=new) or edits one. Admin only; every change is audited. */
export async function saveFeeHeadAction(
  _prev: ActionResult<{ code: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ code: string }>> {
  try {
    const user = await requireAction("fees.edit");
    const parsed = feeHeadSchema.parse({
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, String(formData.get(f) ?? "")])),
      active: formData.get("active") === "on",
    });
    // The form takes a % of Revenue rate as a percentage; it is stored as a fraction (1.5% = 0.015).
    const values =
      parsed.basis === "% of Revenue" && parsed.publishedRate !== null
        ? { ...parsed, publishedRate: percentToFraction(parsed.publishedRate) }
        : parsed;

    const isNew = formData.get("mode") === "new";
    const code = isNew
      ? feeCodeSchema.parse(String(formData.get("code") ?? ""))
      : String(formData.get("code") ?? "");

    if (isNew) {
      await createFeeHead(db, actorOf(user), code, values);
      revalidatePath("/fee-schedule");
      return { ok: true, message: `Fee head ${code} added`, data: { code } };
    }
    const r = await updateFeeHead(db, actorOf(user), code, values);
    revalidatePath("/fee-schedule");
    return { ok: true, message: r.changed === 0 ? "No changes to save" : `Fee head ${code} saved`, data: { code } };
  } catch (err) {
    const result = toActionError(err);
    // A bad code is reported against the code field.
    if (!result.ok && result.fieldErrors && Object.keys(result.fieldErrors).includes("_form")) {
      return { ...result, fieldErrors: { code: result.fieldErrors._form! } };
    }
    return result;
  }
}
