import { describe, it, expect } from 'vitest';
import { parseMoedaBr } from '../shared/parseMoedaBr';

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
