import {
  buildReproAnimalElegibilidadeInput,
  isFemeaReprodutivamenteMadura,
} from "./reproElegibilidade";

export type AnimalCoberturaRow = {
  id: number;
  sexo?: string | null;
  loteId?: number | null;
  categoria?: string | null;
  idadeMeses?: number | null;
  dataNascimento?: Date | string | null;
  brinco?: string | null;
  nome?: string | null;
};

function isMatrizElegivel(a: AnimalCoberturaRow, excludeIds?: ReadonlySet<number>): boolean {
  if (excludeIds?.has(a.id)) return false;
  if (a.sexo !== "femea") return false;
  return isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(a));
}

/** Contagem de matrizes elegíveis por lote (opcionalmente exclui já registradas na sessão). */
export function countMatrizesElegiveisPorLote(
  animais: readonly AnimalCoberturaRow[],
  excludeMatrizIds?: ReadonlySet<number>,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const a of animais) {
    if (!isMatrizElegivel(a, excludeMatrizIds)) continue;
    if (a.loteId == null) continue;
    map.set(a.loteId, (map.get(a.loteId) ?? 0) + 1);
  }
  return map;
}

/** Matrizes elegíveis de um lote, ordenadas por brinco/nome. */
export function listMatrizesElegiveisDoLote(
  animais: readonly AnimalCoberturaRow[],
  loteId: number,
  excludeMatrizIds?: ReadonlySet<number>,
): AnimalCoberturaRow[] {
  return animais
    .filter(a => a.loteId === loteId && isMatrizElegivel(a, excludeMatrizIds))
    .sort((a, b) => labelAnimalCobertura(a).localeCompare(labelAnimalCobertura(b), "pt-BR"));
}

export function labelAnimalCobertura(animal: AnimalCoberturaRow): string {
  const brinco = animal.brinco?.trim();
  if (brinco) return brinco;
  const nome = animal.nome?.trim();
  if (nome) return nome;
  return String(animal.id);
}
