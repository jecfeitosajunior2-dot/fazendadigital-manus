import ExcelJS from "exceljs";
import { formatValorCelulaMoedaBrlExcel, parseExportInteger } from "./parseMoedaBr";
import {
  exportDataColRange,
  patchXlsxIgnoreNumberStoredAsText,
} from "./patchXlsxIgnoredErrors";

export type ExportColumnAlign = "left" | "center" | "right";

export type ExportReportInfoLine = {
  label: string;
  value: string;
};

export type GroupedTableHeaderCell = {
  text: string;
  colSpan?: number;
  rowSpan?: number;
};

export type GroupedTableHeader = {
  topRow: GroupedTableHeaderCell[];
  bottomRow: string[];
};

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
  /** Título do relatório (mesclado sobre a largura da tabela). */
  reportTitle?: string;
  /** Linhas compactas de contexto (texto corrido, mesclado), após o título. */
  reportSubtitles?: string[];
  /** Linhas de contexto label/valor antes da tabela (legado). */
  reportInfo?: ExportReportInfoLine[];
  /** Linha em branco após o meta (padrão: true). */
  blankAfterMeta?: boolean;
  /** Filtro automático na tabela (padrão: true). */
  autoFilter?: boolean;
  /** Cabeçalho discreto: negrito + bordas leves, sem preenchimento colorido. */
  plainHeader?: boolean;
  /** Permite exportar com 0 linhas de dados (mantém cabeçalho/tabela vazia). */
  allowEmpty?: boolean;
  /** Cabeçalho em duas linhas (agrupado), como o quadro de Gerenciamento de Lotes. */
  groupedTableHeader?: GroupedTableHeader;
};

export type ExportSpreadsheetRow = (string | number | null | undefined)[];

const FONT = "Calibri";
const BORDER_COLOR = "FFD1D5DB";
const HEADER_FILL = "FFF4F6F6";
const HEADER_BORDER = "FF2D5A5A";
/** Cinza claro neutro para cabeçalho operacional (#F2F2F2). */
const PLAIN_HEADER_FILL = "FFF2F2F2";
const PLAIN_HEADER_BOTTOM = "FFD0D0D0";

function columnWidth(headers: string[], rows: ExportSpreadsheetRow[], colIndex: number): number {
  let max = String(headers[colIndex] ?? "").length;
  for (const row of rows) {
    const value = row[colIndex];
    const len = value == null ? 0 : String(value).length;
    if (len > max) max = len;
  }
  return Math.min(Math.max(max + 2, 10), 50);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function applyHeaderCellStyle(
  cell: ExcelJS.Cell,
  plainHeader: boolean,
  horizontal: "left" | "center" | "right" = "center",
) {
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FF1A1A1A" } };
  cell.alignment = { horizontal, vertical: "middle" };
  if (plainHeader) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PLAIN_HEADER_FILL } };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: PLAIN_HEADER_BOTTOM } },
    };
  } else {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = {
      ...thinBorder(),
      bottom: { style: "thin", color: { argb: HEADER_BORDER } },
    };
  }
}

function addGroupedTableHeader(
  ws: ExcelJS.Worksheet,
  grouped: GroupedTableHeader,
  plainHeader: boolean,
): number {
  const totalCols = grouped.topRow.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0);
  const topValues = Array.from({ length: totalCols }, () => "");

  const groupRow = ws.addRow(topValues);
  groupRow.height = 22;

  let col = 1;
  for (const cellDef of grouped.topRow) {
    const colSpan = cellDef.colSpan ?? 1;
    const rowSpan = cellDef.rowSpan ?? 1;
    const cell = groupRow.getCell(col);
    cell.value = cellDef.text;
    applyHeaderCellStyle(cell, plainHeader, "center");
    if (colSpan > 1 || rowSpan > 1) {
      ws.mergeCells(
        groupRow.number,
        col,
        groupRow.number + rowSpan - 1,
        col + colSpan - 1,
      );
    }
    col += colSpan;
  }

  const bottomValues = Array.from({ length: totalCols }, () => "");
  let bottomIdx = 0;
  col = 1;
  for (const cellDef of grouped.topRow) {
    const colSpan = cellDef.colSpan ?? 1;
    const rowSpan = cellDef.rowSpan ?? 1;
    if (rowSpan > 1) {
      col += colSpan;
      continue;
    }
    for (let i = 0; i < colSpan; i++) {
      bottomValues[col - 1 + i] = grouped.bottomRow[bottomIdx] ?? "";
      bottomIdx += 1;
    }
    col += colSpan;
  }

  const subHeaderRow = ws.addRow(bottomValues);
  subHeaderRow.height = 20;
  subHeaderRow.eachCell({ includeEmpty: false }, cell => {
    applyHeaderCellStyle(cell, plainHeader, "center");
  });

  return subHeaderRow.number;
}

function reportMetaRowCount(options?: BuildExportSpreadsheetOptions): number {
  const title = options?.reportTitle ? 1 : 0;
  const subs = options?.reportSubtitles?.length ?? 0;
  const info = options?.reportInfo?.length ?? 0;
  const meta = title + subs + info;
  const blank = meta > 0 && options?.blankAfterMeta !== false ? 1 : 0;
  return meta + blank;
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

  const colCount = Math.max(headers.length, 1);
  const metaRows = reportMetaRowCount(options);
  const hasMeta = Boolean(
    options?.reportTitle
    || (options?.reportSubtitles?.length ?? 0) > 0
    || (options?.reportInfo?.length ?? 0) > 0,
  );
  const blankAfterMeta = hasMeta && options?.blankAfterMeta !== false;
  const groupedHeader = options?.groupedTableHeader;
  const headerRowCount = groupedHeader ? 2 : 1;
  let headerExcelRow = metaRows + headerRowCount;
  const plainHeader = options?.plainHeader === true;
  const enableAutoFilter = options?.autoFilter !== false;

  const ws = wb.addWorksheet(options?.sheetName ?? "Dados", {
    views: [{ state: "frozen", ySplit: headerExcelRow }],
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

  if (options?.reportTitle) {
    const titleRow = ws.addRow([options.reportTitle]);
    titleRow.height = plainHeader ? 20 : 24;
    ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
    const titleCell = titleRow.getCell(1);
    titleCell.font = {
      name: FONT,
      size: plainHeader ? 11 : 13,
      bold: true,
      color: { argb: "FF0F172A" },
    };
    titleCell.alignment = {
      horizontal: plainHeader ? "center" : "left",
      vertical: "middle",
      indent: 0,
    };
    if (plainHeader) {
      titleCell.border = thinBorder();
    }
  }

  if (options?.reportSubtitles?.length) {
    for (const line of options.reportSubtitles) {
      const subRow = ws.addRow([line]);
      subRow.height = 17;
      ws.mergeCells(subRow.number, 1, subRow.number, colCount);
      const subCell = subRow.getCell(1);
      subCell.font = { name: FONT, size: 10, color: { argb: "FF6B7280" } };
      subCell.alignment = { horizontal: "left", vertical: "middle" };
    }
  }

  if (options?.reportInfo?.length) {
    for (const line of options.reportInfo) {
      const infoRow = ws.addRow([line.label, line.value]);
      infoRow.height = 18;
      const labelCell = infoRow.getCell(1);
      labelCell.font = { name: FONT, size: 10, bold: true, color: { argb: "FF374151" } };
      labelCell.alignment = { horizontal: "left", vertical: "middle" };

      if (colCount > 2) {
        ws.mergeCells(infoRow.number, 2, infoRow.number, colCount);
      }
      const valueCell = infoRow.getCell(2);
      valueCell.font = { name: FONT, size: 10, color: { argb: "FF111827" } };
      valueCell.alignment = { horizontal: "left", vertical: "middle" };
    }
  }

  if (blankAfterMeta) {
    ws.addRow([]);
  }

  if (groupedHeader) {
    headerExcelRow = addGroupedTableHeader(ws, groupedHeader, plainHeader);
    ws.views = [{ state: "frozen", ySplit: headerExcelRow }];
  } else {
    const headerRow = ws.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FF1A1A1A" } };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };
      if (plainHeader) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PLAIN_HEADER_FILL } };
        cell.border = {
          top: { style: "thin", color: { argb: BORDER_COLOR } },
          left: { style: "thin", color: { argb: BORDER_COLOR } },
          right: { style: "thin", color: { argb: BORDER_COLOR } },
          bottom: { style: "thin", color: { argb: PLAIN_HEADER_BOTTOM } },
        };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        cell.border = {
          ...thinBorder(),
          bottom: { style: "thin", color: { argb: HEADER_BORDER } },
        };
      }
    });
    headerExcelRow = headerRow.number;
  }

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

      excelCell.font = { name: FONT, size: 10 };
      excelCell.alignment = {
        horizontal,
        vertical: "middle",
        wrapText: isObservacoes,
      };
      excelCell.border = thinBorder();

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

  if (enableAutoFilter) {
    const lastDataExcelRow = headerExcelRow + Math.max(rows.length, 0);
    const filterEndRow = Math.max(lastDataExcelRow, headerExcelRow);
    ws.autoFilter = {
      from: { row: headerExcelRow, column: 1 },
      to: { row: filterEndRow, column: colCount },
    };
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
    const width = columnWidth(headers, rows, colIdx);
    // plainHeader (export operacional do lote): um pouco mais de folga para não cortar texto.
    ws.getColumn(colIdx + 1).width = plainHeader
      ? Math.min(Math.max(width + 2, 14), 50)
      : width;
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

  const headerExcelRow = reportMetaRowCount(options) + 1;
  const dataStartRow = headerExcelRow + 1;

  if (options?.textColIndexes?.length && rows.length > 0) {
    const sqrefs = options.textColIndexes.map(colIdx =>
      exportDataColRange(colIdx, rows.length, dataStartRow),
    );
    buffer = await patchXlsxIgnoreNumberStoredAsText(buffer, sqrefs);
  }

  if (options?.currencyColIndexes?.length && rows.length > 0) {
    const sqrefs = options.currencyColIndexes.map(colIdx =>
      exportDataColRange(colIdx, rows.length, dataStartRow),
    );
    buffer = await patchXlsxIgnoreNumberStoredAsText(buffer, sqrefs);
  }

  return buffer;
}
