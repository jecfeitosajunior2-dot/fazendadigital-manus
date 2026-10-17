/**
 * Apresentação das contas financeiras oficiais do Financeiro V2.
 * Usa saldoAtual devolvido pelo núcleo. Não recalcula saldo no cliente.
 */

import { dinheiroNaoNegativo, fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  FINANCEIRO_CONTA_TIPOS,
  isFinanceiroContaTipo,
  type FinanceiroContaTipo,
} from "@shared/financeiroNucleo";

export const FINANCEIRO_CONTAS_V2_PATH = "/financeiro/v2/contas";

export const MSG_NENHUMA_CONTA_V2 = "Nenhuma conta financeira cadastrada.";
export const MSG_SEM_CONTA_V2_ATIVA =
  "Cadastre uma conta financeira para registrar pagamentos.";
export const MSG_INATIVAR_CONTA_V2 =
  "A conta inativa deixa de estar disponível para novos pagamentos.";
export const MSG_CONTAS_V2_CARREGANDO = "Carregando contas financeiras...";
export const MSG_CONTAS_V2_ERRO = "Não foi possível carregar as contas financeiras.";
export const MSG_CONTA_V2_NOME = "Informe o nome da conta.";
export const MSG_CONTA_V2_TIPO = "Selecione o tipo da conta.";
export const MSG_CONTA_V2_SALDO = "Informe um saldo de abertura igual ou maior que zero.";
export const MSG_CONTA_V2_DATA = "Informe a data do saldo de abertura.";

export const OPCOES_TIPO_CONTA_V2: Array<{ value: FinanceiroContaTipo; label: string }> = [
  { value: "conta_corrente", label: "Conta corrente" },
  { value: "poupanca", label: "Poupança" },
  { value: "caixa", label: "Caixa" },
  { value: "investimento", label: "Investimento" },
];

export type ContaFinanceiraV2Oficial = {
  id: number;
  userId: number;
  nome: string;
  tipo: string;
  banco: string | null;
  agencia: string | null;
  numeroConta: string | null;
  saldoAbertura: string | number;
  dataSaldoAbertura: string;
  ativa: boolean;
  saldoAtual?: string | number;
  inativadaEm?: Date | string | null;
  motivoInativacao?: string | null;
};

export type CadastroContaV2Input = {
  nome: string;
  tipo: string;
  saldoAbertura: string;
  dataSaldoAbertura: string;
  banco?: string;
  agencia?: string;
  numeroConta?: string;
};

export type CadastroContaV2Valido = {
  nome: string;
  tipo: FinanceiroContaTipo;
  saldoAbertura: number;
  dataSaldoAbertura: string;
  banco: string | null;
  agencia: string | null;
  numeroConta: string | null;
};

export type ErrosCadastroContaV2 = Partial<Record<
  "nome" | "tipo" | "saldoAbertura" | "dataSaldoAbertura" | "banco" | "agencia" | "numeroConta",
  string
>>;

export function rotuloTipoContaV2(tipo: string): string {
  return OPCOES_TIPO_CONTA_V2.find(opcao => opcao.value === tipo)?.label ?? tipo;
}

export function rotuloSituacaoContaV2(ativa: boolean): "Ativa" | "Inativa" {
  return ativa ? "Ativa" : "Inativa";
}

export function contasVisiveisParaUsuario(
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial[] {
  if (typeof userId !== "number") return [...contas];
  return contas.filter(conta => conta.userId === userId);
}

export function temContaV2Ativa(contas: readonly ContaFinanceiraV2Oficial[]): boolean {
  return contas.some(conta => conta.ativa);
}

export function deveOrientarCadastroContaV2(input: {
  carregando: boolean;
  erro: boolean;
  contas: readonly ContaFinanceiraV2Oficial[] | undefined;
}): boolean {
  return !input.carregando && !input.erro && Array.isArray(input.contas) && !temContaV2Ativa(input.contas);
}

export function parseSaldoAberturaContaV2(raw: string): { ok: true; valor: number } | { ok: false } {
  const normalizado = normalizarSaldoDigitado(raw);
  if (!normalizado) return { ok: false };
  const centavos = toCentavos(normalizado);
  if (!Number.isFinite(centavos) || !dinheiroNaoNegativo(normalizado)) return { ok: false };
  return { ok: true, valor: fromCentavos(centavos) };
}

export function validarCadastroContaV2(
  input: CadastroContaV2Input,
): { ok: true; payload: CadastroContaV2Valido } | { ok: false; erros: ErrosCadastroContaV2 } {
  const erros: ErrosCadastroContaV2 = {};
  const nome = input.nome.trim();
  if (!nome) erros.nome = MSG_CONTA_V2_NOME;
  else if (nome.length > 120) erros.nome = "O nome da conta pode ter no máximo 120 caracteres.";

  if (!isFinanceiroContaTipo(input.tipo)) erros.tipo = MSG_CONTA_V2_TIPO;

  const saldo = parseSaldoAberturaContaV2(input.saldoAbertura);
  if (!saldo.ok) erros.saldoAbertura = MSG_CONTA_V2_SALDO;

  const data = input.dataSaldoAbertura.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erros.dataSaldoAbertura = MSG_CONTA_V2_DATA;

  const banco = input.banco?.trim() || "";
  if (banco.length > 100) erros.banco = "O banco pode ter no máximo 100 caracteres.";
  const agencia = input.agencia?.trim() || "";
  if (agencia.length > 20) erros.agencia = "A agência pode ter no máximo 20 caracteres.";
  const numeroConta = input.numeroConta?.trim() || "";
  if (numeroConta.length > 30) erros.numeroConta = "O número da conta pode ter no máximo 30 caracteres.";

  if (Object.keys(erros).length || !saldo.ok || !isFinanceiroContaTipo(input.tipo)) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    payload: {
      nome,
      tipo: input.tipo,
      saldoAbertura: saldo.valor,
      dataSaldoAbertura: data,
      banco: banco || null,
      agencia: agencia || null,
      numeroConta: numeroConta || null,
    },
  };
}

export { FINANCEIRO_CONTA_TIPOS };

function normalizarSaldoDigitado(raw: string): string {
  const texto = raw.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!texto) return "";
  if (texto.includes(",") && texto.includes(".")) {
    return texto.replace(/\./g, "").replace(",", ".");
  }
  if (texto.includes(",")) return texto.replace(",", ".");
  return texto;
}
