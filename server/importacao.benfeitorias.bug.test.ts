import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";

/**
 * Regressão do bug de IMPORTAÇÃO reportado pelo usuário (08/06/2026):
 *
 * Planilha com R$ 100.000,00 → sistema salvava R$ 100,00 (divisão por 1000).
 *
 * Causa: XLSX.utils.sheet_to_json com raw: false converte o número 100000
 * (formato #,##0.00) para a string "100,000.00" (locale US do SheetJS).
 * parseMoedaBr interpreta "100,000.00" como: vírgula = milhar, ponto = decimal
 * → 100.00 (R$ 100,00). Bug confirmado.
 *
 * Correção: usar raw: true para preservar o valor numérico 100000.
 * parseMoedaBr(String(100000)) = "100000.00" → correto.
 */

// Réplica fiel de parseMoedaBr (shared/parseMoedaBr.ts)
function parseMoedaBr(val: string | number): string {
  if (val == null || (val as string) === '') return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val.toFixed(2) : '';
  }
  let v = (val as string).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!v) return '';
  const hasComma = v.includes(',');
  const hasDot = v.includes('.');
  if (hasComma) {
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n.toFixed(2) : '';
  }
  if (hasDot) {
    const parts = v.split('.');
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length === 2 && /^\d{2}$/.test(last)) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }
    const isBrMilhar = parts.length >= 2
      && /^\d{1,3}$/.test(parts[0])
      && parts.slice(1).every((p: string) => /^\d{3}$/.test(p));
    if (isBrMilhar) {
      const n = parseFloat(v.replace(/\./g, ''));
      return Number.isFinite(n) ? n.toFixed(2) : '';
    }
  }
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n.toFixed(2) : '';
}

/** Cria um XLSX com valor numérico + formato #,##0.00 (como ExcelJS gera) */
function criarXlsxComValor(valor: number): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Fazenda *", "Nome (Benfeitoria) *", "Ano *", "Valor (R$)", "Vida útil", "Observações"],
    ["Fazenda Volta Grande", "Curral", 2025, valor, 15, "Pedro"],
  ]);
  ws["D2"].z = "#,##0.00";
  ws["D2"].t = "n";
  ws["D2"].v = valor;
  XLSX.utils.book_append_sheet(wb, ws, "Benfeitorias");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Bug de importação: R$ 100.000,00 → R$ 100,00", () => {
  it("raw: false (BUG) — converte 100000 para '100,000.00' → parseMoedaBr retorna '100.00'", () => {
    const buf = criarXlsxComValor(100000);
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const ws = wb.Sheets["Benfeitorias"];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
    const valorStr = String(rows[0]["Valor (R$)"] ?? '').trim();
    // Documenta o bug: SheetJS com raw:false usa locale US → "100,000.00"
    expect(valorStr).toBe("100,000.00");
    // parseMoedaBr interpreta vírgula como milhar → 100.00 (ERRADO)
    expect(parseMoedaBr(valorStr)).toBe("100.00"); // ← este é o bug
  });

  it("raw: true (CORREÇÃO) — preserva 100000 como número → parseMoedaBr retorna '100000.00'", () => {
    const buf = criarXlsxComValor(100000);
    const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
    const ws = wb.Sheets["Benfeitorias"];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
    const valorRaw = rows[0]["Valor (R$)"];
    // Com raw:true, o valor chega como número 100000
    expect(typeof valorRaw).toBe("number");
    expect(valorRaw).toBe(100000);
    // parseMoedaBr(String(100000)) = "100000.00" → CORRETO
    expect(parseMoedaBr(String(valorRaw))).toBe("100000.00");
  });

  it("outros valores: 1500, 99999.99, 250000 — todos corretos com raw: true", () => {
    const casos: Array<[number, string]> = [
      [1500, "1500.00"],
      [99999.99, "99999.99"],
      [250000, "250000.00"],
    ];
    for (const [entrada, esperado] of casos) {
      const buf = criarXlsxComValor(entrada);
      const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
      const ws = wb.Sheets["Benfeitorias"];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
      const valorRaw = rows[0]["Valor (R$)"];
      expect(parseMoedaBr(String(valorRaw))).toBe(esperado);
    }
  });
});
