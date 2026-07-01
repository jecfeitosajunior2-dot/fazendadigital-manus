/**
 * Estado dos filtros da Lista de Animais (iRancho)
 */

/** Chaves dos filtros adicionais disponíveis no dropdown */
export type FiltroAdicionalKey =
  | 'rfid'
  | 'raca'
  | 'pelagem'
  | 'marca'
  | 'subdivisao'
  | 'dataNascimento'
  | 'dataDesmama'
  | 'castrado'
  | 'produtorOrigem'
  | 'animalComSisbov'
  | 'rgn'
  | 'rgd'
  | 'pai'
  | 'mae'
  | 'status'
  | 'dataEntrada'
  // mantidos por compatibilidade
  | 'peso'
  | 'categoria'
  | 'inativos'
  | 'marcadores'
  | 'idadeMeses';

export const FILTROS_ADICIONAIS_OPCOES: { key: FiltroAdicionalKey; label: string }[] = [
  { key: 'peso', label: 'Peso (kg)' },
  { key: 'rfid', label: 'Nº RFID' },
  { key: 'raca', label: 'Raça' },
  { key: 'pelagem', label: 'Pelagem' },
  { key: 'marca', label: 'Marca' },
  { key: 'subdivisao', label: 'Subdivisão' },
  { key: 'dataNascimento', label: 'Data de Nascimento' },
  { key: 'dataDesmama', label: 'Data de Desmama' },
  { key: 'castrado', label: 'Castrado' },
  { key: 'produtorOrigem', label: 'Produtor de Origem' },
  { key: 'animalComSisbov', label: 'SISBOV' },
  { key: 'rgn', label: 'Registro Geral de Nascimento (RGN)' },
  { key: 'rgd', label: 'Registro Genealógico Definitivo (RGD)' },
  { key: 'pai', label: 'Pai (Reprodutor)' },
  { key: 'mae', label: 'Mãe (Matriz)' },
  { key: 'status', label: 'Status' },
  { key: 'dataEntrada', label: 'Data de Entrada' },
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
  rfid: string;
  apenasInativos: boolean;
  idadeMesesMin: string;
  idadeMesesMax: string;
  rgn: string;
  rgd: string;
  animalComSisbov: boolean;
  // Novos campos
  pelagem: string;
  marca: string;
  dataDesmamaMes: string;
  dataDesmamaDe: string;
  dataDesmamAte: string;
  castrado: string; // 'sim' | 'nao' | ''
  produtorOrigem: string;
  pai: string;
  mae: string;
  statusFiltro: string; // 'ativo' | 'inativo' | ''
  // Filtro por data de entrada na fazenda
  dataEntradaDe: string;
  dataEntradaAte: string;
  // Filtro de carência
  apenasEmCarencia: boolean;
  // Filtro sem lote
  apenasSemLote: boolean;
  // Filtro sem pesagem recente (60 dias)
  apenasSemPesagem: boolean;
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
  pelagem: '',
  marca: '',
  dataDesmamaMes: '',
  dataDesmamaDe: '',
  dataDesmamAte: '',
  castrado: '',
  produtorOrigem: '',
  pai: '',
  mae: '',
  statusFiltro: '',
  dataEntradaDe: '',
  dataEntradaAte: '',
  apenasEmCarencia: false,
  apenasSemLote: false,
  apenasSemPesagem: false,
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
    somenteSisbov: (filters.somenteSisbov || filters.animalComSisbov) || undefined,
    marcadores: filters.marcadores.length > 0 ? filters.marcadores : undefined,
    pastoId: filters.pastoId ? Number(filters.pastoId) : undefined,
    brincoEletronico: filters.rfid || undefined,
    status: filters.statusFiltro || (filters.apenasInativos ? 'inativo' : undefined),
    idadeMesesMin: idadeMin !== undefined && !Number.isNaN(idadeMin) ? idadeMin : undefined,
    idadeMesesMax: idadeMax !== undefined && !Number.isNaN(idadeMax) ? idadeMax : undefined,
    rgn: filters.rgn || undefined,
    rgd: filters.rgd || undefined,
    pelagem: filters.pelagem || undefined,
    marca: filters.marca || undefined,
    produtorOrigem: filters.produtorOrigem || undefined,
    castrado: filters.castrado === 'sim' ? true : filters.castrado === 'nao' ? false : undefined,
    pai: filters.pai || undefined,
    mae: filters.mae || undefined,
    dataEntradaDe: filters.dataEntradaDe || undefined,
    dataEntradaAte: filters.dataEntradaAte || undefined,
    apenasEmCarencia: filters.apenasEmCarencia || undefined,
    apenasSemLote: filters.apenasSemLote || undefined,
    apenasSemPesagem: filters.apenasSemPesagem || undefined,
  };
}

/** Aplica filtros vindos da URL (ex.: Visão Geral do Rebanho). Retorna null se não houver params relevantes. */
export function animaisFiltersFromSearchParams(search: string): AnimaisListFiltersState | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const dataEntradaDe = params.get('dataEntradaDe');
  const dataEntradaAte = params.get('dataEntradaAte');
  const dataNascimentoDe = params.get('dataNascimentoDe');
  const dataNascimentoAte = params.get('dataNascimentoAte');
  const fazendaId = params.get('fazendaId');
  const apenasEmCarencia = params.get('apenasEmCarencia') === 'true';
  const apenasSemLote = params.get('apenasSemLote') === 'true';
  const apenasSemPesagem = params.get('apenasSemPesagem') === 'true';
  const pesquisa = params.get('pesquisa');

  const hasParams =
    dataEntradaDe ||
    dataEntradaAte ||
    dataNascimentoDe ||
    dataNascimentoAte ||
    fazendaId ||
    apenasEmCarencia ||
    apenasSemLote ||
    apenasSemPesagem ||
    pesquisa;

  if (!hasParams) return null;

  const filtrosAdicionais: FiltroAdicionalKey[] = [];
  if (dataEntradaDe || dataEntradaAte) filtrosAdicionais.push('dataEntrada');
  if (dataNascimentoDe || dataNascimentoAte) filtrosAdicionais.push('dataNascimento');

  return {
    ...INITIAL_ANIMAIS_LIST_FILTERS,
    ...(dataEntradaDe ? { dataEntradaDe } : {}),
    ...(dataEntradaAte ? { dataEntradaAte } : {}),
    ...(dataNascimentoDe ? { dataNascimentoInicial: dataNascimentoDe } : {}),
    ...(dataNascimentoAte ? { dataNascimentoFinal: dataNascimentoAte } : {}),
    ...(fazendaId && fazendaId !== '0' ? { fazendaId } : {}),
    ...(apenasEmCarencia ? { apenasEmCarencia: true } : {}),
    ...(apenasSemLote ? { apenasSemLote: true } : {}),
    ...(apenasSemPesagem ? { apenasSemPesagem: true } : {}),
    ...(pesquisa ? { pesquisa } : {}),
    maisFiltrosAbertos: filtrosAdicionais.length > 0 || Boolean(dataNascimentoDe || dataNascimentoAte),
    filtrosAdicionaisSelecionados: filtrosAdicionais,
  };
}

export function readPersistedAnimaisListFilters(): AnimaisListFiltersState {
  try {
    const raw = sessionStorage.getItem(ANIMAIS_LIST_FILTERS_STORAGE_KEY);
    if (raw) return { ...INITIAL_ANIMAIS_LIST_FILTERS, ...JSON.parse(raw) as Partial<AnimaisListFiltersState> };
  } catch {
    // ignora JSON inválido
  }
  return INITIAL_ANIMAIS_LIST_FILTERS;
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
    filters.animalComSisbov ||
    !!filters.pelagem ||
    !!filters.marca ||
    !!filters.dataDesmamaDe ||
    !!filters.dataDesmamAte ||
    !!filters.castrado ||
    !!filters.produtorOrigem ||
    !!filters.pai ||
    !!filters.mae ||
    !!filters.statusFiltro ||
    !!filters.dataEntradaDe ||
    !!filters.dataEntradaAte ||
    filters.apenasEmCarencia ||
    filters.apenasSemLote ||
    filters.apenasSemPesagem
  );
}
