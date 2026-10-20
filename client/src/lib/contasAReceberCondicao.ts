/**
 * Definição e edição de parcelas no detalhe de Contas a Receber.
 * O servidor continua a autoridade: titulosDefinirParcelas / definirParcelas.
 */

import { fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_TITULO_COM_LIQUIDACAO,
  MSG_FIN_VALOR_POSITIVO,
  validarSomaParcelas,
} from "@shared/financeiroNucleo";
import { MSG_ACESSO_NEGADO, MSG_TITULO_NAO_ENCONTRADO } from "./contasAReceberDetalhe";
import {
  MSG_CONDICAO_NUMERO_DUPLICADO,
  MSG_CONDICAO_QUANTIDADE,
  MSG_CONDICAO_VENCIMENTO,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  parseValorParcela,
  rascunhoInicialDaCondicao,
  somaParcelasRascunho,
  tituloTemPagamentoEfetivo,
  vencimentoISOValido,
  type ErrosCondicaoPagamento,
  type ParcelaDefinicaoV2,
  type RascunhoCondicaoPagamento,
} from "./contasAPagarCondicao";
import { tituloEstaCancelado, type TituloV2DetalheOficial } from "./contasAPagarListagem";

export {
  MSG_CONDICAO_NUMERO_DUPLICADO,
  MSG_CONDICAO_QUANTIDADE,
  MSG_CONDICAO_VENCIMENTO,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  rascunhoInicialDaCondicao,
  somaParcelasRascunho,
  vencimentoISOValido,
};
export type { ErrosCondicaoPagamento, ParcelaDefinicaoV2, RascunhoCondicaoPagamento };

export const ROTULO_DEFINIR_PARCELAS = "Definir parcelas";
export const ROTULO_EDITAR_PARCELAS = "Editar parcelas";
export const MSG_PARCELAS_DEFINIDAS = "Parcelas definidas.";
export const MSG_PARCELAS_ATUALIZADAS = "Parcelas atualizadas.";
export const MSG_PARCELAS_ERRO = "Não foi possível gravar as parcelas.";
export const MSG_CONFIRMAR_PARCELAS = "Confirmar parcelas?";

export const tituloTemRecebimentoEfetivo = tituloTemPagamentoEfetivo;

export type AcaoCondicaoRecebimento =
  | { tipo: "definir"; rotulo: typeof ROTULO_DEFINIR_PARCELAS }
  | { tipo: "editar"; rotulo: typeof ROTULO_EDITAR_PARCELAS }
  | { tipo: "nenhuma"; motivo: "cancelado" | "liquidado" | "recebimento" | "sem_acesso" | "nao_receber" };

export function acaoCondicaoRecebimentoTitulo(
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId" | "parcelas" | "situacao">,
  userId: number | null | undefined,
): AcaoCondicaoRecebimento {
  if (titulo.tipo !== "receber") return { tipo: "nenhuma", motivo: "nao_receber" };
  if (typeof userId === "number" && titulo.userId !== userId) {
    return { tipo: "nenhuma", motivo: "sem_acesso" };
  }
  if (tituloEstaCancelado(titulo) || titulo.estado !== "ativo") {
    return { tipo: "nenhuma", motivo: "cancelado" };
  }
  if (titulo.situacao === "liquidado") return { tipo: "nenhuma", motivo: "liquidado" };
  if (tituloTemRecebimentoEfetivo(titulo)) return { tipo: "nenhuma", motivo: "recebimento" };
  if (titulo.parcelas.length === 0) return { tipo: "definir", rotulo: ROTULO_DEFINIR_PARCELAS };
  return { tipo: "editar", rotulo: ROTULO_EDITAR_PARCELAS };
}

export function mensagemBloqueioCondicaoRecebimento(
  motivo: Extract<AcaoCondicaoRecebimento, { tipo: "nenhuma" }>["motivo"],
): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "liquidado" || motivo === "recebimento") return MSG_FIN_TITULO_COM_LIQUIDACAO;
  if (motivo === "sem_acesso") return MSG_ACESSO_NEGADO;
  return MSG_TITULO_NAO_ENCONTRADO;
}

export function diferencaParcelasRascunho(
  valorOriginal: string | number,
  linhas: RascunhoCondicaoPagamento["linhas"],
): { ok: boolean; originalCentavos: number; somaCentavos: number | null; restanteCentavos: number | null } {
  const originalCentavos = toCentavos(valorOriginal);
  const soma = somaParcelasRascunho(linhas);
  if (!soma.ok) {
    return { ok: false, originalCentavos, somaCentavos: null, restanteCentavos: null };
  }
  return {
    ok: true,
    originalCentavos,
    somaCentavos: soma.somaCentavos,
    restanteCentavos: originalCentavos - soma.somaCentavos,
  };
}

export function validarCondicaoRecebimento(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado" | "situacao" | "valorOriginal" | "parcelas">;
  userId: number | null | undefined;
  rascunho: RascunhoCondicaoPagamento;
}): { ok: true; payload: { tituloId: number; parcelas: ParcelaDefinicaoV2[] } } | { ok: false; erros: ErrosCondicaoPagamento } {
  const acao = acaoCondicaoRecebimentoTitulo(input.titulo, input.userId);
  if (acao.tipo === "nenhuma") {
    return { ok: false, erros: { geral: mensagemBloqueioCondicaoRecebimento(acao.motivo) } };
  }

  const erros: ErrosCondicaoPagamento = { linhas: {} };
  const linhas = input.rascunho.linhas;
  if (input.rascunho.modalidade === "parcelado" && (input.rascunho.quantidade < 2 || linhas.length < 2)) {
    erros.quantidade = MSG_CONDICAO_QUANTIDADE;
  }

  const numeros = linhas.map(linha => linha.numero);
  if (new Set(numeros).size !== numeros.length) {
    erros.geral = MSG_CONDICAO_NUMERO_DUPLICADO;
  }

  const parcelas: ParcelaDefinicaoV2[] = [];
  for (const linha of linhas) {
    const linhaErro: { valor?: string; vencimento?: string } = {};
    const valor = parseValorParcela(linha.valor);
    if (!valor.ok) linhaErro.valor = MSG_FIN_VALOR_POSITIVO;
    if (!vencimentoISOValido(linha.vencimento)) linhaErro.vencimento = MSG_CONDICAO_VENCIMENTO;
    if (linhaErro.valor || linhaErro.vencimento) {
      erros.linhas![linha.numero] = linhaErro;
    } else if (valor.ok) {
      parcelas.push({
        numero: linha.numero,
        vencimento: linha.vencimento.trim(),
        valorOriginal: valor.valor,
      });
    }
  }

  if (parcelas.length === linhas.length && parcelas.length > 0) {
    if (!validarSomaParcelas(input.titulo.valorOriginal, parcelas)) {
      erros.geral = erros.geral ?? MSG_FIN_PARCELAS_SOMA;
    }
  }

  if (erros.geral || erros.quantidade || Object.keys(erros.linhas ?? {}).length) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    payload: {
      tituloId: input.titulo.id,
      parcelas,
    },
  };
}

export function mensagemErroDefinirParcelasReceber(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  return extra || MSG_PARCELAS_ERRO;
}

export function textoConfirmacaoParcelasReceber(input: {
  cliente: string;
  descricao: string;
  valorOriginal: string | number;
  parcelas: readonly ParcelaDefinicaoV2[];
}): string {
  const cliente = input.cliente.trim() || "Cliente não informado";
  const titulo = input.descricao.trim() || "Título";
  const linhas = input.parcelas.map(parcela => (
    `Parcela ${parcela.numero}: ${formatarValorResumo(parcela.valorOriginal)} · vencimento ${parcela.vencimento}`
  ));
  return [
    `Cliente: ${cliente}`,
    `Título: ${titulo}`,
    `Valor original: ${formatarValorResumo(input.valorOriginal)}`,
    `Quantidade de parcelas: ${input.parcelas.length}`,
    ...linhas,
  ].join("\n");
}

function formatarValorResumo(valor: string | number): string {
  return `R$ ${fromCentavos(toCentavos(valor)).toFixed(2).replace(".", ",")}`;
}
