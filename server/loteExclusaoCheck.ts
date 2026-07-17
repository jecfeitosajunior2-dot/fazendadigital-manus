import { db } from "./db";
import {
  animais,
  fazendas,
  lotes,
} from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  type AvaliacaoExclusaoLote,
  mensagemExclusaoLoteBloqueada,
} from "../shared/loteExclusaoBloqueada";
import {
  avaliarExclusaoLocalLote,
  excluirLocalLote,
  inativarLocalLote,
  isDatabaseUnavailable,
} from "./localFallbackStore";

export async function avaliarExclusaoLoteDb(
  userId: number,
  loteId: number,
): Promise<AvaliacaoExclusaoLote> {
  const [lote] = await db
    .select({
      id: lotes.id,
      nome: lotes.nome,
      fazendaId: lotes.fazendaId,
    })
    .from(lotes)
    .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
    .limit(1);

  if (!lote) {
    throw new Error("Lote não encontrado.");
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(animais)
    .where(and(eq(animais.loteId, loteId), eq(animais.userId, userId)));

  const qtdAnimais = Number(countRow?.count ?? 0);

  let fazendaNome: string | null = null;
  if (lote.fazendaId) {
    const [fazenda] = await db
      .select({ nome: fazendas.nome })
      .from(fazendas)
      .where(and(eq(fazendas.id, lote.fazendaId), eq(fazendas.userId, userId)))
      .limit(1);
    fazendaNome = fazenda?.nome ?? null;
  }

  if (qtdAnimais > 0) {
    return {
      situacao: "bloqueado_animais",
      loteId: lote.id,
      nomeLote: lote.nome,
      fazendaId: lote.fazendaId ?? null,
      fazendaNome,
      qtdAnimais,
    };
  }

  return {
    situacao: "pode_excluir",
    loteId: lote.id,
    nomeLote: lote.nome,
    fazendaId: lote.fazendaId ?? null,
    fazendaNome,
    qtdAnimais: 0,
  };
}

export async function avaliarExclusaoLote(
  userId: number,
  loteId: number,
): Promise<AvaliacaoExclusaoLote> {
  try {
    return await avaliarExclusaoLoteDb(userId, loteId);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return avaliarExclusaoLocalLote(userId, loteId);
  }
}

export async function executarExclusaoLote(
  userId: number,
  loteId: number,
): Promise<{ nomeLote: string }> {
  const avaliacao = await avaliarExclusaoLote(userId, loteId);

  if (avaliacao.situacao === "bloqueado_animais") {
    throw new Error(mensagemExclusaoLoteBloqueada(avaliacao.nomeLote, avaliacao.qtdAnimais));
  }

  try {
    await db.delete(lotes).where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)));
    return { nomeLote: avaliacao.nomeLote };
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const result = await excluirLocalLote(userId, loteId);
    return { nomeLote: result.nomeLote };
  }
}

export async function executarInativacaoLote(
  userId: number,
  loteId: number,
): Promise<{ nomeLote: string }> {
  const avaliacao = await avaliarExclusaoLote(userId, loteId);

  if (avaliacao.situacao === "bloqueado_animais") {
    throw new Error(mensagemExclusaoLoteBloqueada(avaliacao.nomeLote, avaliacao.qtdAnimais));
  }

  try {
    const [existing] = await db
      .select({ id: lotes.id, nome: lotes.nome, ativo: lotes.ativo })
      .from(lotes)
      .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
      .limit(1);

    if (!existing) throw new Error("Lote não encontrado.");
    if (existing.ativo === false) {
      return { nomeLote: existing.nome };
    }

    await db.update(lotes)
      .set({ ativo: false })
      .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)));

    return { nomeLote: existing.nome };
  } catch (error) {
    if (error instanceof Error && error.message === "Lote não encontrado.") throw error;
    if (!isDatabaseUnavailable(error)) throw error;
    const result = await inativarLocalLote(userId, loteId);
    return { nomeLote: result.nomeLote };
  }
}
