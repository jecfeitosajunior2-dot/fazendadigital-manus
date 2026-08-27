import ExcelJS from "exceljs";
import {
  EXCEL_FMT_MOEDA_BRL,
  formatValorCelulaMoedaBrlExcel,
  parseExportInteger,
  parseExportMoedaNumber,
} from "./parseMoedaBr";
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

export type ExportHeaderTheme = "default" | "plain" | "dark";

export type BuildExportSpreadsheetOptions = {
  currencyColIndexes?: number[];
  currencyNumFmt?: string;
  /**
   * Quando true, colunas de moeda saem como número Excel com formatação BRL
   * (em vez de texto "R$ …").
   */
  currencyAsNumber?: boolean;
  integerColIndexes?: number[];
  /** Colunas texto (@) — ex.: brinco/RFID com zero à esquerda. */
  textColIndexes?: number[];
  /** Colunas de data (YYYY-MM-DD ou Date) com formato visual DD/MM/AAAA. */
  dateColIndexes?: number[];
  /** numFmt por coluna (ex.: { 7: "0.0" } para peso). */
  columnNumFmts?: Partial<Record<number, string>>;
  columnAligns?: ExportColumnAlign[];
  /** Larguras fixas por coluna (índice 0-based). */
  columnWidths?: Array<number | undefined>;
  /** Colunas com quebra de texto. */
  wrapTextColIndexes?: number[];
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
  /**
   * Quantidade de linhas de dados (após o cabeçalho) incluídas no autofiltro.
   * Use para excluir linhas de totais no rodapé.
   */
  autoFilterDataRowCount?: number;
  /** Estiliza as N últimas linhas como totais (negrito + fundo cinza + borda superior). */
  footerRowCount?: number;
  /**
   * Nas linhas de rodapé, mescla as colunas 1..N para o rótulo
   * (o valor permanece na coluna seguinte, em geral a de moeda).
   */
  footerLabelMergeEndCol?: number;
  /** Altura da linha de cabeçalho (padrão: 22 ou 32 no tema dark). */
  headerRowHeight?: number;
  /** Cabeçalho discreto: negrito + bordas leves, sem preenchimento colorido. */
  plainHeader?: boolean;
  /** Quebra de texto no cabeçalho (padrão true). */
  headerWrapText?: boolean;
  /**
   * Tema do cabeçalho. `dark` = fundo petróleo + texto branco.
   * Se omitido, `plainHeader` continua valendo como antes.
   */
  headerTheme?: ExportHeaderTheme;
  /** Fundo discreto no título mesclado. */
  titleSubtleFill?: boolean;
  /** Permite exportar com 0 linhas de dados (mantém cabeçalho/tabela vazia). */
  allowEmpty?: boolean;
  /** Cabeçalho em duas linhas (agrupado), como o quadro de Gerenciamento de Lotes. */
  groupedTableHeader?: GroupedTableHeader;
  /** Estilo opcional por linha de dados (mesma ordem de `rows`). */
  rowMeta?: ExportSpreadsheetRowMeta[];
};

export type ExportSpreadsheetRowMeta = {
  /** Recuo Excel por coluna (índice 0-based). */
  colIndents?: Partial<Record<number, number>>;
  italic?: boolean;
  muted?: boolean;
  /** Faixa visual de seção (ex.: dia de manejo) — negrito + fundo discreto, sem mesclar. */
  section?: boolean;
};

export type ExportSpreadsheetRow = (string | number | Date | null | undefined)[];

const FONT = "Calibri";
const BORDER_COLOR = "FFD1D5DB";
const HEADER_FILL = "FFF4F6F6";
const HEADER_BORDER = "FF2D5A5A";
/** Cinza claro neutro para cabeçalho operacional (#F2F2F2). */
const PLAIN_HEADER_FILL = "FFF2F2F2";
const PLAIN_HEADER_BOTTOM = "FFD0D0D0";
/** Azul-petróleo institucional (#2D5A5A). */
const DARK_HEADER_FILL = "FF2D5A5A";
const TITLE_FILL = "FFF0F7F6";
const FOOTER_FILL = "FFF3F4F6";
/** Fundo discreto da faixa de seção (dia de manejo). */
const SECTION_FILL = "FFEEF1F2";
const SECTION_BOTTOM = "FF9CA3AF";
const EXCEL_FMT_DATA_BR = "DD/MM/YYYY";

function resolveHeaderTheme(options?: BuildExportSpreadsheetOptions): ExportHeaderTheme {
  if (options?.headerTheme) return options.headerTheme;
  if (options?.plainHeader === true) return "plain";
  return "default";
}

function parseExportDate(val: string | number | Date | null | undefined): Date | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(val).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

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
  theme: ExportHeaderTheme,
  horizontal: "left" | "center" | "right" = "center",
  wrapText = true,
) {
  if (theme === "dark") {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK_HEADER_FILL } };
    cell.border = thinBorder();
  } else if (theme === "plain") {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FF1A1A1A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PLAIN_HEADER_FILL } };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: PLAIN_HEADER_BOTTOM } },
    };
  } else {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: "FF1A1A1A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = {
      ...thinBorder(),
      bottom: { style: "thin", color: { argb: HEADER_BORDER } },
    };
  }
  cell.alignment = { horizontal, vertical: "middle", wrapText };
}

function addGroupedTableHeader(
  ws: ExcelJS.Worksheet,
  grouped: GroupedTableHeader,
  theme: ExportHeaderTheme,
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
    applyHeaderCellStyle(cell, theme, "center");
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
    applyHeaderCellStyle(cell, theme, "center");
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
  const headerWrapText = options?.headerWrapText !== false;
  const groupedHeader = options?.groupedTableHeader;
  const headerRowCount = groupedHeader ? 2 : 1;
  let headerExcelRow = metaRows + headerRowCount;
  const headerTheme = resolveHeaderTheme(options);
  const plainHeader = headerTheme === "plain";
  const enableAutoFilter = options?.autoFilter !== false;
  const currencyAsNumber = options?.currencyAsNumber === true;
  const currencyFmt = options?.currencyNumFmt ?? EXCEL_FMT_MOEDA_BRL;
  const footerRowCount = Math.max(0, options?.footerRowCount ?? 0);
  const wrapCols = options?.wrapTextColIndexes
    ? new Set(options.wrapTextColIndexes)
    : null;
  const dateCols = options?.dateColIndexes ? new Set(options.dateColIndexes) : null;

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

  if (options?.columnAligns?.length) {
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      const horizontal = options.columnAligns[colIdx] ?? "left";
      ws.getColumn(colIdx + 1).alignment = { horizontal, vertical: "middle" };
    }
  } else if (currencyCols) {
    for (const colIdx of currencyCols) {
      const horizontal = options?.columnAligns?.[colIdx] ?? "right";
      ws.getColumn(colIdx + 1).alignment = { horizontal, vertical: "middle" };
    }
  }

  if (options?.reportTitle) {
    const titleRow = ws.addRow([options.reportTitle]);
    const titleLen = options.reportTitle.length;
    titleRow.height = plainHeader ? 20 : 26;
    if (titleLen > 64) {
      titleRow.height = Math.max(titleRow.height ?? 0, 36);
    }
    ws.mergeCells(titleRow.number, 1, titleRow.number, colCount);
    const titleCell = titleRow.getCell(1);
    titleCell.font = {
      name: FONT,
      size: plainHeader ? 11 : 14,
      bold: true,
      color: { argb: "FF0F172A" },
    };
    titleCell.alignment = {
      horizontal: plainHeader || options?.titleSubtleFill || headerTheme === "dark" ? "center" : "left",
      vertical: "middle",
      wrapText: true,
      indent: 0,
    };
    if (plainHeader || options?.titleSubtleFill) {
      titleCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: TITLE_FILL },
      };
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
    headerExcelRow = addGroupedTableHeader(ws, groupedHeader, headerTheme);
    ws.views = [{ state: "frozen", ySplit: headerExcelRow }];
  } else {
    const headerRow = ws.addRow(headers);
    headerRow.height =
      options?.headerRowHeight ?? (headerTheme === "dark" ? 32 : 22);
    headerRow.eachCell(cell => {
      applyHeaderCellStyle(cell, headerTheme, "center", headerWrapText);
    });
    headerExcelRow = headerRow.number;
    ws.views = [{ state: "frozen", ySplit: headerExcelRow }];
  }

  const footerStartIdx = footerRowCount > 0 ? Math.max(0, rows.length - footerRowCount) : rows.length;
  const footerLabelMergeEndCol = Math.max(
    0,
    Math.min(options?.footerLabelMergeEndCol ?? 0, colCount),
  );

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const meta = options?.rowMeta?.[rowIdx];
    const isFooter = rowIdx >= footerStartIdx;
    const isSection = Boolean(meta?.section);
    const excelRow = ws.addRow(new Array(headers.length).fill(null));
    let rowHeight = isFooter || isSection ? 20 : 18;
    if (!isFooter && wrapCols) {
      for (const colIdx of wrapCols) {
        const raw = row[colIdx];
        if (raw == null || raw === "") continue;
        const len = String(raw).length;
        if (len > 36) {
          rowHeight = Math.max(rowHeight, Math.min(18 + Math.ceil(len / 36) * 14, 96));
        }
      }
    }
    excelRow.height = rowHeight;

    row.forEach((rawCell, colIdx) => {
      const excelCell = excelRow.getCell(colIdx + 1);
      const horizontal = options?.columnAligns?.[colIdx] ?? "left";
      const isObservacoes = headers[colIdx]?.toLowerCase().includes("observa");
      const isCurrency = currencyCols?.has(colIdx) ?? false;
      const isInteger = integerCols?.has(colIdx) ?? false;
      const isText = textCols?.has(colIdx) ?? false;
      const isDate = dateCols?.has(colIdx) ?? false;
      const colNumFmt = columnNumFmts?.[colIdx];
      const indent = meta?.colIndents?.[colIdx] ?? 0;
      const wrapText = Boolean(wrapCols?.has(colIdx) || isObservacoes);

      excelCell.font = {
        name: FONT,
        size: isSection ? 11 : 10,
        ...(isFooter || isSection ? { bold: true } : {}),
        ...(meta?.italic ? { italic: true } : {}),
        ...(meta?.muted && !isSection ? { color: { argb: "FF6B7280" } } : {}),
        ...(isSection ? { color: { argb: "FF111827" } } : {}),
      };
      excelCell.alignment = {
        horizontal: isSection ? "center" : horizontal,
        vertical: "middle",
        wrapText,
        ...(indent > 0 && !isSection ? { indent } : {}),
      };
      excelCell.border = isFooter
        ? {
            top: { style: "thin", color: { argb: "FF9CA3AF" } },
            left: { style: "thin", color: { argb: BORDER_COLOR } },
            right: { style: "thin", color: { argb: BORDER_COLOR } },
            bottom: { style: "thin", color: { argb: BORDER_COLOR } },
          }
        : isSection
          ? {
              top: { style: "thin", color: { argb: BORDER_COLOR } },
              left: { style: "thin", color: { argb: BORDER_COLOR } },
              right: { style: "thin", color: { argb: BORDER_COLOR } },
              bottom: { style: "thin", color: { argb: SECTION_BOTTOM } },
            }
          : thinBorder();

      if (isFooter) {
        excelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: FOOTER_FILL },
        };
      } else if (isSection) {
        excelCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: SECTION_FILL },
        };
      }

      if (rawCell == null || rawCell === "") {
        excelCell.value = "";
      } else if (isCurrency) {
        if (currencyAsNumber) {
          const n = parseExportMoedaNumber(rawCell as string | number);
          if (n != null) {
            excelCell.value = n;
            excelCell.numFmt = currencyFmt;
          } else {
            excelCell.value = String(rawCell);
          }
        } else {
          excelCell.value = formatValorCelulaMoedaBrlExcel(rawCell as string | number);
          excelCell.numFmt = "@";
        }
      } else if (isDate) {
        const d = parseExportDate(rawCell as string | number | Date);
        if (d) {
          excelCell.value = d;
          excelCell.numFmt = colNumFmt ?? EXCEL_FMT_DATA_BR;
        } else {
          excelCell.value = String(rawCell);
        }
      } else if (isInteger) {
        const n = parseExportInteger(rawCell as string | number);
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
      } else if (rawCell instanceof Date) {
        excelCell.value = rawCell;
        excelCell.numFmt = colNumFmt ?? EXCEL_FMT_DATA_BR;
      } else if (isText) {
        excelCell.value = String(rawCell);
        excelCell.numFmt = "@";
      } else {
        excelCell.value = String(rawCell);
      }
    });
  }

  if (footerRowCount > 0 && footerLabelMergeEndCol >= 2) {
    for (let i = 0; i < footerRowCount; i++) {
      const excelRowNumber = headerExcelRow + footerStartIdx + 1 + i;
      const row = ws.getRow(excelRowNumber);
      const label = row.getCell(1).value;
      ws.mergeCells(excelRowNumber, 1, excelRowNumber, footerLabelMergeEndCol);
      const merged = row.getCell(1);
      merged.value = label;
      merged.font = { name: FONT, size: 10, bold: true, color: { argb: "FF111827" } };
      merged.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
      merged.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: FOOTER_FILL },
      };
      merged.border = {
        top: { style: "thin", color: { argb: "FF9CA3AF" } },
        left: { style: "thin", color: { argb: BORDER_COLOR } },
        right: { style: "thin", color: { argb: BORDER_COLOR } },
        bottom: { style: "thin", color: { argb: BORDER_COLOR } },
      };
      // Reaplica borda/fundo nas células mescladas restantes
      for (let c = 2; c <= footerLabelMergeEndCol; c++) {
        const cell = row.getCell(c);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: FOOTER_FILL },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF9CA3AF" } },
          left: { style: "thin", color: { argb: BORDER_COLOR } },
          right: { style: "thin", color: { argb: BORDER_COLOR } },
          bottom: { style: "thin", color: { argb: BORDER_COLOR } },
        };
      }
      row.height = 22;
    }
  }

  if (enableAutoFilter) {
    const dataRowsForFilter =
      options?.autoFilterDataRowCount != null
        ? Math.max(0, options.autoFilterDataRowCount)
        : Math.max(rows.length - footerRowCount, 0);
    const filterEndRow = Math.max(headerExcelRow + dataRowsForFilter, headerExcelRow);
    ws.autoFilter = {
      from: { row: headerExcelRow, column: 1 },
      to: { row: filterEndRow, column: colCount },
    };
  }

  headers.forEach((_, colIdx) => {
    const fixed = options?.columnWidths?.[colIdx];
    if (fixed != null) {
      ws.getColumn(colIdx + 1).width = fixed;
      return;
    }
    if (currencyCols?.has(colIdx)) {
      let max = String(headers[colIdx] ?? "").length;
      for (const row of rows) {
        if (currencyAsNumber) {
          const n = parseExportMoedaNumber(row[colIdx] as string | number);
          const formatted = n != null ? formatValorCelulaMoedaBrlExcel(n) : "";
          if (formatted.length > max) max = formatted.length;
        } else {
          const formatted = formatValorCelulaMoedaBrlExcel(row[colIdx] as string | number);
          if (formatted.length > max) max = formatted.length;
        }
      }
      ws.getColumn(colIdx + 1).width = Math.min(Math.max(max + 2, 12), 50);
      return;
    }
    const width = columnWidth(headers, rows, colIdx);
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
