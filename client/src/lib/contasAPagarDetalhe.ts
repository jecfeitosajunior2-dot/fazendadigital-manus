/**
 * Apresentação somente leitura do detalhe de Contas a Pagar.
 * Usa o retorno oficial de titulosGet. Não recalcula regra financeira do V2.
 */

import { dinheiroIgual, somarDinheiro, toCentavos } from "@shared/financeiroMoeda";
import {
  FINANCEIRO_ORIGEM_COMPRA_INSUMOS,
  FINANCEIRO_ORIGEM_MANUTENCAO,
} from "@shared/financeiroNucleo";
import { compraVendaCompraDetalhePath } from "./compraVendaCompradores";
import {
  TEXTO_A_DEFINIR,
  rotuloOrigemTitulo,
  rotuloSituacaoLinha,
  rotuloSituacaoParcela,
  tituloEstaCancelado,
  type ParcelaV2Oficial,
  type SituacaoParcelaExibida,
  type TituloV2DetalheOficial,
} from "./contasAPagarListagem";

export type { SituacaoParcelaExibida };
export { rotuloSituacaoParcela };

export const MSG_CONDICAO_PAGAMENTO_A_DEFINIR = "Condição de pagamento ainda não definida.";
export const MSG_NENHUM_PAGAMENTO_REGISTRADO = "Nenhum pagamento registrado.";
export const MSG_HISTORICO_PAGAMENTOS_CARREGANDO = "Carregando histórico de pagamentos...";
export const MSG_HISTORICO_PAGAMENTOS_ERRO = "Não foi possível carregar o histórico de pagamentos.";
export const MSG_TITULO_NAO_ENCONTRADO = "Título financeiro não encontrado.";
export const MSG_ACESSO_NEGADO = "Você não tem acesso a este registro financeiro.";
export const MSG_NAO_E_CONTA_A_PAGAR = "Este registro não é uma conta a pagar.";

export type SituacaoEventoPagamento = "Pagamento" | "Pagamento estornado" | "Estorno de pagamento";

export type EventoHistoricoPagamentoOficial = {
  liquidacaoId: number;
  tipo: string;
  dataLiquidacao: string;
  contaId: number;
  contaNome: string;
  valorMovimentado: string | number;
  valorAlocadoNesteTitulo: number;
  liquidacaoOriginalId: number | null;
  estornadaPorLiquidacaoId: number | null;
  referencia: string | null;
  observacoes: string | null;
  alocacoesDesteTitulo: Array<{
    parcelaId: number;
    parcelaNumero: number;
    vencimento: string;
    principalLiquidado: string;
    desconto: string;
    juros: string;
    multa: string;
    valorCaixaAlocado: number;
  }>;
  alcanceCompleto?: boolean;
  quantidadeTitulosNaLiquidacao?: number;
  titulosNaLiquidacao?: Array<{
    tituloId: number;
    descricao: string;
    valorAlocado: number;
  }>;
};

export type AlocacaoHistoricoExibicao = {
  parcelaNumero: number;
  vencimento: string;
  principalLiquidado: string;
  desconto: string;
  juros: string;
  multa: string;
  valorCaixaAlocado: number;
  mostrarComponentes: boolean;
};

export type EventoHistoricoPagamentoExibicao = {
  liquidacaoId: number;
  dataLiquidacao: string;
  contaNome: string;
  valorMovimentado: string | number;
  valorNesteTitulo: number;
  mostrarTotalLiquidacao: boolean;
  parcelasTexto: string;
  referencia: string | null;
  observacoes: string | null;
  situacao: SituacaoEventoPagamento;
  efetivo: boolean;
  alocacoes: AlocacaoHistoricoExibicao[];
};

export type LinkOrigemContasAPagar = {
  href: string;
  label: string;
};

export type ResumoOficialContasAPagar = {
  valorOriginal: string | number;
  totalPago: number | null;
  saldoAberto: number | null;
  pendente: boolean;
  situacaoExibida: string;
};

export function tituloEhContaAPagar(titulo: Pick<TituloV2DetalheOficial, "tipo">): boolean {
  return titulo.tipo === "pagar";
}

export function rotuloEstadoTitulo(estado: TituloV2DetalheOficial["estado"]): string {
  return estado === "cancelado" ? "Cancelado" : "Ativo";
}

export function rotuloCondicaoPagamento(titulo: TituloV2DetalheOficial): string {
  if (titulo.condicaoStatus === "a_definir" || titulo.parcelas.length === 0) return TEXTO_A_DEFINIR;
  if (titulo.parcelas.length === 1) return "À vista";
  return `${titulo.parcelas.length} parcelas`;
}

export function identificacaoTitulo(titulo: TituloV2DetalheOficial): string {
  const descricao = titulo.descricao.trim();
  return descricao || `Título ${titulo.id}`;
}

function valorOficialNaoZero(valor: string | number | null | undefined): boolean {
  if (valor == null || valor === "") return false;
  return toCentavos(valor) !== 0;
}

export function rotuloSituacaoEventoPagamento(
  evento: Pick<EventoHistoricoPagamentoOficial, "tipo" | "estornadaPorLiquidacaoId">,
): SituacaoEventoPagamento {
  if (evento.tipo === "estorno_pagamento" || evento.tipo === "estorno_recebimento") {
    return "Estorno de pagamento";
  }
  if (evento.estornadaPorLiquidacaoId != null) return "Pagamento estornado";
  return "Pagamento";
}

export function liquidacaoAbrangeOutrosTitulos(
  evento: Pick<EventoHistoricoPagamentoOficial, "valorMovimentado" | "valorAlocadoNesteTitulo">,
): boolean {
  return !dinheiroIgual(evento.valorMovimentado, evento.valorAlocadoNesteTitulo);
}

export function rotuloParcelasHistorico(
  alocacoes: Array<Pick<EventoHistoricoPagamentoOficial["alocacoesDesteTitulo"][number], "parcelaNumero">>,
): string {
  const numeros = [...new Set(alocacoes.map(aloc => aloc.parcelaNumero))].sort((a, b) => a - b);
  if (numeros.length === 0) return "—";
  if (numeros.length === 1) return `Parcela ${numeros[0]}`;
  if (numeros.length === 2) return `Parcelas ${numeros[0]} e ${numeros[1]}`;
  return `Parcelas ${numeros.slice(0, -1).join(", ")} e ${numeros[numeros.length - 1]}`;
}

export function montarEventosHistoricoPagamentos(
  eventos: EventoHistoricoPagamentoOficial[],
): EventoHistoricoPagamentoExibicao[] {
  return eventos.map(evento => {
    const situacao = rotuloSituacaoEventoPagamento(evento);
    return {
      liquidacaoId: evento.liquidacaoId,
      dataLiquidacao: evento.dataLiquidacao,
      contaNome: evento.contaNome.trim() || "—",
      valorMovimentado: evento.valorMovimentado,
      valorNesteTitulo: evento.valorAlocadoNesteTitulo,
      mostrarTotalLiquidacao: liquidacaoAbrangeOutrosTitulos(evento),
      parcelasTexto: rotuloParcelasHistorico(evento.alocacoesDesteTitulo),
      referencia: evento.referencia?.trim() || null,
      observacoes: evento.observacoes?.trim() || null,
      situacao,
      efetivo: situacao === "Pagamento",
      alocacoes: evento.alocacoesDesteTitulo.map(aloc => ({
        parcelaNumero: aloc.parcelaNumero,
        vencimento: aloc.vencimento,
        principalLiquidado: aloc.principalLiquidado,
        desconto: aloc.desconto,
        juros: aloc.juros,
        multa: aloc.multa,
        valorCaixaAlocado: aloc.valorCaixaAlocado,
        mostrarComponentes:
          valorOficialNaoZero(aloc.desconto)
          || valorOficialNaoZero(aloc.juros)
          || valorOficialNaoZero(aloc.multa),
      })),
    };
  });
}

export function deveMostrarHistoricoVazio(input: {
  carregando: boolean;
  erro: boolean;
  eventos: EventoHistoricoPagamentoOficial[] | undefined;
}): boolean {
  return !input.carregando && !input.erro && Array.isArray(input.eventos) && input.eventos.length === 0;
}

export function mensagemErroHistoricoPagamentos(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  return extra || MSG_HISTORICO_PAGAMENTOS_ERRO;
}

export function resumoOficialContasAPagar(titulo: TituloV2DetalheOficial): ResumoOficialContasAPagar {
  const cancelado = tituloEstaCancelado(titulo);
  const situacaoExibida = rotuloSituacaoLinha(titulo);
  if (titulo.parcelas.length === 0) {
    return {
      valorOriginal: titulo.valorOriginal,
      totalPago: null,
      saldoAberto: null,
      pendente: !cancelado,
      situacaoExibida,
    };
  }
  return {
    valorOriginal: titulo.valorOriginal,
    totalPago: somarDinheiro(...titulo.parcelas.map(parcela => parcela.principalLiquidado)),
    saldoAberto: cancelado
      ? null
      : somarDinheiro(...titulo.parcelas.map(parcela => parcela.saldoPrincipal)),
    pendente: !cancelado,
    situacaoExibida,
  };
}

export function linkOrigemContasAPagar(
  origemTipo: string,
  origemId: number | null | undefined,
): LinkOrigemContasAPagar | null {
  if (origemId == null || !Number.isInteger(origemId) || origemId <= 0) return null;
  if (origemTipo === FINANCEIRO_ORIGEM_COMPRA_INSUMOS) {
    return { href: compraVendaCompraDetalhePath(origemId), label: `Abrir ${rotuloOrigemTitulo(origemTipo).toLowerCase()}` };
  }
  if (origemTipo === FINANCEIRO_ORIGEM_MANUTENCAO) {
    return {
      href: `/maquinas/manutencao/cadastro?id=${origemId}`,
      label: `Abrir ${rotuloOrigemTitulo(origemTipo).toLowerCase()}`,
    };
  }
  return null;
}

export function detalheVisivelParaUsuario(
  titulo: Pick<TituloV2DetalheOficial, "userId" | "tipo">,
  userId: number | null | undefined,
): { ok: true } | { ok: false; motivo: "acesso" | "nao_pagar" } {
  if (!tituloEhContaAPagar(titulo)) return { ok: false, motivo: "nao_pagar" };
  if (typeof userId === "number" && titulo.userId !== userId) return { ok: false, motivo: "acesso" };
  return { ok: true };
}
