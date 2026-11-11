"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { type ActionResult, toActionError, UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, diffFields, writeAudit } from "@/lib/audit";
import { actorOf, requireAction } from "@/lib/session";
import { MAX_PAYMENT_ACCOUNTS, type ReceiverValues, receiverSchema } from "@/lib/validation";

/** Rows posted as paymentAccounts.<i>.bank etc. Indexes match the form, so errors land on the right row. */
function readAccounts(formData: FormData) {
  const rows: { bank: string; accountName: string; accountNumber: string }[] = [];
  for (let i = 0; formData.has(`paymentAccounts.${i}.bank`) && i <= MAX_PAYMENT_ACCOUNTS; i++) {
    const get = (f: string) => String(formData.get(`paymentAccounts.${i}.${f}`) ?? "");
    rows.push({ bank: get("bank"), accountName: get("accountName"), accountNumber: get("accountNumber") });
  }
  return rows;
}

export async function saveReceiverAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("receiver.edit");
    const values: ReceiverValues = receiverSchema.parse({
      orgName: formData.get("orgName"),
      addressLine: formData.get("addressLine") ?? "",
      orgPhone: formData.get("orgPhone") ?? "",
      orgEmail: formData.get("orgEmail") ?? "",
      paymentAccounts: readAccounts(formData),
      dnPaymentInstructions: formData.get("dnPaymentInstructions") ?? "",
      latePaymentNote: formData.get("latePaymentNote") ?? "",
      signatoryName: formData.get("signatoryName") ?? "",
      signatoryDesignation: formData.get("signatoryDesignation") ?? "",
    });

    const changed = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
      if (!current) throw new UserFacingError("Settings are missing. Run the seed script first.");
      // Compare accounts field by field in a fixed order (jsonb doesn't keep key order).
      const before = {
        ...current,
        paymentAccounts: current.paymentAccounts.map((a) => ({ bank: a.bank, accountName: a.accountName, accountNumber: a.accountNumber })),
      };
      const changes = diffFields(before, values);
      if (Object.keys(changes).length === 0) return 0;
      await tx.update(settings).set({ ...values, updatedAt: new Date() }).where(eq(settings.id, 1));
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.settingsChanged,
        reference: "Receiver details",
        details: { changes },
      });
      return Object.keys(changes).length;
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: changed === 0 ? "No changes to save" : `Receiver details saved (${changed} ${changed === 1 ? "change" : "changes"})`,
    };
  } catch (err) {
    return toActionError(err);
  }
}
