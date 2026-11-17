import ExcelJS from "exceljs";
import { type Cell, HandoverFileError, type HandoverSheets } from "./handover";

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
  return { payments: sheetCells(payments!), batch: sheetCells(batch!) };
}
