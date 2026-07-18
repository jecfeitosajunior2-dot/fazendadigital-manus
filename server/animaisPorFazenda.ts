import { and, eq, inArray, or } from "drizzle-orm";
import { animais, lotes, pastos } from "../drizzle/schema";
import { db } from "./db";

export type LoteFazendaRef = {
  id: number;
  fazendaId?: number | null;
  pastoAtualId?: number | null;
};

export type PastoFazendaRef = {
  id: number;
  fazendaId?: number | null;
};

export function buildPastoFazendaMap(pastos: PastoFazendaRef[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const pasto of pastos) {
    if (pasto.fazendaId != null) map.set(pasto.id, Number(pasto.fazendaId));
  }
  return map;
}

/** Mesma regra do Gerenciamento de Lotes: lote.fazendaId ou pasto da subdivisão. */
export function resolveLoteFazendaId(
  lote: LoteFazendaRef,
  pastoFazendaMap: Map<number, number>,
): number | null {
  if (lote.fazendaId != null) return Number(lote.fazendaId);
  if (lote.pastoAtualId != null) {
    return pastoFazendaMap.get(Number(lote.pastoAtualId)) ?? null;
  }
  return null;
}

export function buildLoteFazendaByIdMap(
  lotesList: LoteFazendaRef[],
  pastoFazendaMap: Map<number, number>,
): Map<number, number | null> {
  const map = new Map<number, number | null>();
  for (const lote of lotesList) {
    map.set(lote.id, resolveLoteFazendaId(lote, pastoFazendaMap));
  }
  return map;
}

export function buildLoteFazendaContext(
  lotesList: LoteFazendaRef[],
  pastosList: PastoFazendaRef[],
): { pastoFazendaMap: Map<number, number>; loteFazendaById: Map<number, number | null> } {
  const pastoFazendaMap = buildPastoFazendaMap(pastosList);
  return {
    pastoFazendaMap,
    loteFazendaById: buildLoteFazendaByIdMap(lotesList, pastoFazendaMap),
  };
}

export function listLoteIdsPorFazendaFromContext(
  loteFazendaById: Map<number, number | null>,
  fazendaId: number,
): number[] {
  return [...loteFazendaById.entries()]
    .filter(([, fid]) => fid === fazendaId)
    .map(([id]) => id);
}

/** Localização do animal derivada do lote (fazenda direta ou via subdivisão). */
export function resolveAnimalLocalizacaoFromLote(
  lote: LoteFazendaRef,
  pastoFazendaMap: Map<number, number>,
): { fazendaId: number | null; pastoId: number | null } {
  return {
    fazendaId: resolveLoteFazendaId(lote, pastoFazendaMap),
    pastoId: lote.pastoAtualId ?? null,
  };
}

/** Animal sem fazenda pode entrar no lote; com fazenda, precisa bater com a do lote. */
export function animalCompativelComFazendaLote(
  animal: { fazendaId?: number | null },
  fazendaIdLote: number | null,
): boolean {
  if (fazendaIdLote == null) return false;
  if (animal.fazendaId == null) return true;
  return Number(animal.fazendaId) === Number(fazendaIdLote);
}

/** Animal pertence à fazenda se fazendaId bate ou se o lote resolve para a fazenda. */
export function animalPertenceFazenda(
  animal: { fazendaId?: number | null; loteId?: number | null },
  fazendaId: number,
  loteFazendaById: Map<number, number | null>,
): boolean {
  if (animal.fazendaId != null && Number(animal.fazendaId) === fazendaId) return true;
  if (animal.loteId != null) {
    return loteFazendaById.get(Number(animal.loteId)) === fazendaId;
  }
  return false;
}

export function filterAnimaisPorFazenda<T extends { fazendaId?: number | null; loteId?: number | null }>(
  animaisList: T[],
  fazendaId: number,
  loteFazendaById: Map<number, number | null>,
): T[] {
  return animaisList.filter(a => animalPertenceFazenda(a, fazendaId, loteFazendaById));
}

export async function loadLoteFazendaContextForUser(userId: number) {
  const lotesList = await db
    .select({
      id: lotes.id,
      fazendaId: lotes.fazendaId,
      pastoAtualId: lotes.pastoAtualId,
    })
    .from(lotes)
    .where(eq(lotes.userId, userId));

  const pastosList = await db
    .select({
      id: pastos.id,
      fazendaId: pastos.fazendaId,
    })
    .from(pastos)
    .where(eq(pastos.userId, userId));

  return buildLoteFazendaContext(lotesList, pastosList);
}

/** IDs dos lotes vinculados à fazenda (direto ou via subdivisão). */
export async function listLoteIdsPorFazenda(userId: number, fazendaId: number): Promise<number[]> {
  const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);
  return listLoteIdsPorFazendaFromContext(loteFazendaById, fazendaId);
}

/** Condição SQL: animal da fazenda (campo direto ou lote da fazenda). */
export async function buildAnimaisFazendaCondition(
  userId: number,
  fazendaId: number,
): Promise<ReturnType<typeof and>> {
  const loteIds = await listLoteIdsPorFazenda(userId, fazendaId);
  if (loteIds.length > 0) {
    return and(
      eq(animais.userId, userId),
      or(eq(animais.fazendaId, fazendaId), inArray(animais.loteId, loteIds)),
    );
  }
  return and(eq(animais.userId, userId), eq(animais.fazendaId, fazendaId));
}
