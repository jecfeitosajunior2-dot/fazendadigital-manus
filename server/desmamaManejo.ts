import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, pesagens, reproducaoRegistros } from "../drizzle/schema";
import { db } from "./db";
import {
  createLocalPesagem,
  getLocalAnimal,
  isDatabaseUnavailable,
  listLocalPesagens,
  listLocalReproducaoRegistros,
  updateLocalAnimal,
} from "./localFallbackStore";
import { assertAnimalNaFazenda, assertFazendaDoUsuario } from "./manejoContexto";
import { assertManejoPermitidoNaData } from "./animalBaixa";
import {
  jaPossuiPesagemIgual,
  MSG_DESMAMA_GENERICO,
  observacaoPesagemDesmama,
  validarAnimalParaDesmama,
  validarDesmamaInput,
} from "../shared/desmamaManejo";

export type RegistrarDesmamaInput = {
  fazendaId: number;
  animalId: number;
  dataDesmama: string;
  pesoKg?: string;
  observacoes?: string;
};

export type RegistrarDesmamaResult = {
  success: true;
  pesagemCriada: boolean;
  pesagemReutilizada: boolean;
  localFallback?: true;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

async function listEventosDesmamaAnimal(userId: number, animalId: number) {
  try {
    const rows = await db
      .select({ tipo: reproducaoRegistros.tipo, femeaId: reproducaoRegistros.femeaId })
      .from(reproducaoRegistros)
      .where(and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.femeaId, animalId)));
    return rows;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await listLocalReproducaoRegistros(userId);
    return local.filter(r => r.femeaId === animalId);
  }
}

async function listPesagensAnimal(userId: number, animalId: number) {
  try {
    const rows = await db
      .select({ data: pesagens.data, peso: pesagens.peso })
      .from(pesagens)
      .where(and(eq(pesagens.userId, userId), eq(pesagens.animalId, animalId)));
    return rows;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return listLocalPesagens(userId, animalId);
  }
}

export async function registrarDesmama(
  userId: number,
  input: RegistrarDesmamaInput,
): Promise<RegistrarDesmamaResult> {
  const campos = validarDesmamaInput({
    fazendaId: input.fazendaId,
    animalId: input.animalId,
    dataDesmama: input.dataDesmama,
    pesoKg: input.pesoKg,
  });
  if (!campos.ok) toTrpc(campos.message);

  await assertFazendaDoUsuario(userId, input.fazendaId);
  const animal = await assertAnimalNaFazenda(userId, input.animalId, input.fazendaId);
  await assertManejoPermitidoNaData(userId, input.animalId, campos.dataISO);
  const eventos = await listEventosDesmamaAnimal(userId, input.animalId);

  const elegivel = validarAnimalParaDesmama(
    {
      // Status/data já foram validados pelo evento de baixa; permite retroativo válido.
      status: "ativo",
      dataDesmama: animal.dataDesmama,
      dataNascimento: animal.dataNascimento,
      categoria: animal.categoria,
      registrosEvento: eventos,
    },
    campos.dataISO,
  );
  if (!elegivel.ok) toTrpc(elegivel.message);

  const dataISO = campos.dataISO;
  const peso = campos.peso;
  const observacoes = (input.observacoes ?? "").trim() || undefined;
  let pesagemReutilizada = false;
  let criarPesagem = false;

  if (peso) {
    const historicoPeso = await listPesagensAnimal(userId, input.animalId);
    pesagemReutilizada = jaPossuiPesagemIgual(historicoPeso, dataISO, peso);
    criarPesagem = !pesagemReutilizada;
  }

  try {
    await db.transaction(async tx => {
      await tx
        .update(animais)
        .set({
          dataDesmama: dataISO,
          ...(criarPesagem && peso ? { pesoAtual: peso } : {}),
        })
        .where(and(eq(animais.id, input.animalId), eq(animais.userId, userId)));

      if (criarPesagem && peso) {
        await tx.insert(pesagens).values({
          userId,
          animalId: input.animalId,
          peso,
          data: new Date(dataISO),
          observacoes: observacaoPesagemDesmama(observacoes),
        });
      }
    });
    return { success: true, pesagemCriada: criarPesagem, pesagemReutilizada };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MSG_DESMAMA_GENERICO });
    }
  }

  const localAnimal = await getLocalAnimal(userId, input.animalId);
  if (localAnimal) {
    const localElegivel = validarAnimalParaDesmama(
      {
        status: "ativo",
        dataDesmama: localAnimal.dataDesmama,
        dataNascimento: localAnimal.dataNascimento,
        categoria: localAnimal.categoria,
      },
      dataISO,
    );
    if (!localElegivel.ok) toTrpc(localElegivel.message);
  }

  if (criarPesagem && peso) {
    await createLocalPesagem(userId, {
      animalId: input.animalId,
      peso,
      data: dataISO,
      observacoes: observacaoPesagemDesmama(observacoes),
    });
  }
  await updateLocalAnimal(userId, input.animalId, { dataDesmama: dataISO });
  return {
    success: true,
    pesagemCriada: criarPesagem,
    pesagemReutilizada,
    localFallback: true,
  };
}
