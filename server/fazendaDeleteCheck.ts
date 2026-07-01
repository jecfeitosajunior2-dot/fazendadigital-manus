import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  animais, benfeitorias, estoque, fazendas, lotes, maquinas, pastos,
} from "../drizzle/schema";
import {
  type FazendaDeleteBlocker,
  type FazendaDeleteBlockerKey,
  FAZENDA_DELETE_BLOCKER_LABELS,
  formatFazendaDeleteBlockersMessage,
} from "../shared/fazendaDeleteBlockers";
import {
  listLocalBenfeitorias,
  listLocalPastosByFazenda,
} from "./localFallbackStore";

function blocker(key: FazendaDeleteBlockerKey, qtd: number): FazendaDeleteBlocker | null {
  if (qtd <= 0) return null;
  return { key, label: FAZENDA_DELETE_BLOCKER_LABELS[key], qtd };
}

export async function countFazendaDeleteBlockersFromDb(
  userId: number,
  fazendaId: number,
): Promise<FazendaDeleteBlocker[]> {
  const loteRows = await db
    .select({ id: lotes.id })
    .from(lotes)
    .where(and(eq(lotes.userId, userId), eq(lotes.fazendaId, fazendaId)));
  const loteIds = loteRows.map(row => row.id);

  const animaisWhere = and(
    eq(animais.userId, userId),
    loteIds.length > 0
      ? or(eq(animais.fazendaId, fazendaId), inArray(animais.loteId, loteIds))
      : eq(animais.fazendaId, fazendaId),
  );

  const [
    [pastosRow],
    [animaisRow],
    [lotesRow],
    [maquinasRow],
    [benfeitoriasRow],
    [estoqueRow],
  ] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(pastos)
      .where(and(eq(pastos.userId, userId), eq(pastos.fazendaId, fazendaId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(animais).where(animaisWhere),
    db.select({ count: sql<number>`COUNT(*)` }).from(lotes)
      .where(and(eq(lotes.userId, userId), eq(lotes.fazendaId, fazendaId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(maquinas)
      .where(and(eq(maquinas.userId, userId), eq(maquinas.fazendaId, fazendaId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(benfeitorias)
      .where(and(eq(benfeitorias.userId, userId), eq(benfeitorias.fazendaId, fazendaId))),
    db.select({ count: sql<number>`COUNT(*)` }).from(estoque)
      .where(eq(estoque.fazendaId, fazendaId)),
  ]);

  return [
    blocker("subdivisoes", Number(pastosRow?.count ?? 0)),
    blocker("animais", Number(animaisRow?.count ?? 0)),
    blocker("lotes", Number(lotesRow?.count ?? 0)),
    blocker("maquinas", Number(maquinasRow?.count ?? 0)),
    blocker("benfeitorias", Number(benfeitoriasRow?.count ?? 0)),
    blocker("estoque", Number(estoqueRow?.count ?? 0)),
  ].filter((item): item is FazendaDeleteBlocker => item !== null);
}

export async function countFazendaDeleteBlockersLocal(
  userId: number,
  fazendaId: number,
): Promise<FazendaDeleteBlocker[]> {
  const pastos = await listLocalPastosByFazenda(userId, fazendaId);
  const benfeitoriasList = (await listLocalBenfeitorias(userId))
    .filter(row => row.fazendaId === fazendaId);

  return [
    blocker("subdivisoes", pastos.length),
    blocker("benfeitorias", benfeitoriasList.length),
  ].filter((item): item is FazendaDeleteBlocker => item !== null);
}

export async function getFazendaDeleteCheck(
  userId: number,
  fazendaId: number,
  localOnly = false,
): Promise<{ nome: string; blockers: FazendaDeleteBlocker[]; canDelete: boolean }> {
  if (!localOnly) {
    const [fazenda] = await db
      .select({ nome: fazendas.nome })
      .from(fazendas)
      .where(and(eq(fazendas.id, fazendaId), eq(fazendas.userId, userId)))
      .limit(1);

    if (fazenda) {
      const blockers = await countFazendaDeleteBlockersFromDb(userId, fazendaId);
      return {
        nome: fazenda.nome,
        blockers,
        canDelete: blockers.length === 0,
      };
    }
  }

  const { getLocalFazenda } = await import("./localFallbackStore");
  const local = await getLocalFazenda(userId, fazendaId);
  if (!local) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fazenda não encontrada." });
  }

  const blockers = await countFazendaDeleteBlockersLocal(userId, fazendaId);
  return {
    nome: String(local.nome ?? "Fazenda"),
    blockers,
    canDelete: blockers.length === 0,
  };
}

export async function assertFazendaCanDelete(userId: number, fazendaId: number, localOnly = false): Promise<void> {
  const check = await getFazendaDeleteCheck(userId, fazendaId, localOnly);
  if (!check.canDelete) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: formatFazendaDeleteBlockersMessage(check.nome, check.blockers),
    });
  }
}
