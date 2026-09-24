import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, compras } from "../drizzle/schema";
import {
  MSG_COMPRA_CANCELAR_COM_ANIMAIS,
  MSG_COMPRA_CANCELAR_COM_ANIMAIS_DETALHE,
  MSG_COMPRA_CANCELAR_FALHOU,
  MSG_COMPRA_CANCELAR_JA_CANCELADA,
  MSG_COMPRA_CANCELAR_MOTIVO,
  MSG_COMPRA_CANCELAR_NAO_CONCLUIDA,
  MSG_COMPRA_CANCELAR_NAO_ENCONTRADA,
  normalizarMotivoCancelamentoCompra,
} from "../shared/compraCancelamento";
import { db } from "./db";

export type CancelarCompraInput = {
  compraId: number;
  motivo: string;
  canceladoPorUserId: number;
  canceladoPorNome?: string | null;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

export async function cancelarCompraComercial(userId: number, input: CancelarCompraInput) {
  const compraId = input.compraId;
  const motivo = normalizarMotivoCancelamentoCompra(input.motivo);
  if (!Number.isInteger(compraId) || compraId <= 0) {
    toTrpc(MSG_COMPRA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
  }
  if (!motivo) toTrpc(MSG_COMPRA_CANCELAR_MOTIVO);

  const canceladoPorNome = String(input.canceladoPorNome ?? "").trim() || null;
  const canceladoEm = new Date();

  try {
    return await db.transaction(async tx => {
      const [compra] = await tx
        .select({ id: compras.id, status: compras.status })
        .from(compras)
        .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
        .limit(1);
      if (!compra) toTrpc(MSG_COMPRA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
      if (compra.status === "cancelado") toTrpc(MSG_COMPRA_CANCELAR_JA_CANCELADA);
      if (compra.status !== "concluido") toTrpc(MSG_COMPRA_CANCELAR_NAO_CONCLUIDA);

      const vinculados = await tx
        .select({ id: animais.id })
        .from(animais)
        .where(and(eq(animais.userId, userId), eq(animais.compraId, compraId)));
      if (vinculados.length > 0) {
        toTrpc(`${MSG_COMPRA_CANCELAR_COM_ANIMAIS} ${MSG_COMPRA_CANCELAR_COM_ANIMAIS_DETALHE}`);
      }

      const atualizada = await tx
        .update(compras)
        .set({
          status: "cancelado",
          canceladoEm,
          canceladoPorUserId: input.canceladoPorUserId,
          canceladoPorNome,
          motivoCancelamento: motivo,
          updatedAt: canceladoEm,
        })
        .where(
          and(
            eq(compras.id, compraId),
            eq(compras.userId, userId),
            eq(compras.status, "concluido"),
          ),
        );
      if (affectedRowsOf(atualizada) !== 1) {
        toTrpc(MSG_COMPRA_CANCELAR_JA_CANCELADA);
      }

      return { success: true as const, compraId };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[compra.cancelar]", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: MSG_COMPRA_CANCELAR_FALHOU,
    });
  }
}
