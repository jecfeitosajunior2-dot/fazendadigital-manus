import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, saudeRegistros } from "../drizzle/schema";
import { db } from "./db";
import {
  createLocalSaudeRegistro,
  isDatabaseUnavailable,
  listLocalSaudeRegistros,
  updateLocalAnimal,
} from "./localFallbackStore";
import { assertAnimalNaFazenda, assertFazendaDoUsuario } from "./manejoContexto";
import { assertManejoPermitidoNaData } from "./animalBaixa";
import {
  jaPossuiCastracaoRegistrada,
  montarPersistenciaCastracao,
  MSG_CASTRACAO_DUPLICADA,
  MSG_CASTRACAO_GENERICO,
  validarAnimalParaCastracao,
  validarCastracaoInput,
  type MetodoCastracao,
} from "../shared/castracaoManejo";

export type RegistrarCastracaoInput = {
  fazendaId: number;
  animalId: number;
  dataCastracao: string;
  metodo: MetodoCastracao;
  descricaoMetodo?: string;
  observacoes?: string;
  veterinario?: string;
};

export type RegistrarCastracaoResult = {
  success: true;
  id?: number;
  localFallback?: true;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

async function listCastracoesAnimal(userId: number, animalId: number) {
  try {
    const rows = await db
      .select({ tipo: saudeRegistros.tipo })
      .from(saudeRegistros)
      .where(and(eq(saudeRegistros.userId, userId), eq(saudeRegistros.animalId, animalId)));
    return rows;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalSaudeRegistros(userId, animalId);
  }
}

export async function registrarCastracao(
  userId: number,
  input: RegistrarCastracaoInput,
): Promise<RegistrarCastracaoResult> {
  const campos = validarCastracaoInput({
    fazendaId: input.fazendaId,
    animalId: input.animalId,
    dataCastracao: input.dataCastracao,
    metodo: input.metodo,
    descricaoMetodo: input.descricaoMetodo,
  });
  if (!campos.ok) toTrpc(campos.message);

  await assertFazendaDoUsuario(userId, input.fazendaId);
  const animal = await assertAnimalNaFazenda(userId, input.animalId, input.fazendaId);
  const dataISO = input.dataCastracao.trim().slice(0, 10);
  await assertManejoPermitidoNaData(userId, input.animalId, dataISO);

  const elegivel = validarAnimalParaCastracao({
    sexo: animal.sexo,
    // A autoridade de status/data está acima; retroativos até a baixa são válidos.
    status: "ativo",
    castrado: animal.castrado,
  });
  if (!elegivel.ok) toTrpc(elegivel.message);

  const historico = await listCastracoesAnimal(userId, input.animalId);
  if (jaPossuiCastracaoRegistrada(historico)) toTrpc(MSG_CASTRACAO_DUPLICADA);

  const persist = montarPersistenciaCastracao({
    metodo: input.metodo,
    descricaoMetodo: input.descricaoMetodo,
    observacoes: input.observacoes,
  });
  const veterinario = input.veterinario?.trim() || undefined;

  try {
    const insertId = await db.transaction(async tx => {
      const result = await tx.insert(saudeRegistros).values({
        userId,
        animalId: input.animalId,
        tipo: persist.tipo,
        descricao: persist.descricao,
        medicamento: persist.medicamento,
        veterinario,
        dataRegistro: new Date(dataISO),
        observacoes: persist.observacoes,
      });
      const id = (result as { insertId?: number }[])[0]?.insertId;
      await tx
        .update(animais)
        .set({ castrado: true })
        .where(and(eq(animais.id, input.animalId), eq(animais.userId, userId)));
      return id;
    });
    return { success: true, id: insertId };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MSG_CASTRACAO_GENERICO });
    }
  }

  const local = await createLocalSaudeRegistro(userId, {
    animalId: input.animalId,
    tipo: persist.tipo,
    descricao: persist.descricao,
    medicamento: persist.medicamento,
    veterinario,
    dataRegistro: dataISO,
    observacoes: persist.observacoes,
  });
  await updateLocalAnimal(userId, input.animalId, { castrado: true });
  return { success: true, id: local.id, localFallback: true };
}
