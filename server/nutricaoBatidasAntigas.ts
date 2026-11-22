import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { batidas } from "../drizzle/schema";
import {
  MSG_BATIDA_ANTIGA_CADASTRO,
  MSG_BATIDA_ANTIGA_EXCLUSAO,
  MSG_BATIDA_ANTIGA_LISTA,
} from "../shared/nutricaoIdempotencia";
import { db as dbPadrao } from "./db";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { MSG_NUTRICAO_SEM_MYSQL } from "./nutricaoOperacaoAutorizada";

type BancoLista = Pick<typeof dbPadrao, "transaction" | "select">;

let bancoLista: BancoLista = dbPadrao;

export function definirBancoBatidasAntigas(banco: BancoLista | null) {
  bancoLista = banco ?? dbPadrao;
}

export function recusarCadastroBatidaAntiga(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BATIDA_ANTIGA_CADASTRO });
}

export function recusarExclusaoBatidaAntiga(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BATIDA_ANTIGA_EXCLUSAO });
}

export async function listarBatidasAntigas(sessao: {
  executorId: number;
  sessionVersionDaSessao: number | null;
}) {
  let titular = 0;
  try {
    titular = await bancoLista.transaction(async (tx) => {
      const usuario = await consultaEstoqueNaTransacao(tx).usuario(sessao.executorId);
      if (!usuario || usuario.situacao !== "ativo") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      const versao = sessao.sessionVersionDaSessao ?? 0;
      if (versao !== usuario.sessionVersion) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      if (usuario.papel !== "principal" || usuario.id !== usuario.titularUserId) {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_BATIDA_ANTIGA_LISTA });
      }
      return usuario.titularUserId;
    }, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_NUTRICAO_SEM_MYSQL });
  }
  return bancoLista
    .select()
    .from(batidas)
    .where(eq(batidas.userId, titular))
    .orderBy(desc(batidas.createdAt));
}
