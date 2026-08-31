import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animalBaixas, animais } from "../drizzle/schema";
import {
  avaliarManejoVsBaixa,
  MSG_BAIXA_ANIMAL_INATIVO,
  MSG_BAIXA_DUPLICADA,
  MSG_BAIXA_FAZENDA_DIVERGENTE,
  MSG_BAIXA_GENERICO,
  mensagemSaidaDuplicada,
  tipoBaixaParaStatus,
  validarBaixaAnimalInput,
  type TipoBaixaAnimal,
} from "../shared/animalBaixa";
import { validarMotivoMortePersistido } from "../shared/causaMorte";
import { db } from "./db";
import {
  getLocalAnimal,
  getLocalAnimalBaixa,
  isDatabaseUnavailable,
  registrarLocalAnimalBaixa,
} from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type RegistrarBaixaAnimalInput = {
  fazendaId: number;
  animalId: number;
  dataBaixa: string;
  tipo: TipoBaixaAnimal;
  destino?: string | null;
  motivo?: string | null;
  observacoes?: string | null;
  usuarioNome?: string | null;
};

function toTrpc(
  message: string,
  code: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR" = "BAD_REQUEST",
): never {
  throw new TRPCError({ code, message });
}

function isDuplicateKey(error: unknown): boolean {
  const item = error as { code?: string; errno?: number; message?: string };
  return (
    item?.code === "ER_DUP_ENTRY" ||
    item?.errno === 1062 ||
    String(item?.message ?? "").includes("animal_baixas_animal_uq")
  );
}

export async function getBaixaAnimal(userId: number, animalId: number) {
  try {
    const [row] = await db
      .select()
      .from(animalBaixas)
      .where(and(eq(animalBaixas.userId, userId), eq(animalBaixas.animalId, animalId)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return getLocalAnimalBaixa(userId, animalId);
  }
}

export async function registrarBaixaAnimal(
  userId: number,
  input: RegistrarBaixaAnimalInput,
) {
  const validacao = validarBaixaAnimalInput(input);
  if (!validacao.ok) toTrpc(validacao.message);
  await assertFazendaDoUsuario(userId, input.fazendaId);

  const destino = validacao.tipo === "transferencia" ? input.destino?.trim() || null : null;
  const causa =
    validacao.tipo === "morte"
      ? validarMotivoMortePersistido(input.motivo)
      : { ok: true as const, motivo: null };
  if (!causa.ok) toTrpc(causa.message);
  const motivo = causa.motivo;
  const observacoes = input.observacoes?.trim() || null;
  const usuarioNome = input.usuarioNome?.trim() || null;

  try {
    const result = await db.transaction(async tx => {
      const [animal] = await tx
        .select({
          id: animais.id,
          status: animais.status,
          fazendaId: animais.fazendaId,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), eq(animais.id, input.animalId)))
        .limit(1);
      if (!animal) toTrpc("Animal não encontrado.", "NOT_FOUND");
      if (animal.status !== "ativo") toTrpc(MSG_BAIXA_ANIMAL_INATIVO);
      if (Number(animal.fazendaId) !== Number(input.fazendaId)) {
        toTrpc(MSG_BAIXA_FAZENDA_DIVERGENTE);
      }

      const [existente] = await tx
        .select({ id: animalBaixas.id })
        .from(animalBaixas)
        .where(eq(animalBaixas.animalId, input.animalId))
        .limit(1);
      if (existente) toTrpc(mensagemSaidaDuplicada(validacao.tipo));

      const insert = await tx.insert(animalBaixas).values({
        userId,
        animalId: input.animalId,
        fazendaId: input.fazendaId,
        tipo: validacao.tipo,
        dataBaixa: validacao.dataISO,
        destino,
        motivo,
        observacoes,
        usuarioNome,
      });
      await tx
        .update(animais)
        .set({ status: validacao.status })
        .where(
          and(
            eq(animais.userId, userId),
            eq(animais.id, input.animalId),
            eq(animais.status, "ativo"),
          ),
        );
      return {
        id: Number((insert as { insertId?: number }[])[0]?.insertId),
        status: validacao.status,
      };
    });

    try {
      await registrarLocalAnimalBaixa(userId, {
        ...input,
        tipo: validacao.tipo,
        dataBaixa: validacao.dataISO,
        destino,
        motivo,
        observacoes,
        usuarioNome,
      });
    } catch (mirrorError) {
      console.warn("[animal.baixa] Espelho local não gravado:", mirrorError);
    }
    return { success: true as const, ...result };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isDuplicateKey(error)) toTrpc(mensagemSaidaDuplicada(validacao.tipo));
    if (!isDatabaseUnavailable(error)) {
      console.error("[animal.baixa]", error);
      toTrpc(MSG_BAIXA_GENERICO, "INTERNAL_SERVER_ERROR");
    }
  }

  try {
    const baixa = await registrarLocalAnimalBaixa(userId, {
      ...input,
      tipo: validacao.tipo,
      dataBaixa: validacao.dataISO,
      destino,
      motivo,
      observacoes,
      usuarioNome,
    });
    return {
      success: true as const,
      id: baixa.id,
      status: tipoBaixaParaStatus(baixa.tipo),
      localFallback: true as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : MSG_BAIXA_GENERICO;
    if (
      message === MSG_BAIXA_DUPLICADA ||
      message === mensagemSaidaDuplicada(validacao.tipo) ||
      message === MSG_BAIXA_ANIMAL_INATIVO ||
      message === MSG_BAIXA_FAZENDA_DIVERGENTE ||
      message === "Animal não encontrado."
    ) {
      toTrpc(message, message === "Animal não encontrado." ? "NOT_FOUND" : "BAD_REQUEST");
    }
    toTrpc(MSG_BAIXA_GENERICO, "INTERNAL_SERVER_ERROR");
  }
}

/**
 * Autoridade comum dos manejos: permite retroativo até a data da baixa.
 * Legado inativo sem evento/data permanece bloqueado.
 */
export async function assertManejoPermitidoNaData(
  userId: number,
  animalId: number,
  dataEvento: string,
): Promise<void> {
  let status: string | null | undefined;
  let dataBaixa: string | Date | null | undefined;

  try {
    const [animal, baixa] = await Promise.all([
      db
        .select({ status: animais.status })
        .from(animais)
        .where(and(eq(animais.userId, userId), eq(animais.id, animalId)))
        .limit(1),
      db
        .select({ dataBaixa: animalBaixas.dataBaixa })
        .from(animalBaixas)
        .where(and(eq(animalBaixas.userId, userId), eq(animalBaixas.animalId, animalId)))
        .limit(1),
    ]);
    if (!animal[0]) toTrpc("Animal não encontrado.", "NOT_FOUND");
    status = animal[0].status;
    dataBaixa = baixa[0]?.dataBaixa ?? null;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;
    const [animal, baixa] = await Promise.all([
      getLocalAnimal(userId, animalId),
      getLocalAnimalBaixa(userId, animalId),
    ]);
    if (!animal) toTrpc("Animal não encontrado.", "NOT_FOUND");
    status = animal.status;
    dataBaixa = baixa?.dataBaixa ?? null;
  }

  const avaliacao = avaliarManejoVsBaixa({ status, dataBaixa, dataEvento });
  if (!avaliacao.permitido) toTrpc(avaliacao.mensagem);
}
