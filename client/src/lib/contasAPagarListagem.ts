/**
 * Apresentação da listagem somente leitura de Contas a Pagar (Financeiro V2).
 *
 * titulosList devolve o título cru (FinTituloRow): sem parcelas, vencimento,
 * saldo ou situação. Esses campos oficiais vêm de titulosGet (detalheTitulo).
 * Aqui só projetamos o que o V2 já calculou — sem nova regra financeira.
 */

import {
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  FINANCEIRO_ORIGEM_MANUAL,
  FINANCEIRO_ORIGEM_MANUTENCAO,
  type TituloSituacaoDerivada,
} from "@shared/financeiroNucleo";

export const FINANCEIRO_CONTAS_A_PAGAR_PATH = "/financeiro/contas-a-pagar";

export const FILTRO_TODOS = "";
export const FILTRO_SEM_FAZENDA = "sem";
export const FILTRO_ATIVOS = "ativos";
export const FILTRO_CANCELADO = "cancelado";
export const FILTRO_VENCIDAS = "vencido";
export const TEXTO_A_DEFINIR = "A definir";

export const PERIODO_TODAS = "todas";
export const PERIODO_SEM_VENCIMENTO = "sem";

const MESES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export type ValorFiltroSituacaoContasAPagar =
  | typeof FILTRO_ATIVOS
  | typeof FILTRO_CANCELADO
  | TituloSituacaoDerivada;

export type PeriodoContasAPagar =
  | { tipo: "mes"; anoMes: string }
  | { tipo: "todas" }
  | { tipo: "sem_vencimento" };

export type TituloV2ListaBruta = {
  id: number;
  userId: number;
  tipo: "pagar" | "receber";
  estado: "ativo" | "cancelado";
  condicaoStatus: "a_definir" | "definida";
  pessoaId: number;
  contraparteNomeSnapshot: string;
  fazendaOrigemId: number | null;
  origemTipo: string;
  origemId: number | null;
  origemItemChave: string | null;
  descricao: string;
  dataCompetencia: string;
  valorOriginal: string | number;
  documentoReferencia?: string | null;
  observacoes?: string | null;
};

export type ParcelaV2Oficial = {
  id: number;
  tituloId: number;
  numero: number;
  vencimento: string;
  valorOriginal: string | number;
  saldoPrincipal: number;
  principalLiquidado: number;
  quitada: boolean;
};

export type TituloV2DetalheOficial = TituloV2ListaBruta & {
  situacao: TituloSituacaoDerivada;
  parcelas: ParcelaV2Oficial[];
};

export type LinhaContasAPagar = {
  key: string;
  tituloId: number;
  userId: number;
  parcelaId: number | null;
  parcelaNumero: number | null;
  totalParcelas: number;
  fornecedor: string;
  pessoaId: number;
  origemTipo: string;
  origemId: number | null;
  origemItemChave: string | null;
  documentoReferencia: string;
  fazendaOrigemId: number | null;
  vencimento: string | null;
  valor: string | number | null;
  saldoAberto: number | null;
  situacao: TituloSituacaoDerivada;
  quitada: boolean | null;
  estado: "ativo" | "cancelado";
  descricao: string;
};

export type FiltrosContasAPagar = {
  fazendaId: string;
  situacao: string;
  fornecedorId: string;
  origemTipo: string;
  pesquisa: string;
  periodo: PeriodoContasAPagar;
};

export function anoMesDeHoje(hojeISO: string): string {
  return hojeISO.slice(0, 7);
}

export function periodoMesAtualContasAPagar(hojeISO: string): PeriodoContasAPagar {
  return { tipo: "mes", anoMes: anoMesDeHoje(hojeISO) };
}

export function mesAnterior(anoMes: string): string {
  const parsed = parseAnoMes(anoMes);
  if (!parsed) return anoMes;
  if (parsed.mes === 1) return `${parsed.ano - 1}-12`;
  return `${parsed.ano}-${String(parsed.mes - 1).padStart(2, "0")}`;
}

export function mesSeguinte(anoMes: string): string {
  const parsed = parseAnoMes(anoMes);
  if (!parsed) return anoMes;
  if (parsed.mes === 12) return `${parsed.ano + 1}-01`;
  return `${parsed.ano}-${String(parsed.mes + 1).padStart(2, "0")}`;
}

export function rotuloMesAno(anoMes: string): string {
  const parsed = parseAnoMes(anoMes);
  if (!parsed) return anoMes;
  return `${MESES_PT[parsed.mes - 1]} de ${parsed.ano}`;
}

export function periodoDaNavegacaoMensal(
  periodo: PeriodoContasAPagar,
  hojeISO: string,
): string {
  return periodo.tipo === "mes" ? periodo.anoMes : anoMesDeHoje(hojeISO);
}

export function periodoMesAnterior(
  periodo: PeriodoContasAPagar,
  hojeISO: string,
): PeriodoContasAPagar {
  return { tipo: "mes", anoMes: mesAnterior(periodoDaNavegacaoMensal(periodo, hojeISO)) };
}

export function periodoMesSeguinte(
  periodo: PeriodoContasAPagar,
  hojeISO: string,
): PeriodoContasAPagar {
  return { tipo: "mes", anoMes: mesSeguinte(periodoDaNavegacaoMensal(periodo, hojeISO)) };
}

export function filtrosContasAPagarVazios(hojeISO: string): FiltrosContasAPagar {
  return {
    fazendaId: FILTRO_TODOS,
    situacao: FILTRO_ATIVOS,
    fornecedorId: FILTRO_TODOS,
    origemTipo: FILTRO_TODOS,
    pesquisa: "",
    periodo: periodoMesAtualContasAPagar(hojeISO),
  };
}

export function filtrosContasAPagarTodasDatas(hojeISO: string): FiltrosContasAPagar {
  return {
    ...filtrosContasAPagarVazios(hojeISO),
    periodo: { tipo: "todas" },
  };
}

export function idsTitulosAPagar(titulos: ReadonlyArray<TituloV2ListaBruta>): number[] {
  return titulos.filter(titulo => titulo.tipo === "pagar").map(titulo => titulo.id);
}

export function detalhesDoUsuarioAutenticado<T extends { userId: number }>(
  detalhes: ReadonlyArray<T>,
  userId: number,
): T[] {
  return detalhes.filter(item => item.userId === userId);
}

export function rotuloOrigemTitulo(origemTipo: string): string {
  if (origemTipo === FINANCEIRO_ORIGEM_COMPRA_INSUMOS) return "Compra";
  if (origemTipo === FINANCEIRO_ORIGEM_MANUTENCAO) return "Manutenção";
  if (origemTipo === FINANCEIRO_ORIGEM_MANUAL) return "Manual";
  return origemTipo;
}

export function rotuloSituacaoTitulo(situacao: TituloSituacaoDerivada): string {
  if (situacao === "em_aberto") return "Em aberto";
  if (situacao === "parcial") return "Parcial";
  if (situacao === "liquidado") return "Liquidado";
  return "Vencido";
}

export function tituloEstaCancelado(linha: Pick<LinhaContasAPagar, "estado">): boolean {
  return linha.estado === "cancelado";
}

/** Apresentação: cancelado tem prioridade sobre a situação oficial do V2. */
export function rotuloSituacaoLinha(linha: Pick<LinhaContasAPagar, "estado" | "situacao">): string {
  if (tituloEstaCancelado(linha)) return "Cancelado";
  return rotuloSituacaoTitulo(linha.situacao);
}

export function vencimentoOuSaldoADefinir(valor: string | number | null | undefined): boolean {
  return valor == null || valor === "";
}

/** Mesma condição do núcleo V2 em `derivarSituacaoTitulo`. */
export function parcelaVencidaEmAberto(
  parcela: Pick<ParcelaV2Oficial, "quitada" | "vencimento">,
  hojeISO: string,
): boolean {
  return !parcela.quitada && parcela.vencimento < hojeISO;
}

export function linhasDaListagemAPagar(
  detalhes: ReadonlyArray<TituloV2DetalheOficial>,
): LinhaContasAPagar[] {
  const linhas: LinhaContasAPagar[] = [];
  for (const titulo of detalhes) {
    if (titulo.tipo !== "pagar") continue;
    const documentoReferencia = titulo.documentoReferencia?.trim() ?? "";
    const parcelas = [...titulo.parcelas].sort((a, b) => a.numero - b.numero);
    if (parcelas.length === 0) {
      linhas.push({
        key: `titulo-${titulo.id}`,
        tituloId: titulo.id,
        userId: titulo.userId,
        parcelaId: null,
        parcelaNumero: null,
        totalParcelas: 0,
        fornecedor: titulo.contraparteNomeSnapshot,
        pessoaId: titulo.pessoaId,
        origemTipo: titulo.origemTipo,
        origemId: titulo.origemId,
        origemItemChave: titulo.origemItemChave,
        documentoReferencia,
        fazendaOrigemId: titulo.fazendaOrigemId,
        vencimento: null,
        valor: titulo.valorOriginal,
        saldoAberto: null,
        situacao: titulo.situacao,
        quitada: null,
        estado: titulo.estado,
        descricao: titulo.descricao,
      });
      continue;
    }
    for (const parcela of parcelas) {
      linhas.push({
        key: `parcela-${parcela.id}`,
        tituloId: titulo.id,
        userId: titulo.userId,
        parcelaId: parcela.id,
        parcelaNumero: parcela.numero,
        totalParcelas: parcelas.length,
        fornecedor: titulo.contraparteNomeSnapshot,
        pessoaId: titulo.pessoaId,
        origemTipo: titulo.origemTipo,
        origemId: titulo.origemId,
        origemItemChave: titulo.origemItemChave,
        documentoReferencia,
        fazendaOrigemId: titulo.fazendaOrigemId,
        vencimento: parcela.vencimento,
        valor: parcela.valorOriginal,
        saldoAberto: parcela.saldoPrincipal,
        situacao: titulo.situacao,
        quitada: parcela.quitada,
        estado: titulo.estado,
        descricao: titulo.descricao,
      });
    }
  }
  return linhas;
}

/** Listagem: vencida = vencimento anterior a hoje e saldo pendente. Não usa a situação do título. */
export function linhaVencida(linha: LinhaContasAPagar, hojeISO: string): boolean {
  if (tituloEstaCancelado(linha)) return false;
  if (!linha.vencimento || linha.vencimento >= hojeISO) return false;
  if (linha.quitada === true) return false;
  if (linha.saldoAberto == null) return false;
  return linha.saldoAberto > 0;
}

export function linhaNoPeriodoContasAPagar(
  linha: LinhaContasAPagar,
  periodo: PeriodoContasAPagar,
): boolean {
  if (periodo.tipo === "todas") return true;
  if (periodo.tipo === "sem_vencimento") return linha.vencimento == null;
  if (!linha.vencimento) return false;
  return anoMesDoVencimento(linha.vencimento) === periodo.anoMes;
}

export function linhaCorrespondePesquisa(
  linha: LinhaContasAPagar,
  pesquisa: string,
): boolean {
  const termo = normalizarPesquisa(pesquisa);
  if (!termo) return true;
  return camposPesquisaLinha(linha).some(campo => campo.includes(termo));
}

export function filtrarLinhasContasAPagar(
  linhas: ReadonlyArray<LinhaContasAPagar>,
  filtros: FiltrosContasAPagar,
  hojeISO: string,
): LinhaContasAPagar[] {
  return linhas.filter(linha => {
    if (!linhaNoPeriodoContasAPagar(linha, filtros.periodo)) return false;
    if (filtros.fazendaId === FILTRO_SEM_FAZENDA && linha.fazendaOrigemId != null) return false;
    if (filtros.fazendaId && filtros.fazendaId !== FILTRO_SEM_FAZENDA) {
      if (linha.fazendaOrigemId !== Number(filtros.fazendaId)) return false;
    }
    if (filtros.situacao === FILTRO_CANCELADO) {
      if (!tituloEstaCancelado(linha)) return false;
    } else if (filtros.situacao === FILTRO_VENCIDAS) {
      if (!linhaVencida(linha, hojeISO)) return false;
    } else if (filtros.situacao === FILTRO_ATIVOS || !filtros.situacao) {
      if (tituloEstaCancelado(linha)) return false;
    } else {
      if (tituloEstaCancelado(linha) || linha.situacao !== filtros.situacao) return false;
    }
    if (filtros.fornecedorId && linha.pessoaId !== Number(filtros.fornecedorId)) return false;
    if (filtros.origemTipo && linha.origemTipo !== filtros.origemTipo) return false;
    if (!linhaCorrespondePesquisa(linha, filtros.pesquisa)) return false;
    return true;
  });
}

export function ordenarLinhasContasAPagar(
  linhas: ReadonlyArray<LinhaContasAPagar>,
): LinhaContasAPagar[] {
  return [...linhas].sort((a, b) => {
    if (a.vencimento == null && b.vencimento == null) return a.tituloId - b.tituloId;
    if (a.vencimento == null) return 1;
    if (b.vencimento == null) return -1;
    if (a.vencimento !== b.vencimento) return a.vencimento < b.vencimento ? -1 : 1;
    if (a.tituloId !== b.tituloId) return a.tituloId - b.tituloId;
    return (a.parcelaNumero ?? 0) - (b.parcelaNumero ?? 0);
  });
}

export function paginarContasAPagar<T>(
  rows: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): T[] {
  const pagina = Math.max(1, page);
  const tamanho = Math.max(1, pageSize);
  return rows.slice((pagina - 1) * tamanho, pagina * tamanho);
}

export function opcoesSituacaoContasAPagar(): Array<{ value: ValorFiltroSituacaoContasAPagar; label: string }> {
  return [
    { value: FILTRO_ATIVOS, label: "Ativas" },
    { value: "em_aberto", label: "Em aberto" },
    { value: "parcial", label: "Parcialmente pagas" },
    { value: FILTRO_VENCIDAS, label: "Vencidas" },
    { value: "liquidado", label: "Pagas" },
    { value: FILTRO_CANCELADO, label: "Canceladas" },
  ];
}

export function opcoesFornecedorContasAPagar(
  linhas: ReadonlyArray<LinhaContasAPagar>,
): Array<{ value: string; label: string }> {
  const nomes = new Map<number, string>();
  for (const linha of linhas) {
    if (!nomes.has(linha.pessoaId)) nomes.set(linha.pessoaId, linha.fornecedor);
  }
  return [...nomes.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([id, nome]) => ({ value: String(id), label: nome }));
}

export function opcoesOrigemContasAPagar(
  linhas: ReadonlyArray<LinhaContasAPagar>,
): Array<{ value: string; label: string }> {
  return [...new Set(linhas.map(linha => linha.origemTipo))]
    .sort((a, b) => rotuloOrigemTitulo(a).localeCompare(rotuloOrigemTitulo(b), "pt-BR"))
    .map(tipo => ({ value: tipo, label: rotuloOrigemTitulo(tipo) }));
}

export function rotuloParcela(linha: LinhaContasAPagar): string {
  if (linha.totalParcelas <= 0) return TEXTO_A_DEFINIR;
  if (linha.totalParcelas === 1) return "À vista";
  return `${linha.parcelaNumero}/${linha.totalParcelas}`;
}

export function nomeFazendaDaLinha(
  fazendaOrigemId: number | null,
  fazendas: ReadonlyArray<{ id: number; nome: string }>,
): string {
  if (fazendaOrigemId == null) return "—";
  return fazendas.find(fazenda => fazenda.id === fazendaOrigemId)?.nome ?? "—";
}

const SITUACOES_FILTRO = new Set<string>([
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  "em_aberto",
  "parcial",
  "liquidado",
  "vencido",
]);

export function filtrosContasAPagarDaQuery(search: string, hojeISO: string): FiltrosContasAPagar {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const situacaoRaw = params.get("situacao")?.trim();
  let situacao = situacaoRaw && SITUACOES_FILTRO.has(situacaoRaw) ? situacaoRaw : FILTRO_ATIVOS;
  if (params.get("vencidas") === "1" && (!situacaoRaw || situacaoRaw === FILTRO_ATIVOS)) {
    situacao = FILTRO_VENCIDAS;
  }
  return {
    fazendaId: params.get("fazenda")?.trim() ?? FILTRO_TODOS,
    situacao,
    fornecedorId: params.get("fornecedor")?.trim() ?? FILTRO_TODOS,
    origemTipo: params.get("origem")?.trim() ?? FILTRO_TODOS,
    pesquisa: params.get("q")?.trim() ?? "",
    periodo: periodoDaQuery(params.get("mes")?.trim() ?? "", hojeISO),
  };
}

export function contasAPagarListagemPath(filtros: FiltrosContasAPagar): string {
  const params = new URLSearchParams();
  if (filtros.fazendaId) params.set("fazenda", filtros.fazendaId);
  if (filtros.situacao) params.set("situacao", filtros.situacao);
  if (filtros.fornecedorId) params.set("fornecedor", filtros.fornecedorId);
  if (filtros.origemTipo) params.set("origem", filtros.origemTipo);
  params.set("mes", mesParaQuery(filtros.periodo));
  if (filtros.pesquisa.trim()) params.set("q", filtros.pesquisa.trim());
  const qs = params.toString();
  return qs ? `${FINANCEIRO_CONTAS_A_PAGAR_PATH}?${qs}` : FINANCEIRO_CONTAS_A_PAGAR_PATH;
}

export function contasAPagarDetalhePath(
  id: number,
  filtros?: FiltrosContasAPagar,
): string {
  const base = `${FINANCEIRO_CONTAS_A_PAGAR_PATH}/${id}`;
  if (!filtros) return base;
  const qs = contasAPagarListagemPath(filtros).split("?")[1];
  return qs ? `${base}?${qs}` : base;
}

export function contasAPagarVoltarPath(search: string, hojeISO: string): string {
  return contasAPagarListagemPath(filtrosContasAPagarDaQuery(search, hojeISO));
}

export function idTituloContasAPagar(raw: string | undefined): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function parseAnoMes(anoMes: string): { ano: number; mes: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(anoMes);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (!Number.isInteger(ano) || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

function anoMesDoVencimento(vencimento: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(vencimento);
  return match ? `${match[1]}-${match[2]}` : null;
}

function periodoDaQuery(mesRaw: string, hojeISO: string): PeriodoContasAPagar {
  if (mesRaw === PERIODO_TODAS) return { tipo: "todas" };
  if (mesRaw === PERIODO_SEM_VENCIMENTO) return { tipo: "sem_vencimento" };
  if (parseAnoMes(mesRaw)) return { tipo: "mes", anoMes: mesRaw };
  return periodoMesAtualContasAPagar(hojeISO);
}

function mesParaQuery(periodo: PeriodoContasAPagar): string {
  if (periodo.tipo === "todas") return PERIODO_TODAS;
  if (periodo.tipo === "sem_vencimento") return PERIODO_SEM_VENCIMENTO;
  return periodo.anoMes;
}

function normalizarPesquisa(valor: string): string {
  return valor.trim().toLowerCase();
}

function camposPesquisaLinha(linha: LinhaContasAPagar): string[] {
  const origem = rotuloOrigemTitulo(linha.origemTipo);
  const origemId = linha.origemId != null ? String(linha.origemId) : "";
  const chave = linha.origemItemChave ?? "";
  return [
    linha.fornecedor,
    linha.documentoReferencia,
    origem,
    origemId,
    chave,
    `${origem} ${origemId}`.trim(),
    linha.descricao,
  ].map(normalizarPesquisa);
}
