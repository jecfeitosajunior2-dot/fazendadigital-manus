import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import {
  autorizarCompraNaFazenda,
  fazendasDaConsultaCompra,
} from "./consultaCompraAutorizada";
import type { IoEstoque } from "./consultaEstoqueAutorizada";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
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

export function fazendasDaConsultaCompraNoBanco(
  pedido: Parameters<typeof fazendasDaConsultaCompra>[1],
) {
  return fazendasDaConsultaCompra(ioBanco(), pedido);
}

export function autorizarCompraNaTransacao(
  tx: Transacao,
  pedido: Parameters<typeof autorizarCompraNaFazenda>[1],
  semPermissao: string,
) {
  return autorizarCompraNaFazenda({
    emTransacao: (fn) => fn(consultaEstoqueNaTransacao(tx)),
  }, pedido, semPermissao);
}
