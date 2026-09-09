import { cn } from "@/lib/utils";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface TableHorizontalScrollProps {
  children: ReactNode;
  /** Rodapé fixo (paginação) — não rola com a tabela */
  footer?: ReactNode;
  className?: string;
  /**
   * Quando true, o conteúdo ocupa 100% da largura disponível (sem forçar w-max).
   * Use em tabelas que devem caber no desktop sem rolagem lateral.
   */
  fitWidth?: boolean;
  /** Largura mínima esperada do conteúdo — garante a barra quando a tela é mais estreita. */
  minScrollWidth?: number;
  /** Preenche a altura disponível; corpo da tabela rola verticalmente e o rodapé fica fixo embaixo. */
  fillHeight?: boolean;
}

/**
 * Tabela com barra de rolagem horizontal sincronizada no rodapé (acima da paginação).
 * Usa um trilho dedicado — não depende da barra nativa do navegador.
 */
export default function TableHorizontalScroll({
  children,
  footer,
  className,
  fitWidth = false,
  minScrollWidth,
  fillHeight = false,
}: TableHorizontalScrollProps) {
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);

  const measure = useCallback(() => {
    const tableWrap = tableScrollRef.current;
    if (!tableWrap) return;

    const content =
      (tableWrap.querySelector("table") as HTMLElement | null) ??
      (tableWrap.firstElementChild as HTMLElement | null);
    const nextContentWidth = content
      ? Math.max(content.scrollWidth, content.offsetWidth, content.getBoundingClientRect().width)
      : tableWrap.scrollWidth;
    const nextViewportWidth = tableWrap.clientWidth;

    setContentWidth(prev => (prev === nextContentWidth ? prev : nextContentWidth));
    setViewportWidth(prev => (prev === nextViewportWidth ? prev : nextViewportWidth));
  }, []);

  const syncFromTable = useCallback(() => {
    const tableWrap = tableScrollRef.current;
    const footerWrap = footerScrollRef.current;
    if (!tableWrap || !footerWrap || syncingRef.current) return;
    syncingRef.current = true;
    footerWrap.scrollLeft = tableWrap.scrollLeft;
    syncingRef.current = false;
  }, []);

  const syncFromFooter = useCallback(() => {
    const tableWrap = tableScrollRef.current;
    const footerWrap = footerScrollRef.current;
    if (!tableWrap || !footerWrap || syncingRef.current) return;
    syncingRef.current = true;
    tableWrap.scrollLeft = footerWrap.scrollLeft;
    syncingRef.current = false;
  }, []);

  useLayoutEffect(() => {
    const tableWrap = tableScrollRef.current;
    if (!tableWrap) return;
    tableWrap.scrollLeft = 0;
    if (footerScrollRef.current) footerScrollRef.current.scrollLeft = 0;
    measure();
    const raf = requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [measure, children, fitWidth, fillHeight]);

  useEffect(() => {
    const tableWrap = tableScrollRef.current;
    if (!tableWrap) return;

    measure();
    tableWrap.addEventListener("scroll", syncFromTable, { passive: true });

    const ro = new ResizeObserver(measure);
    ro.observe(tableWrap);
    const inner = tableWrap.querySelector("table") ?? tableWrap.firstElementChild;
    if (inner) ro.observe(inner);

    window.addEventListener("resize", measure);
    return () => {
      tableWrap.removeEventListener("scroll", syncFromTable);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, syncFromTable, children, fitWidth, fillHeight]);

  const effectiveContentWidth = Math.max(contentWidth, minScrollWidth ?? 0);
  const canScroll = effectiveContentWidth > viewportWidth + 1;

  return (
    <div
      className={cn(
        "fd-table-scroll-wrap flex w-full min-w-0 max-w-full flex-col",
        fillHeight && "min-h-0 flex-1",
        className,
      )}
    >
      <div
        id="fd-table-scroll-content"
        ref={tableScrollRef}
        className={cn(
          "fd-table-scroll-x fd-table-scroll-x--hide-native w-full min-w-0 max-w-full overflow-x-auto",
          fillHeight ? "min-h-0 flex-1 overflow-y-auto" : "overflow-y-hidden",
        )}
      >
        <div
          className={cn(fitWidth ? "block w-full min-w-0" : "inline-block w-max max-w-none")}
          style={
            !fitWidth && minScrollWidth
              ? { minWidth: minScrollWidth }
              : undefined
          }
        >
          {children}
        </div>
      </div>

      {canScroll ? (
        <div
          ref={footerScrollRef}
          className="fd-table-scroll-footer w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden border-t border-gray-200 bg-gray-50 shrink-0"
          onScroll={syncFromFooter}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Rolagem horizontal da tabela"
          aria-controls="fd-table-scroll-content"
        >
          <div
            className="h-3"
            style={{ width: Math.max(effectiveContentWidth, viewportWidth + 2) }}
            aria-hidden
          />
        </div>
      ) : null}

      {footer
        ? fillHeight
          ? <div className="shrink-0 mt-auto bg-white">{footer}</div>
          : footer
        : null}
    </div>
  );
}
