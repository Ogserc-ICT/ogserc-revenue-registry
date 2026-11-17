import ExcelJS from "exceljs";
import { type Cell, HandoverFileError, type HandoverSheets } from "./handover";

const MAX_ROWS = 20_000;
const MAX_COLUMNS = 100;

/** Plain value of an ExcelJS cell: rich text and hyperlinks become text, formulas their result. */
function plain(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("formula" in v || "sharedFormula" in v) return plain((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("text" in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return null;
}

function sheetCells(ws: ExcelJS.Worksheet): Cell[][] {
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: Cell[] = [];
    for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value));
    rows[n - 1] = cells;
  });
  return Array.from(rows, (r) => r ?? []);
}

/**
 * Reads a handover workbook (contract §4): the Payments and Batch sheets as plain cell values.
 * A CSV copy is refused: it has no Batch sheet, so totals and checksum can't be checked (§5 step 1).
 */
export async function readHandoverWorkbook(fileName: string, bytes: Uint8Array): Promise<HandoverSheets> {
  if (/\.csv$/i.test(fileName)) {
    throw new HandoverFileError("Upload the .xlsx file, not the CSV copy.", [
      "The CSV copy has no Batch sheet, so its totals and checksum can't be checked. Ask R&E for the .xlsx file of the same batch.",
    ]);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new HandoverFileError("This file isn't an Excel workbook (.xlsx). Upload the handover file exactly as R&E gave it.");
  }
  const payments = wb.getWorksheet("Payments");
  const batch = wb.getWorksheet("Batch");
  const missing = [!payments && '"Payments"', !batch && '"Batch"'].filter(Boolean);
  if (missing.length) {
    throw new HandoverFileError("This isn't a handover file the Revenue Register can read.", [
      `The workbook has no ${missing.join(" or ")} sheet.`,
    ]);
  }
  // A batch is a few hundred lines at most. Refuse an oversized sheet before reading every cell.
  for (const ws of [payments!, batch!]) {
    if (ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLUMNS) {
      throw new HandoverFileError("This file is far larger than a handover batch, so it wasn't read.", [
        `The ${ws.name} sheet has ${ws.rowCount} rows and ${ws.columnCount} columns; a batch has at most ${MAX_ROWS} rows and ${MAX_COLUMNS} columns.`,
      ]);
    }
  }
  return { payments: sheetCells(payments!), batch: sheetCells(batch!) };
}
