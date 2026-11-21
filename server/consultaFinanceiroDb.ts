import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import type { IoEstoque } from "./consultaEstoqueAutorizada";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { acessoDaSessaoFinanceiro, fazendasDaConsultaFinanceiro, type SessaoFinanceiro } from "./consultaFinanceiroAutorizada";
import { db } from "./db";

type Transacao = MySqlTransaction<any, any, any, any>;

function ioBanco(): IoEstoque {
  return {
    emTransacao(fn) {
      return db.transaction(async (tx) => fn(consultaEstoqueNaTransacao(tx)), {
        isolationLevel: "read committed",
      });
    },
  };
}

export function fazendasDaConsultaFinanceiroNoBanco(
  pedido: Parameters<typeof fazendasDaConsultaFinanceiro>[1],
) {
  return fazendasDaConsultaFinanceiro(ioBanco(), pedido);
}

export function acessoFinanceiroNoBanco(sessao: SessaoFinanceiro) {
  return ioBanco().emTransacao((tx) => acessoDaSessaoFinanceiro(tx, sessao));
}

export function consultaFinanceiroNaTransacao(tx: Transacao) {
  return consultaEstoqueNaTransacao(tx);
}
