import { labelAnimalBusca, type AnimalBuscaDisplayRow } from "./animalBuscaDisplay";

export type AnimalAutocompleteRow = AnimalBuscaDisplayRow & {
  fazendaId?: number | null;
  status?: string | null;
  idadeMeses?: number | null;
  dataNascimento?: string | null;
};

/** Busca case-insensitive por brinco, nome ou RFID. */
export function matchesAnimalAutocompleteBusca(
  animal: AnimalAutocompleteRow,
  search: string,
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const fields = [animal.brinco, animal.nome, animal.brincoEletronico];
  return fields.some(f => (f ?? "").trim().toLowerCase().includes(q));
}

export function filterAnimalAutocompleteCandidates<T extends AnimalAutocompleteRow>(
  animais: T[],
  opts: {
    search?: string | null;
    limit?: number;
    isCandidate?: (animal: T) => boolean;
  },
): T[] {
  const limit = opts.limit ?? 40;
  const search = opts.search?.trim() ?? "";
  const isCandidate = opts.isCandidate ?? (() => true);

  return animais
    .filter(isCandidate)
    .filter(a => (search ? matchesAnimalAutocompleteBusca(a, search) : true))
    .slice(0, limit);
}

/** PK interna — nunca derivada do brinco digitado. */
export function resolveAnimalIdFromSelecao(
  selected: { id: number } | null | undefined,
): number | undefined {
  if (selected == null || !Number.isFinite(selected.id) || selected.id <= 0) return undefined;
  return selected.id;
}

/** Texto digitado incompatível com a seleção atual → limpar vínculo. */
export function shouldClearAutocompleteSelection<T extends AnimalAutocompleteRow>(
  searchText: string,
  selected: T | null | undefined,
  getLabel: (animal: T) => string = labelAnimalBusca,
): boolean {
  if (!selected) return false;
  return searchText.trim() !== getLabel(selected);
}
