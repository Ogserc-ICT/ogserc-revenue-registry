"use server";

import { and, asc, desc, eq, gt, lt, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { lists, settings } from "@/db/schema";
import { type ActionResult, toActionError, UserFacingError } from "@/lib/action-result";
import { AUDIT_ACTIONS, diffFields, writeAudit } from "@/lib/audit";
import { LIST_NAMES } from "@/lib/lists";
import { raiseSerial, SerialLowerError } from "@/lib/numbering";
import { actorOf, requireAction } from "@/lib/session";
import {
  listMoveSchema,
  listToggleSchema,
  listValueSchema,
  raiseSerialSchema,
  settingsSchema,
} from "@/lib/validation";

const PATH = "/admin/settings";

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("settings.manage");
    const values = settingsSchema.parse({
      financialYear: formData.get("financialYear"),
      receiptPrefix: formData.get("receiptPrefix"),
      dnPrefix: formData.get("dnPrefix"),
      payerPrefix: formData.get("payerPrefix"),
      defaultTermsDays: formData.get("defaultTermsDays"),
      asAtDate: formData.get("asAtDate") ?? "",
      autoConfirm: formData.get("autoConfirm") === "on",
      usdNgnRate: formData.get("usdNgnRate"),
      budgetVersionLabel: formData.get("budgetVersionLabel") ?? "",
      budgetToDateRule: formData.get("budgetToDateRule"),
    });

    const changed = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
      if (!current) throw new UserFacingError("Settings are missing. Run the seed script first.");
      const changes = diffFields(current, values);
      if (Object.keys(changes).length === 0) return 0;
      await tx.update(settings).set({ ...values, updatedAt: new Date() }).where(eq(settings.id, 1));
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.settingsChanged,
        reference: "Settings",
        details: { changes },
      });
      return Object.keys(changes).length;
    });

    revalidatePath("/", "layout");
    return {
      ok: true,
      message: changed === 0 ? "No changes to save" : `Settings saved (${changed} ${changed === 1 ? "change" : "changes"})`,
    };
  } catch (err) {
    return toActionError(err);
  }
}

const SERIAL_LABELS = { receipt: "Receipt", dn: "Demand notice", payer: "Payer ID" } as const;

export async function raiseSerialAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("serials.manage");
    const { key, nextValue } = raiseSerialSchema.parse({
      key: formData.get("key"),
      nextValue: formData.get("nextValue"),
    });
    await db.transaction(async (tx) => {
      const previous = await raiseSerial(tx, key, nextValue);
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.serialRaised,
        reference: `${SERIAL_LABELS[key]} serial`,
        details: { changes: { nextValue: { old: previous, new: nextValue } }, skipped: nextValue - previous },
      });
    });
    revalidatePath(PATH);
    return { ok: true, message: `${SERIAL_LABELS[key]} serial raised to ${nextValue}` };
  } catch (err) {
    if (err instanceof SerialLowerError) {
      return {
        ok: false,
        error: "Numbers can only move forward.",
        fieldErrors: { nextValue: `Enter a number above ${err.current}. Lower numbers would be reused.` },
      };
    }
    return toActionError(err);
  }
}

export async function addListValueAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireAction("settings.manage");
    const { listName, value } = listValueSchema.parse({
      listName: formData.get("listName"),
      value: formData.get("value"),
    });
    if (!LIST_NAMES.includes(listName)) throw new UserFacingError("That list can't be edited here.");

    await db.transaction(async (tx) => {
      const dup = await tx
        .select({ id: lists.id, active: lists.active })
        .from(lists)
        .where(and(eq(lists.listName, listName), sql`lower(${lists.value}) = lower(${value})`));
      if (dup[0]) {
        throw new UserFacingError("Check the highlighted field.", {
          value: dup[0].active
            ? `"${value}" is already in this list.`
            : `"${value}" is already in this list but inactive. Reactivate it instead.`,
        });
      }
      const [top] = await tx
        .select({ m: max(lists.sortOrder) })
        .from(lists)
        .where(eq(lists.listName, listName));
      const [row] = await tx
        .insert(lists)
        .values({ listName, value, sortOrder: (top?.m ?? 0) + 10 })
        .returning({ id: lists.id });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.listValueAdded,
        reference: listName,
        details: { id: row?.id, value },
      });
    });
    revalidatePath(PATH);
    return { ok: true, message: `"${value}" added to ${listName}` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function toggleListValueAction(input: z.input<typeof listToggleSchema>): Promise<ActionResult> {
  try {
    const user = await requireAction("settings.manage");
    const { id, active } = listToggleSchema.parse(input);
    const value = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(lists).where(eq(lists.id, id)).for("update");
      if (!row) throw new UserFacingError("That value no longer exists. Refresh the page.");
      if (row.active === active) return row.value;
      await tx.update(lists).set({ active }).where(eq(lists.id, id));
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.listValueChanged,
        reference: row.listName,
        details: { id, value: row.value, changes: { active: { old: row.active, new: active } } },
      });
      return row.value;
    });
    revalidatePath(PATH);
    return { ok: true, message: `"${value}" ${active ? "reactivated" : "deactivated"}` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function moveListValueAction(input: z.input<typeof listMoveSchema>): Promise<ActionResult> {
  try {
    const user = await requireAction("settings.manage");
    const { id, direction } = listMoveSchema.parse(input);
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(lists).where(eq(lists.id, id)).for("update");
      if (!row) throw new UserFacingError("That value no longer exists. Refresh the page.");
      const [neighbour] = await tx
        .select()
        .from(lists)
        .where(
          and(
            eq(lists.listName, row.listName),
            direction === "up" ? lt(lists.sortOrder, row.sortOrder) : gt(lists.sortOrder, row.sortOrder),
          ),
        )
        .orderBy(direction === "up" ? desc(lists.sortOrder) : asc(lists.sortOrder))
        .limit(1)
        .for("update");
      if (!neighbour) return;
      await tx.update(lists).set({ sortOrder: neighbour.sortOrder }).where(eq(lists.id, row.id));
      await tx.update(lists).set({ sortOrder: row.sortOrder }).where(eq(lists.id, neighbour.id));
      await writeAudit(tx, {
        actor: actorOf(user),
        action: AUDIT_ACTIONS.listReordered,
        reference: row.listName,
        details: { value: row.value, direction, swappedWith: neighbour.value },
      });
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return toActionError(err);
  }
}
