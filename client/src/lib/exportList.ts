import { toast } from "sonner";
import ExcelJS from "exceljs";

export type ExportRow = (string | number | null | undefined)[];

// ── CORES INSTITUCIONAIS (mesmo padrão da planilha de importação) ──────────
const COR_HEADER_BG = '1A3C3C'; // verde petróleo escuro
const COR_COL_BG    = '2D5A5A'; // verde petróleo médio
const COR_LINHA_ALT = 'F2F7F7'; // cinza esverdeado muito claro

/**
 * Exporta uma lista para XLSX estilizado seguindo o padrão visual da
 * planilha de importação do Fazenda Digital:
 *  - Cabeçalho verde petróleo (#2D5A5A) com texto branco em negrito
 *  - Linhas alternadas (branco / cinza esverdeado)
 *  - Largura automática das colunas
 *  - Números armazenados como tipo numérico
 */
export async function exportListSpreadsheet(
  headers: string[],
  rows: ExportRow[],
  filename: string
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Fazenda Digital';
  wb.created = new Date();

  const ws = wb.addWorksheet('Dados', {
    properties: { tabColor: { argb: COR_COL_BG } },
    views: [{ state: 'frozen', ySplit: 1 }], // congela cabeçalho
  });

  // ── Linha 1: cabeçalhos estilizados ──────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headers.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font  = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_COL_BG } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = {
      bottom: { style: 'medium', color: { argb: COR_HEADER_BG } },
      right:  { style: 'thin',   color: { argb: 'FFFFFF' } },
    };
  });

  // ── Linhas de dados ───────────────────────────────────────────────────────
  rows.forEach((row, rowIdx) => {
    const wsRow = ws.getRow(rowIdx + 2);
    wsRow.height = 18;
    const isAlt = (rowIdx % 2 === 1); // linhas ímpares (0-based) ficam coloridas
    row.forEach((cell, colIdx) => {
      const wsCell = wsRow.getCell(colIdx + 1);
      const val = cell ?? '';
      if (typeof val === 'number' && Number.isFinite(val)) {
        wsCell.value = val;
        wsCell.numFmt = '#,##0.##';
      } else {
        wsCell.value = String(val);
      }
      wsCell.font      = { name: 'Calibri', size: 10 };
      wsCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? COR_LINHA_ALT : 'FFFFFF' } };
      wsCell.alignment = { horizontal: 'left', vertical: 'middle' };
      wsCell.border    = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
    });
  });

  // ── Largura automática das colunas ───────────────────────────────────────
  headers.forEach((h, c) => {
    let max = String(h).length;
    for (const r of rows) {
      const v = r[c];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    ws.getColumn(c + 1).width = Math.min(Math.max(max + 3, 12), 50);
  });

  // ── Gera o arquivo e dispara download ────────────────────────────────────
  const agora = new Date();
  const carimbo = `${agora.toISOString().slice(0, 10)}_${String(agora.getHours()).padStart(2, '0')}-${String(agora.getMinutes()).padStart(2, '0')}-${String(agora.getSeconds()).padStart(2, '0')}`;
  const safeName = `${filename}_${carimbo}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.click();
  URL.revokeObjectURL(url);

  toast.success('Planilha exportada!');
}

export function exportListPdf(
  title: string,
  headers: string[],
  rows: ExportRow[],
  options?: { alignRightFrom?: number; fazendaNome?: string; periodo?: string }
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const alignRightFrom = options?.alignRightFrom ?? headers.length;
  const fazendaNome = options?.fazendaNome || "Todas as Fazendas";

  // Período: usa o fornecido ou gera automaticamente com a data atual
  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaFormatada = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const periodo = options?.periodo || `Gerado em ${dataFormatada} às ${horaFormatada}`;

  // Logo do Fazenda Digital (URL pública usada na Sidebar)
  const LOGO_URL =
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/fd-logo-new-icon-hDRpA4ewivnQJS943anC5c.webp";

  // Formata números no padrão brasileiro apenas para EXIBIÇÃO no PDF.
  const fmtCell = (cell: unknown): string => {
    if (typeof cell === "number" && Number.isFinite(cell)) {
      return cell.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(cell ?? "");
  };

  const head = headers
    .map((h, i) =>
      `<th style="text-align:${i >= alignRightFrom ? "right" : "left"}">${h}</th>`
    )
    .join("");
  const body = rows
    .map((r, idx) =>
      `<tr class="${idx % 2 === 0 ? "row-even" : "row-odd"}">${r
        .map((cell, i) =>
          `<td style="text-align:${i >= alignRightFrom ? "right" : "left"}">${fmtCell(cell)}</td>`
        )
        .join("")}</tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 18mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }

    /* ── Cabeçalho ── */
    .report-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 2px solid #2D5A5A;
      margin-bottom: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand img {
      width: 44px;
      height: 44px;
      object-fit: contain;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1;
    }
    .brand-name {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #0F172A;
      text-transform: uppercase;
    }
    .brand-sub {
      font-size: 8px;
      font-weight: 600;
      letter-spacing: 0.22em;
      color: #2D5A5A;
      text-transform: uppercase;
      margin-top: 3px;
    }
    .report-meta {
      text-align: right;
    }
    .report-meta .fazenda-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #888;
      margin-bottom: 2px;
    }
    .report-meta .fazenda-nome {
      font-size: 13px;
      font-weight: 700;
      color: #2D5A5A;
    }
    .report-meta .periodo {
      font-size: 9px;
      color: #999;
      margin-top: 3px;
    }

    /* ── Título do relatório ── */
    .report-title {
      font-size: 14px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 10px;
    }
    .report-count {
      font-size: 10px;
      color: #666;
      margin-bottom: 12px;
    }

    /* ── Tabela ── */
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    thead tr { background: #2D5A5A; color: #fff; }
    thead th {
      padding: 6px 8px;
      font-weight: 600;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    tbody tr.row-even { background: #fff; }
    tbody tr.row-odd  { background: #f7fafa; }
    tbody td { padding: 5px 8px; border-bottom: 1px solid #e8eded; color: #222; }
    tbody tr:last-child td { border-bottom: none; }

    /* ── Rodapé ── */
    .report-footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #aaa;
    }
  </style>
</head>
<body>

  <!-- Cabeçalho -->
  <div class="report-header">
    <div class="brand">
      <img src="${LOGO_URL}" alt="Fazenda Digital" />
      <div class="brand-text">
        <span class="brand-name">Fazenda</span>
        <span class="brand-sub">Digital</span>
      </div>
    </div>
    <div class="report-meta">
      <div class="fazenda-label">Fazenda</div>
      <div class="fazenda-nome">${fazendaNome}</div>
      <div class="periodo">${periodo}</div>
    </div>
  </div>

  <!-- Título -->
  <div class="report-title">${title}</div>
  <div class="report-count">${rows.length} registro${rows.length !== 1 ? "s" : ""} encontrado${rows.length !== 1 ? "s" : ""}</div>

  <!-- Tabela -->
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>

  <!-- Rodapé -->
  <div class="report-footer">
    <span>Fazenda Digital &copy; ${agora.getFullYear()} &mdash; Gestão Pecuária Inteligente</span>
    <span>${dataFormatada} ${horaFormatada}</span>
  </div>

</body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Permita pop-ups para exportar PDF");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
