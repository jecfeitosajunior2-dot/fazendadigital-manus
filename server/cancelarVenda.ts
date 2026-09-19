import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { animalBaixas, animais, vendaItens, vendas } from "../drizzle/schema";
import { db } from "./db";

export const MSG_VENDA_CANCELAR_NAO_ENCONTRADA = "Venda não encontrada.";
export const MSG_VENDA_CANCELAR_JA_CANCELADA = "Esta venda já está cancelada.";
export const MSG_VENDA_CANCELAR_NAO_CONCLUIDA = "Só é possível cancelar uma venda concluída.";
export const MSG_VENDA_CANCELAR_SEM_ITENS =
  "Esta venda não tem itens individuais e não pode ser cancelada por aqui.";
export const MSG_VENDA_CANCELAR_ANIMAL_ALTERADO =
  "Não foi possível cancelar: um ou mais animais já não estão mais como vendidos nesta venda.";
export const MSG_VENDA_CANCELAR_BAIXA_AUSENTE =
  "Não foi possível cancelar: a baixa ativa desta venda não foi encontrada para todos os animais.";
export const MSG_VENDA_CANCELAR_MOTIVO = "Informe o motivo do cancelamento.";
export const MSG_VENDA_CANCELAR_FALHOU = "Não foi possível cancelar a venda.";

export type CancelarVendaInput = {
  vendaId: number;
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

function identificacao(animal: { brinco?: string | null; id: number }): string {
  const brinco = String(animal.brinco ?? "").trim();
  return brinco || `#${animal.id}`;
}

export async function cancelarVendaComercial(userId: number, input: CancelarVendaInput) {
  const vendaId = input.vendaId;
  const motivo = String(input.motivo ?? "").trim();
  if (!Number.isInteger(vendaId) || vendaId <= 0) {
    toTrpc(MSG_VENDA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
  }
  if (!motivo) toTrpc(MSG_VENDA_CANCELAR_MOTIVO);

  const canceladoPorNome = String(input.canceladoPorNome ?? "").trim() || null;
  const canceladoEm = new Date();

  try {
    return await db.transaction(async tx => {
      const [venda] = await tx
        .select({
          id: vendas.id,
          status: vendas.status,
        })
        .from(vendas)
        .where(and(eq(vendas.id, vendaId), eq(vendas.userId, userId)))
        .limit(1);
      if (!venda) toTrpc(MSG_VENDA_CANCELAR_NAO_ENCONTRADA, "NOT_FOUND");
      if (venda.status === "cancelado") toTrpc(MSG_VENDA_CANCELAR_JA_CANCELADA);
      if (venda.status !== "concluido") toTrpc(MSG_VENDA_CANCELAR_NAO_CONCLUIDA);

      const itens = await tx
        .select({ animalId: vendaItens.animalId })
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, userId), eq(vendaItens.vendaId, vendaId)));
      if (!itens.length) toTrpc(MSG_VENDA_CANCELAR_SEM_ITENS);

      const animalIds = [...new Set(itens.map(item => item.animalId))];
      const animaisRows = await tx
        .select({
          id: animais.id,
          brinco: animais.brinco,
          status: animais.status,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, animalIds)));

      if (animaisRows.length !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO);
      const naoVendidos = animaisRows.filter(animal => animal.status !== "vendido");
      if (naoVendidos.length) {
        toTrpc(
          `${MSG_VENDA_CANCELAR_ANIMAL_ALTERADO} (${naoVendidos.map(identificacao).join(", ")})`,
        );
      }

      const baixas = await tx
        .select({
          id: animalBaixas.id,
          animalId: animalBaixas.animalId,
        })
        .from(animalBaixas)
        .where(
          and(
            eq(animalBaixas.userId, userId),
            eq(animalBaixas.vendaId, vendaId),
            eq(animalBaixas.tipo, "venda"),
            eq(animalBaixas.status, "ativa"),
            inArray(animalBaixas.animalId, animalIds),
          ),
        );

      const baixaIds: number[] = [];
      for (const animalId of animalIds) {
        const baixa = baixas.find(row => row.animalId === animalId);
        if (!baixa) toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);
        baixaIds.push(baixa.id);
      }
      if (baixas.length !== animalIds.length) toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);

      const estornadas = await tx
        .update(animalBaixas)
        .set({ status: "estornada" })
        .where(
          and(
            eq(animalBaixas.userId, userId),
            eq(animalBaixas.vendaId, vendaId),
            eq(animalBaixas.status, "ativa"),
            inArray(animalBaixas.id, baixaIds),
          ),
        );
      if (affectedRowsOf(estornadas) !== baixaIds.length) {
        toTrpc(MSG_VENDA_CANCELAR_BAIXA_AUSENTE);
      }

      const restaurados = await tx
        .update(animais)
        .set({ status: "ativo" })
        .where(
          and(
            eq(animais.userId, userId),
            inArray(animais.id, animalIds),
            eq(animais.status, "vendido"),
          ),
        );
      if (affectedRowsOf(restaurados) !== animalIds.length) {
        toTrpc(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO);
      }

      const atualizada = await tx
        .update(vendas)
        .set({
          status: "cancelado",
          canceladoEm,
          canceladoPorUserId: input.canceladoPorUserId,
          canceladoPorNome,
          motivoCancelamento: motivo,
        })
        .where(
          and(
            eq(vendas.id, vendaId),
            eq(vendas.userId, userId),
            eq(vendas.status, "concluido"),
          ),
        );
      if (affectedRowsOf(atualizada) !== 1) {
        toTrpc(MSG_VENDA_CANCELAR_JA_CANCELADA);
      }

      return { success: true as const, vendaId, quantidade: animalIds.length };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[venda.cancelar]", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: MSG_VENDA_CANCELAR_FALHOU,
    });
  }
}
