import ExcelJS from "exceljs";
import { formatValorCelulaMoedaBrlExcel, parseExportInteger } from "./parseMoedaBr";
import {
  exportDataColRange,
  patchXlsxIgnoreNumberStoredAsText,
} from "./patchXlsxIgnoredErrors";

export type ExportColumnAlign = "left" | "center" | "right";

export type BuildExportSpreadsheetOptions = {
  currencyColIndexes?: number[];
  currencyNumFmt?: string;
  integerColIndexes?: number[];
  /** Colunas texto (@) — ex.: brinco/RFID com zero à esquerda. */
  textColIndexes?: number[];
  /** numFmt por coluna (ex.: { 7: "0.0" } para peso). */
  columnNumFmts?: Partial<Record<number, string>>;
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
  const textCols = options?.textColIndexes ? new Set(options.textColIndexes) : null;
  const columnNumFmts = options?.columnNumFmts ?? null;

  if (currencyCols) {
    for (const colIdx of currencyCols) {
      const horizontal = options?.columnAligns?.[colIdx] ?? "right";
      ws.getColumn(colIdx + 1).alignment = { horizontal, vertical: "middle" };
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
    const excelRow = ws.addRow(new Array(headers.length).fill(null));
    excelRow.height = 18;

    row.forEach((rawCell, colIdx) => {
      const excelCell = excelRow.getCell(colIdx + 1);
      const horizontal = options?.columnAligns?.[colIdx] ?? "left";
      const isObservacoes = headers[colIdx]?.toLowerCase().includes("observa");
      const isCurrency = currencyCols?.has(colIdx) ?? false;
      const isInteger = integerCols?.has(colIdx) ?? false;
      const isText = textCols?.has(colIdx) ?? false;
      const colNumFmt = columnNumFmts?.[colIdx];

      excelCell.font = { name: "Calibri", size: 10 };
      excelCell.alignment = {
        horizontal,
        vertical: "middle",
        wrapText: isObservacoes,
      };

      if (rawCell == null || rawCell === "") {
        excelCell.value = "";
      } else if (isCurrency) {
        excelCell.value = formatValorCelulaMoedaBrlExcel(rawCell);
        excelCell.numFmt = "@";
      } else if (isInteger) {
        const n = parseExportInteger(rawCell);
        if (n != null) {
          excelCell.value = n;
          excelCell.numFmt = colNumFmt ?? "0";
        } else {
          excelCell.value = String(rawCell);
        }
      } else if (typeof rawCell === "number" && Number.isFinite(rawCell)) {
        excelCell.value = rawCell;
        if (colNumFmt) {
          excelCell.numFmt = colNumFmt;
        }
      } else if (isText) {
        excelCell.value = String(rawCell);
        excelCell.numFmt = "@";
      } else {
        excelCell.value = String(rawCell);
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

/** Gera buffer XLSX pronto para download, com ignoredErrors em colunas texto. */
export async function buildExportSpreadsheetBuffer(
  headers: string[],
  rows: ExportSpreadsheetRow[],
  options?: BuildExportSpreadsheetOptions,
): Promise<ArrayBuffer> {
  const wb = await buildExportSpreadsheetWorkbook(headers, rows, options);
  let buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;

  if (options?.textColIndexes?.length && rows.length > 0) {
    const sqrefs = options.textColIndexes.map(colIdx => exportDataColRange(colIdx, rows.length));
    buffer = await patchXlsxIgnoreNumberStoredAsText(buffer, sqrefs);
  }

  if (options?.currencyColIndexes?.length && rows.length > 0) {
    const sqrefs = options.currencyColIndexes.map(colIdx => exportDataColRange(colIdx, rows.length));
    buffer = await patchXlsxIgnoreNumberStoredAsText(buffer, sqrefs);
  }

  return buffer;
}
