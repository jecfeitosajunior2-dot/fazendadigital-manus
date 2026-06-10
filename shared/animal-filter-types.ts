/**
 * Estado dos filtros da Lista de Animais (iRancho)
 */

/** Chaves dos filtros adicionais disponíveis no dropdown */
export type FiltroAdicionalKey =
  | 'dataNascimento'
  | 'peso'
  | 'rfid'
  | 'subdivisao'
  | 'raca'
  | 'categoria'
  | 'inativos'
  | 'marcadores'
  | 'idadeMeses'
  | 'rgn'
  | 'rgd'
  | 'animalComSisbov';

export const FILTROS_ADICIONAIS_OPCOES: { key: FiltroAdicionalKey; label: string }[] = [
  { key: 'dataNascimento', label: 'Data de Nascimento' },
  { key: 'peso', label: 'Peso' },
  { key: 'rfid', label: 'Nº RFID' },
  { key: 'subdivisao', label: 'Subdivisão' },
  { key: 'raca', label: 'Raça' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'inativos', label: 'Filtrar apenas animais inativos' },
  { key: 'marcadores', label: 'Marcadores' },
  { key: 'idadeMeses', label: 'Idade em Meses' },
  { key: 'rgn', label: 'Registro de Nascimento (RGN)' },
  { key: 'rgd', label: 'Registro Definitivo (RGD)' },
  { key: 'animalComSisbov', label: 'Animal com SISBOV' },
];

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
  pastoId: string;
  // Novos campos adicionais
  rfid: string;
  apenasInativos: boolean;
  idadeMesesMin: string;
  idadeMesesMax: string;
  rgn: string;
  rgd: string;
  animalComSisbov: boolean;
  // Filtros adicionais selecionados no dropdown
  filtrosAdicionaisSelecionados: FiltroAdicionalKey[];
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
  pastoId: '',
  rfid: '',
  apenasInativos: false,
  idadeMesesMin: '',
  idadeMesesMax: '',
  rgn: '',
  rgd: '',
  animalComSisbov: false,
  filtrosAdicionaisSelecionados: [],
};

/** Converte estado do filtro para parâmetros da API animais.list */
export function animaisFiltersToApiParams(filters: AnimaisListFiltersState, debouncedPesquisa: string) {
  const pesoMin = filters.pesoInicial.trim() ? Number(filters.pesoInicial.replace(',', '.')) : undefined;
  const pesoMax = filters.pesoFinal.trim() ? Number(filters.pesoFinal.replace(',', '.')) : undefined;
  const idadeMin = filters.idadeMesesMin.trim() ? Number(filters.idadeMesesMin) : undefined;
  const idadeMax = filters.idadeMesesMax.trim() ? Number(filters.idadeMesesMax) : undefined;

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
    pastoId: filters.pastoId ? Number(filters.pastoId) : undefined,
    rfid: filters.rfid || undefined,
    apenasInativos: filters.apenasInativos || undefined,
    idadeMesesMin: idadeMin !== undefined && !Number.isNaN(idadeMin) ? idadeMin : undefined,
    idadeMesesMax: idadeMax !== undefined && !Number.isNaN(idadeMax) ? idadeMax : undefined,
    rgn: filters.rgn || undefined,
    rgd: filters.rgd || undefined,
    animalComSisbov: filters.animalComSisbov || undefined,
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
    filters.marcadores.length > 0 ||
    !!filters.pastoId ||
    !!filters.rfid ||
    filters.apenasInativos ||
    !!filters.idadeMesesMin.trim() ||
    !!filters.idadeMesesMax.trim() ||
    !!filters.rgn ||
    !!filters.rgd ||
    filters.animalComSisbov
  );
}
