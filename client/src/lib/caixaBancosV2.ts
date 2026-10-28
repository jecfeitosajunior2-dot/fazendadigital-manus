/**
 * Apresentação e validação de Caixa e Bancos V2.
 * Extrato e transferência usam o núcleo. Não misturam legado.
 * Não recalculam saldo acumulado no período filtrado.
 */

import { dinheiroPositivo, fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_SALDO_INSUFICIENTE,
  MSG_FIN_TRANSFERENCIA_MESMA_CONTA,
  MSG_FIN_VALOR_POSITIVO,
  isFinanceiroContaTipo,
  type FinanceiroContaTipo,
} from "@shared/financeiroNucleo";
import {
  MSG_CONTA_V2_NOME,
  MSG_CONTA_V2_TIPO,
  contasVisiveisParaUsuario,
  parseSaldoAberturaContaV2,
  type ContaFinanceiraV2Oficial,
  type ErrosCadastroContaV2,
} from "./contasFinanceirasV2";

export const MSG_EXTRATO_V2_VAZIO = "Nenhuma movimentação neste período.";
export const MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO =
  "O saldo acumulado do período não é exibido para não misturar com movimentos de fora do filtro.";
export const MSG_TRANSFERENCIA_CONTA_ORIGEM = "Selecione a conta de origem.";
export const MSG_TRANSFERENCIA_CONTA_DESTINO = "Selecione a conta de destino.";
export const MSG_TRANSFERENCIA_DATA = "Informe a data da transferência.";
export const MSG_TRANSFERENCIA_RESULTADO_DESCONHECIDO =
  "Não foi possível confirmar se a transferência foi gravada. Consulte o extrato oficial. Não inicie outra transferência.";
export const MSG_TRANSFERENCIA_OCUPADA = "Aguarde a confirmação em andamento.";
export const PREFIXO_CHAVE_TRANSFERENCIA = "trf-";

export type MovimentoExtratoV2 = {
  id: number;
  userId?: number;
  contaId: number;
  dataMovimento: string;
  direcao: string;
  natureza: string;
  valor: string | number;
  descricao: string;
  referencia?: string | null;
  liquidacaoId?: number | null;
  transferenciaId?: number | null;
};

export type ExtratoV2Oficial = {
  conta: ContaFinanceiraV2Oficial;
  saldoAtual: string | number;
  movimentos: MovimentoExtratoV2[];
};

export type FiltroExtratoV2 = {
  contaId: number | "";
  de: string;
  ate: string;
};

export type TransferenciaCaixaInput = {
  contaOrigemId: string;
  contaDestinoId: string;
  valor: string;
  dataTransferencia: string;
  descricao?: string;
};

export type TransferenciaCaixaValida = {
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number;
  dataTransferencia: string;
  descricao: string | null;
};

export type ErrosTransferenciaCaixa = Partial<Record<
  "contaOrigemId" | "contaDestinoId" | "valor" | "dataTransferencia",
  string
>>;

export function novaChaveIdempotenciaTransferencia(): string {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${PREFIXO_CHAVE_TRANSFERENCIA}${uuid.replace(/-/g, "")}`.slice(0, 80);
}

export function ordenarMovimentosExtrato(
  movimentos: readonly MovimentoExtratoV2[],
): MovimentoExtratoV2[] {
  return [...movimentos].sort((a, b) => {
    const data = a.dataMovimento.localeCompare(b.dataMovimento);
    if (data !== 0) return data;
    return a.id - b.id;
  });
}

export function periodoExtratoValido(filtro: Pick<FiltroExtratoV2, "de" | "ate">): boolean {
  if (filtro.de && !/^\d{4}-\d{2}-\d{2}$/.test(filtro.de)) return false;
  if (filtro.ate && !/^\d{4}-\d{2}-\d{2}$/.test(filtro.ate)) return false;
  if (filtro.de && filtro.ate && filtro.de > filtro.ate) return false;
  return true;
}

export function deveOmitirSaldoAcumulado(filtro: Pick<FiltroExtratoV2, "de" | "ate">): boolean {
  return Boolean(filtro.de || filtro.ate);
}

export function rotuloDirecaoExtrato(direcao: string): "Entrada" | "Saída" | string {
  if (direcao === "entrada") return "Entrada";
  if (direcao === "saida") return "Saída";
  return direcao;
}

export function rotuloNaturezaExtrato(natureza: string): string {
  const mapa: Record<string, string> = {
    recebimento: "Recebimento",
    pagamento: "Pagamento",
    transferencia_saida: "Transferência (saída)",
    transferencia_entrada: "Transferência (entrada)",
    estorno_recebimento: "Estorno de recebimento",
    estorno_pagamento: "Estorno de pagamento",
  };
  return mapa[natureza] ?? natureza;
}

export function origemMovimentoExtrato(mov: MovimentoExtratoV2): string {
  if (mov.transferenciaId) return `Transferência #${mov.transferenciaId}`;
  if (mov.liquidacaoId) return `Liquidação #${mov.liquidacaoId}`;
  if (mov.referencia?.trim()) return mov.referencia.trim();
  return rotuloNaturezaExtrato(mov.natureza);
}

export function contasAtivasParaTransferencia(
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial[] {
  return contasVisiveisParaUsuario(contas, userId).filter(conta => conta.ativa);
}

export function validarTransferenciaCaixaV2(
  input: TransferenciaCaixaInput,
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
): { ok: true; payload: TransferenciaCaixaValida } | { ok: false; erros: ErrosTransferenciaCaixa } {
  const erros: ErrosTransferenciaCaixa = {};
  const visiveis = contasVisiveisParaUsuario(contas, userId);
  const origemId = Number(input.contaOrigemId);
  const destinoId = Number(input.contaDestinoId);
  const origem = visiveis.find(c => c.id === origemId);
  const destino = visiveis.find(c => c.id === destinoId);

  if (!Number.isInteger(origemId) || origemId <= 0) erros.contaOrigemId = MSG_TRANSFERENCIA_CONTA_ORIGEM;
  else if (!origem) erros.contaOrigemId = MSG_FIN_CONTA_NAO_ENCONTRADA;
  else if (!origem.ativa) erros.contaOrigemId = MSG_FIN_CONTA_INATIVA;

  if (!Number.isInteger(destinoId) || destinoId <= 0) erros.contaDestinoId = MSG_TRANSFERENCIA_CONTA_DESTINO;
  else if (!destino) erros.contaDestinoId = MSG_FIN_CONTA_NAO_ENCONTRADA;
  else if (!destino.ativa) erros.contaDestinoId = MSG_FIN_CONTA_INATIVA;

  if (origem && destino && origem.id === destino.id) {
    erros.contaDestinoId = MSG_FIN_TRANSFERENCIA_MESMA_CONTA;
  }

  const valorParse = parseSaldoAberturaContaV2(input.valor);
  if (!valorParse.ok || !dinheiroPositivo(valorParse.valor)) {
    erros.valor = MSG_FIN_VALOR_POSITIVO;
  } else if (origem && origem.saldoAtual != null) {
    const saldo = toCentavos(origem.saldoAtual);
    if (Number.isFinite(saldo) && saldo < toCentavos(valorParse.valor)) {
      erros.valor = MSG_FIN_SALDO_INSUFICIENTE;
    }
  }

  const data = input.dataTransferencia.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erros.dataTransferencia = MSG_TRANSFERENCIA_DATA;

  if (Object.keys(erros).length || !valorParse.ok) return { ok: false, erros };
  return {
    ok: true,
    payload: {
      contaOrigemId: origemId,
      contaDestinoId: destinoId,
      valor: valorParse.valor,
      dataTransferencia: data,
      descricao: input.descricao?.trim() || null,
    },
  };
}

export function resumoTransferenciaCaixa(payload: TransferenciaCaixaValida, contas: readonly ContaFinanceiraV2Oficial[]) {
  const origem = contas.find(c => c.id === payload.contaOrigemId);
  const destino = contas.find(c => c.id === payload.contaDestinoId);
  return {
    origem: origem?.nome ?? `#${payload.contaOrigemId}`,
    destino: destino?.nome ?? `#${payload.contaDestinoId}`,
    valor: fromCentavos(toCentavos(payload.valor)),
    data: payload.dataTransferencia,
  };
}

export function validarEdicaoContaV2(
  input: { nome: string; tipo: string; banco?: string; agencia?: string; numeroConta?: string },
): { ok: true; payload: { nome: string; tipo: FinanceiroContaTipo; banco: string | null; agencia: string | null; numeroConta: string | null } }
  | { ok: false; erros: ErrosCadastroContaV2 } {
  const erros: ErrosCadastroContaV2 = {};
  const nome = input.nome.trim();
  if (!nome) erros.nome = MSG_CONTA_V2_NOME;
  else if (nome.length > 120) erros.nome = "O nome da conta pode ter no máximo 120 caracteres.";
  if (!isFinanceiroContaTipo(input.tipo)) erros.tipo = MSG_CONTA_V2_TIPO;
  const banco = input.banco?.trim() || "";
  if (banco.length > 100) erros.banco = "O banco pode ter no máximo 100 caracteres.";
  const agencia = input.agencia?.trim() || "";
  if (agencia.length > 20) erros.agencia = "A agência pode ter no máximo 20 caracteres.";
  const numeroConta = input.numeroConta?.trim() || "";
  if (numeroConta.length > 30) erros.numeroConta = "O número da conta pode ter no máximo 30 caracteres.";
  if (Object.keys(erros).length || !isFinanceiroContaTipo(input.tipo)) return { ok: false, erros };
  return {
    ok: true,
    payload: {
      nome,
      tipo: input.tipo,
      banco: banco || null,
      agencia: agencia || null,
      numeroConta: numeroConta || null,
    },
  };
}

export function contasParaListagemCaixa(
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
  somenteAtivas: boolean,
): ContaFinanceiraV2Oficial[] {
  const visiveis = contasVisiveisParaUsuario(contas, userId);
  return somenteAtivas ? visiveis.filter(c => c.ativa) : visiveis;
}
