import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { animais, lotes, pastos } from "../drizzle/schema";
import {
  buildReproAnimalElegibilidadeInput,
  isFemeaReprodutivamenteMadura,
} from "../shared/reproElegibilidade";
import type { CoberturaAlvoPersistido, CoberturaSelecaoModo } from "../shared/reproCoberturaAlvo";
import {
  MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO,
  MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS,
  MSG_REPRO_LOTE_INELEGIVEL,
  MSG_REPRO_MATRIZ_INELEGIVEL,
} from "../shared/reproCoberturaAlvo";
import { db } from "./db";
import {
  animalPertenceFazenda,
  buildLoteFazendaContext,
  resolveLoteFazendaId,
} from "./animaisPorFazenda";
import {
  getLocalAnimal,
  getLocalLote,
  isDatabaseUnavailable,
} from "./localFallbackStore";

type AnimalRow = {
  id: number;
  sexo?: string | null;
  categoria?: string | null;
  dataNascimento?: Date | string | null;
  status?: string | null;
  fazendaId?: number | null;
  loteId?: number | null;
  brinco?: string | null;
  nome?: string | null;
};

function labelBrincoAnimal(animal: { brinco?: string | null; nome?: string | null; id: number }) {
  const brinco = animal.brinco?.trim();
  if (brinco) return brinco;
  const nome = animal.nome?.trim();
  if (nome) return nome;
  return String(animal.id);
}

function isMatrizElegivel(animal: AnimalRow): boolean {
  if ((animal.status ?? "ativo") !== "ativo") return false;
  if (animal.sexo !== "femea") return false;
  return isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(animal));
}

async function loadAnimalById(userId: number, id: number): Promise<AnimalRow | null> {
  try {
    const [row] = await db
      .select({
        id: animais.id,
        sexo: animais.sexo,
        categoria: animais.categoria,
        dataNascimento: animais.dataNascimento,
        status: animais.status,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        brinco: animais.brinco,
        nome: animais.nome,
      })
      .from(animais)
      .where(and(eq(animais.id, id), eq(animais.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await getLocalAnimal(userId, id);
    if (!local) return null;
    return local as AnimalRow;
  }
}

async function loadLoteById(userId: number, id: number) {
  try {
    const [row] = await db
      .select({
        id: lotes.id,
        nome: lotes.nome,
        fazendaId: lotes.fazendaId,
        pastoAtualId: lotes.pastoAtualId,
        ativo: lotes.ativo,
      })
      .from(lotes)
      .where(and(eq(lotes.id, id), eq(lotes.userId, userId)))
      .limit(1);
    return row ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await getLocalLote(userId, id);
    return local ?? null;
  }
}

async function loadLoteFazendaContext(userId: number) {
  try {
    const lotesList = await db
      .select({ id: lotes.id, fazendaId: lotes.fazendaId, pastoAtualId: lotes.pastoAtualId })
      .from(lotes)
      .where(eq(lotes.userId, userId));
    const pastosList = await db
      .select({ id: pastos.id, fazendaId: pastos.fazendaId })
      .from(pastos)
      .where(eq(pastos.userId, userId));
    return buildLoteFazendaContext(lotesList, pastosList);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const { listLocalLotes } = await import("./localFallbackStore");
    const lotesList = await listLocalLotes(userId);
    const pastosList: { id: number; fazendaId?: number | null }[] = [];
    return buildLoteFazendaContext(lotesList, pastosList);
  }
}

function dedupeMatrizIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function resolveAndValidateCoberturaAlvo(input: {
  userId: number;
  fazendaId: number;
  coberturaSelecaoModo?: CoberturaSelecaoModo;
  coberturaMatrizIds?: number[];
  coberturaLoteId?: number;
}): Promise<CoberturaAlvoPersistido> {
  const { userId, fazendaId } = input;
  const modo = input.coberturaSelecaoModo;

  if (!modo) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO });
  }

  const matrizIds = dedupeMatrizIds(input.coberturaMatrizIds ?? []);
  if (matrizIds.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS });
  }

  const { loteFazendaById, pastoFazendaMap } = await loadLoteFazendaContext(userId);

  let loteContexto: { id: number; nome: string } | null = null;
  if (modo === "lote") {
    const loteId = input.coberturaLoteId;
    if (!loteId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO });
    }
    const lote = await loadLoteById(userId, loteId);
    if (!lote || lote.ativo === false) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_LOTE_INELEGIVEL });
    }
    const loteFazendaId = resolveLoteFazendaId(lote, pastoFazendaMap);
    if (loteFazendaId !== fazendaId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_LOTE_INELEGIVEL });
    }
    loteContexto = {
      id: lote.id,
      nome: lote.nome?.trim() || `Lote #${lote.id}`,
    };
  }

  const labelsBrinco: string[] = [];

  for (const matrizId of matrizIds) {
    const matriz = await loadAnimalById(userId, matrizId);
    if (!matriz) {
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_REPRO_MATRIZ_INELEGIVEL });
    }
    if (!animalPertenceFazenda(matriz, fazendaId, loteFazendaById)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MATRIZ_INELEGIVEL });
    }
    if (!isMatrizElegivel(matriz)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MATRIZ_INELEGIVEL });
    }
    if (modo === "lote" && loteContexto && matriz.loteId !== loteContexto.id) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_REPRO_MATRIZ_INELEGIVEL });
    }
    labelsBrinco.push(labelBrincoAnimal(matriz));
  }

  return {
    selectionMode: modo,
    animalIds: matrizIds,
    labelsBrinco,
    ...(loteContexto
      ? { loteId: loteContexto.id, labelLoteNome: loteContexto.nome }
      : {}),
  };
}
