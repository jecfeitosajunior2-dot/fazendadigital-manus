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

/** Mesma regra da lista Rebanho → Animais: "04" → 4. */
export function parseBrincoSortValue(v: string | null | undefined): string | number {
  const n = Number(v);
  return !Number.isNaN(n) && v !== "" && v !== null && v !== undefined ? n : (v || "");
}

/** Ordem crescente de brinco, igual ao padrão de Rebanho → Animais. */
export function compareBrincoCrescente(
  a: { brinco?: string | null; id?: number },
  b: { brinco?: string | null; id?: number },
): number {
  const va = parseBrincoSortValue(a.brinco);
  const vb = parseBrincoSortValue(b.brinco);
  if (va < vb) return -1;
  if (va > vb) return 1;
  return (a.id ?? 0) - (b.id ?? 0);
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
    .sort(compareBrincoCrescente)
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

/**
 * Dropdown abre no foco/click mesmo com busca vazia.
 * Busca vazia NÃO entra neste cálculo — filtrar é outro passo.
 */
export function shouldShowAnimalAutocompleteDropdown(params: {
  open: boolean;
  disabled?: boolean;
  selected?: unknown | null;
}): boolean {
  return Boolean(params.open) && !params.disabled && params.selected == null;
}
