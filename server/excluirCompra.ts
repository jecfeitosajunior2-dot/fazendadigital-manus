import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, compraGrupos, compras } from "../drizzle/schema";
import {
  mensagemBloqueioExclusaoCompra,
  podeExcluirCompraFisicamente,
} from "../shared/compraCancelamento";
import { db } from "./db";

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
