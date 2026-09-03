import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  animalBaixas,
  animalLoteMovimentacoes,
  animais,
  historicoBrincos,
  partoCrias,
  pesagens,
  reproducaoRegistros,
  saudeRegistros,
  semenPartidas,
  vendaItens,
} from "../drizzle/schema";
import {
  animalStatusNaoAtivo,
  collectBlockedAnimalIds,
  isAnimalExclusaoBloqueada,
  MSG_ANIMAL_EXCLUSAO_BLOQUEADA,
} from "../shared/animalExclusao";
import { db } from "./db";
import {
  collectLocalAnimalIdsComHistorico,
  getLocalAnimal,
  isDatabaseUnavailable,
} from "./localFallbackStore";

export async function collectAnimalIdsComHistoricoDb(
  userId: number,
  animalIds: number[],
): Promise<Set<number>> {
  if (animalIds.length === 0) return new Set();

  const [
    pesagemRows,
    saudeRows,
    reproRows,
    baixaRows,
    movRows,
    brincoRows,
    vendaRows,
    filhosRows,
    criaRows,
    semenRows,
  ] = await Promise.all([
    db
      .select({ animalId: pesagens.animalId })
      .from(pesagens)
      .where(and(eq(pesagens.userId, userId), inArray(pesagens.animalId, animalIds))),
    db
      .select({ animalId: saudeRegistros.animalId })
      .from(saudeRegistros)
      .where(and(eq(saudeRegistros.userId, userId), inArray(saudeRegistros.animalId, animalIds))),
    db
      .select({ femeaId: reproducaoRegistros.femeaId, machoId: reproducaoRegistros.machoId })
      .from(reproducaoRegistros)
      .where(
        and(
          eq(reproducaoRegistros.userId, userId),
          or(
            inArray(reproducaoRegistros.femeaId, animalIds),
            inArray(reproducaoRegistros.machoId, animalIds),
          ),
        ),
      ),
    db
      .select({ animalId: animalBaixas.animalId })
      .from(animalBaixas)
      .where(and(eq(animalBaixas.userId, userId), inArray(animalBaixas.animalId, animalIds))),
    db
      .select({ animalId: animalLoteMovimentacoes.animalId })
      .from(animalLoteMovimentacoes)
      .where(
        and(
          eq(animalLoteMovimentacoes.userId, userId),
          inArray(animalLoteMovimentacoes.animalId, animalIds),
        ),
      ),
    db
      .select({ animalId: historicoBrincos.animalId })
      .from(historicoBrincos)
      .where(and(eq(historicoBrincos.userId, userId), inArray(historicoBrincos.animalId, animalIds))),
    db
      .select({ animalId: vendaItens.animalId })
      .from(vendaItens)
      .where(and(eq(vendaItens.userId, userId), inArray(vendaItens.animalId, animalIds))),
    db
      .select({ maeId: animais.maeId, paiId: animais.paiId })
      .from(animais)
      .where(
        and(
          eq(animais.userId, userId),
          or(inArray(animais.maeId, animalIds), inArray(animais.paiId, animalIds)),
        ),
      ),
    db
      .select({ criaAnimalId: partoCrias.criaAnimalId })
      .from(partoCrias)
      .where(and(eq(partoCrias.userId, userId), inArray(partoCrias.criaAnimalId, animalIds))),
    db
      .select({ machoId: semenPartidas.machoId })
      .from(semenPartidas)
      .where(and(eq(semenPartidas.userId, userId), inArray(semenPartidas.machoId, animalIds))),
  ]);

  return collectBlockedAnimalIds(animalIds, {
    pesagemIds: pesagemRows.map(r => r.animalId),
    saudeIds: saudeRows.map(r => r.animalId),
    reproducaoFemeaIds: reproRows.map(r => r.femeaId),
    reproducaoMachoIds: reproRows.map(r => r.machoId),
    baixaIds: baixaRows.map(r => r.animalId),
    movimentacaoLoteIds: movRows.map(r => r.animalId),
    historicoBrincoIds: brincoRows.map(r => r.animalId),
    vendaIds: vendaRows.map(r => r.animalId),
    maeDeIds: filhosRows.map(r => r.maeId),
    paiDeIds: filhosRows.map(r => r.paiId),
    partoCriaIds: criaRows.map(r => r.criaAnimalId),
    semenMachoIds: semenRows.map(r => r.machoId),
  });
}

function throwSeBloqueado(status: string | null | undefined, temHistorico: boolean): void {
  if (
    isAnimalExclusaoBloqueada({
      statusNaoAtivo: animalStatusNaoAtivo(status),
      temHistoricoOperacional: temHistorico,
    })
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: MSG_ANIMAL_EXCLUSAO_BLOQUEADA,
    });
  }
}

export async function assertAnimalPodeExcluirDb(userId: number, animalId: number): Promise<void> {
  const [animal] = await db
    .select({ id: animais.id, status: animais.status })
    .from(animais)
    .where(and(eq(animais.id, animalId), eq(animais.userId, userId)))
    .limit(1);

  if (!animal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Animal não encontrado." });
  }

  const blocked = await collectAnimalIdsComHistoricoDb(userId, [animalId]);
  throwSeBloqueado(animal.status, blocked.has(animalId));
}

export async function assertAnimalPodeExcluirLocal(userId: number, animalId: number): Promise<void> {
  const animal = await getLocalAnimal(userId, animalId);
  if (!animal) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Animal não encontrado." });
  }

  const blocked = await collectLocalAnimalIdsComHistorico(userId, [animalId]);
  throwSeBloqueado(animal.status, blocked.has(animalId));
}

export async function assertAnimalPodeExcluir(userId: number, animalId: number): Promise<void> {
  try {
    await assertAnimalPodeExcluirDb(userId, animalId);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (!isDatabaseUnavailable(error)) throw error;
    await assertAnimalPodeExcluirLocal(userId, animalId);
  }
}
