"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type ActionResult, toActionError } from "@/lib/action-result";
import { lagosToday } from "@/lib/dates";
import { openNoticesForPayer } from "@/lib/dn-service";
import { formatAmount } from "@/lib/money";
import {
  CodeMismatchError,
  findLiveRef,
  isDuplicateRefViolation,
  recordReceipt,
  updatePendingReceipt,
} from "@/lib/receipt-service";
import { actorOf, requireAction } from "@/lib/session";
import { receiptSchema } from "@/lib/validation";

export type SaveReceiptResult =
  | ActionResult<{ id: string; receiptNo: string; print: boolean }>
  | { ok: false; error: string; mismatch: { dnNo: string; dnCode: string; receiptCode: string }; fieldErrors?: undefined };

const FIELDS = Object.keys(receiptSchema.shape) as (keyof typeof receiptSchema.shape)[];

function revalidate() {
  revalidatePath("/register");
  revalidatePath("/demand-notices");
  revalidatePath("/payers");
}

/**
 * Records a receipt, or edits a pending one when the form carries a receiptId. Revenue Officers
 * and Admins; editing is further limited to the receipt's recorder (checked in the service).
 */
export async function saveReceiptAction(_prev: SaveReceiptResult | null, formData: FormData): Promise<SaveReceiptResult> {
  try {
    const user = await requireAction("receipts.record");
    const values = receiptSchema.parse(Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")])));
    const opts = { acknowledgeCodeMismatch: formData.get("acknowledge") === "1" };
    const print = formData.get("intent") === "print";
    const receiptId = String(formData.get("receiptId") ?? "");

    if (receiptId) {
      const id = z.string().uuid().parse(receiptId);
      const r = await updatePendingReceipt(db, actorOf(user), id, values, opts);
      revalidate();
      revalidatePath(`/register/${id}`);
      return {
        ok: true,
        message: r.changed === 0 ? "No changes to save" : `Receipt ${r.receiptNo} saved`,
        data: { id, receiptNo: r.receiptNo, print },
      };
    }

    const r = await recordReceipt(db, actorOf(user), values, opts);
    revalidate();
    const over = r.overpaysNotice ? ` It is ₦${formatAmount(r.overpaysNotice)} more than the notice's balance.` : "";
    return {
      ok: true,
      message: `Receipt ${r.receiptNo} saved (${r.status}).${over}`,
      data: { id: r.id, receiptNo: r.receiptNo, print },
    };
  } catch (err) {
    if (err instanceof CodeMismatchError) {
      return {
        ok: false,
        error: `Demand notice ${err.dnNo} was issued for ${err.dnCode}, but this receipt is for ${err.receiptCode}. Check before you save.`,
        mismatch: { dnNo: err.dnNo, dnCode: err.dnCode, receiptCode: err.receiptCode },
      };
    }
    if (isDuplicateRefViolation(err)) {
      return {
        ok: false,
        error: "Receipt not saved. Fix the following:",
        fieldErrors: { paymentRef: "Another receipt with this payment reference was just saved (possible duplicate)." },
      };
    }
    return toActionError(err);
  }
}

export interface OpenNotice {
  dnNo: string;
  revenueCode: string;
  revenueHead: string;
  issueDate: string;
  outstanding: string;
}

/** A payer's open demand notices, for the receipt form's notice picker. */
export async function openNoticesAction(payerId: string): Promise<OpenNotice[]> {
  await requireAction("receipts.record");
  const id = z.string().trim().min(1).max(40).safeParse(payerId);
  if (!id.success) return [];
  const rows = await openNoticesForPayer(db, id.data, lagosToday());
  return rows.map((r) => ({
    dnNo: r.dnNo,
    revenueCode: r.revenueCode,
    revenueHead: r.revenueHead,
    issueDate: r.issueDate,
    outstanding: r.outstanding,
  }));
}

/** Live duplicate check for the payment reference (the save checks again). */
export async function checkRefAction(ref: string, excludeId?: string): Promise<{ receiptNo: string } | null> {
  await requireAction("receipts.record");
  const v = z.string().trim().min(1).max(60).safeParse(ref);
  if (!v.success) return null;
  const exclude = excludeId && z.string().uuid().safeParse(excludeId).success ? excludeId : undefined;
  const hit = await findLiveRef(db, v.data, exclude);
  return hit ? { receiptNo: hit.receiptNo } : null;
}
