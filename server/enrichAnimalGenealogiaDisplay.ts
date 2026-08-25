import { and, eq, inArray } from "drizzle-orm";
import { animais } from "../drizzle/schema";
import {
  collectGenealogiaParentIds,
  resolveGenealogiaDisplay,
  type GenealogiaDisplay,
  type GenealogiaSource,
} from "../shared/genealogiaDisplay";
import { db } from "./db";
import { listLocalAnimais } from "./localFallbackStore";

/** MySQL: uma query batch para mãe/pai (0–2 IDs), sem filtro de status. */
export async function enrichAnimalGenealogiaDisplayDb(
  userId: number,
  animal: GenealogiaSource,
): Promise<GenealogiaDisplay> {
  const ids = collectGenealogiaParentIds(animal);
  if (ids.length === 0) {
    return resolveGenealogiaDisplay(animal, new Map());
  }

  const rows = await db
    .select({ id: animais.id, brinco: animais.brinco, nome: animais.nome })
    .from(animais)
    .where(and(eq(animais.userId, userId), inArray(animais.id, ids)));

  const parentById = new Map(rows.map(r => [r.id, r]));
  return resolveGenealogiaDisplay(animal, parentById);
}

/** Fallback local: lê animais.json uma vez e resolve em memória. */
export async function enrichAnimalGenealogiaDisplayLocal(
  userId: number,
  animal: GenealogiaSource,
): Promise<GenealogiaDisplay> {
  const ids = collectGenealogiaParentIds(animal);
  if (ids.length === 0) {
    return resolveGenealogiaDisplay(animal, new Map());
  }

  const wanted = new Set(ids);
  const all = await listLocalAnimais(userId);
  const parentById = new Map(
    all
      .filter(a => wanted.has(a.id))
      .map(a => [a.id, { id: a.id, brinco: a.brinco, nome: a.nome }]),
  );
  return resolveGenealogiaDisplay(animal, parentById);
}
