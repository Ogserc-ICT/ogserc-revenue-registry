import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { serials } from "@/db/schema";

export type SerialKey = "receipt" | "dn" | "payer";

/**
 * Policy decision 1 (agreed): one running serial per key, never reset per year.
 * The year is still part of receipt and DN numbers. Stored as serials.year = 0.
 */
export const RUNNING_SERIAL_YEAR = 0;

export { formatDnNo, formatPayerId, formatReceiptNo, parseSerial } from "./number-format";

/**
 * Atomically takes the next serial for `key`. Call this inside the same transaction as the
 * insert that uses the number: if the insert rolls back, so does the allocation. Concurrent
 * callers serialise on the row lock taken by the upsert, so a number is never handed out twice.
 */
export async function allocateSerial(
  tx: Db,
  key: SerialKey,
  year: number = RUNNING_SERIAL_YEAR,
): Promise<number> {
  const rows = await tx
    .insert(serials)
    .values({ key, year, nextValue: 2 })
    .onConflictDoUpdate({
      target: [serials.key, serials.year],
      set: { nextValue: sql`${serials.nextValue} + 1` },
    })
    .returning({ allocated: sql<number>`${serials.nextValue} - 1` });
  const allocated = rows[0]?.allocated;
  if (allocated === undefined) throw new Error(`Could not allocate a ${key} serial`);
  return Number(allocated);
}

/** The number the next save would get. A preview only; never use it to save. */
export async function peekSerial(
  db: Db,
  key: SerialKey,
  year: number = RUNNING_SERIAL_YEAR,
): Promise<number> {
  const rows = await db
    .select({ nextValue: serials.nextValue })
    .from(serials)
    .where(and(eq(serials.key, key), eq(serials.year, year)));
  return rows[0]?.nextValue ?? 1;
}

export class SerialLowerError extends Error {
  constructor(
    public readonly current: number,
    public readonly requested: number,
  ) {
    super(`Next serial can only be raised. It is ${current}; ${requested} would reuse numbers.`);
  }
}

/**
 * Raises the next serial (Admin only). Lowering is refused because numbers are never reused.
 * Returns the previous value. The row is locked so a concurrent allocation can't slip between
 * the check and the update.
 */
export async function raiseSerial(
  tx: Db,
  key: SerialKey,
  newNext: number,
  year: number = RUNNING_SERIAL_YEAR,
): Promise<number> {
  const locked = await tx
    .select({ nextValue: serials.nextValue })
    .from(serials)
    .where(and(eq(serials.key, key), eq(serials.year, year)))
    .for("update");
  const current = locked[0]?.nextValue ?? 1;
  if (newNext <= current) throw new SerialLowerError(current, newNext);
  await tx
    .insert(serials)
    .values({ key, year, nextValue: newNext })
    .onConflictDoUpdate({ target: [serials.key, serials.year], set: { nextValue: newNext } });
  return current;
}
