import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { pastos } from "../drizzle/schema";
import {
  extrairCoordenadasKml,
  mapaCoordenadasPorNome,
  normalizarNomeSubdivisao,
} from "../shared/parseKmlCoordenadas";
import { db } from "./db";
import { listLocalPastosByFazenda, updateLocalPasto } from "./localFallbackStore";

export type ImportarCoordenadasInput = {
  fazendaId: number;
  kmlContent: string;
};

export type ImportarCoordenadasResult = {
  importados: number;
  ignorados: string[];
  totalNoArquivo: number;
};

function buildCoordenadasPayload(coordinates: string) {
  return JSON.stringify({
    coordinates,
    importadoEm: new Date().toISOString(),
  });
}

async function aplicarCoordenadasDb(userId: number, pastoId: number, coordinates: string) {
  await db.update(pastos).set({ coordenadas: buildCoordenadasPayload(coordinates) }).where(
    and(eq(pastos.id, pastoId), eq(pastos.userId, userId)),
  );
}

export async function importarCoordenadasPastos(
  userId: number,
  input: ImportarCoordenadasInput,
): Promise<ImportarCoordenadasResult> {
  const placemarks = extrairCoordenadasKml(input.kmlContent);
  if (placemarks.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nenhuma coordenada encontrada no arquivo KML/KMZ",
    });
  }

  const coordenadasPorNome = mapaCoordenadasPorNome(placemarks);

  const subdivisoes = await db.select().from(pastos).where(
    and(eq(pastos.fazendaId, input.fazendaId), eq(pastos.userId, userId)),
  );

  if (subdivisoes.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cadastre subdivisões antes de importar coordenadas",
    });
  }

  const lookup = new Map<string, number>();
  for (const s of subdivisoes) {
    lookup.set(normalizarNomeSubdivisao(s.nome), s.id);
    if (s.sigla?.trim()) {
      lookup.set(normalizarNomeSubdivisao(s.sigla), s.id);
    }
  }

  const atualizados = new Set<number>();
  const ignorados: string[] = [];

  for (const [nomeNorm, coordinates] of coordenadasPorNome) {
    const pastoId = lookup.get(nomeNorm);
    if (!pastoId) {
      const original = placemarks.find(p => normalizarNomeSubdivisao(p.nome) === nomeNorm);
      ignorados.push(original?.nome ?? nomeNorm);
      continue;
    }

    await aplicarCoordenadasDb(userId, pastoId, coordinates);
    try {
      await updateLocalPasto(userId, pastoId, { coordenadas: buildCoordenadasPayload(coordinates) });
    } catch {
      /* espelho local opcional */
    }
    atualizados.add(pastoId);
  }

  return {
    importados: atualizados.size,
    ignorados: [...new Set(ignorados)],
    totalNoArquivo: coordenadasPorNome.size,
  };
}

export async function importarCoordenadasPastosLocal(
  userId: number,
  input: ImportarCoordenadasInput,
): Promise<ImportarCoordenadasResult> {
  const placemarks = extrairCoordenadasKml(input.kmlContent);
  if (placemarks.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Nenhuma coordenada encontrada no arquivo KML/KMZ",
    });
  }

  const coordenadasPorNome = mapaCoordenadasPorNome(placemarks);
  const subdivisoes = await listLocalPastosByFazenda(userId, input.fazendaId);

  if (subdivisoes.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cadastre subdivisões antes de importar coordenadas",
    });
  }

  const lookup = new Map<string, number>();
  for (const s of subdivisoes) {
    lookup.set(normalizarNomeSubdivisao(s.nome), s.id);
    if (s.sigla?.trim()) {
      lookup.set(normalizarNomeSubdivisao(s.sigla), s.id);
    }
  }

  const atualizados = new Set<number>();
  const ignorados: string[] = [];

  for (const [nomeNorm, coordinates] of coordenadasPorNome) {
    const pastoId = lookup.get(nomeNorm);
    if (!pastoId) {
      const original = placemarks.find(p => normalizarNomeSubdivisao(p.nome) === nomeNorm);
      ignorados.push(original?.nome ?? nomeNorm);
      continue;
    }

    await updateLocalPasto(userId, pastoId, { coordenadas: buildCoordenadasPayload(coordinates) });
    atualizados.add(pastoId);
  }

  return {
    importados: atualizados.size,
    ignorados: [...new Set(ignorados)],
    totalNoArquivo: coordenadasPorNome.size,
  };
}
