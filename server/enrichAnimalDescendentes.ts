import { and, eq, or } from "drizzle-orm";
import { animais } from "../drizzle/schema";
import {
  buildDescendentesList,
  type DescendenteRow,
} from "../shared/animalDescendentes";
import { db } from "./db";
import { listLocalAnimais } from "./localFallbackStore";

/** MySQL: uma query batch por maeId/paiId estruturados — usa índices animais_mae_id_idx / animais_pai_id_idx. */
export async function enrichAnimalDescendentesDb(
  userId: number,
  animalId: number,
): Promise<DescendenteRow[]> {
  if (animalId <= 0) return [];

  const rows = await db
    .select({
      id: animais.id,
      maeId: animais.maeId,
      paiId: animais.paiId,
      brinco: animais.brinco,
      sexo: animais.sexo,
      categoria: animais.categoria,
      dataNascimento: animais.dataNascimento,
      status: animais.status,
    })
    .from(animais)
    .where(
      and(
        eq(animais.userId, userId),
        or(eq(animais.maeId, animalId), eq(animais.paiId, animalId)),
      ),
    );

  return buildDescendentesList(animalId, rows);
}

/** Fallback local: filtra animais.json em memória — mesma semântica, sem N+1. */
export async function enrichAnimalDescendentesLocal(
  userId: number,
  animalId: number,
): Promise<DescendenteRow[]> {
  if (animalId <= 0) return [];
  const all = await listLocalAnimais(userId);
  return buildDescendentesList(animalId, all);
}
