/**
 * Tipos e constantes para animais
 * Mapeamento de Sexo → Categoria (lista dependente)
 */

export const SEXOS = ['Macho', 'Fêmea'] as const;
export type Sexo = (typeof SEXOS)[number];

export const CATEGORIAS_POR_SEXO: Record<Sexo, string[]> = {
  Macho: ['Boi', 'Novilho', 'Bezerro'],
  Fêmea: ['Vaca', 'Novilha', 'Bezerra'],
};

/**
 * Retorna as categorias válidas para um sexo
 */
export function getCategoriasPorSexo(sexo: string): string[] {
  if (sexo in CATEGORIAS_POR_SEXO) {
    return CATEGORIAS_POR_SEXO[sexo as Sexo];
  }
  return [];
}

/**
 * Valida se uma categoria é compatível com um sexo
 */
export function isCategoriaValidaParaSexo(sexo: string, categoria: string): boolean {
  const categoriasValidas = getCategoriasPorSexo(sexo);
  return categoriasValidas.includes(categoria);
}

/**
 * Retorna todas as categorias válidas (sem duplicatas)
 */
export function todasAsCategorias(): string[] {
  const todasCategorias = new Set<string>();
  Object.values(CATEGORIAS_POR_SEXO).forEach(cats => cats.forEach(cat => todasCategorias.add(cat)));
  return Array.from(todasCategorias).sort();
}
