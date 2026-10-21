/**
 * Domínio da futura integração Venda comercial → Contas a Receber V2.
 * Funções puras. Não confirma venda, não cria título, não mexe em caixa.
 */

import { dinheiroPositivo, fromCentavos, toCentavos } from "./financeiroMoeda";
import {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
  MSG_FIN_PARCELAS_SOMA,
  MSG_FIN_VALOR_POSITIVO,
  validarOrigemTitulo,
  validarSomaParcelas,
  type FinanceiroCondicaoStatus,
} from "./financeiroNucleo";
import {
  calcularValorItem,
  MSG_VENDA_ANIMAL_DUPLICADO,
  MSG_VENDA_ARROBA_REQUER_MIGRATION,
  MSG_VENDA_FORMA_INVALIDA,
  MSG_VENDA_SEM_ITENS,
  parsePesoVenda,
  resumirItensVenda,
  type FormaPrecificacaoVendaPersistivel,
} from "./vendaComercial";

export {
  FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
};

export const CONDICOES_RECEBIMENTO_VENDA = [
  "a_vista",
  "a_prazo",
  "parcelado",
  "definir_depois",
] as const;
export type CondicaoRecebimentoVenda = (typeof CONDICOES_RECEBIMENTO_VENDA)[number];

export const MSG_VENDA_CONDICAO_INVALIDA = "Selecione a condição de recebimento.";
export const MSG_VENDA_CONDICAO_A_VISTA =
  "Venda à vista deve ter uma parcela no valor total, com vencimento na data da venda.";
export const MSG_VENDA_CONDICAO_A_PRAZO =
  "Venda a prazo deve ter uma parcela no valor total e vencimento na data da venda ou depois.";
export const MSG_VENDA_CONDICAO_PARCELADO = "Informe duas ou mais parcelas para o parcelamento.";
export const MSG_VENDA_CONDICAO_DEFINIR_DEPOIS =
  "Para definir depois, não informe parcelas na confirmação da venda.";
export const MSG_VENDA_VENCIMENTO_INVALIDO = "Informe uma data de vencimento válida.";
export const MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA =
  "O vencimento não pode ser anterior à data da venda.";
export const MSG_VENDA_PARCELA_NUMERO_INVALIDO = "Informe um número de parcela válido.";
export const MSG_VENDA_PARCELA_NUMERO_DUPLICADO = "A numeração das parcelas não pode se repetir.";
export const MSG_VENDA_TOTAL_INVALIDO = "Não foi possível calcular o valor oficial da venda.";
export const MSG_VENDA_INTENCAO_INCOMPLETA = "Informe fazenda, comprador, data e animais da venda.";

export type ParcelaRecebimentoVenda = {
  numero: number;
  vencimento: string;
  valorOriginal: number;
};

export type ItemConfirmacaoVendaFinanceiro = {
  animalId: number;
  pesoVenda?: number | null;
  precoUnitario: number;
};

export type IntencaoConfirmacaoVendaFinanceiro = {
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: FormaPrecificacaoVendaPersistivel | "arroba" | string;
  precoPadrao?: number | null;
  observacoes?: string | null;
  itens: ReadonlyArray<ItemConfirmacaoVendaFinanceiro>;
  condicao: CondicaoRecebimentoVenda | string;
  parcelas?: ReadonlyArray<ParcelaRecebimentoVenda> | null;
};

export type ItemOficialVendaFinanceiro = {
  animalId: number;
  pesoVenda: number | null;
  precoUnitario: number;
  valorItem: number;
};

export type CondicaoRecebimentoVendaOk = {
  ok: true;
  condicao: CondicaoRecebimentoVenda;
  condicaoStatusTitulo: FinanceiroCondicaoStatus;
  valorTotal: number;
  valorTotalCentavos: number;
  parcelas: ParcelaRecebimentoVenda[];
  itens: ItemOficialVendaFinanceiro[];
};

export type CondicaoRecebimentoVendaErro = { ok: false; message: string };

export function isCondicaoRecebimentoVenda(value: unknown): value is CondicaoRecebimentoVenda {
  return (
    value === "a_vista"
    || value === "a_prazo"
    || value === "parcelado"
    || value === "definir_depois"
  );
}

export function origemFinanceiraVendaAnimais(vendaId: number) {
  return validarOrigemTitulo({
    origemTipo: FINANCEIRO_ORIGEM_VENDA_ANIMAIS,
    origemId: vendaId,
    origemItemChave: FINANCEIRO_ORIGEM_ITEM_PRINCIPAL,
  });
}

export function dataCivilVendaValida(raw: string): boolean {
  const match = String(raw ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(ano, mes - 1, dia);
  return data.getFullYear() === ano && data.getMonth() === mes - 1 && data.getDate() === dia;
}

function textoOpcional(valor: string | null | undefined): string {
  return String(valor ?? "").trim();
}

function pesoAssinatura(peso: number | null | undefined): string {
  const parsed = parsePesoVenda(peso);
  if (parsed == null) return "";
  return String(Math.round(parsed * 100));
}

function dinheiroAssinatura(valor: number | string | null | undefined): string {
  if (valor == null || valor === "") return "";
  const centavos = toCentavos(valor);
  if (!Number.isFinite(centavos)) return "nan";
  return String(centavos);
}

export function calcularTotalOficialVenda(input: {
  formaPrecificacao: unknown;
  itens: ReadonlyArray<ItemConfirmacaoVendaFinanceiro>;
}): CondicaoRecebimentoVendaErro | {
  ok: true;
  forma: FormaPrecificacaoVendaPersistivel;
  valorTotal: number;
  valorTotalCentavos: number;
  itens: ItemOficialVendaFinanceiro[];
} {
  if (input.formaPrecificacao === "arroba") {
    return { ok: false, message: MSG_VENDA_ARROBA_REQUER_MIGRATION };
  }
  if (input.formaPrecificacao !== "kg" && input.formaPrecificacao !== "cabeca") {
    return { ok: false, message: MSG_VENDA_FORMA_INVALIDA };
  }
  if (!input.itens.length) return { ok: false, message: MSG_VENDA_SEM_ITENS };

  const vistos = new Set<number>();
  const itens: ItemOficialVendaFinanceiro[] = [];
  for (const item of input.itens) {
    if (!Number.isInteger(item.animalId) || item.animalId <= 0) {
      return { ok: false, message: MSG_VENDA_SEM_ITENS };
    }
    if (vistos.has(item.animalId)) return { ok: false, message: MSG_VENDA_ANIMAL_DUPLICADO };
    vistos.add(item.animalId);
    if (!dinheiroPositivo(item.precoUnitario)) {
      return { ok: false, message: MSG_FIN_VALOR_POSITIVO };
    }
    const calc = calcularValorItem({
      forma: input.formaPrecificacao,
      pesoVenda: item.pesoVenda,
      precoUnitario: item.precoUnitario,
    });
    if (!calc.ok) return { ok: false, message: calc.message };
    itens.push({
      animalId: item.animalId,
      pesoVenda: parsePesoVenda(item.pesoVenda),
      precoUnitario: fromCentavos(toCentavos(item.precoUnitario)),
      valorItem: calc.valor,
    });
  }

  const totais = resumirItensVenda(itens.map(item => ({
    pesoVenda: item.pesoVenda,
    valorItem: item.valorItem,
  })));
  const valorTotalCentavos = toCentavos(totais.valorTotal);
  if (!Number.isFinite(valorTotalCentavos) || valorTotalCentavos <= 0) {
    return { ok: false, message: MSG_VENDA_TOTAL_INVALIDO };
  }
  return {
    ok: true,
    forma: input.formaPrecificacao,
    valorTotal: fromCentavos(valorTotalCentavos),
    valorTotalCentavos,
    itens,
  };
}

function normalizarParcela(
  parcela: ParcelaRecebimentoVenda,
): { ok: true; parcela: ParcelaRecebimentoVenda } | CondicaoRecebimentoVendaErro {
  if (!Number.isInteger(parcela.numero) || parcela.numero <= 0) {
    return { ok: false, message: MSG_VENDA_PARCELA_NUMERO_INVALIDO };
  }
  if (!dinheiroPositivo(parcela.valorOriginal)) {
    return { ok: false, message: MSG_FIN_VALOR_POSITIVO };
  }
  const vencimento = String(parcela.vencimento ?? "").trim();
  if (!dataCivilVendaValida(vencimento)) {
    return { ok: false, message: MSG_VENDA_VENCIMENTO_INVALIDO };
  }
  return {
    ok: true,
    parcela: {
      numero: parcela.numero,
      vencimento,
      valorOriginal: fromCentavos(toCentavos(parcela.valorOriginal)),
    },
  };
}

function validarListaParcelas(
  parcelas: ReadonlyArray<ParcelaRecebimentoVenda>,
  dataVenda: string,
  valorTotal: number,
): CondicaoRecebimentoVendaErro | { ok: true; parcelas: ParcelaRecebimentoVenda[] } {
  const normalizadas: ParcelaRecebimentoVenda[] = [];
  const numeros = new Set<number>();
  for (const parcela of parcelas) {
    const ok = normalizarParcela(parcela);
    if (!ok.ok) return ok;
    if (numeros.has(ok.parcela.numero)) {
      return { ok: false, message: MSG_VENDA_PARCELA_NUMERO_DUPLICADO };
    }
    numeros.add(ok.parcela.numero);
    if (ok.parcela.vencimento < dataVenda) {
      return { ok: false, message: MSG_VENDA_VENCIMENTO_ANTES_DA_VENDA };
    }
    normalizadas.push(ok.parcela);
  }
  if (!validarSomaParcelas(valorTotal, normalizadas)) {
    return { ok: false, message: MSG_FIN_PARCELAS_SOMA };
  }
  return { ok: true, parcelas: [...normalizadas].sort((a, b) => a.numero - b.numero) };
}

export function validarCondicaoRecebimentoVenda(
  input: IntencaoConfirmacaoVendaFinanceiro,
): CondicaoRecebimentoVendaOk | CondicaoRecebimentoVendaErro {
  if (!Number.isInteger(input.fazendaId) || input.fazendaId <= 0) {
    return { ok: false, message: MSG_VENDA_INTENCAO_INCOMPLETA };
  }
  if (!Number.isInteger(input.compradorId) || input.compradorId <= 0) {
    return { ok: false, message: MSG_VENDA_INTENCAO_INCOMPLETA };
  }
  const data = String(input.data ?? "").trim();
  if (!dataCivilVendaValida(data)) return { ok: false, message: MSG_VENDA_INTENCAO_INCOMPLETA };
  if (!isCondicaoRecebimentoVenda(input.condicao)) {
    return { ok: false, message: MSG_VENDA_CONDICAO_INVALIDA };
  }

  const total = calcularTotalOficialVenda({
    formaPrecificacao: input.formaPrecificacao,
    itens: input.itens,
  });
  if (!total.ok) return total;

  const informadas = (input.parcelas ?? []).filter(Boolean);
  const base = {
    condicao: input.condicao,
    valorTotal: total.valorTotal,
    valorTotalCentavos: total.valorTotalCentavos,
    itens: total.itens,
  };

  if (input.condicao === "definir_depois") {
    if (informadas.length) return { ok: false, message: MSG_VENDA_CONDICAO_DEFINIR_DEPOIS };
    return { ok: true, ...base, condicaoStatusTitulo: "a_definir", parcelas: [] };
  }

  if (input.condicao === "a_vista") {
    const parcelas = informadas.length
      ? informadas
      : [{ numero: 1, vencimento: data, valorOriginal: total.valorTotal }];
    if (parcelas.length !== 1) return { ok: false, message: MSG_VENDA_CONDICAO_A_VISTA };
    const lista = validarListaParcelas(parcelas, data, total.valorTotal);
    if (!lista.ok) return lista;
    if (lista.parcelas[0]!.vencimento !== data) {
      return { ok: false, message: MSG_VENDA_CONDICAO_A_VISTA };
    }
    return { ok: true, ...base, condicaoStatusTitulo: "definida", parcelas: lista.parcelas };
  }

  if (input.condicao === "a_prazo") {
    if (informadas.length !== 1) return { ok: false, message: MSG_VENDA_CONDICAO_A_PRAZO };
    const lista = validarListaParcelas(informadas, data, total.valorTotal);
    if (!lista.ok) return lista;
    return { ok: true, ...base, condicaoStatusTitulo: "definida", parcelas: lista.parcelas };
  }

  if (informadas.length < 2) return { ok: false, message: MSG_VENDA_CONDICAO_PARCELADO };
  const lista = validarListaParcelas(informadas, data, total.valorTotal);
  if (!lista.ok) return lista;
  return { ok: true, ...base, condicaoStatusTitulo: "definida", parcelas: lista.parcelas };
}

export function assinaturaIntencaoConfirmacaoVenda(
  intencao: IntencaoConfirmacaoVendaFinanceiro,
): string | null {
  const validado = validarCondicaoRecebimentoVenda(intencao);
  if (!validado.ok) return null;
  const itens = [...validado.itens]
    .sort((a, b) => a.animalId - b.animalId)
    .map(item => [
      item.animalId,
      pesoAssinatura(item.pesoVenda),
      dinheiroAssinatura(item.precoUnitario),
      dinheiroAssinatura(item.valorItem),
    ].join(":"))
    .join(",");
  const parcelas = validado.parcelas
    .map(parcela => [
      parcela.numero,
      parcela.vencimento,
      dinheiroAssinatura(parcela.valorOriginal),
    ].join(":"))
    .join(",");
  return [
    intencao.fazendaId,
    String(intencao.data).trim().slice(0, 10),
    intencao.compradorId,
    validado.itens[0] ? intencao.formaPrecificacao : "",
    dinheiroAssinatura(intencao.precoPadrao),
    textoOpcional(intencao.observacoes),
    validado.condicao,
    dinheiroAssinatura(validado.valorTotal),
    itens,
    parcelas,
  ].join("|");
}

export function retryConfirmacaoVendaBateComPedido(
  persistida: IntencaoConfirmacaoVendaFinanceiro,
  pedido: IntencaoConfirmacaoVendaFinanceiro,
): boolean {
  const a = assinaturaIntencaoConfirmacaoVenda(persistida);
  const b = assinaturaIntencaoConfirmacaoVenda(pedido);
  return a != null && b != null && a === b;
}

export const PREFIXO_CHAVE_CONFIRMACAO_VENDA = "ven-";
export const PREFIXO_CONDICAO_TITULO_VENDA = "condicaoRecebimento=";
export const MSG_VENDA_IDEMPOTENCY =
  "Informe uma chave ven- de confirmação da venda, com 8 a 80 caracteres.";
export const MSG_VENDA_CONFLITO_IDEMPOTENCIA =
  "Esta chave já confirmou outra venda. Use uma chave nova ou o mesmo pedido original.";
export const MSG_VENDA_RECUPERACAO_FALHOU =
  "Não foi possível recuperar a venda já confirmada com esta chave.";

export function validarChaveIdempotenciaVenda(
  raw: unknown,
): { ok: true; key: string } | { ok: false; message: string } {
  const key = String(raw ?? "").trim();
  if (key.length < 8 || key.length > 80 || !key.startsWith(PREFIXO_CHAVE_CONFIRMACAO_VENDA)) {
    return { ok: false, message: MSG_VENDA_IDEMPOTENCY };
  }
  return { ok: true, key };
}

export function observacaoCondicaoTituloVenda(condicao: CondicaoRecebimentoVenda): string {
  return `${PREFIXO_CONDICAO_TITULO_VENDA}${condicao}`;
}

export function lerCondicaoTituloVenda(observacoes: string | null | undefined): CondicaoRecebimentoVenda | null {
  const raw = String(observacoes ?? "").trim();
  if (!raw.startsWith(PREFIXO_CONDICAO_TITULO_VENDA)) return null;
  const condicao = raw.slice(PREFIXO_CONDICAO_TITULO_VENDA.length).trim();
  return isCondicaoRecebimentoVenda(condicao) ? condicao : null;
}
