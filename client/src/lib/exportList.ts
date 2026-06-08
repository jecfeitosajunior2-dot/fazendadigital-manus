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

  const safeName = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, safeName);
  toast.success("Planilha exportada!");
}

export function exportListPdf(
  title: string,
  headers: string[],
  rows: ExportRow[],
  options?: { alignRightFrom?: number }
) {
  if (rows.length === 0) {
    toast.error("Nenhum dado para exportar");
    return;
  }
  const alignRightFrom = options?.alignRightFrom ?? headers.length;

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
    .map(r =>
      `<tr>${r
        .map((cell, i) =>
          `<td style="text-align:${i >= alignRightFrom ? "right" : "left"}">${fmtCell(cell)}</td>`
        )
        .join("")}</tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px}
    th{background:#f5f5f5}</style></head><body>
    <h1>${title}</h1>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Permita pop-ups para exportar PDF");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
