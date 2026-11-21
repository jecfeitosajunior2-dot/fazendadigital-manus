import type { MySqlTransaction } from "drizzle-orm/mysql-core";
import type { IoEstoque } from "./consultaEstoqueAutorizada";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import {
  autorizarVendaNaFazenda,
  fazendasDaConsultaVenda,
} from "./consultaVendaAutorizada";
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

export function fazendasDaConsultaVendaNoBanco(
  pedido: Parameters<typeof fazendasDaConsultaVenda>[1],
) {
  return fazendasDaConsultaVenda(ioBanco(), pedido);
}

export function autorizarVendaNaTransacao(
  tx: Transacao,
  pedido: Parameters<typeof autorizarVendaNaFazenda>[1],
  semPermissao: string,
) {
  return autorizarVendaNaFazenda({
    emTransacao: (fn) => fn(consultaEstoqueNaTransacao(tx)),
  }, pedido, semPermissao);
}
