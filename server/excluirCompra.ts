import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, compraGrupos, compras } from "../drizzle/schema";
import {
  mensagemBloqueioExclusaoCompra,
  podeExcluirCompraFisicamente,
} from "../shared/compraCancelamento";
import { db } from "./db";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import {
  MSG_SEM_PERMISSAO_EXCLUIR_COMPRAS,
  PERMISSAO_INATIVAR_COMPRAS,
  erroCompra,
} from "./consultaCompraAutorizada";
import { autorizarCompraNaTransacao } from "./consultaCompraDb";

export async function titularParaExcluirCompra(
  executorId: number,
  sessionVersionDaSessao: number | null,
  compraId: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const [peek] = await tx
      .select({ fazendaId: compras.fazendaId, userId: compras.userId })
      .from(compras)
      .where(eq(compras.id, compraId))
      .limit(1);
    if (!peek?.userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
    }
    if (peek.fazendaId == null) {
      const usuario = await consultaEstoqueNaTransacao(tx as never).usuario(executorId);
      const sessaoOk = sessionVersionDaSessao == null || sessionVersionDaSessao === usuario?.sessionVersion;
      if (
        !usuario
        || !sessaoOk
        || usuario.situacao !== "ativo"
        || usuario.papel !== "principal"
        || usuario.titularUserId !== peek.userId
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_PERMISSAO_EXCLUIR_COMPRAS });
      }
      return usuario.titularUserId;
    }
    const acesso = await autorizarCompraNaTransacao(tx as never, {
      executorId,
      sessionVersionDaSessao,
      fazendaId: peek.fazendaId,
      permissaoId: PERMISSAO_INATIVAR_COMPRAS,
    }, MSG_SEM_PERMISSAO_EXCLUIR_COMPRAS);
    if (!acesso.ok) throw erroCompra(acesso, MSG_SEM_PERMISSAO_EXCLUIR_COMPRAS);
    if (peek.userId !== acesso.titularUserId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
    }
    return acesso.titularUserId;
  });
}

export async function excluirCompraLegada(userId: number, compraId: number) {
  const [compra] = await db
    .select({ id: compras.id, status: compras.status })
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
    .limit(1);
  if (!compra) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
  }

  const grupos = await db
    .select({ id: compraGrupos.id })
    .from(compraGrupos)
    .where(and(eq(compraGrupos.compraId, compraId), eq(compraGrupos.userId, userId)));
  const vinculados = await db
    .select({ id: animais.id })
    .from(animais)
    .where(and(eq(animais.userId, userId), eq(animais.compraId, compraId)));

  const opts = {
    status: compra.status,
    temGrupos: grupos.length > 0,
    identificados: vinculados.length,
  };
  if (!podeExcluirCompraFisicamente(opts)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: mensagemBloqueioExclusaoCompra(opts) });
  }

  await db.delete(compras).where(and(eq(compras.id, compraId), eq(compras.userId, userId)));
  return { success: true as const };
}
