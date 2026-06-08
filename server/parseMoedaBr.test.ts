import { describe, it, expect } from 'vitest';
import { parseMoedaBr, formatValorDecimalBancoParaPlanilha, parseValorDecimalBanco } from '../shared/parseMoedaBr';

describe('parseMoedaBr — importação benfeitorias', () => {
  const casos: [string | number, string][] = [
    ['150,00', '150.00'],
    ['1.500,00', '1500.00'],
    ['15.000,00', '15000.00'],
    ['150.000,00', '150000.00'],
    ['1.500.000,00', '1500000.00'],
    ['150.000', '150000.00'],
    ['R$ 150.000,00', '150000.00'],
    ['150000', '150000.00'],
    ['150.00', '150.00'],
    [150000, '150000.00'],
  ];

  it.each(casos)('"%s" → %s', (entrada, esperado) => {
    expect(parseMoedaBr(entrada)).toBe(esperado);
  });
});

describe('formatValorDecimalBancoParaPlanilha — exportação benfeitorias', () => {
  const casos: [string | number, string][] = [
    ['150.00', '150,00'],
    [150, '150,00'],
    ['1500.50', '1.500,50'],
    ['15000.00', '15.000,00'],
    ['150000.00', '150.000,00'],
    ['1500000.00', '1.500.000,00'],
  ];

  it.each(casos)('banco %s → planilha "%s"', (entrada, esperado) => {
    expect(formatValorDecimalBancoParaPlanilha(entrada)).toBe(esperado);
  });

  it('não multiplica por 1000 (150 reais permanece 150,00)', () => {
    expect(formatValorDecimalBancoParaPlanilha('150.00')).toBe('150,00');
    expect(formatValorDecimalBancoParaPlanilha('150.00')).not.toBe('150.000,00');
  });

  it('não usa extração de dígitos que infla o valor', () => {
    const inflado = parseInt('150.00'.replace(/\D/g, ''), 10);
    expect(inflado).toBe(15000);
    expect(parseValorDecimalBanco('150.00')).toBe(150);
  });

  it('usa vírgula decimal (seguro para Excel BR)', () => {
    const fmt = formatValorDecimalBancoParaPlanilha('150.00');
    expect(fmt).toContain(',');
    expect(fmt).not.toMatch(/^\d+\.\d{2}$/);
  });
});
