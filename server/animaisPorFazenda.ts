import { and, eq, inArray, or } from "drizzle-orm";
import { animais, lotes } from "../drizzle/schema";
import { db } from "./db";

/** IDs dos lotes vinculados à fazenda. */
export async function listLoteIdsPorFazenda(userId: number, fazendaId: number): Promise<number[]> {
  const rows = await db
    .select({ id: lotes.id })
    .from(lotes)
    .where(and(eq(lotes.userId, userId), eq(lotes.fazendaId, fazendaId)));
  return rows.map(row => row.id);
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

export function buildLoteIdsSetPorFazenda(
  lotes: { id: number; fazendaId?: number | null }[],
  fazendaId: number,
): Set<number> {
  return new Set(
    lotes
      .filter(l => Number(l.fazendaId) === fazendaId)
      .map(l => l.id),
  );
}

/** Animal pertence à fazenda se fazendaId bate ou se está em lote da fazenda. */
export function animalPertenceFazenda(
  animal: { fazendaId?: number | null; loteId?: number | null },
  fazendaId: number,
  loteIdsFazenda: Set<number>,
): boolean {
  if (Number(animal.fazendaId) === fazendaId) return true;
  if (animal.loteId != null && loteIdsFazenda.has(Number(animal.loteId))) return true;
  return false;
}

export function filterAnimaisPorFazenda<T extends { fazendaId?: number | null; loteId?: number | null }>(
  animais: T[],
  fazendaId: number,
  loteIdsFazenda: Set<number>,
): T[] {
  return animais.filter(a => animalPertenceFazenda(a, fazendaId, loteIdsFazenda));
}
