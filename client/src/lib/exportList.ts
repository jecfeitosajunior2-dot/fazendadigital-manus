import { toast } from "sonner";
import {
  buildExportSpreadsheetBuffer,
  type BuildExportSpreadsheetOptions,
  type ExportColumnAlign,
  type ExportReportInfoLine,
  type ExportSpreadsheetRow,
  type ExportSpreadsheetRowMeta,
} from "@shared/buildExportSpreadsheet";
import { formatValorCelulaMoedaBrlExcel } from "@shared/parseMoedaBr";

export type ExportRow = ExportSpreadsheetRow;
export type ExportSpreadsheetOptions = BuildExportSpreadsheetOptions;

function downloadXlsxBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportFilename(base: string) {
  const agora = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`;
  return `${base}_${carimbo}.xlsx`;
}

function exportPdfFilename(title: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "relatorio";
  return exportFilename(base).replace(/\.xlsx$/, ".pdf");
}

/**
 * Exporta uma lista para XLSX com tipagem correta, moeda BRL e alinhamento por coluna.
 */
export async function exportListSpreadsheet(
  headers: string[],
  rows: ExportRow[],
  filename: string,
  options?: ExportSpreadsheetOptions,
) {
  if (rows.length === 0 && !options?.allowEmpty) {
    toast.error("Nenhum dado para exportar");
    return;
  }

  try {
    const buffer = await buildExportSpreadsheetBuffer(headers, rows, options);
    downloadXlsxBuffer(buffer, exportFilename(filename));
    toast.success("Planilha exportada!");
  } catch (error) {
    console.error("[exportListSpreadsheet]", error);
    toast.error("Não foi possível exportar a planilha");
  }
}

export type ExportPdfOptions = {
  alignRightFrom?: number;
  alignRightCols?: number[];
  fazendaNome?: string;
  periodo?: string;
  groupByCol?: number[];
  landscape?: boolean;
  currencyColIndexes?: number[];
  integerColIndexes?: number[];
  columnAligns?: ExportColumnAlign[];
  wrapColIndexes?: number[];
  /** Cabeçalho em múltiplas linhas (ex.: Machos / Fêmeas agrupados). */
  headRows?: PdfHeadCell[][];
  /** Linhas de contexto abaixo do título (mesmo padrão do Excel). */
  reportSubtitles?: string[];
  /** Linhas label/valor abaixo do título (mesmo padrão do Excel). */
  reportInfo?: ExportReportInfoLine[];
  /** Oculta subtítulo (ex.: Mapa do Rebanho). */
  skipSubtitle?: boolean;
  /** Exibe "X registros encontrados" (padrão: true, exceto skipSubtitle). */
  showRegistrosSubtitle?: boolean;
};

function buildPdfReportSubtitleLines(
  rowsCount: number,
  options?: Pick<
    ExportPdfOptions,
    "skipSubtitle" | "reportSubtitles" | "reportInfo" | "showRegistrosSubtitle"
  >,
): { lines: string[]; titleOnly: boolean } {
  if (options?.skipSubtitle) {
    return { lines: [], titleOnly: true };
  }

  const lines: string[] = [];
  for (const item of options?.reportInfo ?? []) {
    lines.push(`${item.label}: ${item.value}`);
  }
  if (options?.reportSubtitles?.length) {
    lines.push(...options.reportSubtitles);
  }

  if (options?.showRegistrosSubtitle !== false) {
    lines.push(
      `${rowsCount} registro${rowsCount !== 1 ? "s" : ""} encontrado${rowsCount !== 1 ? "s" : ""}`,
    );
  }

  return { lines, titleOnly: lines.length === 0 };
}

export type PdfHeadCell = string | { content: string; colSpan?: number; rowSpan?: number };

const PDF_SYMBOL_URL = "/assets/brand/fd-symbol-final-aligned.png";
const FD_NAVY = [15, 23, 42] as const;
const FD_TEAL = [120, 214, 207] as const;
const PDF_BAND_H = 16;
const PDF_TITLE_FONT_SIZE = 13;
const PDF_SUBTITLE_FONT_SIZE = 9;
const PDF_TITLE_OFFSET = 8;
const PDF_SUBTITLE_OFFSET = 14;
const PDF_TABLE_GAP = 6;

function pdfTableStartY(summaryLineCount = 0, titleOnly = false): number {
  if (titleOnly) {
    return PDF_BAND_H + PDF_TITLE_OFFSET + PDF_TABLE_GAP + 2;
  }
  if (summaryLineCount <= 0) {
    return PDF_BAND_H + PDF_SUBTITLE_OFFSET + PDF_TABLE_GAP + 3;
  }
  const lastLineY = PDF_BAND_H + PDF_SUBTITLE_OFFSET + (summaryLineCount - 1) * 3.5;
  return lastLineY + 5;
}

function measureCanvasSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacingPx: number,
): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += ctx.measureText(text[i]!).width;
    if (i < text.length - 1) width += letterSpacingPx;
  }
  return width;
}

function fillCanvasSpacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacingPx: number,
) {
  let cursorX = x;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i]!, cursorX, y);
    cursorX += ctx.measureText(text[i]!).width;
    if (i < text.length - 1) cursorX += letterSpacingPx;
  }
}

async function loadPdfAssetDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
    return dataUrl;
  } catch {
    return null;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Renderiza a marca igual à sidebar (ícone + FAZENDA/DIGITAL centralizado). */
async function renderPdfSidebarBrand(symbolDataUrl: string): Promise<string | null> {
  try {
    const symbol = await loadImageElement(symbolDataUrl);
    const scale = 4;
    const iconSize = 44;
    const textWidth = 118;
    const gap = 6;
    const totalW = iconSize + gap + textWidth;
    const totalH = 48;

    const canvas = document.createElement("canvas");
    canvas.width = totalW * scale;
    canvas.height = totalH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const iconY = (totalH - iconSize) / 2;
    ctx.drawImage(symbol, 0, iconY, iconSize, iconSize);

    const textX = iconSize + gap;
    const fazendaText = "FAZENDA";
    const digitalText = "DIGITAL";
    const fazendaLetterSp = 15 * 0.058;
    const digitalLetterSp = 9 * 0.255;

    ctx.font = "820 15px Inter, Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textBaseline = "alphabetic";
    const fazendaW = measureCanvasSpacedText(ctx, fazendaText, fazendaLetterSp);
    fillCanvasSpacedText(ctx, fazendaText, textX + (textWidth - fazendaW) / 2, 18, fazendaLetterSp);

    const digitalY = 34;
    const lineW = 18;
    const digitalRowWidth = 104;
    const digitalRowLeft = textX + (textWidth - digitalRowWidth) / 2;
    ctx.font = "800 9px Inter, Arial, Helvetica, sans-serif";
    const digitalTextW = measureCanvasSpacedText(ctx, digitalText, digitalLetterSp);
    const rowGap = 5;
    const rowW = lineW + rowGap + digitalTextW + rowGap + lineW;
    let rowX = digitalRowLeft + (digitalRowWidth - rowW) / 2;

    ctx.strokeStyle = "rgba(120,214,207,0.64)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rowX, digitalY);
    ctx.lineTo(rowX + lineW, digitalY);
    ctx.stroke();
    rowX += lineW + rowGap;

    ctx.fillStyle = "#78D6CF";
    fillCanvasSpacedText(ctx, digitalText, rowX + 1, digitalY + 3, digitalLetterSp);
    rowX += digitalTextW + rowGap;

    ctx.beginPath();
    ctx.moveTo(rowX, digitalY);
    ctx.lineTo(rowX + lineW, digitalY);
    ctx.stroke();

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function drawPdfPageChrome(
  doc: {
    setFillColor: (r: number, g: number, b: number) => void;
    rect: (x: number, y: number, w: number, h: number, style?: string) => void;
    addImage: (imageData: string, format: string, x: number, y: number, w: number, h: number) => void;
    setFont: (font: string, style?: string) => void;
    setFontSize: (size: number) => void;
    setTextColor: (r: number, g?: number, b?: number) => void;
    text: (text: string, x: number, y: number, options?: { align?: "left" | "center" | "right" }) => void;
    setDrawColor: (r: number, g: number, b: number) => void;
    setLineWidth: (width: number) => void;
    line: (x1: number, y1: number, x2: number, y2: number) => void;
    getNumberOfPages: () => number;
  },
  opts: {
    pageWidth: number;
    pageHeight: number;
    marginX: number;
    brandDataUrl: string | null;
    fazendaNome: string;
    periodo: string;
    title: string;
    rowsCount: number;
    year: number;
    dataFormatada: string;
    horaFormatada: string;
    summaryLines?: string[];
    /** Sem subtítulo (ex.: Mapa do Rebanho — só título). */
    skipSubtitle?: boolean;
  },
) {
  const {
    pageWidth,
    pageHeight,
    marginX,
    brandDataUrl,
    fazendaNome,
    periodo,
    title,
    rowsCount,
    year,
    dataFormatada,
    horaFormatada,
    summaryLines,
    skipSubtitle,
  } = opts;

  doc.setFillColor(FD_NAVY[0], FD_NAVY[1], FD_NAVY[2]);
  doc.rect(0, 0, pageWidth, PDF_BAND_H, "F");

  if (brandDataUrl) {
    const brandH = 11;
    const brandW = brandH * (168 / 48);
    doc.addImage(brandDataUrl, "PNG", marginX, (PDF_BAND_H - brandH) / 2, brandW, brandH);
  }

  const metaCenterY = PDF_BAND_H / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(FD_TEAL[0], FD_TEAL[1], FD_TEAL[2]);
  doc.text(fazendaNome, pageWidth - marginX, metaCenterY - 1.2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 195, 195);
  doc.text(periodo, pageWidth - marginX, metaCenterY + 2.8, { align: "right" });

  doc.setDrawColor(FD_TEAL[0], FD_TEAL[1], FD_TEAL[2]);
  doc.setLineWidth(0.35);
  doc.line(0, PDF_BAND_H, pageWidth, PDF_BAND_H);

  const titleY = PDF_BAND_H + PDF_TITLE_OFFSET;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PDF_TITLE_FONT_SIZE);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX, titleY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(PDF_SUBTITLE_FONT_SIZE);
  doc.setTextColor(90, 90, 90);
  if (!skipSubtitle) {
    if (summaryLines?.length) {
      summaryLines.forEach((line, i) => {
        doc.text(line, marginX, PDF_BAND_H + PDF_SUBTITLE_OFFSET + i * 3.5);
      });
    } else {
      doc.text(
        `${rowsCount} registro${rowsCount !== 1 ? "s" : ""} encontrado${rowsCount !== 1 ? "s" : ""}`,
        marginX,
        PDF_BAND_H + PDF_SUBTITLE_OFFSET,
      );
    }
  }

  const pageNumber = doc.getNumberOfPages();
  doc.setDrawColor(224, 224, 224);
  doc.setLineWidth(0.2);
  doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Fazenda Digital © ${year} - Gestão Pecuária Inteligente`, marginX, pageHeight - 6);
  doc.text(`${dataFormatada} ${horaFormatada} · Página ${pageNumber}`, pageWidth - marginX, pageHeight - 6, {
    align: "right",
  });
}

function pdfCellAlign(
  colIdx: number,
  options: {
    alignRightFrom: number;
    alignRightCols: number[];
    columnAligns?: ExportColumnAlign[];
  },
): string {
  const explicit = options.columnAligns?.[colIdx];
  if (explicit) return explicit;
  if (colIdx >= options.alignRightFrom || options.alignRightCols.includes(colIdx)) return "right";
  return "left";
}

function formatPdfCell(
  cell: unknown,
  colIdx: number,
  currencyCols: Set<number> | null,
  integerCols: Set<number> | null,
): string {
  if (cell == null || cell === "") return "";

  if (currencyCols?.has(colIdx)) {
    return formatValorCelulaMoedaBrlExcel(cell as string | number);
  }

  if (typeof cell === "number" && Number.isFinite(cell)) {
    if (integerCols?.has(colIdx)) return String(Math.round(cell));
    if (cell === 0) return "0";
    return cell.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (integerCols?.has(colIdx) && typeof cell === "string" && /^\d+$/.test(cell.trim())) {
    return cell.trim();
  }

  return String(cell);
}

export async function exportListPdf(
  title: string,
  headers: string[],
  rows: ExportRow[],
  options?: ExportPdfOptions,
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const alignRightFrom = options?.alignRightFrom ?? headers.length;
  const alignRightCols = options?.alignRightCols ?? [];
  const fazendaNome = options?.fazendaNome || "Todas as Fazendas";
  const groupByCol = options?.groupByCol ?? [];
  const landscape = options?.landscape ?? false;
  const currencyCols = options?.currencyColIndexes ? new Set(options.currencyColIndexes) : null;
  const integerCols = options?.integerColIndexes ? new Set(options.integerColIndexes) : null;
  const alignOpts = { alignRightFrom, alignRightCols, columnAligns: options?.columnAligns };
  const headRows = options?.headRows;
  const columnCount = headers.length;

  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaFormatada = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const periodo = options?.periodo || `Gerado em ${dataFormatada} às ${horaFormatada}`;

  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;

    const tableRows = rows.map((r, idx) =>
      r.map((cell, i) => {
        const suppress =
          groupByCol.includes(i) &&
          idx > 0 &&
          String(rows[idx - 1]?.[i] ?? "") === String(cell ?? "");
        return suppress ? "" : formatPdfCell(cell, i, currencyCols, integerCols);
      }),
    );

    const isTotaisRow = (row: ExportRow) =>
      /^totais\b/i.test(String(row[0] ?? "").trim());
    const detailRowsCount = rows.filter(r => !isTotaisRow(r)).length;

    const doc = new jsPDF({
      orientation: landscape ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
    });
    const symbolDataUrl = await loadPdfAssetDataUrl(PDF_SYMBOL_URL);
    const brandDataUrl = symbolDataUrl ? await renderPdfSidebarBrand(symbolDataUrl) : null;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const { lines: summaryLines, titleOnly } = buildPdfReportSubtitleLines(
      detailRowsCount,
      options,
    );
    const tableStartY = pdfTableStartY(summaryLines.length, titleOnly);

    const drawHeaderFooter = () => {
      drawPdfPageChrome(doc, {
        pageWidth,
        pageHeight,
        marginX,
        brandDataUrl,
        fazendaNome,
        periodo,
        title,
        rowsCount: detailRowsCount,
        year: agora.getFullYear(),
        dataFormatada,
        horaFormatada,
        summaryLines: summaryLines.length > 0 ? summaryLines : undefined,
        skipSubtitle: titleOnly,
      });
    };

    const columnStyles = Array.from({ length: columnCount }, (_, i) => i).reduce<
      Record<number, { halign: "left" | "center" | "right" }>
    >((acc, i) => {
      acc[i] = { halign: pdfCellAlign(i, alignOpts) as "left" | "center" | "right" };
      return acc;
    }, {});

    autoTable(doc, {
      head: headRows ?? [headers],
      body: tableRows,
      startY: tableStartY,
      margin: { top: tableStartY, right: marginX, bottom: 15, left: marginX },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.6,
        minCellHeight: 5,
        overflow: "linebreak",
        valign: "middle",
        textColor: [34, 34, 34],
        lineColor: [232, 237, 237],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [45, 90, 90],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      alternateRowStyles: { fillColor: [247, 250, 250] },
      columnStyles,
      didParseCell: hookData => {
        if (hookData.section !== "body") return;
        const raw = rows[hookData.row.index];
        if (!raw || !isTotaisRow(raw)) return;
        hookData.cell.styles.fontStyle = "bold";
        hookData.cell.styles.fillColor = [243, 244, 246];
      },
      didDrawPage: drawHeaderFooter,
    });

    const blob = doc.output("blob");
    downloadPdfBlob(blob, exportPdfFilename(title));
    toast.success("PDF exportado!");
  } catch (error) {
    console.error("[exportListPdf]", error);
    toast.error("Não foi possível exportar o PDF");
  }
}


// ─── Tipos para exportação hierárquica do Mapa do Rebanho ────────────────────
export type MapaLoteExport = {
  loteNome: string;
  totalAnimais: number;
  taxaProporcional: number | null;
  dataEntradaPasto: string | null;
  diasNoPasto: number | null;
};

export type MapaSubdivisaoExport = {
  pastoNome: string;
  pastoSigla: string | null;
  pastoStatus: string | null;
  totalAnimais: number;
  areaHa: number | null;
  taxaLotacao: number | null;
  capacidade: number | null;
  diasVazio?: number | null;
  lotes: MapaLoteExport[];
};

export type MapaFazendaExport = {
  fazendaNome: string;
  subdivisoes: MapaSubdivisaoExport[];
  semSubdivisao: MapaLoteExport[];
};

function normalizeMapaFazendasExport(
  fazendas: MapaFazendaExport[] | undefined | null,
): MapaFazendaExport[] {
  if (!Array.isArray(fazendas)) return [];
  return fazendas.map(f => ({
    fazendaNome: f.fazendaNome ?? "Fazenda",
    subdivisoes: (f.subdivisoes ?? []).map(s => ({
      ...s,
      lotes: s.lotes ?? [],
    })),
    semSubdivisao: f.semSubdivisao ?? [],
  }));
}

export function countMapaRebanhoRegistros(
  fazendas: MapaFazendaExport[] | undefined | null,
): number {
  return normalizeMapaFazendasExport(fazendas).reduce(
    (acc, f) =>
      acc +
      f.subdivisoes.reduce((a, s) => a + Math.max(s.lotes.length, 1), 0) +
      (f.semSubdivisao.length > 0 ? 1 + f.semSubdivisao.length : 0),
    0,
  );
}

function fmtMapaNum(v: number | string | null | undefined, dec = 2): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Mesma regra da tela: inteiro sem decimais, senão 2 casas. */
function formatMapaAreaExport(areaHa: number | null | undefined): string {
  if (areaHa == null) return "—";
  const n = Number(areaHa);
  if (!Number.isFinite(n)) return "—";
  const formatted = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${formatted} ha`;
}

function formatMapaTaxaLotePlain(lote: MapaLoteExport): string {
  if (lote.taxaProporcional == null) return "—";
  return `${formatMapaTaxaExportBr(lote.taxaProporcional)} contribuição`;
}

const MAPA_EXPORT_COL_HEADERS = [
  "Subdivisão e Lotes",
  "Animais",
  "Área",
  "Lotação",
  "Entrada",
] as const;

/** Lotação em pt-BR para Excel (0,10 UA/ha). */
function formatMapaTaxaExportBr(taxa: number | null | undefined): string {
  if (taxa == null || !Number.isFinite(taxa)) return "—";
  return `${taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UA/ha`;
}

function formatMapaTaxaLoteExcel(lote: MapaLoteExport): string {
  if (lote.taxaProporcional == null) return "—";
  return `${formatMapaTaxaExportBr(lote.taxaProporcional)} contribuição`;
}

function formatMapaEntradaSubdivisaoExcel(sub: MapaSubdivisaoExport): string {
  if (sub.totalAnimais > 0) return "—";
  return "Sem animais";
}

function formatMapaEntradaLoteExcel(lote: MapaLoteExport): string {
  if (!lote.dataEntradaPasto) return "Sem histórico";
  if (lote.diasNoPasto != null && lote.diasNoPasto >= 0) {
    return `${lote.dataEntradaPasto} (${lote.diasNoPasto} dias no pasto)`;
  }
  return lote.dataEntradaPasto;
}

function buildMapaRebanhoExcelRows(dados: MapaFazendaExport[]): {
  rows: ExportSpreadsheetRow[];
  rowMeta: ExportSpreadsheetRowMeta[];
} {
  const rows: ExportSpreadsheetRow[] = [];
  const rowMeta: ExportSpreadsheetRowMeta[] = [];
  const multiFaz = dados.length > 1;

  const pushRow = (row: ExportSpreadsheetRow, meta: ExportSpreadsheetRowMeta = {}) => {
    rows.push(row);
    rowMeta.push(meta);
  };

  const loteIndent: ExportSpreadsheetRowMeta = { colIndents: { 0: 2 } };
  const infoRowMeta: ExportSpreadsheetRowMeta = { italic: true, muted: true };

  for (const faz of dados) {
    for (const sub of faz.subdivisoes) {
      const subLabel = multiFaz ? `${faz.fazendaNome} — ${sub.pastoNome}` : sub.pastoNome;
      pushRow([
        subLabel,
        sub.totalAnimais,
        formatMapaAreaExport(sub.areaHa),
        formatMapaTaxaExportBr(sub.taxaLotacao),
        formatMapaEntradaSubdivisaoExcel(sub),
      ]);

      if (sub.lotes.length === 0) {
        pushRow(["Sem lotes cadastrados", "—", "—", "—", "—"], infoRowMeta);
      } else {
        for (const lote of sub.lotes) {
          pushRow(
            [
              `LOTE ${lote.loteNome}`,
              lote.totalAnimais,
              "—",
              formatMapaTaxaLoteExcel(lote),
              formatMapaEntradaLoteExcel(lote),
            ],
            loteIndent,
          );
        }
      }
    }

    if (faz.semSubdivisao.length > 0) {
      const totalSem = faz.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0);
      const n = faz.semSubdivisao.length;
      const lotLabel = n === 1 ? "1 lote" : `${n} lotes`;
      const semLabel = multiFaz
        ? `${faz.fazendaNome} — Sem Subdivisão (${lotLabel})`
        : `Sem Subdivisão (${lotLabel})`;
      pushRow([semLabel, totalSem, "—", "—", "—"]);
      for (const lote of faz.semSubdivisao) {
        pushRow(
          [
            `LOTE ${lote.loteNome}`,
            lote.totalAnimais,
            "—",
            "—",
            formatMapaEntradaLoteExcel(lote),
          ],
          loteIndent,
        );
      }
    }
  }

  return { rows, rowMeta };
}

/**
 * Exporta o Mapa do Rebanho em XLSX — linha de contexto + tabela (padrão Animais do Lote).
 */
export async function exportMapaRebanhoXlsx(
  fazendas: MapaFazendaExport[],
  options?: { fazendaNome?: string; subdivisaoNome?: string },
) {
  try {
    const dados = normalizeMapaFazendasExport(fazendas);
    if (countMapaRebanhoRegistros(dados) === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const fazendaNome = options?.fazendaNome ?? "Todas as Fazendas";
    let reportTitle = `${fazendaNome} — Mapa do Rebanho`;
    if (options?.subdivisaoNome) {
      reportTitle += ` — ${options.subdivisaoNome}`;
    }

    const { rows, rowMeta } = buildMapaRebanhoExcelRows(dados);
    const headers = [...MAPA_EXPORT_COL_HEADERS];

    const buffer = await buildExportSpreadsheetBuffer(headers, rows, {
      reportTitle,
      blankAfterMeta: false,
      autoFilter: false,
      plainHeader: true,
      sheetName: "Mapa do Rebanho",
      integerColIndexes: [1],
      columnAligns: ["left", "center", "center", "center", "center"],
      rowMeta,
    });

    downloadXlsxBuffer(buffer, exportFilename("mapa-rebanho"));
    toast.success("Planilha exportada!");
  } catch (error) {
    console.error("[exportMapaRebanhoXlsx]", error);
    toast.error("Não foi possível exportar a planilha");
  }
}

/** jsPDF (Helvetica) corrompe o restante da célula após alguns símbolos Unicode. */
function sanitizeMapaPdfText(value: string | number): string {
  if (typeof value === "number") return String(value);
  return value
    .replace(/\u2514/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u00B7/g, " | ")
    .replace(/\u26A0\uFE0F?/g, "!")
    .replace(/—/g, "-");
}

function mapaPdfCell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  return sanitizeMapaPdfText(value);
}

/** Recuo visual no PDF (3 espaços), alinhado ao Excel. */
const MAPA_PDF_INDENT = "   ";

function mapaPdfLoteLabel(loteNome: string): string {
  return mapaPdfCell(`${MAPA_PDF_INDENT}LOTE ${loteNome}`);
}

function mapaPdfIndentedInfoLabel(text: string): string {
  return mapaPdfCell(`${MAPA_PDF_INDENT}${text}`);
}

function mapaPdfTaxaBr(taxa: number | null | undefined): string {
  return mapaPdfCell(formatMapaTaxaExportBr(taxa));
}

function mapaPdfEntradaSubdivisao(sub: MapaSubdivisaoExport): string {
  return mapaPdfCell(formatMapaEntradaSubdivisaoExcel(sub));
}

function mapaPdfEntradaLote(lote: MapaLoteExport): string {
  return mapaPdfCell(formatMapaEntradaLoteExcel(lote));
}

type MapaPdfRowKind = "fazenda" | "sub" | "sem" | "lote" | "empty" | "blank";
type MapaPdfCell = string | number | { content: string; colSpan?: number; styles?: Record<string, unknown> };

function buildMapaRebanhoPdfTable(dados: MapaFazendaExport[]) {
  const body: MapaPdfCell[][] = [];
  const rowKinds: MapaPdfRowKind[] = [];

  dados.forEach((faz, fi) => {
    if (fi > 0) {
      body.push(["", "", "", "", ""]);
      rowKinds.push("blank");
    }

    const totalFaz =
      faz.subdivisoes.reduce((a, s) => a + s.totalAnimais, 0) +
      faz.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0);

    if (dados.length > 1) {
      body.push([
        {
          content: mapaPdfCell(
            `FAZENDA: ${faz.fazendaNome} - ${totalFaz} animal${totalFaz !== 1 ? "is" : ""}`,
          ),
          colSpan: 5,
          styles: {
            fillColor: [26, 61, 61],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            halign: "left",
          },
        },
      ]);
      rowKinds.push("fazenda");
    }

    faz.subdivisoes.forEach(sub => {
      body.push([
        mapaPdfCell(sub.pastoNome),
        sub.totalAnimais,
        mapaPdfCell(formatMapaAreaExport(sub.areaHa)),
        mapaPdfTaxaBr(sub.taxaLotacao),
        mapaPdfEntradaSubdivisao(sub),
      ]);
      rowKinds.push("sub");

      if (sub.lotes.length === 0) {
        body.push([
          mapaPdfIndentedInfoLabel("Sem lotes cadastrados"),
          "-",
          "-",
          "-",
          "-",
        ]);
        rowKinds.push("empty");
      } else {
        sub.lotes.forEach(lote => {
          body.push([
            mapaPdfLoteLabel(lote.loteNome),
            lote.totalAnimais,
            "-",
            mapaPdfCell(formatMapaTaxaLotePlain(lote)),
            mapaPdfEntradaLote(lote),
          ]);
          rowKinds.push("lote");
        });
      }
    });

    if (faz.semSubdivisao.length > 0) {
      const totalSem = faz.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0);
      const lotLabel =
        faz.semSubdivisao.length === 1 ? "1 lote" : `${faz.semSubdivisao.length} lotes`;
      body.push([
        mapaPdfCell(`Sem Subdivisão (${lotLabel})`),
        totalSem,
        "-",
        "-",
        "-",
      ]);
      rowKinds.push("sem");
      faz.semSubdivisao.forEach(lote => {
        body.push([
          mapaPdfLoteLabel(lote.loteNome),
          lote.totalAnimais,
          "-",
          "-",
          mapaPdfEntradaLote(lote),
        ]);
        rowKinds.push("lote");
      });
    }
  });

  return { body, rowKinds };
}

/**
 * Exporta o Mapa do Rebanho em PDF (download direto, mesmo fluxo dos demais relatórios).
 */
export async function exportMapaRebanhoPdf(
  fazendas: MapaFazendaExport[],
  options?: { fazendaNome?: string; periodo?: string },
) {
  try {
    const dados = normalizeMapaFazendasExport(fazendas);
    const totalRegistros = countMapaRebanhoRegistros(dados);
    if (totalRegistros === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }

    const agora = new Date();
    const dataFormatada = agora.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const horaFormatada = agora.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const periodo =
      options?.periodo || `Gerado em ${dataFormatada} às ${horaFormatada}`;
    const fazendaNome = options?.fazendaNome || "Todas as Fazendas";
    const title = "Mapa do Rebanho";

    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const autoTable = autoTableModule.default;
    const { body, rowKinds } = buildMapaRebanhoPdfTable(dados);

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });
    const symbolDataUrl = await loadPdfAssetDataUrl(PDF_SYMBOL_URL);
    const brandDataUrl = symbolDataUrl ? await renderPdfSidebarBrand(symbolDataUrl) : null;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 10;
    const tableStartY = pdfTableStartY(0, true);

    const drawHeaderFooter = () => {
      drawPdfPageChrome(doc, {
        pageWidth,
        pageHeight,
        marginX,
        brandDataUrl,
        fazendaNome,
        periodo,
        title,
        rowsCount: totalRegistros,
        year: agora.getFullYear(),
        dataFormatada,
        horaFormatada,
        skipSubtitle: true,
      });
    };

    autoTable(doc, {
      head: [[...MAPA_EXPORT_COL_HEADERS]],
      body,
      startY: tableStartY,
      margin: { top: tableStartY, right: marginX, bottom: 15, left: marginX },
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7,
        cellPadding: 1.6,
        minCellHeight: 5,
        overflow: "linebreak",
        valign: "middle",
        textColor: [34, 34, 34],
        lineColor: [232, 237, 237],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [45, 90, 90],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "left" },
        1: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "center" },
      },
      didParseCell: hookData => {
        if (hookData.section !== "body") return;
        const kind = rowKinds[hookData.row.index];
        if (!kind || kind === "blank") return;

        if (kind === "sub") {
          hookData.cell.styles.fillColor = [45, 90, 90];
          hookData.cell.styles.textColor = [255, 255, 255];
          hookData.cell.styles.fontStyle = "bold";
        } else if (kind === "sem") {
          hookData.cell.styles.fillColor = [255, 251, 235];
          hookData.cell.styles.textColor = [146, 64, 14];
          hookData.cell.styles.fontStyle = "bold";
        } else if (kind === "lote") {
          const loteIndex = rowKinds
            .slice(0, hookData.row.index + 1)
            .filter(k => k === "lote").length;
          hookData.cell.styles.fillColor =
            loteIndex % 2 === 1 ? [255, 255, 255] : [247, 250, 250];
        } else if (kind === "empty") {
          hookData.cell.styles.textColor = [170, 170, 170];
          hookData.cell.styles.fontStyle = "italic";
        }
      },
      didDrawPage: drawHeaderFooter,
    });

    const blob = doc.output("blob");
    downloadPdfBlob(blob, exportPdfFilename(title));
    toast.success("PDF exportado!");
  } catch (error) {
    console.error("[exportMapaRebanhoPdf]", error);
    toast.error("Não foi possível exportar o PDF");
  }
}
