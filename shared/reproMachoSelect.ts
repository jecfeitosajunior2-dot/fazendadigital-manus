import {
  compareBrincoCrescente,
  matchesAnimalAutocompleteBusca,
  resolveAnimalIdFromSelecao,
  type AnimalAutocompleteRow,
} from "./animalAutocomplete";
import {
  buildReproAnimalElegibilidadeInput,
  isMachoReprodutivamenteMaduro,
} from "./reproElegibilidade";

export type ReproMachoSelectRow = AnimalAutocompleteRow;

/** @deprecated Use matchesAnimalAutocompleteBusca */
export function matchesReproMachoBusca(animal: ReproMachoSelectRow, search: string): boolean {
  return matchesAnimalAutocompleteBusca(animal, search);
}

/** Macho ativo, elegível, mesma fazenda (quando informada) e distinto da matriz. */
export function isMachoReprodutorCandidato(
  animal: ReproMachoSelectRow,
  opts: {
    fazendaId?: number | null;
    excludeAnimalId?: number | null;
  },
): boolean {
  if (animal.sexo !== "macho") return false;
  if ((animal.status ?? "ativo") !== "ativo") return false;
  if (opts.excludeAnimalId != null && animal.id === opts.excludeAnimalId) return false;
  if (opts.fazendaId != null && opts.fazendaId > 0 && animal.fazendaId != null) {
    if (animal.fazendaId !== opts.fazendaId) return false;
  }
  return isMachoReprodutivamenteMaduro(buildReproAnimalElegibilidadeInput(animal));
}

/** Lista de machos elegíveis para autocomplete (filtro client-side). */
export function filterMachosReprodutoresCandidatos(
  animais: ReproMachoSelectRow[],
  opts: {
    fazendaId?: number | null;
    excludeAnimalId?: number | null;
    search?: string | null;
    limit?: number;
  },
): ReproMachoSelectRow[] {
  const limit = opts.limit ?? 40;
  const search = opts.search?.trim() ?? "";

  return animais
    .filter(a => isMachoReprodutorCandidato(a, opts))
    .filter(a => (search ? matchesAnimalAutocompleteBusca(a, search) : true))
    .sort(compareBrincoCrescente)
    .slice(0, limit);
}

/** Texto digitado sem objeto selecionado não produz machoId. */
export function resolveMachoIdFromSelecao(
  machoSel: { id: number } | null | undefined,
): number | undefined {
  return resolveAnimalIdFromSelecao(machoSel);
}
