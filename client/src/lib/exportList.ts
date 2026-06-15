import { toast } from "sonner";
import * as XLSX from "xlsx";

export type ExportRow = (string | number | null | undefined)[];

/**
 * Exporta uma lista para um arquivo XLSX nativo (Excel real).
 *
 * Por que XLSX e não CSV:
 *  - Em CSV, o valor "100,00" (PT-BR) ou "100" pode ser reinterpretado pelo Excel
 *    de acordo com o locale do sistema (US lê vírgula como separador de milhar),
 *    inflando valores monetários (ex.: 100 → 100.000).
 *  - Em XLSX, cada célula carrega seu próprio TIPO. Números são gravados como
 *    número nativo (t:'n') com formato de exibição explícito (#,##0.00), de forma
 *    que o valor armazenado é EXATAMENTE o valor do banco, independente do locale.
 *
 * Regras de tipagem por célula:
 *  - number finito  → célula numérica (t:'n') com formato "#,##0.00"
 *  - demais valores → célula de texto (t:'s')
 */
export function exportListSpreadsheet(
  headers: string[],
  rows: ExportRow[],
  filename: string
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }

  // Formato de número brasileiro: milhar com ponto, decimal com vírgula.
  // O ExcelJS/SheetJS aplica o separador conforme o locale do Excel ao exibir,
  // mas o VALOR armazenado permanece sendo o número puro (sem multiplicação).
  const NUM_FMT = "#,##0.00";

  const aoa: (string | number)[][] = [
    headers,
    ...rows.map(r => r.map(cell => (cell ?? "") as string | number)),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Aplica o tipo correto célula a célula.
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      // Linha 0 é o cabeçalho — sempre texto.
      if (R === 0) continue;
      const original = rows[R - 1]?.[C];
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;

      if (typeof original === "number" && Number.isFinite(original)) {
        cell.t = "n";
        cell.v = original;
        cell.z = NUM_FMT;
      } else {
        cell.t = "s";
        cell.v = String(original ?? "");
      }
    }
  }

  // Largura automática aproximada das colunas (melhora a leitura no Excel).
  ws["!cols"] = headers.map((h, c) => {
    let max = String(h).length;
    for (const r of rows) {
      const v = r[c];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 10), 50) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");

  // Nome único com data E hora-minuto-segundo: evita colisão/confusão com
  // arquivos antigos em cache (ex.: "Modelo Importação (Benfeitorias) (11).xlsx").
  const agora = new Date();
  const carimbo = `${agora.toISOString().slice(0, 10)}_${String(agora.getHours()).padStart(2, "0")}-${String(agora.getMinutes()).padStart(2, "0")}-${String(agora.getSeconds()).padStart(2, "0")}`;
  const safeName = `${filename}_${carimbo}.xlsx`;
  XLSX.writeFile(wb, safeName);
  toast.success("Planilha exportada!");
}

export function exportListPdf(
  title: string,
  headers: string[],
  rows: ExportRow[],
  options?: { alignRightFrom?: number; fazendaNome?: string; periodo?: string; groupByCol?: number[] }
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const alignRightFrom = options?.alignRightFrom ?? headers.length;
  const fazendaNome = options?.fazendaNome || "Todas as Fazendas";
  const groupByCol = options?.groupByCol ?? [];

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
    .map((r, idx) => {
      const cells = r.map((cell, i) => {
        // Suprimir valor se coluna está no grupo E o valor é igual à linha anterior
        const suppress =
          groupByCol.includes(i) &&
          idx > 0 &&
          String(rows[idx - 1]?.[i] ?? "") === String(cell ?? "");
        const display = suppress ? "" : fmtCell(cell);
        const style = [
          `text-align:${i >= alignRightFrom ? "right" : "left"}`,
          suppress ? "color:#ccc" : "",
        ]
          .filter(Boolean)
          .join(";");
        return `<td style="${style}">${display}</td>`;
      });
      return `<tr class="${idx % 2 === 0 ? "row-even" : "row-odd"}">${cells.join("")}</tr>`;
    })
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
