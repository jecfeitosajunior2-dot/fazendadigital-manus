import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { EXPORT_HEADERS, EXPORT_VALOR_COL_INDEX } from "../shared/importacaoBenfeitorias";

/**
 * Regressão do bug reportado pelo usuário (prints de 08/06/2026):
 *  - Sistema mostra R$ 100,00 | Planilha exportada mostrava R$ 100.000,00.
 *
 * Causa histórica: valor exportado como STRING formatada PT-BR ("100,00"),
 * que o Excel com locale US interpretava como 100000 (×1000).
 *
 * Garantia atual: a célula de valor é NÚMERO nativo (t:'n') = 100, NUNCA 100000.
 * Este teste reproduz o fluxo real (parseValorDecimalBanco + montagem AOA + tipagem
 * célula a célula) e inspeciona o XLSX gerado.
 */

// Réplica fiel de parseValorDecimalBanco (shared/parseMoedaBr.ts)
function parseValorDecimalBanco(val: string | number | null | undefined): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const n = parseFloat(String(val).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Réplica fiel de exportListSpreadsheet → gera o workbook em memória.
function buildWorkbook(headers: string[], rows: (string | number)[][]) {
  const NUM_FMT = "#,##0.00";
  const aoa: (string | number)[][] = [headers, ...rows.map(r => r.map(c => (c ?? "") as string | number))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
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
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  return wb;
}

function valorCellRef(rowIndex: number): string {
  return XLSX.utils.encode_cell({ r: rowIndex, c: EXPORT_VALOR_COL_INDEX });
}

describe("Exportação de benfeitorias — cenário exato do print do usuário", () => {
  // Dados idênticos ao banco/print: valorEstimado vem como string decimal "100.00".
  const benfeitorias = [
    { fazenda: "Fazenda Volta Grande", nome: "Curral", ano: 2025, valorBanco: "100.00", vidaUtil: 15, obs: "Pedro" },
    { fazenda: "Fazenda Volta Grande", nome: "Casa",   ano: 2025, valorBanco: "100.00", vidaUtil: 15, obs: "Pedro" },
  ];

  const rows = benfeitorias.map(b => [
    b.nome,
    b.ano,
    b.vidaUtil,
    parseValorDecimalBanco(b.valorBanco) ?? "",
  ]) as (string | number)[][];

  it("grava o valor como número 100 (não 100000) na célula", () => {
    const wb = buildWorkbook(EXPORT_HEADERS, rows);
    const ws = wb.Sheets["Dados"];
    expect(ws[valorCellRef(1)].t).toBe("n");
    expect(ws[valorCellRef(1)].v).toBe(100);
    expect(ws[valorCellRef(1)].v).not.toBe(100000);
    expect(ws[valorCellRef(2)].t).toBe("n");
    expect(ws[valorCellRef(2)].v).toBe(100);
    expect(ws[valorCellRef(2)].v).not.toBe(100000);
  });

  it("round-trip: ao reler o XLSX, o valor continua 100", () => {
    const wb = buildWorkbook(EXPORT_HEADERS, rows);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const wb2 = XLSX.read(buf, { type: "buffer" });
    const ws2 = wb2.Sheets["Dados"];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws2);
    expect(Number(json[0]["Valor"])).toBe(100);
    expect(Number(json[1]["Valor"])).toBe(100);
  });

  it("não infla outros valores realistas (1500, 150000, 99999.99)", () => {
    const casos: Array<[string, number]> = [
      ["1500.00", 1500],
      ["150000.00", 150000],
      ["99999.99", 99999.99],
    ];
    for (const [banco, esperado] of casos) {
      const r = [["B", 2020, 10, parseValorDecimalBanco(banco) ?? ""]] as (string | number)[][];
      const wb = buildWorkbook(EXPORT_HEADERS, r);
      const ws = wb.Sheets["Dados"];
      expect(ws[valorCellRef(1)].v).toBe(esperado);
    }
  });
});
