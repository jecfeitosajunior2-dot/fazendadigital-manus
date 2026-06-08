import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseValorDecimalBanco } from '../shared/parseMoedaBr';

/**
 * Regressão do bug "valor × 1000 na exportação de benfeitorias".
 *
 * O bug original: a planilha exportava o valor de R$ 100,00 como 100.000,00.
 * Causa: CSV com valor formatado PT-BR reinterpretado pelo Excel (locale).
 * Correção: exportar XLSX nativo com a célula de valor como NÚMERO real.
 *
 * Este teste reproduz a montagem de células feita em client/src/lib/exportList.ts
 * (tipagem por célula) e faz o round-trip (gera XLSX → lê de volta) para garantir
 * que o número armazenado é EXATAMENTE o valor do banco.
 */

const NUM_FMT = '#,##0.00';

// Reproduz a lógica de tipagem célula a célula de exportListSpreadsheet.
function buildSheet(headers: string[], rows: (string | number | null | undefined)[][]) {
  const aoa: (string | number)[][] = [
    headers,
    ...rows.map(r => r.map(c => (c ?? '') as string | number)),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws['!ref'] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      if (R === 0) continue;
      const original = rows[R - 1]?.[C];
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell) continue;
      if (typeof original === 'number' && Number.isFinite(original)) {
        cell.t = 'n';
        cell.v = original;
        cell.z = NUM_FMT;
      } else {
        cell.t = 's';
        cell.v = String(original ?? '');
      }
    }
  }
  return ws;
}

// Faz o round-trip completo: monta workbook → escreve buffer → lê de volta.
function roundTrip(ws: XLSX.WorkSheet) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const wb2 = XLSX.read(buf, { type: 'buffer' });
  return wb2.Sheets[wb2.SheetNames[0]];
}

describe('Exportação XLSX de benfeitorias — valor numérico preservado', () => {
  const headers = ['Fazenda', 'Nome', 'Ano', 'Valor (R$)', 'Vida útil', 'Observações'];

  // Cenários: valor no banco (DECIMAL string) → número esperado na célula.
  const casos: [string, number][] = [
    ['100.00', 100],
    ['200.00', 200],
    ['1500.00', 1500],
    ['15000.00', 15000],
    ['150000.00', 150000],
    ['1500000.00', 1500000],
    ['1500.50', 1500.5],
  ];

  it.each(casos)('banco "%s" → célula numérica %d (sem multiplicar por 1000)', (bancoVal, esperado) => {
    const valorNum = parseValorDecimalBanco(bancoVal);
    const rows = [['Fazenda Volta Grande', 'Curral', 2025, valorNum ?? '', 15, 'obs']];
    const ws = buildSheet(headers, rows);
    const wsLido = roundTrip(ws);

    // Coluna D (índice 3) da linha 2 (R=1) → célula D2.
    const cell = wsLido['D2'];
    expect(cell).toBeDefined();
    expect(cell.t).toBe('n'); // tipo numérico nativo
    expect(cell.v).toBe(esperado); // valor exato, sem inflar
    expect(cell.v).not.toBe(esperado * 1000); // jamais multiplicado por 1000
  });

  it('R$ 100,00 jamais vira 100000 (bug original)', () => {
    const rows = [['F', 'Curral', 2025, parseValorDecimalBanco('100.00') ?? '', 15, '']];
    const wsLido = roundTrip(buildSheet(headers, rows));
    expect(wsLido['D2'].v).toBe(100);
    expect(wsLido['D2'].v).not.toBe(100000);
  });

  it('R$ 200,00 jamais vira 200000 (bug original)', () => {
    const rows = [['F', 'Galpão', 2025, parseValorDecimalBanco('200.00') ?? '', 15, '']];
    const wsLido = roundTrip(buildSheet(headers, rows));
    expect(wsLido['D2'].v).toBe(200);
    expect(wsLido['D2'].v).not.toBe(200000);
  });

  it('célula de valor recebe formato de moeda #,##0.00', () => {
    const rows = [['F', 'Curral', 2025, 100, 15, '']];
    const ws = buildSheet(headers, rows);
    expect(ws['D2'].z).toBe(NUM_FMT);
  });

  it('valor nulo/vazio é exportado como texto vazio, não como número', () => {
    const rows = [['F', 'Curral', 2025, parseValorDecimalBanco(null) ?? '', 15, '']];
    const ws = buildSheet(headers, rows);
    // célula D2 deve ser string vazia (não numérica)
    expect(ws['D2'].t).toBe('s');
    expect(ws['D2'].v).toBe('');
  });

  it('campos de texto permanecem como texto', () => {
    const rows = [['Fazenda Volta Grande', 'Curral', 2025, 100, 15, 'Pedro']];
    const wsLido = roundTrip(buildSheet(headers, rows));
    expect(wsLido['A2'].t).toBe('s');
    expect(wsLido['A2'].v).toBe('Fazenda Volta Grande');
    expect(wsLido['B2'].v).toBe('Curral');
  });
});
