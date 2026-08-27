/** Padrão da Lista de Fazendas / listas administrativas. */
export const SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT = 10;

export function paginateSemenEstoqueList<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): {
  pageItems: T[];
  pageSafe: number;
  totalPages: number;
  totalItems: number;
} {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1);
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const start = (pageSafe - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    pageSafe,
    totalPages,
    totalItems,
  };
}

export function semenEstoqueEmptyMessage(opts: {
  hasFazenda: boolean;
  loading: boolean;
  totalItems: number;
  hasActiveFilters: boolean;
}): string {
  if (!opts.hasFazenda) return "Selecione uma fazenda para ver o estoque.";
  if (opts.loading) return "Carregando...";
  if (opts.totalItems > 0) return "";
  if (opts.hasActiveFilters) return "Nenhuma partida encontrada.";
  return "Nenhuma partida de sêmen cadastrada.";
}
