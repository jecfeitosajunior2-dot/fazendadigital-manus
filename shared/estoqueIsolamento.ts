/**
 * Isolamento de leitura do estoque.
 * A tabela `estoque` não tem userId: o dono é a fazenda (fazendas.userId).
 * Produto ou movimento sem fazenda válida não é de ninguém e não aparece para outros usuários.
 */

export function fazendaIdAutorizada(
  fazendaId: number | null | undefined,
  fazendasDoUsuario: ReadonlySet<number>,
): boolean {
  return typeof fazendaId === "number" && Number.isFinite(fazendaId) && fazendaId > 0 && fazendasDoUsuario.has(fazendaId);
}

export function produtoEstoqueVisivel(
  produto: { fazendaId?: number | null },
  fazendasDoUsuario: ReadonlySet<number>,
): boolean {
  return fazendaIdAutorizada(produto.fazendaId, fazendasDoUsuario);
}

export function movimentacaoEstoqueVisivel(
  mov: { fazendaId?: number | null; produtoFazendaId?: number | null },
  fazendasDoUsuario: ReadonlySet<number>,
): boolean {
  if (!fazendaIdAutorizada(mov.produtoFazendaId ?? null, fazendasDoUsuario)) return false;
  if (mov.fazendaId == null) return true;
  return fazendaIdAutorizada(mov.fazendaId, fazendasDoUsuario);
}

export function setFazendasDoUsuario(fazendaIds: readonly number[]): Set<number> {
  return new Set(fazendaIds.filter(id => Number.isFinite(id) && id > 0));
}

export function filtrarProdutosEstoque<T extends { fazendaId?: number | null }>(
  rows: readonly T[],
  fazendaIds: readonly number[],
): T[] {
  const autorizadas = setFazendasDoUsuario(fazendaIds);
  return rows.filter(row => produtoEstoqueVisivel(row, autorizadas));
}

export function filtrarMovimentacoesEstoque<T extends { fazendaId?: number | null; produtoFazendaId?: number | null }>(
  rows: readonly T[],
  fazendaIds: readonly number[],
): T[] {
  const autorizadas = setFazendasDoUsuario(fazendaIds);
  return rows.filter(row => movimentacaoEstoqueVisivel(row, autorizadas));
}

export const MSG_ESTOQUE_ESCRITA_NEGADA = "Você não tem acesso a este produto de estoque.";

export function podeEscreverProdutoEstoque(
  produto: { fazendaId?: number | null } | null | undefined,
  fazendasDoUsuario: ReadonlySet<number>,
): boolean {
  return !!produto && produtoEstoqueVisivel(produto, fazendasDoUsuario);
}

export function produtoEstoqueNaFazenda(
  produto: { fazendaId?: number | null } | null | undefined,
  fazendaId: number,
): boolean {
  return !!produto && Number(produto.fazendaId) === Number(fazendaId) && fazendaId > 0;
}

export function idsEstoqueNaoAutorizados<T extends { id: number; fazendaId?: number | null }>(
  rows: readonly T[],
  fazendasDoUsuario: ReadonlySet<number>,
): number[] {
  return rows.filter(row => !podeEscreverProdutoEstoque(row, fazendasDoUsuario)).map(row => row.id);
}
