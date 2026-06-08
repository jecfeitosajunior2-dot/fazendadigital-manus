import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseValorDecimalBanco } from "../shared/parseMoedaBr";

/**
 * Validação forense do bug "valor ×1000" na exportação de benfeitorias.
 *
 * Reproduz EXATAMENTE o fluxo do BenfeitoriasListPage + exportListSpreadsheet:
 *  1. Banco retorna valorEstimado como string DECIMAL ("100.00", "1500.00", "150000.00")
 *  2. BenfeitoriasListPage faz parseValorDecimalBanco(b.valorEstimado) -> number
 *  3. exportListSpreadsheet grava o número como célula numérica (t:'n')
 *
 * Esperado:
 *  - banco "100.00"    -> célula numérica 100      (exibida "100,00")
 *  - banco "1500.00"   -> célula numérica 1500     (exibida "1.500,00")
 *  - banco "150000.00" -> célula numérica 150000   (exibida "150.000,00")
 *
 * Em NENHUM caso pode aparecer multiplicação por 1000.
 */

// Réplica fiel da lógica de gravação de exportList.ts (não importável fora do browser por usar writeFile)
function buildSheet(headers: string[], rows: (string | number | null | undefined)[][]) {
  const aoa: (string | number)[][] = [
    headers,
    ...rows.map(r => r.map(cell => (cell ?? "") as string | number)),
  ];
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
        cell.z = "#,##0.00";
      } else {
        cell.t = "s";
        cell.v = String(original ?? "");
      }
    }
  }
  return ws;
}

function readCellValue(ws: XLSX.WorkSheet, addr: string) {
  return ws[addr];
}

describe("Exportação de benfeitorias - valor não é multiplicado", () => {
  const headers = ["Fazenda", "Nome", "Ano", "Valor Estimado", "Vida Útil", "Observações"];

  const casos: { bancoStr: string; esperadoNumero: number }[] = [
    { bancoStr: "100.00", esperadoNumero: 100 },
    { bancoStr: "1500.00", esperadoNumero: 1500 },
    { bancoStr: "150000.00", esperadoNumero: 150000 },
    { bancoStr: "0.00", esperadoNumero: 0 },
    { bancoStr: "99999.99", esperadoNumero: 99999.99 },
  ];

  it.each(casos)("banco $bancoStr -> célula numérica $esperadoNumero", ({ bancoStr, esperadoNumero }) => {
    const valor = parseValorDecimalBanco(bancoStr);
    expect(valor).toBe(esperadoNumero);

    const rows = [["Fazenda A", "Curral", 2020, valor, 25, "obs"]];
    const ws = buildSheet(headers, rows);

    // Coluna D (índice 3) = Valor Estimado, linha 2 (R=1, primeira linha de dados)
    const cell = readCellValue(ws, "D2");
    expect(cell.t).toBe("n");
    expect(cell.v).toBe(esperadoNumero);
    // Garante que NÃO houve multiplicação por 1000 (zero é exceção trivial: 0*1000=0)
    if (esperadoNumero !== 0) {
      expect(cell.v).not.toBe(esperadoNumero * 1000);
    }
  });

  it("round-trip: ler de volta o XLSX preserva o valor exato (sem ×1000)", () => {
    const valor = parseValorDecimalBanco("100.00");
    const rows = [["Fazenda A", "Curral", 2020, valor, 25, "obs"]];
    const ws = buildSheet(headers, rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const wb2 = XLSX.read(buf, { type: "buffer" });
    const ws2 = wb2.Sheets["Dados"];
    const cell = ws2["D2"];
    expect(cell.v).toBe(100);
    expect(cell.v).not.toBe(100000);
  });
});
