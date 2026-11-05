"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import type { NearDuplicate } from "@/lib/payer-names";
import { createPayer, NearDuplicateError, updatePayer } from "@/lib/payers-service";
import { actorOf, requireAction } from "@/lib/session";
import { payerSchema } from "@/lib/validation";

export type SavePayerResult =
  | ActionResult<{ payerId: string }>
  | { ok: false; error: string; nearDuplicates: NearDuplicate[]; fieldErrors?: undefined };

const FIELDS = Object.keys(payerSchema.shape) as (keyof typeof payerSchema.shape)[];

/** Adds a payer (no payerId in the form) or edits one. Revenue Officers and Admins only. */
export async function savePayerAction(_prev: SavePayerResult | null, formData: FormData): Promise<SavePayerResult> {
  try {
    const user = await requireAction("payers.edit");
    const values = payerSchema.parse(Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])));
    const acknowledgeNearDuplicates = formData.get("acknowledge") === "1";
    const payerId = String(formData.get("payerId") ?? "");

    if (!payerId) {
      const created = await createPayer(db, actorOf(user), values, { acknowledgeNearDuplicates });
      revalidatePath("/payers");
      return { ok: true, message: `Payer ${created.payerId} added`, data: { payerId: created.payerId } };
    }

    const id = z.string().min(1).max(40).parse(payerId);
    const result = await updatePayer(
      db,
      actorOf(user),
      id,
      { ...values, active: formData.get("active") === "on" },
      { acknowledgeNearDuplicates },
    );
    revalidatePath("/payers");
    revalidatePath(`/payers/${id}`);
    return {
      ok: true,
      message: result.changed === 0 ? "No changes to save" : `Payer ${id} saved`,
      data: { payerId: id },
    };
  } catch (err) {
    if (err instanceof NearDuplicateError) {
      return {
        ok: false,
        error: "This name looks like a payer that already exists. Check the list below before you save.",
        nearDuplicates: err.matches,
      };
    }
    if (isUniqueNameViolation(err)) {
      return {
        ok: false,
        error: "Check the highlighted field.",
        fieldErrors: { name: "Another payer was just saved with this name. Open that payer instead." },
      };
    }
    return toActionError(err);
  }
}

/** The database's unique index on lower(name) caught a concurrent duplicate. */
function isUniqueNameViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: { code?: string; constraint_name?: string } };
  const c = e?.cause ?? e;
  return c?.code === "23505" && (c.constraint_name ?? "").includes("payers_name_lower_uq");
}
