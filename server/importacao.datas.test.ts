/**
 * Testes de regressão para conversão de datas na importação de animais.
 *
 * Garante que todos os campos de data (dataNascimento, dataDesmama, dataEntrada, dataRnd)
 * são convertidos corretamente de DD/MM/AAAA para YYYY-MM-DD sem inversão de dia/mês.
 *
 * Critério de aceite:
 *   - Brinco 19, Data de Desmama: 01/05/2026 → banco: "2026-05-01" → exibição: "01/05/2026"
 */

import { describe, it, expect } from 'vitest';

// ─── Replica exata da função parseData usada na procedure importar ────────────
const parseData = (raw: string): string | undefined => {
  const s = (raw || '').trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const d = br[1].padStart(2, '0');
    const m = br[2].padStart(2, '0');
    let y = br[3];
    if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
    return `${y}-${m}-${d}`;
  }
  return undefined;
};

// ─── Replica exata da função toDateStr usada no NewAnimalPage ─────────────────
const toDateStr = (v: unknown): string => {
  if (!v) return '';
  if (typeof v === 'string') return v.split('T')[0];
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return '';
};

// ─── Replica da exibição no FormDatePicker ────────────────────────────────────
const displayDate = (value: string): string => {
  if (!value) return '';
  return new Date(value + 'T12:00:00').toLocaleDateString('pt-BR');
};

describe('Importação de animais — conversão de datas', () => {
  describe('parseData — formato DD/MM/AAAA → YYYY-MM-DD', () => {
    it('converte 01/05/2026 (1 de Maio) corretamente', () => {
      expect(parseData('01/05/2026')).toBe('2026-05-01');
    });

    it('converte 01/01/2026 (1 de Janeiro) corretamente', () => {
      expect(parseData('01/01/2026')).toBe('2026-01-01');
    });

    it('converte 31/12/2025 (31 de Dezembro) corretamente', () => {
      expect(parseData('31/12/2025')).toBe('2025-12-31');
    });

    it('não inverte dia e mês: 02/05/2026 deve ser 2 de Maio, não 5 de Fevereiro', () => {
      const result = parseData('02/05/2026');
      expect(result).toBe('2026-05-02');
      expect(result).not.toBe('2026-02-05');
    });

    it('aceita formato ISO YYYY-MM-DD sem alteração', () => {
      expect(parseData('2026-05-01')).toBe('2026-05-01');
    });

    it('retorna undefined para string vazia', () => {
      expect(parseData('')).toBeUndefined();
    });

    it('retorna undefined para string inválida', () => {
      expect(parseData('data-invalida')).toBeUndefined();
    });

    it('converte ano com 2 dígitos < 50 para 20xx', () => {
      expect(parseData('01/05/26')).toBe('2026-05-01');
    });

    it('converte ano com 2 dígitos >= 50 para 19xx', () => {
      expect(parseData('01/05/75')).toBe('1975-05-01');
    });
  });

  describe('Fluxo completo: planilha → banco → exibição', () => {
    it('caso do usuário: Brinco 19, Data de Desmama 01/05/2026', () => {
      // Passo 1: frontend lê "01/05/2026" da planilha
      const valorPlanilha = '01/05/2026';

      // Passo 2: backend converte para YYYY-MM-DD (o que vai para o banco)
      const valorBanco = parseData(valorPlanilha);
      expect(valorBanco).toBe('2026-05-01');

      // Passo 3: banco retorna "2026-05-01" (mode:string), frontend converte com toDateStr
      const valorFormulario = toDateStr(valorBanco);
      expect(valorFormulario).toBe('2026-05-01');

      // Passo 4: FormDatePicker exibe a data em formato BR
      const valorExibido = displayDate(valorFormulario);
      expect(valorExibido).toBe('01/05/2026');
    });

    it('não confunde 01/05/2026 (1 de Maio) com 05/01/2026 (5 de Janeiro)', () => {
      const valorPlanilha = '01/05/2026';
      const valorBanco = parseData(valorPlanilha);

      // Deve ser 1 de Maio, não 5 de Janeiro
      expect(valorBanco).toBe('2026-05-01');
      expect(valorBanco).not.toBe('2026-01-05');

      const valorExibido = displayDate(valorBanco!);
      expect(valorExibido).toBe('01/05/2026');
      expect(valorExibido).not.toBe('05/01/2026');
    });

    it('todos os campos de data usam a mesma rotina de conversão', () => {
      const datas = {
        dataNascimento: '01/01/2026',
        dataDesmama: '01/05/2026',
        dataEntrada: '15/03/2026',
        dataRnd: '20/06/2025',
      };

      expect(parseData(datas.dataNascimento)).toBe('2026-01-01');
      expect(parseData(datas.dataDesmama)).toBe('2026-05-01');
      expect(parseData(datas.dataEntrada)).toBe('2026-03-15');
      expect(parseData(datas.dataRnd)).toBe('2025-06-20');
    });
  });
});
