import { and, eq, inArray } from "drizzle-orm";
import { animais, partoCrias } from "../drizzle/schema";
import { db } from "./db";
import { listLocalAnimais, listLocalPartoCrias } from "./localFallbackStore";

export type ReproPartoCriaResumo = {
  animalId: number;
  brinco: string;
  ordem: number;
};

export type ReproRegistroComPartoCrias<T extends { id: number; tipo?: string | null }> = T & {
  crias?: ReproPartoCriaResumo[];
};

type PartoCriaVinculo = {
  partoRegistroId: number;
  criaAnimalId: number;
  ordem: number;
};

function isPartoTipo(tipo: string | null | undefined): boolean {
  return String(tipo ?? "").trim() === "Parto";
}

function brincoDisplay(animalId: number, brinco: string | null | undefined): string {
  const trimmed = brinco?.trim();
  return trimmed || `#${animalId}`;
}

/** Mescla vínculos parto_crias nos registros — função pura, testável sem I/O. */
export function attachPartoCriasToRegistros<T extends { id: number; tipo?: string | null }>(
  registros: T[],
  vinculos: PartoCriaVinculo[],
  brincoPorAnimalId: Map<number, string>,
): ReproRegistroComPartoCrias<T>[] {
  const partoIds = new Set(registros.filter(r => isPartoTipo(r.tipo)).map(r => r.id));
  if (partoIds.size === 0) return registros;

  const byParto = new Map<number, ReproPartoCriaResumo[]>();
  for (const v of vinculos) {
    if (!partoIds.has(v.partoRegistroId)) continue;
    const list = byParto.get(v.partoRegistroId) ?? [];
    list.push({
      animalId: v.criaAnimalId,
      brinco: brincoPorAnimalId.get(v.criaAnimalId) ?? brincoDisplay(v.criaAnimalId, null),
      ordem: v.ordem,
    });
    byParto.set(v.partoRegistroId, list);
  }

  return registros.map(r => {
    if (!isPartoTipo(r.tipo)) return r;
    const crias = byParto.get(r.id);
    if (!crias?.length) return r;
    crias.sort((a, b) => a.ordem - b.ordem);
    return { ...r, crias };
  });
}

/** MySQL: no máximo 2 queries extras (parto_crias + animais), independente do número de Partos. */
export async function enrichReproducaoListPartoCriasDb<T extends { id: number; tipo?: string | null }>(
  userId: number,
  registros: T[],
): Promise<ReproRegistroComPartoCrias<T>[]> {
  const partoIds = registros.filter(r => isPartoTipo(r.tipo)).map(r => r.id);
  if (partoIds.length === 0) return registros;

  const vinculos = await db
    .select({
      partoRegistroId: partoCrias.partoRegistroId,
      criaAnimalId: partoCrias.criaAnimalId,
      ordem: partoCrias.ordem,
    })
    .from(partoCrias)
    .where(and(eq(partoCrias.userId, userId), inArray(partoCrias.partoRegistroId, partoIds)));

  if (vinculos.length === 0) return registros;

  const animalIds = [...new Set(vinculos.map(v => v.criaAnimalId))];
  const animaisRows = await db
    .select({ id: animais.id, brinco: animais.brinco })
    .from(animais)
    .where(and(eq(animais.userId, userId), inArray(animais.id, animalIds)));

  const brincoPorAnimalId = new Map(
    animaisRows.map(a => [a.id, brincoDisplay(a.id, a.brinco)]),
  );

  return attachPartoCriasToRegistros(registros, vinculos, brincoPorAnimalId);
}

/** Fallback local: lê parto-crias.json e animais.json uma vez cada — sem N+1 por linha. */
export async function enrichReproducaoListPartoCriasLocal<T extends { id: number; tipo?: string | null }>(
  userId: number,
  registros: T[],
): Promise<ReproRegistroComPartoCrias<T>[]> {
  const partoIds = new Set(registros.filter(r => isPartoTipo(r.tipo)).map(r => r.id));
  if (partoIds.size === 0) return registros;

  const allVinculos = await listLocalPartoCrias(userId);
  const vinculos = allVinculos.filter(v => partoIds.has(v.partoRegistroId));
  if (vinculos.length === 0) return registros;

  const animalIds = new Set(vinculos.map(v => v.criaAnimalId));
  const allAnimais = await listLocalAnimais(userId);
  const brincoPorAnimalId = new Map<number, string>();
  for (const a of allAnimais) {
    if (animalIds.has(a.id)) {
      brincoPorAnimalId.set(a.id, brincoDisplay(a.id, a.brinco));
    }
  }

  return attachPartoCriasToRegistros(
    registros,
    vinculos.map(v => ({
      partoRegistroId: v.partoRegistroId,
      criaAnimalId: v.criaAnimalId,
      ordem: v.ordem,
    })),
    brincoPorAnimalId,
  );
}
