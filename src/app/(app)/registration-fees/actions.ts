"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { updateSchedule3Fee, updateSchedule3Group } from "@/lib/fees-service";
import { actorOf, requireAction } from "@/lib/session";
import { sch3FeeSchema, sch3GroupSchema } from "@/lib/validation";

function revalidate() {
  revalidatePath("/registration-fees");
  revalidatePath("/fee-schedule");
}

/** Admin only. Changes a Part A fee and copies it into the REG-x fee head. */
export async function saveSch3FeeAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("fees.edit");
    const v = sch3FeeSchema.parse({
      category: String(formData.get("category") ?? ""),
      feeNgn: String(formData.get("feeNgn") ?? ""),
    });
    const r = await updateSchedule3Fee(db, actorOf(user), v.category, v.feeNgn!);
    revalidate();
    return { ok: true, message: r.changed ? `Category ${v.category} fee saved` : "No changes to save" };
  } catch (err) {
    return toActionError(err);
  }
}

/** Admin only. Changes a Part B late-charge group and copies it into its LRC fee heads. */
export async function saveSch3GroupAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("fees.edit");
    const v = sch3GroupSchema.parse({
      group: String(formData.get("group") ?? ""),
      initialNgn: String(formData.get("initialNgn") ?? ""),
      dailyNgn: String(formData.get("dailyNgn") ?? ""),
      dailyCapNgn: String(formData.get("dailyCapNgn") ?? ""),
    });
    const r = await updateSchedule3Group(db, actorOf(user), v.group, {
      initialNgn: v.initialNgn!,
      dailyNgn: v.dailyNgn!,
      dailyCapNgn: v.dailyCapNgn!,
    });
    revalidate();
    return { ok: true, message: r.changed ? `${v.group} charges saved` : "No changes to save" };
  } catch (err) {
    return toActionError(err);
  }
}
