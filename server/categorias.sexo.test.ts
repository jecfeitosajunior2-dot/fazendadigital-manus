/**
 * Testes de regressão para a regra de categorias por sexo.
 *
 * Garante que:
 * - Macho: apenas Boi, Novilho, Bezerro
 * - Fêmea: apenas Vaca, Novilha, Bezerra
 * - Touro, Garrote e Vaca Prenha/Prenhe NÃO existem em nenhuma lista
 *
 * A fonte da verdade é shared/animal-types.ts — usada por backend, importação e frontend.
 */

import { describe, it, expect } from 'vitest';
import {
  CATEGORIAS_POR_SEXO,
  getCategoriasPorSexo,
  isCategoriaValidaParaSexo,
  todasAsCategorias,
} from '../shared/animal-types';

describe('CATEGORIAS_POR_SEXO — regra definitiva', () => {
  describe('Macho', () => {
    it('contém exatamente Bezerro, Novilho e Boi (nessa ordem)', () => {
      expect(CATEGORIAS_POR_SEXO.Macho).toEqual(['Bezerro', 'Novilho', 'Boi']);
    });

    it('NÃO contém Touro', () => {
      expect(CATEGORIAS_POR_SEXO.Macho).not.toContain('Touro');
    });

    it('NÃO contém Garrote', () => {
      expect(CATEGORIAS_POR_SEXO.Macho).not.toContain('Garrote');
    });
  });

  describe('Fêmea', () => {
    it('contém exatamente Bezerra, Novilha e Vaca (nessa ordem)', () => {
      expect(CATEGORIAS_POR_SEXO['Fêmea']).toEqual(['Bezerra', 'Novilha', 'Vaca']);
    });

    it('NÃO contém Vaca Prenha', () => {
      expect(CATEGORIAS_POR_SEXO['Fêmea']).not.toContain('Vaca Prenha');
    });

    it('NÃO contém Vaca Prenhe', () => {
      expect(CATEGORIAS_POR_SEXO['Fêmea']).not.toContain('Vaca Prenhe');
    });
  });
});

describe('getCategoriasPorSexo', () => {
  it('retorna [Bezerro, Novilho, Boi] para Macho', () => {
    expect(getCategoriasPorSexo('Macho')).toEqual(['Bezerro', 'Novilho', 'Boi']);
  });

  it('retorna [Bezerra, Novilha, Vaca] para Fêmea', () => {
    expect(getCategoriasPorSexo('Fêmea')).toEqual(['Bezerra', 'Novilha', 'Vaca']);
  });

  it('retorna [] para sexo desconhecido', () => {
    expect(getCategoriasPorSexo('Desconhecido')).toEqual([]);
  });
});

describe('isCategoriaValidaParaSexo', () => {
  // ── Macho ────────────────────────────────────────────────────────────────────
  it('Boi é válido para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Boi')).toBe(true);
  });

  it('Novilho é válido para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Novilho')).toBe(true);
  });

  it('Bezerro é válido para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Bezerro')).toBe(true);
  });

  it('Touro é INVÁLIDO para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Touro')).toBe(false);
  });

  it('Garrote é INVÁLIDO para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Garrote')).toBe(false);
  });

  it('Vaca é INVÁLIDA para Macho', () => {
    expect(isCategoriaValidaParaSexo('Macho', 'Vaca')).toBe(false);
  });

  // ── Fêmea ────────────────────────────────────────────────────────────────────
  it('Vaca é válida para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Vaca')).toBe(true);
  });

  it('Novilha é válida para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Novilha')).toBe(true);
  });

  it('Bezerra é válida para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Bezerra')).toBe(true);
  });

  it('Vaca Prenha é INVÁLIDA para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Vaca Prenha')).toBe(false);
  });

  it('Vaca Prenhe é INVÁLIDA para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Vaca Prenhe')).toBe(false);
  });

  it('Boi é INVÁLIDO para Fêmea', () => {
    expect(isCategoriaValidaParaSexo('Fêmea', 'Boi')).toBe(false);
  });
});

describe('todasAsCategorias', () => {
  it('retorna exatamente 6 categorias', () => {
    expect(todasAsCategorias()).toHaveLength(6);
  });

  it('NÃO inclui Touro', () => {
    expect(todasAsCategorias()).not.toContain('Touro');
  });

  it('NÃO inclui Garrote', () => {
    expect(todasAsCategorias()).not.toContain('Garrote');
  });

  it('NÃO inclui Vaca Prenha', () => {
    expect(todasAsCategorias()).not.toContain('Vaca Prenha');
  });

  it('NÃO inclui Vaca Prenhe', () => {
    expect(todasAsCategorias()).not.toContain('Vaca Prenhe');
  });

  it('inclui todas as categorias válidas', () => {
    const todas = todasAsCategorias();
    expect(todas).toContain('Boi');
    expect(todas).toContain('Novilho');
    expect(todas).toContain('Bezerro');
    expect(todas).toContain('Vaca');
    expect(todas).toContain('Novilha');
    expect(todas).toContain('Bezerra');
  });
});
