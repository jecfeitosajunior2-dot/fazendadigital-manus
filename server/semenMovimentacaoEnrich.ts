import { and, eq, inArray } from "drizzle-orm";
import { annotateSemenMovimentacoesHistorico, type SemenMovimentacaoHistoricoFlags } from "../shared/semenEstoqueLedger";
import {
  buildSemenMovimentacoesDisplay,
  buildSemenReproContextMapsFromRows,
  collectSemenMovimentacaoReproRegistroIds,
} from "../shared/semenMovimentacaoDisplay";
import { animais, db, reproducaoRegistros } from "./db";
import type { SemenMovimentacaoRow } from "./semenEstoqueDb";
import { listLocalAnimais, listLocalReproducaoRegistros } from "./localFallbackStore";

export type SemenMovimentacaoComDisplay = SemenMovimentacaoRow & {
  tipoLabel: string;
  quantidadeLabel: string;
  contextoDisplay: string | null;
} & SemenMovimentacaoHistoricoFlags;

function withHistoricoFlags(
  rows: Array<SemenMovimentacaoRow & { tipoLabel: string; quantidadeLabel: string; contextoDisplay: string | null }>,
): SemenMovimentacaoComDisplay[] {
  return annotateSemenMovimentacoesHistorico(rows);
}

export async function enrichSemenMovimentacoesDisplayDb(
  userId: number,
  movimentacoes: SemenMovimentacaoRow[],
): Promise<SemenMovimentacaoComDisplay[]> {
  const reproIds = collectSemenMovimentacaoReproRegistroIds(movimentacoes);
  if (!reproIds.length) {
    return withHistoricoFlags(buildSemenMovimentacoesDisplay(movimentacoes, new Map(), new Map()));
  }

  const registros = await db
    .select({
      id: reproducaoRegistros.id,
      femeaId: reproducaoRegistros.femeaId,
      observacoes: reproducaoRegistros.observacoes,
    })
    .from(reproducaoRegistros)
    .where(and(eq(reproducaoRegistros.userId, userId), inArray(reproducaoRegistros.id, reproIds)));

  const femeaIds = [...new Set(registros.map(r => r.femeaId))];
  const animaisRows =
    femeaIds.length > 0
      ? await db
          .select({ id: animais.id, brinco: animais.brinco })
          .from(animais)
          .where(and(eq(animais.userId, userId), inArray(animais.id, femeaIds)))
      : [];

  const { reproById, brincoByAnimalId } = buildSemenReproContextMapsFromRows({
    registros,
    animais: animaisRows,
  });

  return withHistoricoFlags(buildSemenMovimentacoesDisplay(movimentacoes, reproById, brincoByAnimalId));
}

export async function enrichSemenMovimentacoesDisplayLocal(
  userId: number,
  movimentacoes: SemenMovimentacaoRow[],
): Promise<SemenMovimentacaoComDisplay[]> {
  const reproIds = collectSemenMovimentacaoReproRegistroIds(movimentacoes);
  if (!reproIds.length) {
    return withHistoricoFlags(buildSemenMovimentacoesDisplay(movimentacoes, new Map(), new Map()));
  }

  const reproIdSet = new Set(reproIds);
  const registros = (await listLocalReproducaoRegistros(userId))
    .filter(r => reproIdSet.has(r.id))
    .map(r => ({
      id: r.id,
      femeaId: r.femeaId,
      observacoes: r.observacoes,
    }));

  const femeaIds = new Set(registros.map(r => r.femeaId));
  const animaisRows = (await listLocalAnimais(userId))
    .filter(a => femeaIds.has(a.id))
    .map(a => ({ id: a.id, brinco: a.brinco }));

  const { reproById, brincoByAnimalId } = buildSemenReproContextMapsFromRows({
    registros,
    animais: animaisRows,
  });

  return withHistoricoFlags(buildSemenMovimentacoesDisplay(movimentacoes, reproById, brincoByAnimalId));
}
