import ExcelJS from "exceljs";
import { formatValorCelulaMoedaBrlExcel } from "./parseMoedaBr";

export type ExportColumnAlign = "left" | "center" | "right";

export type BuildExportSpreadsheetOptions = {
  currencyColIndexes?: number[];
  currencyNumFmt?: string;
  integerColIndexes?: number[];
  columnAligns?: ExportColumnAlign[];
  sheetName?: string;
};

export type ExportSpreadsheetRow = (string | number | null | undefined)[];

function columnWidth(headers: string[], rows: ExportSpreadsheetRow[], colIndex: number): number {
  let max = String(headers[colIndex] ?? "").length;
  for (const row of rows) {
    const value = row[colIndex];
    const len = value == null ? 0 : String(value).length;
    if (len > max) max = len;
  }
  return Math.min(Math.max(max + 2, 10), 50);
}

function resolveExportCellValue(
  cell: string | number | null | undefined,
  colIdx: number,
  currencyCols: Set<number> | null,
): string | number {
  if (cell == null || cell === "") return "";
  if (currencyCols?.has(colIdx)) {
    return formatValorCelulaMoedaBrlExcel(cell);
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return cell;
  }
  return String(cell);
}

/** Monta workbook XLSX com alinhamento por coluna e cabeçalho formatado. */
export async function buildExportSpreadsheetWorkbook(
  headers: string[],
  rows: ExportSpreadsheetRow[],
  options?: BuildExportSpreadsheetOptions,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fazenda Digital";
  wb.created = new Date();

  const ws = wb.addWorksheet(options?.sheetName ?? "Dados", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const currencyCols = options?.currencyColIndexes
    ? new Set(options.currencyColIndexes)
    : null;
  const integerCols = options?.integerColIndexes
    ? new Set(options.integerColIndexes)
    : null;

  if (currencyCols) {
    for (const colIdx of currencyCols) {
      ws.getColumn(colIdx + 1).alignment = { horizontal: "right", vertical: "middle" };
    }
  }

  const headerRow = ws.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell(cell => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF1A1A1A" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6F6" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF2D5A5A" } } };
  });

  for (const row of rows) {
    const resolvedRow = row.map((cell, colIdx) =>
      resolveExportCellValue(cell, colIdx, currencyCols),
    );
    const excelRow = ws.addRow(resolvedRow);
    excelRow.height = 18;

    resolvedRow.forEach((cell, colIdx) => {
      const excelCell = excelRow.getCell(colIdx + 1);
      const horizontal = options?.columnAligns?.[colIdx] ?? "left";
      const isObservacoes = headers[colIdx]?.toLowerCase().includes("observa");
      const isCurrency = currencyCols?.has(colIdx) ?? false;
      const isInteger = integerCols?.has(colIdx) ?? false;

      excelCell.font = { name: "Calibri", size: 10 };
      excelCell.alignment = {
        horizontal,
        vertical: "middle",
        wrapText: isObservacoes,
      };

      if (cell === "") {
        excelCell.value = "";
      } else if (typeof cell === "number" && Number.isFinite(cell)) {
        excelCell.value = cell;
        if (isInteger) excelCell.numFmt = "0";
      } else if (isCurrency) {
        excelCell.value = String(cell);
        excelCell.numFmt = "@";
      } else {
        excelCell.value = String(cell);
      }
    });
  }

  if (currencyCols) {
    headers.forEach((_, colIdx) => {
      if (!currencyCols.has(colIdx)) return;
      let max = String(headers[colIdx] ?? "").length;
      for (const row of rows) {
        const formatted = formatValorCelulaMoedaBrlExcel(row[colIdx]);
        if (formatted.length > max) max = formatted.length;
      }
      ws.getColumn(colIdx + 1).width = Math.min(Math.max(max + 2, 12), 50);
    });
  }

  headers.forEach((_, colIdx) => {
    if (currencyCols?.has(colIdx)) return;
    ws.getColumn(colIdx + 1).width = columnWidth(headers, rows, colIdx);
  });

  return wb;
}
