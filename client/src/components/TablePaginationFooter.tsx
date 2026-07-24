import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [sizeOpen, setSizeOpen] = useState(false);
  const sizeRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const ignoreScrollCloseRef = useRef(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!sizeOpen || !sizeRef.current) {
      setMenuPos(null);
      return;
    }

    const estimatedMenuHeight = pageSizeOptions.length * 32 + 8;
    const gap = 4;
    const rect = sizeRef.current.getBoundingClientRect();
    const overflow = Math.ceil(rect.bottom + gap + estimatedMenuHeight + 8 - window.innerHeight);

    if (overflow > 0) {
      ignoreScrollCloseRef.current = true;
      const prevPad = Number.parseInt(document.body.style.paddingBottom || "0", 10) || 0;
      document.body.style.paddingBottom = `${prevPad + overflow}px`;
      window.scrollBy(0, overflow);
      requestAnimationFrame(() => {
        ignoreScrollCloseRef.current = false;
      });
    }

    const nextRect = sizeRef.current.getBoundingClientRect();
    setMenuPos({
      top: nextRect.bottom + gap,
      left: nextRect.left,
      minWidth: Math.max(nextRect.width, 148),
    });

    return () => {
      document.body.style.paddingBottom = "";
    };
  }, [sizeOpen, pageSizeOptions.length]);

  useEffect(() => {
    if (!sizeOpen) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sizeRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setSizeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSizeOpen(false);
    };
    const onScroll = () => {
      if (ignoreScrollCloseRef.current) return;
      setSizeOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [sizeOpen]);

  return (
    <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-[10px] text-gray-500">
      {onPageSizeChange ? (
        <div ref={sizeRef} className="relative">
          <button
            type="button"
            onClick={() => setSizeOpen(o => !o)}
            aria-expanded={sizeOpen}
            aria-haspopup="listbox"
            aria-label="Itens por página"
            className={`h-8 pl-2.5 pr-1 inline-flex items-center gap-1 rounded bg-white text-[10px] text-gray-600 hover:bg-gray-50 focus:outline-none transition-colors ${
              sizeOpen
                ? "border border-[#4ECDC4]"
                : "border border-gray-200 focus:border-[#4ECDC4]"
            }`}
          >
            <span>{pageSize} itens por página</span>
            <span className="material-icons text-[14px] text-gray-400">
              {sizeOpen ? "expand_less" : "expand_more"}
            </span>
          </button>
          {sizeOpen &&
            menuPos &&
            createPortal(
              <ul
                ref={menuRef}
                role="listbox"
                className="fixed z-[200] bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden py-1"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  minWidth: menuPos.minWidth,
                }}
              >
                {pageSizeOptions.map(size => {
                  const selected = size === pageSize;
                  return (
                    <li key={size} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={`w-full text-left px-3 py-2 text-[10px] whitespace-nowrap transition-colors ${
                          selected
                            ? "bg-[#4ECDC414] text-gray-900 font-semibold"
                            : "text-gray-600 hover:bg-gray-50"
                        }`}
                        onClick={() => {
                          onPageSizeChange(size as TablePageSize);
                          setSizeOpen(false);
                        }}
                      >
                        {size} itens por página
                      </button>
                    </li>
                  );
                })}
              </ul>,
              document.body,
            )}
        </div>
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
