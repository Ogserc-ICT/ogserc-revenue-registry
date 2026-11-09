"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { type ImportReport, importPayers } from "@/lib/payer-import";
import { actorOf, requireAction } from "@/lib/session";

const MAX_BYTES = 1_000_000;
const input = z.object({
  csv: z.string().min(1, "Choose a CSV file first.").max(MAX_BYTES, "Keep the file under 1 MB (about 2,000 payers)."),
  includeNearDuplicates: z.boolean(),
});

/** Admin only. Dry run: reports what an import would do and writes nothing. */
export async function previewImportAction(csv: string, includeNearDuplicates: boolean): Promise<ActionResult<ImportReport>> {
  try {
    const user = await requireAction("data.manage");
    const v = input.parse({ csv, includeNearDuplicates });
    const report = await importPayers(db, actorOf(user), v.csv, { dryRun: true, includeNearDuplicates: v.includeNearDuplicates });
    return { ok: true, data: report };
  } catch (err) {
    return toActionError(err);
  }
}

/** Admin only. Imports the file in one transaction; each payer added is audited. */
export async function importAction(csv: string, includeNearDuplicates: boolean): Promise<ActionResult<ImportReport>> {
  try {
    const user = await requireAction("data.manage");
    const v = input.parse({ csv, includeNearDuplicates });
    const report = await importPayers(db, actorOf(user), v.csv, { dryRun: false, includeNearDuplicates: v.includeNearDuplicates });
    revalidatePath("/payers");
    return {
      ok: true,
      message: `${report.added} ${report.added === 1 ? "payer" : "payers"} imported${report.skipped ? `, ${report.skipped} skipped` : ""}.`,
      data: report,
    };
  } catch (err) {
    return toActionError(err);
  }
}
