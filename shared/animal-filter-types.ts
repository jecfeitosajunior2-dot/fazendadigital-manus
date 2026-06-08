/**
 * Estado dos filtros da Lista de Animais (iRancho)
 */

export type AnimaisListFiltersState = {
  fazendaId: string;
  raca: string;
  pesquisa: string;
  sexo: string;
  categoria: string;
  loteId: string;
  pesoInicial: string;
  pesoFinal: string;
  dataNascimentoInicial: string;
  dataNascimentoFinal: string;
  somenteSisbov: boolean;
  marcadores: string[];
  maisFiltrosAbertos: boolean;
};

export const ANIMAIS_LIST_FILTERS_STORAGE_KEY = 'fd:lista-animais-filtros';

export const INITIAL_ANIMAIS_LIST_FILTERS: AnimaisListFiltersState = {
  fazendaId: '',
  raca: '',
  pesquisa: '',
  sexo: '',
  categoria: '',
  loteId: '',
  pesoInicial: '',
  pesoFinal: '',
  dataNascimentoInicial: '',
  dataNascimentoFinal: '',
  somenteSisbov: false,
  marcadores: [],
  maisFiltrosAbertos: false,
};

/** Converte estado do filtro para parâmetros da API animais.list */
export function animaisFiltersToApiParams(filters: AnimaisListFiltersState, debouncedPesquisa: string) {
  const pesoMin = filters.pesoInicial.trim() ? Number(filters.pesoInicial.replace(',', '.')) : undefined;
  const pesoMax = filters.pesoFinal.trim() ? Number(filters.pesoFinal.replace(',', '.')) : undefined;

  return {
    fazendaId: filters.fazendaId ? Number(filters.fazendaId) : undefined,
    raca: filters.raca || undefined,
    search: debouncedPesquisa.trim() || undefined,
    sexo: filters.sexo || undefined,
    categoria: filters.categoria || undefined,
    loteId: filters.loteId ? Number(filters.loteId) : undefined,
    pesoMin: pesoMin !== undefined && !Number.isNaN(pesoMin) ? pesoMin : undefined,
    pesoMax: pesoMax !== undefined && !Number.isNaN(pesoMax) ? pesoMax : undefined,
    dataNascimentoInicio: filters.dataNascimentoInicial || undefined,
    dataNascimentoFim: filters.dataNascimentoFinal || undefined,
    somenteSisbov: filters.somenteSisbov || undefined,
    marcadores: filters.marcadores.length > 0 ? filters.marcadores : undefined,
  };
}

export function hasActiveAnimaisFilters(filters: AnimaisListFiltersState): boolean {
  return (
    !!filters.fazendaId ||
    !!filters.raca ||
    !!filters.pesquisa.trim() ||
    !!filters.sexo ||
    !!filters.categoria ||
    !!filters.loteId ||
    !!filters.pesoInicial.trim() ||
    !!filters.pesoFinal.trim() ||
    !!filters.dataNascimentoInicial ||
    !!filters.dataNascimentoFinal ||
    filters.somenteSisbov ||
    filters.marcadores.length > 0
  );
}
