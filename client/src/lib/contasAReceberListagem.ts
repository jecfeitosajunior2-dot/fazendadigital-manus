/**
 * Apresentação da listagem somente leitura de Contas a Receber (Financeiro V2).
 *
 * A descoberta dos títulos usa titulosList (tipo receber). Saldo, vencimento,
 * parcelas e situação oficiais vêm de titulosGet (detalheTitulo) — o mesmo
 * recorte da lista a pagar. Não recalcula saldo nem chama o Financeiro legado.
 */

import {
  FINANCEIRO_CONTAS_A_PAGAR_PATH,
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  FILTRO_TODOS,
  FILTRO_VENCIDAS,
  PERIODO_SEM_VENCIMENTO,
  PERIODO_TODAS,
  detalhesDoUsuarioAutenticado,
  filtrarLinhasContasAPagar,
  filtrosContasAPagarVazios,
  idTituloContasAPagar,
  opcoesFornecedorContasAPagar,
  ordenarLinhasContasAPagar,
  periodoMesAtualContasAPagar,
  rotuloSituacaoLinha,
  type FiltrosContasAPagar,
  type LinhaContasAPagar,
  type PeriodoContasAPagar,
  type TituloV2DetalheOficial,
  type TituloV2ListaBruta,
  type ValorFiltroSituacaoContasAPagar,
} from "./contasAPagarListagem";

export const FINANCEIRO_CONTAS_A_RECEBER_PATH = "/financeiro/contas-a-receber";

export type { TituloV2DetalheOficial, TituloV2ListaBruta } from "./contasAPagarListagem";
export type LinhaContasAReceber = LinhaContasAPagar;
export type FiltrosContasAReceber = FiltrosContasAPagar;
export type PeriodoContasAReceber = PeriodoContasAPagar;

export {
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  FILTRO_SEM_FAZENDA,
  FILTRO_TODOS,
  FILTRO_VENCIDAS,
  PERIODO_SEM_VENCIMENTO,
  PERIODO_TODAS,
  TEXTO_A_DEFINIR,
  detalhesDoUsuarioAutenticado,
  filtrarLinhasContasAPagar as filtrarLinhasContasAReceber,
  linhaVencida,
  nomeFazendaDaLinha,
  ordenarLinhasContasAPagar as ordenarLinhasContasAReceber,
  paginarContasAPagar as paginarContasAReceber,
  periodoMesAnterior,
  periodoMesSeguinte,
  rotuloMesAno,
  rotuloParcela,
  rotuloSituacaoTitulo,
  tituloEstaCancelado,
  vencimentoOuSaldoADefinir,
} from "./contasAPagarListagem";

export const idTituloContasAReceber = idTituloContasAPagar;

export function idsTitulosAReceber(titulos: ReadonlyArray<TituloV2ListaBruta>): number[] {
  return titulos.filter(titulo => titulo.tipo === "receber").map(titulo => titulo.id);
}

/** Uma linha por parcela oficial. Título sem parcela permanece localizável. */
export function linhasDaListagemAReceber(
  detalhes: ReadonlyArray<TituloV2DetalheOficial>,
): LinhaContasAReceber[] {
  const linhas: LinhaContasAReceber[] = [];
  for (const titulo of detalhes) {
    if (titulo.tipo !== "receber") continue;
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
        principalLiquidado: null,
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
        principalLiquidado: parcela.principalLiquidado,
        situacao: titulo.situacao,
        quitada: parcela.quitada,
        estado: titulo.estado,
        descricao: titulo.descricao,
      });
    }
  }
  return linhas;
}

export function filtrosContasAReceberVazios(hojeISO: string): FiltrosContasAReceber {
  return {
    ...filtrosContasAPagarVazios(hojeISO),
    origemTipo: FILTRO_TODOS,
  };
}

export function filtrosContasAReceberTodasDatas(hojeISO: string): FiltrosContasAReceber {
  return {
    ...filtrosContasAReceberVazios(hojeISO),
    periodo: { tipo: "todas" },
  };
}

export function opcoesSituacaoContasAReceber(): Array<{
  value: ValorFiltroSituacaoContasAPagar;
  label: string;
}> {
  return [
    { value: FILTRO_ATIVOS, label: "Ativas" },
    { value: "em_aberto", label: "Em aberto" },
    { value: "parcial", label: "Parcialmente recebidas" },
    { value: FILTRO_VENCIDAS, label: "Vencidas" },
    { value: "liquidado", label: "Recebidas" },
    { value: FILTRO_CANCELADO, label: "Canceladas" },
  ];
}

export function opcoesClienteContasAReceber(
  linhas: ReadonlyArray<LinhaContasAReceber>,
): Array<{ value: string; label: string }> {
  return opcoesFornecedorContasAPagar(linhas);
}

export function rotuloSituacaoLinhaReceber(linha: LinhaContasAReceber): string {
  const texto = rotuloSituacaoLinha(linha);
  if (texto === "Quitada") return "Recebida";
  return texto;
}

export function clienteDaLinha(linha: LinhaContasAReceber): string {
  return linha.fornecedor;
}

const SITUACOES_FILTRO = new Set<string>([
  FILTRO_ATIVOS,
  FILTRO_CANCELADO,
  "em_aberto",
  "parcial",
  "liquidado",
  "vencido",
]);

function parseAnoMes(anoMes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(anoMes);
}

function periodoDaQuery(mesRaw: string, hojeISO: string): PeriodoContasAReceber {
  if (mesRaw === PERIODO_TODAS) return { tipo: "todas" };
  if (mesRaw === PERIODO_SEM_VENCIMENTO) return { tipo: "sem_vencimento" };
  if (parseAnoMes(mesRaw)) return { tipo: "mes", anoMes: mesRaw };
  return periodoMesAtualContasAPagar(hojeISO);
}

function mesParaQuery(periodo: PeriodoContasAReceber): string {
  if (periodo.tipo === "todas") return PERIODO_TODAS;
  if (periodo.tipo === "sem_vencimento") return PERIODO_SEM_VENCIMENTO;
  return periodo.anoMes;
}

export function filtrosContasAReceberDaQuery(search: string, hojeISO: string): FiltrosContasAReceber {
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
    fornecedorId: params.get("cliente")?.trim() ?? FILTRO_TODOS,
    origemTipo: FILTRO_TODOS,
    pesquisa: params.get("q")?.trim() ?? "",
    periodo: periodoDaQuery(params.get("mes")?.trim() ?? "", hojeISO),
  };
}

export function contasAReceberListagemPath(filtros: FiltrosContasAReceber): string {
  const params = new URLSearchParams();
  if (filtros.fazendaId) params.set("fazenda", filtros.fazendaId);
  if (filtros.situacao) params.set("situacao", filtros.situacao);
  if (filtros.fornecedorId) params.set("cliente", filtros.fornecedorId);
  params.set("mes", mesParaQuery(filtros.periodo));
  if (filtros.pesquisa.trim()) params.set("q", filtros.pesquisa.trim());
  const qs = params.toString();
  return qs ? `${FINANCEIRO_CONTAS_A_RECEBER_PATH}?${qs}` : FINANCEIRO_CONTAS_A_RECEBER_PATH;
}

export function contasAReceberDetalhePath(id: number, filtros?: FiltrosContasAReceber): string {
  const base = `${FINANCEIRO_CONTAS_A_RECEBER_PATH}/${id}`;
  if (!filtros) return base;
  const qs = contasAReceberListagemPath(filtros).split("?")[1];
  return qs ? `${base}?${qs}` : base;
}

export function contasAReceberVoltarPath(search: string, hojeISO: string): string {
  return contasAReceberListagemPath(filtrosContasAReceberDaQuery(search, hojeISO));
}

export function listagemAReceberNaoUsaRotaAPagar(): boolean {
  return FINANCEIRO_CONTAS_A_RECEBER_PATH !== FINANCEIRO_CONTAS_A_PAGAR_PATH;
}

export function montarListagemAReceber(
  detalhes: ReadonlyArray<TituloV2DetalheOficial>,
  userId: number | undefined,
  filtros: FiltrosContasAReceber,
  hojeISO: string,
): LinhaContasAReceber[] {
  const doUsuario = typeof userId === "number"
    ? detalhesDoUsuarioAutenticado(detalhes, userId)
    : detalhes;
  return ordenarLinhasContasAPagar(
    filtrarLinhasContasAPagar(linhasDaListagemAReceber(doUsuario), filtros, hojeISO),
  );
}
