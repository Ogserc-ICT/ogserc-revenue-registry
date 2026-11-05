import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { lists } from "@/db/schema";
import type { ListName } from "./lists";

/** Active values of an editable list, in their admin-set order, for dropdowns. */
export const getListValues = cache(async (listName: ListName): Promise<string[]> => {
  const rows = await db
    .select({ value: lists.value })
    .from(lists)
    .where(and(eq(lists.listName, listName), eq(lists.active, true)))
    .orderBy(asc(lists.sortOrder), asc(lists.id));
  return rows.map((r) => r.value);
});

/**
 * Dropdown options for an edit form: the active values, plus the record's current value if it
 * has since been deactivated (so editing other fields doesn't silently change it).
 */
export function withCurrent(values: string[], current: string | null | undefined): string[] {
  return current && !values.includes(current) ? [...values, current] : values;
}
