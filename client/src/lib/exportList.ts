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
  lotes: MapaLoteExport[];
};

export type MapaFazendaExport = {
  fazendaNome: string;
  subdivisoes: MapaSubdivisaoExport[];
  semSubdivisao: MapaLoteExport[];
};

/**
 * Exporta o Mapa do Rebanho em PDF com layout hierárquico:
 * - Linha de resumo por subdivisão (fundo verde escuro, dados consolidados)
 * - Linhas filhas de cada lote (recuadas, com taxa proporcional)
 */
export function exportMapaRebanhoPdf(
  fazendas: MapaFazendaExport[],
  options?: { fazendaNome?: string; periodo?: string }
) {
  const totalRegistros = fazendas.reduce(
    (acc, f) =>
      acc +
      f.subdivisoes.reduce((a, s) => a + Math.max(s.lotes.length, 1), 0) +
      f.semSubdivisao.length,
    0
  );
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

  const LOGO_URL =
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663279574029/PysonEdborftbNjnGCsDJF/fd-logo-new-icon-hDRpA4ewivnQJS943anC5c.webp";

  const fmtNum = (v: number | null, decimals = 2): string =>
    v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "—";

  const fmtArea = (v: number | null): string =>
    v != null ? `${fmtNum(v)} ha` : "—";

  const statusLabel: Record<string, string> = {
    ativo: "Ativo",
    inativo: "Inativo",
    descanso: "Descanso",
    reforma: "Reforma",
  };

  // ── Gera blocos HTML por fazenda (igual ao layout da tela) ───────────────────────────────
  const multiModo = fazendas.length > 1;

  const buildFazendaBlock = (faz: typeof fazendas[0]): string => {
    let rowIdx = 0;
    let tableRows = "";

    const addSubRow = (sub: MapaSubdivisaoExport) => {
      const superlotado =
        sub.capacidade != null && sub.capacidade > 0 && sub.totalAnimais > sub.capacidade;
      const statusText = sub.pastoStatus ? (statusLabel[sub.pastoStatus] ?? sub.pastoStatus) : "";
      const siglaText = sub.pastoSigla ? ` (${sub.pastoSigla})` : "";
      const capText =
        sub.capacidade != null && sub.capacidade > 0
          ? `<br><span style="font-size:8px;color:${superlotado ? "#dc2626" : "#888"};"> ${superlotado ? "⚠ " : ""}${sub.totalAnimais}/${sub.capacidade} UA</span>`
          : "";

      tableRows += `
        <tr class="sub-row" style="background:#2D5A5A;">
          <td style="padding:6px 8px;font-weight:700;font-size:10px;color:#fff;">
            ${sub.pastoNome}${siglaText}
            ${statusText ? `<span style="margin-left:6px;font-size:8px;font-weight:600;background:rgba(255,255,255,0.2);padding:1px 5px;border-radius:3px;color:#d1fae5;">${statusText}</span>` : ""}
            <span style="margin-left:6px;font-size:8px;color:rgba(255,255,255,0.6);">${sub.lotes.length} lote${sub.lotes.length !== 1 ? "s" : ""}</span>
          </td>
          <td style="padding:6px 8px;text-align:center;font-weight:700;color:#fff;font-size:11px;">${sub.totalAnimais}${capText}</td>
          <td style="padding:6px 8px;text-align:center;color:rgba(255,255,255,0.85);font-size:10px;">${fmtArea(sub.areaHa)}</td>
          <td style="padding:6px 8px;text-align:center;color:rgba(255,255,255,0.85);font-size:10px;">${fmtNum(sub.taxaLotacao)} UA/ha</td>
          <td style="padding:6px 8px;text-align:center;color:rgba(255,255,255,0.5);font-size:10px;">—</td>
        </tr>`;

      if (sub.lotes.length === 0) {
        const bg = rowIdx % 2 === 0 ? "#fff" : "#f7fafa";
        rowIdx++;
        tableRows += `
          <tr style="background:${bg};">
            <td style="padding:5px 8px 5px 22px;font-size:10px;color:#aaa;">└ Sem lotes cadastrados</td>
            <td colspan="4" style="padding:5px 8px;text-align:center;font-size:10px;color:#aaa;">—</td>
          </tr>`;
      } else {
        sub.lotes.forEach(lote => {
          const bg = rowIdx % 2 === 0 ? "#fff" : "#f7fafa";
          rowIdx++;
          const diasText =
            lote.diasNoPasto != null
              ? `<br><span style="font-size:8px;color:#aaa;">${lote.diasNoPasto}d no pasto</span>`
              : "";
          const taxaText =
            lote.taxaProporcional != null
              ? `${fmtNum(lote.taxaProporcional)} UA/ha<br><span style="font-size:8px;color:#aaa;">contribuição</span>`
              : "—";
          tableRows += `
            <tr style="background:${bg};border-bottom:1px solid #e8eded;">
              <td style="padding:5px 8px 5px 22px;font-size:10px;color:#374151;">
                <span style="color:#ccc;margin-right:4px;">└</span>${lote.loteNome}
              </td>
              <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:600;color:#374151;">${lote.totalAnimais}</td>
              <td style="padding:5px 8px;text-align:center;font-size:10px;color:#aaa;">—</td>
              <td style="padding:5px 8px;text-align:center;font-size:10px;color:#374151;">${taxaText}</td>
              <td style="padding:5px 8px;text-align:center;font-size:10px;color:#374151;">${lote.dataEntradaPasto ?? "—"}${diasText}</td>
            </tr>`;
        });
      }
    };

    faz.subdivisoes.forEach(sub => addSubRow(sub));
    faz.semSubdivisao.forEach(lote => {
      const bg = rowIdx % 2 === 0 ? "#fff" : "#f7fafa";
      rowIdx++;
      const diasText =
        lote.diasNoPasto != null
          ? `<br><span style="font-size:8px;color:#aaa;">${lote.diasNoPasto}d no pasto</span>`
          : "";
      tableRows += `
        <tr style="background:${bg};border-bottom:1px solid #e8eded;">
          <td style="padding:5px 8px;font-size:10px;color:#aaa;font-style:italic;">Sem Subdivisão</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;font-weight:600;color:#374151;">${lote.totalAnimais}</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;color:#aaa;">—</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;color:#aaa;">—</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;color:#374151;">${lote.dataEntradaPasto ?? "—"}${diasText}</td>
        </tr>`;
    });

    const totalFaz = faz.subdivisoes.reduce((a, s) => a + s.totalAnimais, 0) +
      faz.semSubdivisao.reduce((a, l) => a + l.totalAnimais, 0);

    // Cabeçalho da fazenda (barra verde escura) + tabela própria
    const fazHeader = multiModo
      ? `<div style="background:#1a3d3d;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;margin-top:14px;border-radius:4px 4px 0 0;">
           <span style="font-size:11px;font-weight:700;">${faz.fazendaNome}</span>
           <span style="font-size:10px;opacity:0.8;">${totalFaz} animal${totalFaz !== 1 ? "is" : ""}</span>
         </div>`
      : "";

    return `
      ${fazHeader}
      <table style="width:100%;border-collapse:collapse;font-size:10px;${multiModo ? "border-radius:0 0 4px 4px;overflow:hidden;" : ""}">
        <thead>
          <tr style="background:#fff;border-bottom:2px solid #2D5A5A;">
            <th style="text-align:left;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">Subdivisão / Lote</th>
            <th style="text-align:center;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">Total Animais</th>
            <th style="text-align:center;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">Área (ha)</th>
            <th style="text-align:center;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">Taxa Lotação (UA/ha)</th>
            <th style="text-align:center;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">Entrada no Pasto</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>`;
  };

  const allBlocksHtml = fazendas.map(buildFazendaBlock).join("");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Mapa do Rebanho</title>
  <style>
    @page { margin: 18mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .sub-row, .sub-row td { background:#2D5A5A !important; color:#fff !important; }
    }
    .report-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:12px; border-bottom:2px solid #2D5A5A; margin-bottom:16px; }
    .brand { display:flex; align-items:center; gap:10px; }
    .brand img { width:44px; height:44px; object-fit:contain; }
    .brand-text { display:flex; flex-direction:column; line-height:1; }
    .brand-name { font-size:15px; font-weight:700; letter-spacing:.06em; color:#0F172A; text-transform:uppercase; }
    .brand-sub { font-size:8px; font-weight:600; letter-spacing:.22em; color:#2D5A5A; text-transform:uppercase; margin-top:3px; }
    .report-meta { text-align:right; }
    .report-meta .fazenda-label { font-size:9px; text-transform:uppercase; letter-spacing:.08em; color:#888; margin-bottom:2px; }
    .report-meta .fazenda-nome { font-size:13px; font-weight:700; color:#2D5A5A; }
    .report-meta .periodo { font-size:9px; color:#999; margin-top:3px; }
    .report-title { font-size:14px; font-weight:700; color:#0F172A; margin-bottom:10px; }
    .report-count { font-size:10px; color:#666; margin-bottom:12px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    thead tr { background:#fff; color:#1a1a1a; border-bottom:2px solid #2D5A5A; }
    thead th { padding:6px 8px; font-weight:700; font-size:9px; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; color:#1a1a1a; border-bottom:2px solid #2D5A5A; }
    .sub-row { background:#2D5A5A !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
    .sub-row td { color:#fff !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .report-footer { margin-top:16px; padding-top:8px; border-top:1px solid #e0e0e0; display:flex; justify-content:space-between; font-size:9px; color:#aaa; }
  </style>
</head>
<body>
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

  <div class="report-title">Mapa do Rebanho</div>
  <div class="report-count">${totalRegistros} registro${totalRegistros !== 1 ? "s" : ""} encontrado${totalRegistros !== 1 ? "s" : ""}</div>

  ${allBlocksHtml}

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
