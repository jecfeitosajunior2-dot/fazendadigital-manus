/**
 * Apresentação e validação da condição de pagamento (parcelas) no detalhe V2.
 * O servidor continua a autoridade: titulosDefinirParcelas / definirParcelas.
 * Soma e valor positivo usam as funções oficiais do núcleo.
 */

import { dinheiroPositivo, fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_TITULO_COM_LIQUIDACAO,
  MSG_FIN_VALOR_POSITIVO,
  validarSomaParcelas,
} from "@shared/financeiroNucleo";
import { MSG_ACESSO_NEGADO, MSG_TITULO_NAO_ENCONTRADO } from "./contasAPagarDetalhe";
import { tituloEstaCancelado, type TituloV2DetalheOficial } from "./contasAPagarListagem";

export const MAX_PARCELAS_CONDICAO = 60;

export const MSG_CONDICAO_PAGAMENTO_ERRO = "Não foi possível gravar a condição de pagamento.";
export const MSG_CONDICAO_PAGAMENTO_DEFINIDA = "Condição de pagamento definida.";
export const MSG_CONDICAO_PAGAMENTO_ATUALIZADA = "Condição de pagamento atualizada.";
export const MSG_CONDICAO_VENCIMENTO = "Informe uma data de vencimento válida.";
export const MSG_CONDICAO_NUMERO_DUPLICADO = "A numeração das parcelas não pode se repetir.";
export const MSG_CONDICAO_QUANTIDADE = "Informe a quantidade de parcelas.";
export const ROTULO_DEFINIR_CONDICAO = "Definir condição de pagamento";
export const ROTULO_EDITAR_CONDICAO = "Editar condição de pagamento";

export type ModalidadeCondicaoPagamento = "unico" | "parcelado";

export type LinhaRascunhoParcela = {
  numero: number;
  valor: string;
  vencimento: string;
};

export type RascunhoCondicaoPagamento = {
  modalidade: ModalidadeCondicaoPagamento;
  quantidade: number;
  linhas: LinhaRascunhoParcela[];
};

export type ParcelaDefinicaoV2 = {
  numero: number;
  vencimento: string;
  valorOriginal: number;
};

export type ErrosCondicaoPagamento = {
  geral?: string;
  quantidade?: string;
  linhas?: Record<number, { valor?: string; vencimento?: string }>;
};

export type AcaoCondicaoPagamento =
  | { tipo: "definir"; rotulo: typeof ROTULO_DEFINIR_CONDICAO }
  | { tipo: "editar"; rotulo: typeof ROTULO_EDITAR_CONDICAO }
  | { tipo: "nenhuma"; motivo: "cancelado" | "pagamento" | "sem_acesso" | "nao_pagar" };

export function tituloTemPagamentoEfetivo(
  titulo: Pick<TituloV2DetalheOficial, "parcelas">,
): boolean {
  return titulo.parcelas.some(parcela => {
    const pago = toCentavos(parcela.principalLiquidado);
    return Number.isFinite(pago) && pago > 0;
  });
}

export function acaoCondicaoPagamentoTitulo(
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId" | "parcelas">,
  userId: number | null | undefined,
): AcaoCondicaoPagamento {
  if (titulo.tipo !== "pagar") return { tipo: "nenhuma", motivo: "nao_pagar" };
  if (typeof userId === "number" && titulo.userId !== userId) {
    return { tipo: "nenhuma", motivo: "sem_acesso" };
  }
  if (tituloEstaCancelado(titulo) || titulo.estado !== "ativo") {
    return { tipo: "nenhuma", motivo: "cancelado" };
  }
  if (tituloTemPagamentoEfetivo(titulo)) return { tipo: "nenhuma", motivo: "pagamento" };
  if (titulo.parcelas.length === 0) return { tipo: "definir", rotulo: ROTULO_DEFINIR_CONDICAO };
  return { tipo: "editar", rotulo: ROTULO_EDITAR_CONDICAO };
}

export function formatarValorDigitadoDeOficial(valor: string | number): string {
  const centavos = toCentavos(valor);
  if (!Number.isFinite(centavos)) return "";
  return fromCentavos(centavos).toFixed(2).replace(".", ",");
}

export function parseValorParcela(raw: string): { ok: true; valor: number } | { ok: false } {
  const normalizado = normalizarValorDigitado(raw);
  if (!normalizado || !dinheiroPositivo(normalizado)) return { ok: false };
  return { ok: true, valor: fromCentavos(toCentavos(normalizado)) };
}

export function vencimentoISOValido(raw: string): boolean {
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

export function distribuirValorOriginalEmParcelas(
  valorOriginal: string | number,
  quantidade: number,
): number[] {
  const total = toCentavos(valorOriginal);
  const qtd = Math.trunc(quantidade);
  if (!Number.isFinite(total) || total <= 0 || qtd < 1) return [];
  const base = Math.floor(total / qtd);
  const resto = total - base * qtd;
  return Array.from({ length: qtd }, (_, indice) => (
    fromCentavos(indice === qtd - 1 ? base + resto : base)
  ));
}

export function rascunhoInicialDaCondicao(
  titulo: Pick<TituloV2DetalheOficial, "valorOriginal" | "parcelas">,
): RascunhoCondicaoPagamento {
  const ordenadas = [...titulo.parcelas].sort((a, b) => a.numero - b.numero);
  if (ordenadas.length <= 1) {
    return {
      modalidade: "unico",
      quantidade: 1,
      linhas: [{
        numero: 1,
        valor: formatarValorDigitadoDeOficial(titulo.valorOriginal),
        vencimento: ordenadas[0]?.vencimento ?? "",
      }],
    };
  }
  return {
    modalidade: "parcelado",
    quantidade: ordenadas.length,
    linhas: ordenadas.map((parcela, indice) => ({
      numero: indice + 1,
      valor: formatarValorDigitadoDeOficial(parcela.valorOriginal),
      vencimento: parcela.vencimento,
    })),
  };
}

export function aplicarModalidadeCondicao(
  rascunho: RascunhoCondicaoPagamento,
  modalidade: ModalidadeCondicaoPagamento,
  valorOriginal: string | number,
): RascunhoCondicaoPagamento {
  if (modalidade === "unico") {
    return {
      modalidade: "unico",
      quantidade: 1,
      linhas: [{
        numero: 1,
        valor: formatarValorDigitadoDeOficial(valorOriginal),
        vencimento: rascunho.linhas[0]?.vencimento ?? "",
      }],
    };
  }
  const quantidade = Math.max(2, rascunho.quantidade === 1 ? 2 : rascunho.quantidade);
  return aplicarQuantidadeParcelas(rascunho, quantidade, valorOriginal);
}

export function aplicarQuantidadeParcelas(
  rascunho: RascunhoCondicaoPagamento,
  quantidade: number,
  valorOriginal: string | number,
): RascunhoCondicaoPagamento {
  const qtd = Math.min(MAX_PARCELAS_CONDICAO, Math.max(2, Math.trunc(quantidade)));
  const valores = distribuirValorOriginalEmParcelas(valorOriginal, qtd);
  return {
    modalidade: "parcelado",
    quantidade: qtd,
    linhas: valores.map((valor, indice) => ({
      numero: indice + 1,
      valor: formatarValorDigitadoDeOficial(valor),
      vencimento: rascunho.linhas[indice]?.vencimento ?? "",
    })),
  };
}

export function somaParcelasRascunho(linhas: readonly LinhaRascunhoParcela[]): {
  ok: boolean;
  valores: number[];
  somaCentavos: number;
} {
  const valores: number[] = [];
  for (const linha of linhas) {
    const parsed = parseValorParcela(linha.valor);
    if (!parsed.ok) return { ok: false, valores: [], somaCentavos: NaN };
    valores.push(parsed.valor);
  }
  return {
    ok: true,
    valores,
    somaCentavos: valores.reduce((acc, valor) => acc + toCentavos(valor), 0),
  };
}

export function validarCondicaoPagamento(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado" | "valorOriginal" | "parcelas">;
  userId: number | null | undefined;
  rascunho: RascunhoCondicaoPagamento;
}): { ok: true; payload: { tituloId: number; parcelas: ParcelaDefinicaoV2[] } } | { ok: false; erros: ErrosCondicaoPagamento } {
  const acao = acaoCondicaoPagamentoTitulo(input.titulo, input.userId);
  if (acao.tipo === "nenhuma") {
    return {
      ok: false,
      erros: { geral: mensagemBloqueioCondicao(acao.motivo) },
    };
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

export function mensagemErroDefinirParcelas(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  return extra || MSG_CONDICAO_PAGAMENTO_ERRO;
}

export function mensagemBloqueioCondicao(motivo: Exclude<AcaoCondicaoPagamento, { tipo: "definir" } | { tipo: "editar" }>["motivo"]): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "pagamento") return MSG_FIN_TITULO_COM_LIQUIDACAO;
  if (motivo === "sem_acesso") return MSG_ACESSO_NEGADO;
  return MSG_TITULO_NAO_ENCONTRADO;
}

function normalizarValorDigitado(raw: string): string {
  const texto = raw.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!texto) return "";
  if (texto.includes(",") && texto.includes(".")) return texto.replace(/\./g, "").replace(",", ".");
  if (texto.includes(",")) return texto.replace(",", ".");
  return texto;
}
