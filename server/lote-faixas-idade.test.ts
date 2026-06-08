import { describe, it, expect } from 'vitest';
import {
  faixaIdadeLote,
  calcularIdadeMeses,
  adicionarAnimalAoResumo,
  criarResumoSexoFaixa,
} from '../shared/lote-faixas-idade';

describe('lote-faixas-idade', () => {
  it('classifica faixas corretamente', () => {
    expect(faixaIdadeLote(0)).toBe('0-8');
    expect(faixaIdadeLote(8)).toBe('0-8');
    expect(faixaIdadeLote(9)).toBe('9-12');
    expect(faixaIdadeLote(12)).toBe('9-12');
    expect(faixaIdadeLote(13)).toBe('13-24');
    expect(faixaIdadeLote(36)).toBe('25-36');
    expect(faixaIdadeLote(37)).toBe('36+');
  });

  it('agrega contagem por sexo e faixa', () => {
    let resumo = criarResumoSexoFaixa();
    resumo = adicionarAnimalAoResumo(resumo, 'macho', 5);
    resumo = adicionarAnimalAoResumo(resumo, 'macho', 10);
    resumo = adicionarAnimalAoResumo(resumo, 'femea', 3);
    expect(resumo.machos['0-8']).toBe(1);
    expect(resumo.machos['9-12']).toBe(1);
    expect(resumo.femeas['0-8']).toBe(1);
  });

  it('retorna null para data inválida', () => {
    expect(calcularIdadeMeses(null)).toBeNull();
    expect(calcularIdadeMeses('')).toBeNull();
  });
});
