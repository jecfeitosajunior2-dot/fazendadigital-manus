/**
 * Condição de recebimento na Nova Venda.
 * Prepara a intenção financeira no rascunho. Não confirma venda e não cria título.
 */
import { fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import { MSG_FIN_PARCELAS_SOMA } from "@shared/financeiroNucleo";
import {
  calcularTotalOficialVenda,
  isCondicaoRecebimentoVenda,
  validarCondicaoRecebimentoVenda,
  type CondicaoRecebimentoVenda,
  type ItemConfirmacaoVendaFinanceiro,
  type ParcelaRecebimentoVenda,
} from "@shared/vendaFinanceiro";
import {
  MAX_PARCELAS_CONDICAO,
  distribuirValorOriginalEmParcelas,
  formatarValorDigitadoDeOficial,
  parseValorParcela,
} from "./contasAPagarCondicao";

export const CONDICAO_RECEBIMENTO_VENDA_OPCOES = [
  { value: "a_vista", label: "À vista" },
  { value: "a_prazo", label: "A prazo" },
  { value: "parcelado", label: "Parcelado" },
  { value: "definir_depois", label: "Definir depois" },
] as const;

export const MSG_VENDA_CONDICAO_PREPARACAO =
  "As condições de recebimento ficam no rascunho. A geração do título em Contas a Receber ainda não está ligada nesta etapa.";

export const MSG_VENDA_DEFINIR_DEPOIS_ORIENTACAO =
  "O valor da venda será registrado em Contas a Receber, e os vencimentos poderão ser definidos posteriormente.";

export type LinhaParcelaNovaVenda = {
  numero: number;
  vencimento: string;
  valor: string;
};

export type RascunhoCondicaoNovaVenda = {
  condicao: CondicaoRecebimentoVenda;
  vencimentoPrazo: string;
  quantidadeParcelas: number;
  linhas: LinhaParcelaNovaVenda[];
};

export type RascunhoComercialNovaVenda = {
  fazendaId: string;
  data: string;
  compradorId: string;
  forma: string;
  precoPadrao: string;
  rendimento: string;
  observacoes: string;
  itens: unknown[];
  condicaoRecebimento?: unknown;
};

export function rascunhoInicialCondicaoNovaVenda(): RascunhoCondicaoNovaVenda {
  return {
    condicao: "a_vista",
    vencimentoPrazo: "",
    quantidadeParcelas: 2,
    linhas: [],
  };
}

export function lerRascunhoCondicaoNovaVenda(raw: unknown): RascunhoCondicaoNovaVenda {
  const inicial = rascunhoInicialCondicaoNovaVenda();
  if (!raw || typeof raw !== "object") return inicial;
  const dado = raw as Partial<RascunhoCondicaoNovaVenda>;
  const condicao = isCondicaoRecebimentoVenda(dado.condicao) ? dado.condicao : inicial.condicao;
  const quantidade = Number(dado.quantidadeParcelas);
  const linhas = Array.isArray(dado.linhas)
    ? dado.linhas
      .map((linha, indice) => ({
        numero: Number(linha?.numero) > 0 ? Number(linha.numero) : indice + 1,
        vencimento: String(linha?.vencimento ?? "").trim(),
        valor: String(linha?.valor ?? ""),
      }))
      .filter(linha => Number.isInteger(linha.numero))
    : [];
  return {
    condicao,
    vencimentoPrazo: String(dado.vencimentoPrazo ?? "").trim(),
    quantidadeParcelas: Number.isInteger(quantidade) && quantidade >= 2
      ? Math.min(MAX_PARCELAS_CONDICAO, quantidade)
      : 2,
    linhas,
  };
}

export function preservarRascunhoComercialNovaVenda(
  comercial: RascunhoComercialNovaVenda,
  condicao: RascunhoCondicaoNovaVenda,
): RascunhoComercialNovaVenda {
  return {
    fazendaId: comercial.fazendaId,
    data: comercial.data,
    compradorId: comercial.compradorId,
    forma: comercial.forma,
    precoPadrao: comercial.precoPadrao,
    rendimento: comercial.rendimento,
    observacoes: comercial.observacoes,
    itens: comercial.itens,
    condicaoRecebimento: condicao,
  };
}

function linhaUnica(valorTotal: number | null, vencimento: string): LinhaParcelaNovaVenda[] {
  if (valorTotal == null || !Number.isFinite(toCentavos(valorTotal)) || toCentavos(valorTotal) <= 0) {
    return [{ numero: 1, vencimento, valor: "" }];
  }
  return [{
    numero: 1,
    vencimento,
    valor: formatarValorDigitadoDeOficial(valorTotal),
  }];
}

export function aplicarCondicaoNovaVenda(
  rascunho: RascunhoCondicaoNovaVenda,
  condicao: CondicaoRecebimentoVenda,
  input: { dataVenda: string; valorTotal: number | null },
): RascunhoCondicaoNovaVenda {
  if (condicao === "definir_depois") {
    return {
      ...rascunho,
      condicao,
      linhas: [],
    };
  }
  if (condicao === "a_vista") {
    return {
      ...rascunho,
      condicao,
      linhas: linhaUnica(input.valorTotal, input.dataVenda),
    };
  }
  if (condicao === "a_prazo") {
    const vencimento = rascunho.vencimentoPrazo
      || rascunho.linhas[0]?.vencimento
      || "";
    return {
      ...rascunho,
      condicao,
      vencimentoPrazo: vencimento,
      linhas: linhaUnica(input.valorTotal, vencimento),
    };
  }
  const quantidade = Math.max(2, rascunho.quantidadeParcelas === 1 ? 2 : rascunho.quantidadeParcelas);
  return aplicarQuantidadeParcelasNovaVenda({ ...rascunho, condicao: "parcelado" }, quantidade, input.valorTotal);
}

export function aplicarQuantidadeParcelasNovaVenda(
  rascunho: RascunhoCondicaoNovaVenda,
  quantidade: number,
  valorTotal: number | null,
): RascunhoCondicaoNovaVenda {
  const qtd = Math.min(MAX_PARCELAS_CONDICAO, Math.max(2, Math.trunc(quantidade) || 2));
  const valores = valorTotal != null && toCentavos(valorTotal) > 0
    ? distribuirValorOriginalEmParcelas(valorTotal, qtd)
    : Array.from({ length: qtd }, () => NaN);
  return {
    ...rascunho,
    condicao: "parcelado",
    quantidadeParcelas: qtd,
    linhas: valores.map((valor, indice) => ({
      numero: indice + 1,
      vencimento: rascunho.linhas[indice]?.vencimento ?? "",
      valor: Number.isFinite(valor) ? formatarValorDigitadoDeOficial(valor) : "",
    })),
  };
}

export function atualizarLinhaParcelaNovaVenda(
  rascunho: RascunhoCondicaoNovaVenda,
  numero: number,
  campo: "vencimento" | "valor",
  valor: string,
): RascunhoCondicaoNovaVenda {
  const linhas = rascunho.linhas.map(linha => (
    linha.numero === numero ? { ...linha, [campo]: valor } : linha
  ));
  return {
    ...rascunho,
    linhas,
    vencimentoPrazo: rascunho.condicao === "a_prazo" && numero === 1 && campo === "vencimento"
      ? valor
      : rascunho.vencimentoPrazo,
  };
}

export function alinharCondicaoNovaVendaAoTotal(
  rascunho: RascunhoCondicaoNovaVenda,
  input: { dataVenda: string; valorTotal: number | null },
): RascunhoCondicaoNovaVenda {
  if (rascunho.condicao === "definir_depois") {
    return { ...rascunho, linhas: [] };
  }
  if (rascunho.condicao === "a_vista") {
    return aplicarCondicaoNovaVenda(rascunho, "a_vista", input);
  }
  if (rascunho.condicao === "a_prazo") {
    return aplicarCondicaoNovaVenda(rascunho, "a_prazo", {
      dataVenda: input.dataVenda,
      valorTotal: input.valorTotal,
    });
  }
  return aplicarQuantidadeParcelasNovaVenda(rascunho, rascunho.quantidadeParcelas, input.valorTotal);
}

export function parcelasDoRascunhoNovaVenda(
  rascunho: RascunhoCondicaoNovaVenda,
): ParcelaRecebimentoVenda[] {
  if (rascunho.condicao === "definir_depois") return [];
  const parcelas: ParcelaRecebimentoVenda[] = [];
  for (const linha of rascunho.linhas) {
    const valor = parseValorParcela(linha.valor);
    if (!valor.ok) continue;
    parcelas.push({
      numero: linha.numero,
      vencimento: linha.vencimento.trim(),
      valorOriginal: valor.valor,
    });
  }
  return parcelas;
}

export function resumoParcelasNovaVenda(
  valorTotal: number | null,
  linhas: readonly LinhaParcelaNovaVenda[],
): {
  somaCentavos: number | null;
  restanteCentavos: number | null;
  somaBate: boolean;
} {
  if (valorTotal == null || toCentavos(valorTotal) <= 0) {
    return { somaCentavos: null, restanteCentavos: null, somaBate: false };
  }
  const original = toCentavos(valorTotal);
  let soma = 0;
  for (const linha of linhas) {
    const parsed = parseValorParcela(linha.valor);
    if (!parsed.ok) return { somaCentavos: null, restanteCentavos: null, somaBate: false };
    soma += toCentavos(parsed.valor);
  }
  const restante = original - soma;
  return {
    somaCentavos: soma,
    restanteCentavos: restante,
    somaBate: restante === 0,
  };
}

export function formatarCentavosNovaVenda(centavos: number | null): string {
  if (centavos == null || !Number.isFinite(centavos)) return "—";
  return fromCentavos(centavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarValorOficialNovaVenda(valor: number | null): string {
  if (valor == null || !Number.isFinite(toCentavos(valor))) return "—";
  return formatarCentavosNovaVenda(toCentavos(valor));
}

export function totalOficialNovaVenda(input: {
  formaPrecificacao: unknown;
  itens: ReadonlyArray<ItemConfirmacaoVendaFinanceiro>;
}) {
  return calcularTotalOficialVenda(input);
}

export function validarRascunhoCondicaoNovaVenda(input: {
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: string;
  itens: ReadonlyArray<ItemConfirmacaoVendaFinanceiro>;
  rascunho: RascunhoCondicaoNovaVenda;
}) {
  return validarCondicaoRecebimentoVenda({
    fazendaId: input.fazendaId,
    data: input.data,
    compradorId: input.compradorId,
    formaPrecificacao: input.formaPrecificacao,
    itens: input.itens,
    condicao: input.rascunho.condicao,
    parcelas: parcelasDoRascunhoNovaVenda(input.rascunho),
  });
}

export function mensagemDiferencaParcelasNovaVenda(restanteCentavos: number | null): string | null {
  if (restanteCentavos == null || restanteCentavos === 0) return null;
  return MSG_FIN_PARCELAS_SOMA;
}

export { MAX_PARCELAS_CONDICAO };
