/**
 * Apresentação somente leitura do detalhe de Contas a Receber.
 * Usa titulosGet e tituloHistoricoPagamentos. Não recalcula regra do V2.
 */

import { toCentavos } from "@shared/financeiroMoeda";
import {
  deveMostrarHistoricoVazio,
  identificacaoTitulo,
  montarEventosHistoricoPagamentos,
  resumoOficialContasAPagar,
  rotuloCondicaoPagamento,
  rotuloEstadoTitulo,
  rotuloParcelasHistorico,
  type EventoHistoricoPagamentoExibicao,
  type EventoHistoricoPagamentoOficial,
  type ResumoOficialContasAPagar,
} from "./contasAPagarDetalhe";
import {
  rotuloSituacaoParcela,
  tituloEstaCancelado,
  type ParcelaV2Oficial,
  type TituloV2DetalheOficial,
} from "./contasAPagarListagem";
import { rotuloSituacaoLinhaReceber } from "./contasAReceberListagem";

export {
  deveMostrarHistoricoVazio,
  identificacaoTitulo,
  rotuloCondicaoPagamento,
  rotuloEstadoTitulo,
  rotuloParcelasHistorico,
};
export type { EventoHistoricoPagamentoExibicao, EventoHistoricoPagamentoOficial };

export const MSG_PARCELAS_AINDA_NAO_DEFINIDAS = "Parcelas ainda não definidas.";
export const MSG_NENHUM_RECEBIMENTO_REGISTRADO = "Nenhum recebimento registrado.";
export const MSG_HISTORICO_RECEBIMENTOS_CARREGANDO = "Carregando histórico de recebimentos...";
export const MSG_HISTORICO_RECEBIMENTOS_ERRO = "Não foi possível carregar o histórico de recebimentos.";
export const MSG_TITULO_NAO_ENCONTRADO = "Título financeiro não encontrado.";
export const MSG_ACESSO_NEGADO = "Você não tem acesso a este registro financeiro.";
export const MSG_NAO_E_CONTA_A_RECEBER = "Este registro não é uma conta a receber.";

export type SituacaoEventoRecebimento =
  | "Recebimento"
  | "Recebimento estornado"
  | "Estorno de recebimento";

export type SituacaoParcelaReceberExibida =
  | "Cancelado"
  | "Recebida"
  | "Parcial"
  | "Em aberto"
  | "Vencida";

export type EventoHistoricoRecebimentoExibicao = Omit<EventoHistoricoPagamentoExibicao, "situacao"> & {
  situacao: SituacaoEventoRecebimento;
};

export type ResumoOficialContasAReceber = ResumoOficialContasAPagar;

export function tituloEhContaAReceber(titulo: Pick<TituloV2DetalheOficial, "tipo">): boolean {
  return titulo.tipo === "receber";
}

export function rotuloSituacaoEventoRecebimento(
  evento: Pick<EventoHistoricoPagamentoOficial, "tipo" | "estornadaPorLiquidacaoId">,
): SituacaoEventoRecebimento {
  if (evento.tipo === "estorno_recebimento" || evento.tipo === "estorno_pagamento") {
    return "Estorno de recebimento";
  }
  if (evento.estornadaPorLiquidacaoId != null) return "Recebimento estornado";
  return "Recebimento";
}

export function montarEventosHistoricoRecebimentos(
  eventos: EventoHistoricoPagamentoOficial[],
): EventoHistoricoRecebimentoExibicao[] {
  return montarEventosHistoricoPagamentos(eventos).map((linha, indice) => {
    const situacao = rotuloSituacaoEventoRecebimento(eventos[indice]!);
    return {
      ...linha,
      situacao,
      efetivo: situacao === "Recebimento",
    };
  });
}

export function mensagemErroHistoricoRecebimentos(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  return extra || MSG_HISTORICO_RECEBIMENTOS_ERRO;
}

export function resumoOficialContasAReceber(titulo: TituloV2DetalheOficial): ResumoOficialContasAReceber {
  const resumo = resumoOficialContasAPagar(titulo);
  return {
    ...resumo,
    situacaoExibida: rotuloSituacaoLinhaReceber({
      estado: titulo.estado,
      situacao: titulo.situacao,
    }),
  };
}

export function rotuloSituacaoParcelaReceber(
  parcela: Pick<ParcelaV2Oficial, "quitada" | "saldoPrincipal" | "principalLiquidado" | "vencimento">,
  titulo: Pick<TituloV2DetalheOficial, "estado">,
  hojeISO: string,
): SituacaoParcelaReceberExibida {
  if (tituloEstaCancelado(titulo)) return "Cancelado";
  const texto = rotuloSituacaoParcela(parcela, titulo);
  if (texto === "Quitada") return "Recebida";
  if (texto === "Parcial") return "Parcial";
  if (!parcela.quitada && toCentavos(parcela.saldoPrincipal) > 0 && parcela.vencimento < hojeISO) {
    return "Vencida";
  }
  return "Em aberto";
}

export function detalheReceberVisivelParaUsuario(
  titulo: Pick<TituloV2DetalheOficial, "userId" | "tipo">,
  userId: number | null | undefined,
): { ok: true } | { ok: false; motivo: "acesso" | "nao_receber" } {
  if (!tituloEhContaAReceber(titulo)) return { ok: false, motivo: "nao_receber" };
  if (typeof userId === "number" && titulo.userId !== userId) return { ok: false, motivo: "acesso" };
  return { ok: true };
}

export function eventoRecebimentoEfetivo(
  evento: Pick<EventoHistoricoPagamentoOficial, "tipo" | "estornadaPorLiquidacaoId">,
): boolean {
  return rotuloSituacaoEventoRecebimento(evento) === "Recebimento";
}
