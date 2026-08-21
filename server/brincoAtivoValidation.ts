import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { animais } from "../drizzle/schema";
import {
  buildBrincoAtivoConflitoMessage,
  findActiveBrincoConflict,
  normalizeBrincoKey,
  resolveEffectiveStatus,
  type AnimalBrincoRef,
} from "../shared/brincoAtivo";
import { db } from "./db";
import { listLocalAnimais } from "./localFallbackStore";
import {
  listLoteIdsPorFazendaFromContext,
  loadLoteFazendaContextForUser,
} from "./animaisPorFazenda";

export type BrincoUnicidadeOptions = {
  excludeAnimalId?: number;
  fazendaId?: number;
};

export async function findActiveBrincoConflictInDb(
  userId: number,
  brinco: string | null | undefined,
  options?: BrincoUnicidadeOptions,
): Promise<AnimalBrincoRef | null> {
  const key = normalizeBrincoKey(brinco);
  if (!key) return null;

  const conditions = [
    eq(animais.userId, userId),
    eq(animais.status, "ativo"),
    sql`LOWER(TRIM(${animais.brinco})) = ${key}`,
  ];
  if (options?.excludeAnimalId != null) {
    conditions.push(ne(animais.id, options.excludeAnimalId));
  }

  if (options?.fazendaId != null) {
    const fazendaId = Number(options.fazendaId);
    const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);
    const loteIds = listLoteIdsPorFazendaFromContext(loteFazendaById, fazendaId);
    const farmScope =
      loteIds.length > 0
        ? or(eq(animais.fazendaId, fazendaId), inArray(animais.loteId, loteIds))
        : eq(animais.fazendaId, fazendaId);
    conditions.push(farmScope!);
  }

  const rows = await db
    .select({
      id: animais.id,
      brinco: animais.brinco,
      status: animais.status,
      fazendaId: animais.fazendaId,
      loteId: animais.loteId,
    })
    .from(animais)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function findActiveBrincoConflictLocal(
  userId: number,
  brinco: string | null | undefined,
  options?: BrincoUnicidadeOptions,
): Promise<AnimalBrincoRef | null> {
  const lista = await listLocalAnimais(userId);
  let loteFazendaById: Map<number, number | null> | undefined;
  if (options?.fazendaId != null) {
    try {
      const ctx = await loadLoteFazendaContextForUser(userId);
      loteFazendaById = ctx.loteFazendaById;
    } catch {
      loteFazendaById = undefined;
    }
  }
  return findActiveBrincoConflict(lista, brinco, {
    excludeAnimalId: options?.excludeAnimalId,
    effectiveStatus: "ativo",
    fazendaId: options?.fazendaId,
    loteFazendaById,
  });
}

function throwBrincoConflito(brinco: string, conflito: AnimalBrincoRef): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: buildBrincoAtivoConflitoMessage(brinco, conflito),
  });
}

export async function assertBrincoUnicoEntreAtivosDb(
  userId: number,
  brinco: string | null | undefined,
  effectiveStatus: string,
  excludeAnimalId?: number,
  fazendaId?: number,
): Promise<void> {
  if (resolveEffectiveStatus(effectiveStatus) !== "ativo") return;

  const brincoTrim = (brinco ?? "").trim();
  if (!brincoTrim) return;

  const conflito = await findActiveBrincoConflictInDb(userId, brincoTrim, {
    excludeAnimalId,
    fazendaId,
  });
  if (conflito) throwBrincoConflito(brincoTrim, conflito);
}

export async function assertBrincoUnicoEntreAtivosLocal(
  userId: number,
  brinco: string | null | undefined,
  effectiveStatus: string,
  excludeAnimalId?: number,
  fazendaId?: number,
): Promise<void> {
  if (resolveEffectiveStatus(effectiveStatus) !== "ativo") return;

  const brincoTrim = (brinco ?? "").trim();
  if (!brincoTrim) return;

  const conflito = await findActiveBrincoConflictLocal(userId, brincoTrim, {
    excludeAnimalId,
    fazendaId,
  });
  if (conflito) throwBrincoConflito(brincoTrim, conflito);
}

export async function assertBrincoUnicoEntreAtivos(
  userId: number,
  brinco: string | null | undefined,
  effectiveStatus: string,
  excludeAnimalId?: number,
  useLocal = false,
  fazendaId?: number,
): Promise<void> {
  if (useLocal) {
    await assertBrincoUnicoEntreAtivosLocal(
      userId,
      brinco,
      effectiveStatus,
      excludeAnimalId,
      fazendaId,
    );
    return;
  }
  await assertBrincoUnicoEntreAtivosDb(
    userId,
    brinco,
    effectiveStatus,
    excludeAnimalId,
    fazendaId,
  );
}

export async function loadActiveBrincoKeysFromDb(userId: number): Promise<Set<string>> {
  const rows = await db
    .select({ brinco: animais.brinco })
    .from(animais)
    .where(and(eq(animais.userId, userId), eq(animais.status, "ativo")));

  const keys = new Set<string>();
  for (const row of rows) {
    const key = normalizeBrincoKey(row.brinco);
    if (key) keys.add(key);
  }
  return keys;
}

export async function loadActiveBrincoKeysLocal(userId: number): Promise<Set<string>> {
  const lista = await listLocalAnimais(userId);
  const keys = new Set<string>();
  for (const animal of lista) {
    if (resolveEffectiveStatus(animal.status) !== "ativo") continue;
    const key = normalizeBrincoKey(animal.brinco);
    if (key) keys.add(key);
  }
  return keys;
}
