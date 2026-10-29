import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { estoque, estoqueMovimentacoes } from "../drizzle/schema";
import {
  MSG_ESTOQUE_ESCRITA_NEGADA,
  podeEscreverProdutoEstoque,
  produtoEstoqueVisivel,
  setFazendasDoUsuario,
} from "../shared/estoqueIsolamento";
import { db } from "./db";
import { devLocalStore } from "./devLocalStore";
import { idsFazendasDoUsuarioParaEstoque } from "./estoqueIsolamentoLeitura";
import { isDatabaseUnavailable } from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";

export async function fazendasAutorizadasEstoque(userId: number) {
  const ids = await idsFazendasDoUsuarioParaEstoque(userId);
  return { ids, set: setFazendasDoUsuario(ids) };
}

export function recusarEscritaEstoque(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: MSG_ESTOQUE_ESCRITA_NEGADA });
}

export async function assertFazendasEstoqueDoUsuario(userId: number, fazendaIds: readonly number[]) {
  const unicos = [...new Set(fazendaIds.filter(id => Number.isFinite(id) && id > 0))];
  if (unicos.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos uma fazenda para usar este produto." });
  }
  for (const fazendaId of unicos) {
    await assertFazendaDoUsuario(userId, fazendaId);
  }
}

export async function carregarProdutoEstoquePorId(estoqueId: number) {
  try {
    const [row] = await db.select().from(estoque).where(eq(estoque.id, estoqueId));
    if (row) return row;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  return devLocalStore.getEstoque(estoqueId) ?? null;
}

export async function assertProdutoEstoqueDoUsuario(userId: number, estoqueId: number) {
  const { set } = await fazendasAutorizadasEstoque(userId);
  const row = await carregarProdutoEstoquePorId(estoqueId);
  if (!podeEscreverProdutoEstoque(row, set)) recusarEscritaEstoque();
  return row!;
}

export async function assertProdutosEstoqueDoUsuario(userId: number, estoqueIds: readonly number[]) {
  const { set } = await fazendasAutorizadasEstoque(userId);
  const unicos = [...new Set(estoqueIds)];
  const encontrados: Array<{ id: number; fazendaId?: number | null }> = [];
  for (const id of unicos) {
    const row = await carregarProdutoEstoquePorId(id);
    if (!row || !podeEscreverProdutoEstoque(row, set)) recusarEscritaEstoque();
    encontrados.push(row);
  }
  return encontrados;
}

export async function assertMovimentacaoEstoqueDoUsuario(userId: number, movimentacaoId: number) {
  const { set } = await fazendasAutorizadasEstoque(userId);
  try {
    const [mov] = await db.select().from(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.id, movimentacaoId));
    if (mov) {
      const produto = await carregarProdutoEstoquePorId(mov.estoqueId);
      if (!produtoEstoqueVisivel({ fazendaId: produto?.fazendaId ?? mov.fazendaId }, set)) recusarEscritaEstoque();
      return mov;
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const local = devLocalStore.getMovimentacao(movimentacaoId);
  if (!local || !produtoEstoqueVisivel({ fazendaId: local.produtoFazendaId ?? local.fazendaId }, set)) {
    recusarEscritaEstoque();
  }
  return local;
}
