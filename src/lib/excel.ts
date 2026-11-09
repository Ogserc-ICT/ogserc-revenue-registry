import ExcelJS from "exceljs";

/**
 * Small .xlsx builder over exceljs (BUILD_SPEC 1: Excel export). Money goes in as a number with
 * the "#,##0.00" format so it can be added up in Excel; the source values are 2 dp decimals,
 * which a spreadsheet's doubles hold exactly at these sizes.
 */

export type ColumnType = "text" | "money" | "int" | "pct" | "date" | "datetime";

export interface SheetColumn<T> {
  header: string;
  width?: number;
  type?: ColumnType;
  value: (row: T) => string | number | Date | boolean | null | undefined;
}

const FORMATS: Partial<Record<ColumnType, string>> = {
  money: "#,##0.00",
  int: "0",
  pct: "0.00\"%\"",
  date: "dd mmm yyyy",
  datetime: "dd mmm yyyy hh:mm",
};

export function newWorkbook(title: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OGSERC Revenue Register";
  wb.title = title;
  wb.created = new Date();
  return wb;
}

/** Adds a sheet: bold frozen header row, typed and formatted cells, an optional title line above. */
export function addSheet<T>(
  wb: ExcelJS.Workbook,
  name: string,
  columns: SheetColumn<T>[],
  rows: T[],
  opts: { title?: string; boldRow?: (row: T) => boolean } = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  if (opts.title) {
    ws.addRow([opts.title]).font = { bold: true, size: 12 };
    ws.addRow([]);
  }
  const header = ws.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF4F0" } };
    cell.border = { bottom: { style: "thin" } };
  });
  ws.views = [{ state: "frozen", ySplit: header.number }];

  for (const row of rows) {
    const values = columns.map((c) => {
      const v = c.value(row);
      if (v === null || v === undefined || v === "") return null;
      if ((c.type === "money" || c.type === "int" || c.type === "pct") && typeof v === "string") return Number(v);
      if (c.type === "date" && typeof v === "string") return new Date(`${v}T00:00:00Z`);
      return v;
    });
    const added = ws.addRow(values);
    if (opts.boldRow?.(row)) added.font = { bold: true };
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.max(10, Math.min(48, c.header.length + 4));
    const fmt = c.type ? FORMATS[c.type] : undefined;
    if (fmt) col.numFmt = fmt;
    if (c.type === "money" || c.type === "int" || c.type === "pct") col.alignment = { horizontal: "right" };
  });
  return ws;
}

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
