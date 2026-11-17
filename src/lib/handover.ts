import { createHash } from "node:crypto";
import Decimal from "decimal.js";

/**
 * R&E payment handover, format version 1 (REVENUE-REGISTRY-CONTRACT.md §4 and §5 steps 1-3).
 * Pure functions: they read the two sheets as plain cell values and check the file on its own.
 * The database checks (steps 4-8) are in handover-service.ts.
 *
 * Identifiers are opaque text: nothing is parsed out of them except the batch sequence, which is
 * used only for the "earlier batch not imported" warning the contract recommends.
 */

export const HANDOVER_FORMAT = "OGSERC payment handover";
export const HANDOVER_FORMAT_VERSION = 1;

/** A cell as read from the workbook: text, number, or something the format doesn't allow. */
export type Cell = string | number | boolean | Date | null | undefined;

export interface HandoverSheets {
  /** Row 1 is the header. */
  payments: Cell[][];
  /** Two columns, Field and Value. */
  batch: Cell[][];
}

/** The Payments sheet columns, in contract order, mapped to field names. */
export const PAYMENT_COLUMNS = [
  ["Line ID", "lineId"],
  ["Line type", "lineType"],
  ["PAY no.", "payNo"],
  ["Batch no.", "batchNo"],
  ["Date received", "dateReceived"],
  ["Date confirmed", "dateConfirmed"],
  ["Amount (NGN)", "amountNgn"],
  ["Amount (kobo)", "amountKobo"],
  ["Purpose", "purpose"],
  ["Revenue code", "revenueCode"],
  ["Channel", "channel"],
  ["RRR", "rrr"],
  ["Payer", "payer"],
  ["Paid for", "paidFor"],
  ["Filing type", "filingType"],
  ["ACK no.", "ackNo"],
  ["Registration no. / OUN", "registrationNo"],
  ["Category", "category"],
  ["LGA", "lga"],
  ["Recorded by", "recordedBy"],
  ["Confirmed by", "confirmedBy"],
  ["Verified with bank", "verifiedWithBank"],
  ["Reversed on", "reversedOn"],
  ["Reversed by", "reversedBy"],
  ["Reversal reason", "reversalReason"],
] as const;

type ColumnKey = (typeof PAYMENT_COLUMNS)[number][1];

export interface HandoverLine {
  lineId: string;
  lineType: "Payment" | "Reversal";
  payNo: string;
  batchNo: string;
  dateReceived: string;
  dateConfirmed: string;
  /** Exact integer kobo, as text (e.g. "-15000000"). The authoritative amount. */
  amountKobo: string;
  /** Naira with 2 dp, = kobo / 100 (e.g. "-150000.00"). */
  amount: string;
  purpose: string | null;
  revenueCode: string | null;
  channel: string | null;
  rrr: string | null;
  payer: string;
  paidFor: string | null;
  filingType: string | null;
  ackNo: string | null;
  registrationNo: string | null;
  category: string | null;
  lga: string | null;
  recordedBy: string | null;
  confirmedBy: string | null;
  verifiedWithBank: string | null;
  reversedOn: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
}

export interface HandoverBatch {
  batchNo: string;
  formatVersion: number;
  preparedAt: string | null;
  preparedBy: string | null;
  confirmedFrom: string | null;
  confirmedTo: string | null;
  paymentLines: number;
  reversalLines: number;
  /** Naira, 2 dp. */
  paymentTotal: string;
  reversalTotal: string;
  netTotal: string;
  checksum: string;
}

export interface ParsedHandover {
  batch: HandoverBatch;
  lines: HandoverLine[];
  /** Columns in the file that format version 1 doesn't define; ignored (contract §7). */
  ignoredColumns: string[];
}

/** The file can't be imported. `problems` lists each reason, for the person importing. */
export class HandoverFileError extends Error {
  constructor(
    message: string,
    public readonly problems: string[] = [],
  ) {
    super(message);
  }
}

// ---------- Cell readers ----------

const isBlank = (v: Cell) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Text cell, trimmed; null when blank. Numbers are accepted as their plain text (e.g. an RRR). */
function text(v: Cell): string | null {
  if (isBlank(v)) return null;
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null; // a Date: rejected by the caller where a date is expected
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** An integer from a number cell or digit text; null otherwise. Kept as text so nothing rounds. */
function integerText(v: Cell): string | null {
  if (typeof v === "number") return Number.isSafeInteger(v) ? String(v) : null;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return v.trim().replace(/^(-?)0+(?=\d)/, "$1");
  return null;
}

/** A decimal from a number cell or numeric text; null otherwise. */
function decimal(v: Cell): Decimal | null {
  if (typeof v === "number") return Number.isFinite(v) ? new Decimal(String(v)) : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return new Decimal(v.trim());
  return null;
}

const koboToNaira = (kobo: string) => new Decimal(kobo).div(100).toFixed(2);

/** Contract §4.3: SHA-256 of "{Line ID}|{Amount (kobo)}" lines joined by \n, lowercase hex. */
export function handoverChecksum(lines: { lineId: string; amountKobo: string }[]): string {
  return createHash("sha256")
    .update(lines.map((l) => `${l.lineId}|${l.amountKobo}`).join("\n"), "utf8")
    .digest("hex");
}

// ---------- Batch sheet ----------

function readBatchSheet(rows: Cell[][], problems: string[]) {
  const fields = new Map<string, Cell>();
  for (const [i, row] of rows.entries()) {
    const name = text(row[0] ?? null);
    if (i === 0 && name === "Field") continue;
    if (name) fields.set(name, row[1] ?? null);
  }
  const need = (name: string) => {
    if (!fields.has(name)) problems.push(`The Batch sheet has no "${name}" row.`);
    return fields.get(name) ?? null;
  };
  const int = (name: string) => {
    const raw = need(name);
    const v = integerText(raw);
    if (fields.has(name) && v === null) problems.push(`Batch sheet: "${name}" must be a whole number.`);
    return v;
  };
  const optionalDate = (name: string) => {
    const raw = fields.get(name);
    if (raw instanceof Date) problems.push(`Batch sheet: "${name}" must be text in the form YYYY-MM-DD, not an Excel date.`);
    const v = text(raw ?? null);
    if (v !== null && !isRealDate(v)) problems.push(`Batch sheet: "${name}" must be a date in the form YYYY-MM-DD.`);
    return v;
  };

  const version = int("Format version");
  if (version !== null && Number(version) !== HANDOVER_FORMAT_VERSION) {
    problems.push(`This is format version ${version}. The Revenue Register reads format version ${HANDOVER_FORMAT_VERSION} only.`);
  }
  const batchNo = text(need("Batch no."));
  if (fields.has("Batch no.") && !batchNo) problems.push('Batch sheet: "Batch no." is blank.');
  const checksum = text(need("Checksum (SHA-256)"))?.toLowerCase() ?? null;
  if (checksum !== null && !/^[0-9a-f]{64}$/.test(checksum)) problems.push("Batch sheet: the checksum must be 64 hexadecimal characters.");

  return {
    format: text(fields.get("Format") ?? null),
    formatVersion: version,
    batchNo,
    preparedAt: text(fields.get("Prepared at") ?? null),
    preparedBy: text(fields.get("Prepared by") ?? null),
    confirmedFrom: optionalDate("Confirmed from"),
    confirmedTo: optionalDate("Confirmed to"),
    paymentLines: int("Payment lines"),
    reversalLines: int("Reversal lines"),
    paymentTotalKobo: int("Payment total (kobo)"),
    reversalTotalKobo: int("Reversal total (kobo)"),
    netTotalKobo: int("Net total (kobo)"),
    checksum,
  };
}

// ---------- Payments sheet ----------

function readPaymentsSheet(rows: Cell[][], problems: string[]) {
  const header = (rows[0] ?? []).map((h) => text(h) ?? "");
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (h && !index.has(h)) index.set(h, i);
  });
  const missing = PAYMENT_COLUMNS.filter(([h]) => !index.has(h)).map(([h]) => h);
  if (missing.length) problems.push(`The Payments sheet is missing ${missing.length === 1 ? "the column" : "the columns"} ${missing.map((m) => `"${m}"`).join(", ")}.`);
  const known = new Set<string>(PAYMENT_COLUMNS.map(([h]) => h));
  const ignoredColumns = header.filter((h) => h && !known.has(h));

  const records = rows
    .slice(1)
    .map((row, i) => ({ row: i + 2, cells: row }))
    .filter(({ cells }) => cells.some((c) => !isBlank(c)))
    .map(({ row, cells }) => {
      const get = {} as Record<ColumnKey, Cell>;
      for (const [h, key] of PAYMENT_COLUMNS) get[key] = index.has(h) ? cells[index.get(h)!] : null;
      return { row, get };
    });
  return { records, ignoredColumns, headerOk: missing.length === 0 };
}

/** One row of the Payments sheet: §5 step 3. Adds problems to `lineProblems`. */
function checkLine(row: number, get: Record<ColumnKey, Cell>, batchNo: string | null, lineProblems: string[]): HandoverLine | null {
  const before = lineProblems.length;
  const bad = (msg: string) => lineProblems.push(`Row ${row}: ${msg}`);

  const lineId = text(get.lineId);
  const lineType = text(get.lineType);
  const payNo = text(get.payNo);
  const lineBatch = text(get.batchNo);
  if (!lineId) bad("Line ID is blank.");
  if (lineType !== "Payment" && lineType !== "Reversal") bad(`Line type must be "Payment" or "Reversal", not "${lineType ?? ""}".`);
  if (!payNo) bad("PAY no. is blank.");
  if (lineId && payNo && (lineType === "Payment" || lineType === "Reversal")) {
    const expected = `${payNo}:${lineType === "Payment" ? "P" : "R"}`;
    if (lineId !== expected) bad(`Line ID ${lineId} doesn't match PAY no. and line type (expected ${expected}).`);
  }
  if (!lineBatch) bad("Batch no. is blank.");
  else if (batchNo && lineBatch !== batchNo) bad(`Batch no. ${lineBatch} isn't this batch (${batchNo}).`);

  const date = (key: ColumnKey, label: string, required: boolean) => {
    const raw = get[key];
    // A Date, or a bare number (an Excel date serial without date formatting): dates must be text.
    if (raw instanceof Date || typeof raw === "number") {
      bad(`${label} must be text in the form YYYY-MM-DD, not an Excel date.`);
      return null;
    }
    const v = text(raw);
    if (!v) {
      if (required) bad(`${label} is blank.`);
      return null;
    }
    if (!isRealDate(v)) bad(`${label} "${v}" isn't a date in the form YYYY-MM-DD.`);
    return v;
  };
  const dateReceived = date("dateReceived", "Date received", true);
  const dateConfirmed = date("dateConfirmed", "Date confirmed", true);
  const reversedOn = date("reversedOn", "Reversed on", lineType === "Reversal");

  const kobo = integerText(get.amountKobo);
  const naira = decimal(get.amountNgn);
  if (kobo === null) bad("Amount (kobo) must be a whole number.");
  if (naira === null) bad("Amount (NGN) must be a number.");
  if (kobo !== null && naira !== null && !naira.times(100).eq(new Decimal(kobo))) {
    bad(`Amount (NGN) ${naira.toFixed(2)} × 100 isn't Amount (kobo) ${kobo}.`);
  }
  if (kobo !== null) {
    const k = new Decimal(kobo);
    if (lineType === "Payment" && !k.gt(0)) bad("A Payment line's amount must be above zero.");
    if (lineType === "Reversal" && !k.lt(0)) bad("A Reversal line's amount must be below zero.");
  }

  const payer = text(get.payer);
  if (!payer) bad("Payer is blank.");

  if (lineProblems.length > before) return null;
  return {
    lineId: lineId!,
    lineType: lineType as "Payment" | "Reversal",
    payNo: payNo!,
    batchNo: lineBatch!,
    dateReceived: dateReceived!,
    dateConfirmed: dateConfirmed!,
    amountKobo: kobo!,
    amount: koboToNaira(kobo!),
    purpose: text(get.purpose),
    revenueCode: text(get.revenueCode),
    channel: text(get.channel),
    rrr: text(get.rrr),
    payer: payer!,
    paidFor: text(get.paidFor),
    filingType: text(get.filingType),
    ackNo: text(get.ackNo),
    registrationNo: text(get.registrationNo),
    category: text(get.category),
    lga: text(get.lga),
    recordedBy: text(get.recordedBy),
    confirmedBy: text(get.confirmedBy),
    verifiedWithBank: text(get.verifiedWithBank),
    reversedOn,
    reversedBy: text(get.reversedBy),
    reversalReason: text(get.reversalReason),
  };
}

const MAX_PROBLEMS_SHOWN = 20;

/**
 * Contract §5 steps 1-3: format, totals and checksum, then each line. Throws HandoverFileError
 * listing every problem found; the file is refused as a whole.
 */
export function parseHandover(sheets: HandoverSheets): ParsedHandover {
  const problems: string[] = [];
  const b = readBatchSheet(sheets.batch, problems);
  const { records, ignoredColumns, headerOk } = readPaymentsSheet(sheets.payments, problems);
  if (problems.length || !headerOk) {
    throw new HandoverFileError("This isn't a handover file the Revenue Register can read.", problems);
  }
  if (records.length === 0) throw new HandoverFileError("The Payments sheet has no lines.", []);

  const lineProblems: string[] = [];
  const lines: HandoverLine[] = [];
  const seen = new Set<string>();
  for (const { row, get } of records) {
    const line = checkLine(row, get, b.batchNo, lineProblems);
    if (!line) continue;
    if (seen.has(line.lineId)) lineProblems.push(`Row ${row}: Line ID ${line.lineId} appears more than once in the file.`);
    seen.add(line.lineId);
    lines.push(line);
  }
  if (lineProblems.length) {
    const shown = lineProblems.slice(0, MAX_PROBLEMS_SHOWN);
    if (lineProblems.length > shown.length) shown.push(`…and ${lineProblems.length - shown.length} more.`);
    throw new HandoverFileError("Some lines break the handover rules, so the file was refused.", shown);
  }

  // Step 2: recount and re-add, recompute the checksum.
  const payments = lines.filter((l) => l.lineType === "Payment");
  const reversals = lines.filter((l) => l.lineType === "Reversal");
  const sum = (ls: HandoverLine[]) => ls.reduce((a, l) => a.plus(l.amountKobo), new Decimal(0));
  const paymentKobo = sum(payments);
  const reversalKobo = sum(reversals);
  const netKobo = paymentKobo.plus(reversalKobo);
  const checksum = handoverChecksum(lines);
  const mismatch: string[] = [];
  const eq = (label: string, file: string | null, actual: Decimal | number) => {
    if (file === null || !new Decimal(file).eq(actual)) mismatch.push(`${label}: the Batch sheet says ${file ?? "(blank)"}, the lines add up to ${actual.toString()}.`);
  };
  eq("Payment lines", b.paymentLines, payments.length);
  eq("Reversal lines", b.reversalLines, reversals.length);
  eq("Payment total (kobo)", b.paymentTotalKobo, paymentKobo);
  eq("Reversal total (kobo)", b.reversalTotalKobo, reversalKobo);
  eq("Net total (kobo)", b.netTotalKobo, netKobo);
  if (b.checksum !== checksum) mismatch.push("The checksum doesn't match the lines.");
  if (mismatch.length) throw new HandoverFileError("The file is incomplete or has been altered, so it was refused.", mismatch);

  return {
    batch: {
      batchNo: b.batchNo!,
      formatVersion: Number(b.formatVersion),
      preparedAt: b.preparedAt,
      preparedBy: b.preparedBy,
      confirmedFrom: b.confirmedFrom,
      confirmedTo: b.confirmedTo,
      paymentLines: payments.length,
      reversalLines: reversals.length,
      paymentTotal: koboToNaira(paymentKobo.toFixed(0)),
      reversalTotal: koboToNaira(reversalKobo.toFixed(0)),
      netTotal: koboToNaira(netKobo.toFixed(0)),
      checksum,
    },
    lines,
    ignoredColumns,
  };
}

/**
 * The batch number before this one in the same year, for the "earlier batch not imported"
 * warning (contract §5, recommended). Null for the first batch of a year or an unexpected format.
 */
export function previousBatchNo(batchNo: string): string | null {
  const m = /^(.*\/)(\d+)$/.exec(batchNo);
  if (!m) return null;
  const n = Number(m[2]);
  if (n <= 1) return null;
  return `${m[1]}${String(n - 1).padStart(m[2]!.length, "0")}`;
}
