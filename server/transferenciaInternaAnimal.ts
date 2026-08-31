import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animalBaixas, animalLoteMovimentacoes, animais, lotes, pastos } from "../drizzle/schema";
import { MSG_SAIDA_TRANSFERENCIA_DUPLICADA } from "../shared/animalBaixa";
import {
  MSG_BAIXA_ANIMAL_INATIVO,
  MSG_BAIXA_FAZENDA_DIVERGENTE,
  MSG_TRANSFERENCIA_GENERICO,
  MSG_TRANSFERENCIA_LOTE_FAZENDA,
  MSG_TRANSFERENCIA_LOTE_INATIVO,
  MSG_TRANSFERENCIA_PASTO_FAZENDA,
  validarTransferenciaInternaInput,
} from "../shared/transferenciaInternaAnimal";
import { db } from "./db";
import { assertManejoPermitidoNaData } from "./animalBaixa";
import {
  isDatabaseUnavailable,
  registrarLocalTransferenciaInterna,
} from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type RegistrarTransferenciaInternaInput = {
  fazendaOrigemId: number;
  fazendaDestinoId: number;
  animalId: number;
  loteDestinoId: number;
  pastoDestinoId?: number | null;
  dataTransferencia: string;
  observacoes?: string | null;
  usuarioNome?: string | null;
};

function toTrpc(
  message: string,
  code: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}

export async function registrarTransferenciaInternaAnimal(
  userId: number,
  input: RegistrarTransferenciaInternaInput,
) {
  await assertFazendaDoUsuario(userId, input.fazendaOrigemId);
  await assertFazendaDoUsuario(userId, input.fazendaDestinoId);

  try {
    const [loteDestino] = await db
      .select({
        id: lotes.id,
        fazendaId: lotes.fazendaId,
        ativo: lotes.ativo,
        pastoAtualId: lotes.pastoAtualId,
        nome: lotes.nome,
      })
      .from(lotes)
      .where(and(eq(lotes.userId, userId), eq(lotes.id, input.loteDestinoId)))
      .limit(1);
    if (!loteDestino) toTrpc("Lote de destino não encontrado.", "NOT_FOUND");

    let pastoDestinoFazendaId: number | null = null;
    const pastoInformado =
      input.pastoDestinoId != null && input.pastoDestinoId > 0
        ? input.pastoDestinoId
        : loteDestino.pastoAtualId ?? null;
    if (pastoInformado != null) {
      const [pasto] = await db
        .select({ id: pastos.id, fazendaId: pastos.fazendaId })
        .from(pastos)
        .where(and(eq(pastos.userId, userId), eq(pastos.id, pastoInformado)))
        .limit(1);
      if (!pasto) toTrpc("Subdivisão de destino não encontrada.", "NOT_FOUND");
      pastoDestinoFazendaId = pasto.fazendaId;
      if (Number(pasto.fazendaId) !== Number(input.fazendaDestinoId)) {
        toTrpc(MSG_TRANSFERENCIA_PASTO_FAZENDA);
      }
    }

    const validacao = validarTransferenciaInternaInput({
      fazendaOrigemId: input.fazendaOrigemId,
      fazendaDestinoId: input.fazendaDestinoId,
      animalId: input.animalId,
      loteDestinoId: input.loteDestinoId,
      loteDestinoFazendaId: loteDestino.fazendaId,
      loteDestinoAtivo: loteDestino.ativo,
      pastoDestinoId: pastoInformado,
      pastoDestinoFazendaId,
      dataTransferencia: input.dataTransferencia,
    });
    if (!validacao.ok) toTrpc(validacao.message);
    if (loteDestino.fazendaId == null) toTrpc(MSG_TRANSFERENCIA_LOTE_FAZENDA);
    if (loteDestino.ativo === false) toTrpc(MSG_TRANSFERENCIA_LOTE_INATIVO);

    await assertManejoPermitidoNaData(userId, input.animalId, validacao.dataISO);

    const observacoes = input.observacoes?.trim() || null;
    const usuarioNome = input.usuarioNome?.trim() || null;

    const result = await db.transaction(async tx => {
      const [animal] = await tx
        .select({
          id: animais.id,
          status: animais.status,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          pastoId: animais.pastoId,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), eq(animais.id, input.animalId)))
        .limit(1);
      if (!animal) toTrpc("Animal não encontrado.", "NOT_FOUND");
      if (animal.status !== "ativo") toTrpc(MSG_BAIXA_ANIMAL_INATIVO);
      if (Number(animal.fazendaId) !== Number(input.fazendaOrigemId)) {
        toTrpc(MSG_BAIXA_FAZENDA_DIVERGENTE);
      }

      const [existente] = await tx
        .select({ id: animalBaixas.id })
        .from(animalBaixas)
        .where(eq(animalBaixas.animalId, input.animalId))
        .limit(1);
      if (existente) toTrpc(MSG_SAIDA_TRANSFERENCIA_DUPLICADA);

      await tx
        .update(animais)
        .set({
          fazendaId: validacao.fazendaDestinoId,
          loteId: validacao.loteDestinoId,
          pastoId: validacao.pastoDestinoId,
        })
        .where(
          and(
            eq(animais.userId, userId),
            eq(animais.id, input.animalId),
            eq(animais.status, "ativo"),
          ),
        );

      await tx.insert(animalLoteMovimentacoes).values({
        userId,
        animalId: input.animalId,
        loteOrigemId: animal.loteId && animal.loteId > 0 ? animal.loteId : null,
        loteDestinoId: validacao.loteDestinoId,
        pastoOrigemId: animal.pastoId ?? null,
        pastoDestinoId: validacao.pastoDestinoId,
        fazendaId: validacao.fazendaDestinoId,
        fazendaOrigemId: validacao.fazendaOrigemId,
        dataMovimentacao: validacao.dataISO,
        usuarioNome,
        observacoes,
      });

      return {
        status: "ativo" as const,
        fazendaId: validacao.fazendaDestinoId,
        loteId: validacao.loteDestinoId,
        loteDestinoNome: loteDestino.nome,
      };
    });

    try {
      await registrarLocalTransferenciaInterna(userId, {
        ...input,
        dataTransferencia: validacao.dataISO,
        pastoDestinoId: validacao.pastoDestinoId,
        observacoes,
        usuarioNome,
      });
    } catch (mirrorError) {
      console.warn("[animal.transferenciaInterna] Espelho local não gravado:", mirrorError);
    }

    return { success: true as const, ...result };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) {
      console.error("[animal.transferenciaInterna]", error);
      toTrpc(MSG_TRANSFERENCIA_GENERICO, "INTERNAL_SERVER_ERROR");
    }
  }

  try {
    const local = await registrarLocalTransferenciaInterna(userId, {
      ...input,
      usuarioNome: input.usuarioNome?.trim() || null,
      observacoes: input.observacoes?.trim() || null,
    });
    return { success: true as const, ...local, localFallback: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : MSG_TRANSFERENCIA_GENERICO;
    if (message === "Animal não encontrado." || message === "Lote de destino não encontrado.") {
      toTrpc(message, "NOT_FOUND");
    }
    toTrpc(message);
  }
}
