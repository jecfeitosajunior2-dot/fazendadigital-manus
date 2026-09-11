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
  updateLocalPesagemObservacoes,
} from "./localFallbackStore";
import { assertAnimalNaFazenda, assertFazendaDoUsuario } from "./manejoContexto";
import { assertManejoPermitidoNaData } from "./animalBaixa";
import {
  MSG_DESMAMA_GENERICO,
  observacaoAoVincularPesagemDesmama,
  observacaoPesagemDesmama,
  resolverDataNascimentoDesmama,
  resolverPesagemDesmama,
  toISODateOnly,
  validarAnimalParaDesmama,
  validarDesmamaInput,
  type PesagemDesmamaRow,
} from "../shared/desmamaManejo";

export type RegistrarDesmamaInput = {
  fazendaId: number;
  animalId: number;
  dataDesmama: string;
  pesoKg?: string;
  observacoes?: string;
  /** Quando o animal não tem nascimento cadastrado, idade aproximada na data da desmama. */
  idadeMeses?: number;
};

export type RegistrarDesmamaResult = {
  success: true;
  pesagemCriada: boolean;
  pesagemReutilizada: boolean;
  pesagemVinculada: boolean;
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

async function listPesagensAnimal(userId: number, animalId: number): Promise<PesagemDesmamaRow[]> {
  try {
    const rows = await db
      .select({
        id: pesagens.id,
        data: pesagens.data,
        peso: pesagens.peso,
        observacoes: pesagens.observacoes,
      })
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

  const dataISO = campos.dataISO;
  const dataNascimentoResolvida = resolverDataNascimentoDesmama({
    dataNascimento: animal.dataNascimento,
    idadeMesesInformada: input.idadeMeses,
    dataEvento: dataISO,
  });
  const dataNascimentoPersistir =
    !toISODateOnly(animal.dataNascimento) && dataNascimentoResolvida
      ? dataNascimentoResolvida
      : undefined;

  const elegivel = validarAnimalParaDesmama(
    {
      status: "ativo",
      dataDesmama: animal.dataDesmama,
      dataNascimento: dataNascimentoResolvida ?? animal.dataNascimento,
      categoria: animal.categoria,
      registrosEvento: eventos,
    },
    dataISO,
  );
  if (!elegivel.ok) toTrpc(elegivel.message);
  const observacoes = (input.observacoes ?? "").trim() || undefined;
  const historicoPeso = await listPesagensAnimal(userId, input.animalId);
  const resolucao = resolverPesagemDesmama({
    dataISO,
    pesoInformado: campos.peso,
    historico: historicoPeso,
  });
  const peso = resolucao.peso;
  const criarPesagem = resolucao.criarPesagem;
  const pesagemReutilizada = resolucao.pesagemReutilizada;
  const pesagemIdVincular = resolucao.pesagemIdVincular;

  let pesagemVinculada = false;
  let obsVinculo: string | null = null;
  if (pesagemIdVincular != null) {
    const row = historicoPeso.find(p => p.id === pesagemIdVincular);
    obsVinculo = observacaoAoVincularPesagemDesmama(row?.observacoes, observacoes);
    pesagemVinculada = obsVinculo !== (row?.observacoes ?? "").trim();
  }

  try {
    await db.transaction(async tx => {
      await tx
        .update(animais)
        .set({
          dataDesmama: dataISO,
          ...(dataNascimentoPersistir ? { dataNascimento: dataNascimentoPersistir } : {}),
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
      } else if (pesagemIdVincular != null && obsVinculo != null) {
        await tx
          .update(pesagens)
          .set({ observacoes: obsVinculo })
          .where(
            and(
              eq(pesagens.id, pesagemIdVincular),
              eq(pesagens.userId, userId),
              eq(pesagens.animalId, input.animalId),
            ),
          );
      }
    });
    return {
      success: true,
      pesagemCriada: criarPesagem,
      pesagemReutilizada,
      pesagemVinculada: pesagemVinculada || (pesagemIdVincular != null && !criarPesagem),
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: MSG_DESMAMA_GENERICO });
    }
  }

  const localAnimal = await getLocalAnimal(userId, input.animalId);
  if (localAnimal) {
    const localNascimento = resolverDataNascimentoDesmama({
      dataNascimento: localAnimal.dataNascimento,
      idadeMesesInformada: input.idadeMeses,
      dataEvento: dataISO,
    });
    const localElegivel = validarAnimalParaDesmama(
      {
        status: "ativo",
        dataDesmama: localAnimal.dataDesmama,
        dataNascimento: localNascimento ?? localAnimal.dataNascimento,
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
  } else if (pesagemIdVincular != null && obsVinculo != null) {
    await updateLocalPesagemObservacoes(userId, pesagemIdVincular, obsVinculo);
  }
  await updateLocalAnimal(userId, input.animalId, {
    dataDesmama: dataISO,
    ...(dataNascimentoPersistir ? { dataNascimento: dataNascimentoPersistir } : {}),
  });
  return {
    success: true,
    pesagemCriada: criarPesagem,
    pesagemReutilizada,
    pesagemVinculada: pesagemIdVincular != null && !criarPesagem,
    localFallback: true,
  };
}
