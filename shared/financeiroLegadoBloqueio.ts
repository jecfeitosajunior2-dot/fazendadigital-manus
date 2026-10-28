/** Bloqueio operacional do Financeiro legado. Não apaga dados históricos. */

export const MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA =
  "O Financeiro legado está desativado. Use o Financeiro V2.";

export const MSG_FINANCEIRO_LEGADO_DESATIVADO = MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA;

export const FINANCEIRO_LEGADO_MUTATIONS_BLOQUEADAS = [
  "createConta",
  "createMovimentacao",
  "deleteMovimentacao",
] as const;

export const FINANCEIRO_LEGADO_QUERIES_BLOQUEADAS = [
  "listContas",
  "listMovimentacoes",
  "summary",
] as const;

export function mensagemEscritaFinanceiroLegadoBloqueada(): string {
  return MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA;
}
