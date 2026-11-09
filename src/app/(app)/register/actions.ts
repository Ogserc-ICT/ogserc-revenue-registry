"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { confirmReceipts, reverseReceipts } from "@/lib/receipt-service";
import { actorOf, requireAction } from "@/lib/session";
import { receiptIdsSchema, reverseReceiptsSchema } from "@/lib/validation";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function revalidate() {
  revalidatePath("/register");
  revalidatePath("/demand-notices");
  revalidatePath("/payers");
  // The pending badge in the top bar.
  revalidatePath("/", "layout");
}

/** Finance Officers and Admins. Only Pending receipts change; your own receipts are skipped. */
export async function confirmReceiptsAction(ids: string[]): Promise<ActionResult<{ confirmedIds: string[] }>> {
  try {
    const user = await requireAction("receipts.confirm");
    const v = receiptIdsSchema.parse({ ids });
    const r = await confirmReceipts(db, actorOf(user), v.ids);
    revalidate();
    const parts = [`${plural(r.confirmed, "receipt")} confirmed`];
    if (r.notPending) parts.push(`${r.notPending} skipped (already confirmed or reversed)`);
    if (r.ownReceipts) parts.push(`${r.ownReceipts} skipped because you recorded ${r.ownReceipts === 1 ? "it" : "them"}: someone else must confirm`);
    return { ok: true, message: parts.join(". ") + ".", data: { confirmedIds: r.confirmedIds } };
  } catch (err) {
    return toActionError(err);
  }
}

/** Finance Officers and Admins. A reason is required. */
export async function reverseReceiptsAction(ids: string[], reason: string): Promise<ActionResult<{ reversedIds: string[] }>> {
  try {
    const user = await requireAction("receipts.reverse");
    const v = reverseReceiptsSchema.parse({ ids, reason });
    const r = await reverseReceipts(db, actorOf(user), v.ids, v.reason);
    revalidate();
    return {
      ok: true,
      message: `${plural(r.reversed, "receipt")} reversed${r.skipped ? `, ${r.skipped} already reversed` : ""}.`,
      data: { reversedIds: r.reversedIds },
    };
  } catch (err) {
    return toActionError(err);
  }
}
