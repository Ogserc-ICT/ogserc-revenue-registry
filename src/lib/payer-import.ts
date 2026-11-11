import type { Db } from "@/db";
import { UserFacingError } from "./action-result";
import type { AuditActor } from "./audit";
import { parseCsv } from "./csv";
import { createPayer, NearDuplicateError } from "./payers-service";
import { payerSchema } from "./validation";

/**
 * Bulk import of payers from CSV with a dry-run preview (BUILD_SPEC 6 improvement).
 * The preview runs the real import inside a transaction and rolls it back, so it reports exactly
 * what the import would do: validation errors, exact and near duplicates (against existing
 * payers and earlier rows in the same file) and the payer IDs that would be assigned. The real
 * import is one transaction: all of it or none of it.
 */

export const MAX_IMPORT_ROWS = 2000;

/** CSV columns, in template order; the first is required. Headers are matched loosely. */
export const IMPORT_COLUMNS = [
  ["name", "Payer name (required)"],
  ["category", "Payer category"],
  ["licenceNo", "Licence number"],
  ["licenceStatus", "Licence status"],
  ["capacityMw", "Capacity (MW, required; 0 if none)"],
  ["revenueBaseNgn", "Revenue base (NGN)"],
  ["lga", "LGA"],
  ["address", "Address (required)"],
  ["contactPerson", "Contact person"],
  ["phone", "Phone"],
  ["email", "Email"],
  ["dateRegistered", "Date registered (YYYY-MM-DD)"],
  ["sch3Category", "Schedule 3 category (A-K)"],
  ["expectedRegMonth", "Expected registration month (1-12 or Even)"],
  ["notes", "Notes"],
] as const;

type Field = (typeof IMPORT_COLUMNS)[number][0];

const squash = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const HEADER_MAP = new Map<string, Field>(
  IMPORT_COLUMNS.flatMap(([key, label]) => [
    [squash(key), key],
    [squash(label), key],
  ]),
);
HEADER_MAP.set("payer", "name");
HEADER_MAP.set("sch3", "sch3Category");
HEADER_MAP.set("schedule3", "sch3Category");
HEADER_MAP.set("capacity", "capacityMw");
HEADER_MAP.set("revenuebase", "revenueBaseNgn");

export type ImportOutcome = "add" | "near-duplicate" | "skip";

export interface ImportRowResult {
  /** Line in the file (the header is line 1). */
  line: number;
  name: string;
  outcome: ImportOutcome;
  /** The ID it gets (or would get). */
  payerId?: string;
  messages: string[];
}

export interface ImportReport {
  rows: ImportRowResult[];
  added: number;
  nearDuplicates: number;
  skipped: number;
  unknownHeaders: string[];
}

class DryRunRollback extends Error {}

/** Reads the CSV and maps its headers. Throws a UserFacingError for a file that can't be used. */
export function readImportCsv(text: string): { records: { line: number; values: Partial<Record<Field, string>> }[]; unknownHeaders: string[] } {
  const table = parseCsv(text);
  if (table.length < 2) throw new UserFacingError("The file has no payer rows. Use the template and add one payer per row.");
  const [header, ...body] = table;
  const fields = header!.map((h) => HEADER_MAP.get(squash(h)));
  if (!fields.includes("name")) throw new UserFacingError("The file needs a 'Payer name' column. Download the template to see the columns.");
  if (body.length > MAX_IMPORT_ROWS) throw new UserFacingError(`Import at most ${MAX_IMPORT_ROWS} payers at a time.`);
  const unknownHeaders = header!.filter((h, i) => !fields[i] && h.trim() !== "");
  const records = body.map((cells, i) => {
    const values: Partial<Record<Field, string>> = {};
    fields.forEach((f, c) => {
      if (f) values[f] = (cells[c] ?? "").trim();
    });
    return { line: i + 2, values };
  });
  return { records, unknownHeaders };
}

export async function importPayers(
  db: Db,
  actor: AuditActor,
  csvText: string,
  opts: { dryRun: boolean; includeNearDuplicates: boolean },
): Promise<ImportReport> {
  const { records, unknownHeaders } = readImportCsv(csvText);
  const results: ImportRowResult[] = [];

  const run = async (tx: Db) => {
    for (const { line, values } of records) {
      const name = values.name ?? "";
      const parsed = payerSchema.safeParse(Object.fromEntries(IMPORT_COLUMNS.map(([k]) => [k, values[k] ?? ""])));
      if (!parsed.success) {
        results.push({ line, name, outcome: "skip", messages: [...new Set(parsed.error.issues.map((i) => i.message))] });
        continue;
      }
      // createPayer opens its own transaction, which is a savepoint inside the import's: a bad
      // row is undone on its own without spoiling the rest.
      const attempt = (acknowledge: boolean) =>
        createPayer(tx, actor, parsed.data, { acknowledgeNearDuplicates: acknowledge, source: "CSV import" });
      try {
        const created = await attempt(false);
        results.push({ line, name, outcome: "add", payerId: created.payerId, messages: [] });
      } catch (err) {
        if (err instanceof NearDuplicateError) {
          const similar = `Looks like ${err.matches.map((m) => `${m.payerId} ${m.name}`).join("; ")}`;
          if (opts.includeNearDuplicates) {
            const created = await attempt(true);
            results.push({ line, name, outcome: "near-duplicate", payerId: created.payerId, messages: [similar] });
          } else {
            results.push({ line, name, outcome: "near-duplicate", messages: [similar, "Not imported: tick the box to import possible duplicates."] });
          }
        } else if (err instanceof UserFacingError) {
          results.push({ line, name, outcome: "skip", messages: Object.values(err.fieldErrors ?? {}).concat(err.fieldErrors ? [] : [err.message]) });
        } else throw err;
      }
    }
    if (opts.dryRun) throw new DryRunRollback();
  };

  try {
    await db.transaction(run);
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  const imported = (r: ImportRowResult) => r.payerId !== undefined;
  return {
    rows: results,
    added: results.filter(imported).length,
    nearDuplicates: results.filter((r) => r.outcome === "near-duplicate").length,
    skipped: results.filter((r) => !imported(r)).length,
    unknownHeaders,
  };
}
