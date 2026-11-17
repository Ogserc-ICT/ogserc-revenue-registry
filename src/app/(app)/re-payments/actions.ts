"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError, UserFacingError } from "@/lib/action-result";
import { HandoverFileError } from "@/lib/handover";
import { type HandoverReport, importHandover, MAX_HANDOVER_BYTES } from "@/lib/handover-service";
import { actorOf, requireAction } from "@/lib/session";

/** The refusal reasons travel to the form as `problems`, one per line. */
export type HandoverActionResult = ActionResult<HandoverReport> | { ok: false; error: string; problems: string[] };

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new UserFacingError("Choose the batch file (.xlsx) first.");
  if (file.size > MAX_HANDOVER_BYTES) throw new UserFacingError("That file is too large for a handover batch. Check it's the right file.");
  return { name: file.name.slice(0, 200), bytes: new Uint8Array(await file.arrayBuffer()) };
}

async function run(formData: FormData, dryRun: boolean): Promise<HandoverActionResult> {
  try {
    const user = await requireAction("handover.import");
    const report = await importHandover(db, actorOf(user), await readUpload(formData), { dryRun });
    if (!dryRun && report.status === "new") revalidatePath("/re-payments");
    return { ok: true, data: report };
  } catch (err) {
    if (err instanceof HandoverFileError) return { ok: false, error: err.message, problems: err.problems };
    return toActionError(err);
  }
}

/** Admin and Finance. Checks the file and shows what an import would do; writes nothing. */
export async function previewHandoverAction(formData: FormData): Promise<HandoverActionResult> {
  return run(formData, true);
}

/** Admin and Finance. Imports the batch in one transaction (contract §5); audited. */
export async function importHandoverAction(formData: FormData): Promise<HandoverActionResult> {
  return run(formData, false);
}
