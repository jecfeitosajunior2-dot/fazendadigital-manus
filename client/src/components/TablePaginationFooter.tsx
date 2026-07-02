export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];

interface TablePaginationFooterProps {
  pageSize: number;
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: TablePageSize) => void;
  /** Rótulo do item no contador (ex.: "animais", "itens") */
  itemLabel?: string;
  pageSizeOptions?: readonly number[];
}

export default function TablePaginationFooter({
  pageSize,
  page,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel = "itens",
  pageSizeOptions = TABLE_PAGE_SIZE_OPTIONS,
}: TablePaginationFooterProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[10px] text-gray-500">
      {onPageSizeChange ? (
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value) as TablePageSize)}
          className="h-8 px-2 border border-gray-200 rounded bg-white text-[10px] text-gray-600 focus:outline-none focus:border-[#4ECDC4]"
          aria-label="Itens por página"
        >
          {pageSizeOptions.map(size => (
            <option key={size} value={size}>
              {size} itens por página
            </option>
          ))}
        </select>
      ) : (
        <span className="whitespace-nowrap">{pageSize} itens por página</span>
      )}

      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap">
          Mostrando {start}-{end} de {totalItems} {itemLabel}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100"
            aria-label="Página anterior"
          >
            <span className="material-icons text-[16px]">chevron_left</span>
          </button>
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded font-medium text-white bg-[#4ECDC4] tabular-nums">{page}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100"
            aria-label="Próxima página"
          >
            <span className="material-icons text-[16px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  );
}
