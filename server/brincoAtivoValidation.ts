import { TRPCError } from "@trpc/server";
import { and, eq, ne, sql } from "drizzle-orm";
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

export async function findActiveBrincoConflictInDb(
  userId: number,
  brinco: string | null | undefined,
  options?: { excludeAnimalId?: number },
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

  const rows = await db
    .select({ id: animais.id, brinco: animais.brinco, status: animais.status })
    .from(animais)
    .where(and(...conditions))
    .limit(1);

  return rows[0] ?? null;
}

export async function findActiveBrincoConflictLocal(
  userId: number,
  brinco: string | null | undefined,
  options?: { excludeAnimalId?: number },
): Promise<AnimalBrincoRef | null> {
  const lista = await listLocalAnimais(userId);
  return findActiveBrincoConflict(lista, brinco, {
    excludeAnimalId: options?.excludeAnimalId,
    effectiveStatus: "ativo",
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
): Promise<void> {
  if (resolveEffectiveStatus(effectiveStatus) !== "ativo") return;

  const brincoTrim = (brinco ?? "").trim();
  if (!brincoTrim) return;

  const conflito = await findActiveBrincoConflictInDb(userId, brincoTrim, { excludeAnimalId });
  if (conflito) throwBrincoConflito(brincoTrim, conflito);
}

export async function assertBrincoUnicoEntreAtivosLocal(
  userId: number,
  brinco: string | null | undefined,
  effectiveStatus: string,
  excludeAnimalId?: number,
): Promise<void> {
  if (resolveEffectiveStatus(effectiveStatus) !== "ativo") return;

  const brincoTrim = (brinco ?? "").trim();
  if (!brincoTrim) return;

  const conflito = await findActiveBrincoConflictLocal(userId, brincoTrim, { excludeAnimalId });
  if (conflito) throwBrincoConflito(brincoTrim, conflito);
}

export async function assertBrincoUnicoEntreAtivos(
  userId: number,
  brinco: string | null | undefined,
  effectiveStatus: string,
  excludeAnimalId?: number,
  useLocal = false,
): Promise<void> {
  if (useLocal) {
    await assertBrincoUnicoEntreAtivosLocal(userId, brinco, effectiveStatus, excludeAnimalId);
    return;
  }
  await assertBrincoUnicoEntreAtivosDb(userId, brinco, effectiveStatus, excludeAnimalId);
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
