/**
 * Composição da transação única Manutenção + Financeiro V2.
 *
 * Os motores homologados já aceitam a mesma conexão:
 * - persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx))
 * - criarTituloNoTx(createFinanceiroNucleoTxFromDrizzle(tx))
 * - estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx))
 *
 * NÃO chamar persistirManutencaoCompletaMysql / estornarManutencaoCompletaMysql
 * daqui: eles abrem COMMIT próprio.
 *
 * O runner público permanece travado até a homologação.
 */
import { createFinanceiroNucleoTxFromDrizzle, type FinanceiroDrizzleTx } from "./financeiroNucleo";
import { criarPersistenciaCompletaCtx } from "./manutencaoCompletaMysql";
import { criarManutencaoEstoqueTx } from "./manutencaoEstoqueMysql";
import {
  ManutencaoFinanceiroAPagarError,
  persistirManutencaoComFinanceiroAPagarAtomico,
  recusarProcedurePublicaAPagar,
  type EmitirManutencaoAPagarInput,
  type EmitirManutencaoAPagarResultado,
  type PortasManutencaoAPagar,
} from "./manutencaoFinanceiroAPagar";
import { MANUT_A_PAGAR_OPERACIONAL, MSG_MANUT_FIN_NAO_ATIVA } from "../shared/manutencaoFinanceiroAPagar";

export function criarPortasManutencaoAPagar(tx: FinanceiroDrizzleTx): PortasManutencaoAPagar {
  return {
    persistencia: criarPersistenciaCompletaCtx(tx),
    fin: createFinanceiroNucleoTxFromDrizzle(tx),
    motorEstoque: criarManutencaoEstoqueTx(tx),
  };
}

type DrizzleComTransacao = {
  transaction: <T>(fn: (tx: FinanceiroDrizzleTx) => Promise<T>) => Promise<T>;
};

/** Cada chamada abre transação nova. A recuperação do 1062 não reusa o snapshot da perdedora. */
export async function persistirManutencaoComFinanceiroAPagarEmTxIsolada(
  drizzleDb: DrizzleComTransacao,
  input: EmitirManutencaoAPagarInput,
): Promise<EmitirManutencaoAPagarResultado> {
  return persistirManutencaoComFinanceiroAPagarAtomico(
    fn => drizzleDb.transaction(async tx => fn(criarPortasManutencaoAPagar(tx))),
    input,
  );
}

/**
 * Prova de composição: a mesma `tx` alimenta os dois motores.
 * Não grava chaveOperacao no MySQL do produtor até a migration 0060.
 */
export function transacaoUnicaCompartilhaMotores(tx: FinanceiroDrizzleTx): {
  mesmaConexao: true;
  chamaWrapperMysqlComCommit: false;
  persisteIdempotenciaOperacao: false;
} {
  const portas = criarPortasManutencaoAPagar(tx);
  void portas;
  return {
    mesmaConexao: true,
    chamaWrapperMysqlComCommit: false,
    persisteIdempotenciaOperacao: false,
  };
}

export async function emitirManutencaoAPagarMysql(): Promise<never> {
  void MANUT_A_PAGAR_OPERACIONAL;
  throw new ManutencaoFinanceiroAPagarError(MSG_MANUT_FIN_NAO_ATIVA);
}

export async function estornarManutencaoAPagarMysql(): Promise<never> {
  recusarProcedurePublicaAPagar();
}
