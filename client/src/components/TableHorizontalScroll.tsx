import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface TableHorizontalScrollProps {
  children: ReactNode;
  /** Rodapé fixo (paginação) — não rola com a tabela */
  footer?: ReactNode;
  className?: string;
}

/**
 * Tabela com barra de rolagem horizontal acima do rodapé de paginação.
 */
export default function TableHorizontalScroll({
  children,
  footer,
  className,
}: TableHorizontalScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [metrics, setMetrics] = useState({ canScroll: false, thumbWidth: 0, thumbLeft: 0 });

  const updateMetrics = useCallback(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const { scrollWidth, clientWidth, scrollLeft } = el;
    const trackWidth = track.clientWidth;
    const canScroll = scrollWidth > clientWidth + 2;
    const thumbWidth = canScroll
      ? Math.min(Math.max((clientWidth / scrollWidth) * trackWidth, 40), trackWidth)
      : trackWidth;
    const maxThumbTravel = Math.max(trackWidth - thumbWidth, 0);
    const maxScroll = Math.max(scrollWidth - clientWidth, 0);
    const thumbLeft = canScroll && maxScroll > 0 ? (scrollLeft / maxScroll) * maxThumbTravel : 0;

    setMetrics({ canScroll, thumbWidth, thumbLeft });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    updateMetrics();
    el.addEventListener("scroll", updateMetrics, { passive: true });

    const ro = new ResizeObserver(updateMetrics);
    ro.observe(el);
    ro.observe(track);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    window.addEventListener("resize", updateMetrics);
    return () => {
      el.removeEventListener("scroll", updateMetrics);
      ro.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [updateMetrics, children]);

  const scrollFromClientX = (clientX: number) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track || !metrics.canScroll) return;

    const rect = track.getBoundingClientRect();
    const travel = rect.width - metrics.thumbWidth;
    if (travel <= 0) return;

    const ratio = (clientX - rect.left - metrics.thumbWidth / 2) / travel;
    const clamped = Math.min(1, Math.max(0, ratio));
    el.scrollLeft = clamped * (el.scrollWidth - el.clientWidth);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current || !scrollRef.current || !trackRef.current) return;
      const el = scrollRef.current;
      const track = trackRef.current;
      const travel = track.clientWidth - metrics.thumbWidth;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (travel <= 0 || maxScroll <= 0) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const scrollDelta = (deltaX / travel) * maxScroll;
      el.scrollLeft = dragRef.current.startScrollLeft + scrollDelta;
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [metrics.thumbWidth]);

  return (
    <div className={cn("fd-table-scroll-wrap max-w-full min-w-0", className)}>
      <div
        ref={scrollRef}
        className="fd-table-scroll-x fd-table-scroll-x--hide-native overflow-x-auto overflow-y-hidden"
      >
        <div className="inline-block w-max min-w-full">{children}</div>
      </div>

      <div className="px-4 pt-2 pb-1 border-t border-gray-100">
        <div
          ref={trackRef}
          className={cn(
            "fd-table-scroll-track",
            metrics.canScroll ? "cursor-pointer" : "cursor-default",
          )}
          onClick={e => scrollFromClientX(e.clientX)}
          role="scrollbar"
          aria-orientation="horizontal"
          aria-label="Rolagem horizontal da tabela"
          aria-hidden={!metrics.canScroll}
        >
          <div
            className={cn(
              "fd-table-scroll-thumb",
              !metrics.canScroll && "fd-table-scroll-thumb--idle w-full",
              metrics.canScroll && "cursor-grab active:cursor-grabbing",
            )}
            style={
              metrics.canScroll
                ? { width: metrics.thumbWidth, transform: `translateX(${metrics.thumbLeft}px)` }
                : undefined
            }
            onMouseDown={e => {
              if (!metrics.canScroll || !scrollRef.current) return;
              e.preventDefault();
              e.stopPropagation();
              dragRef.current = {
                startX: e.clientX,
                startScrollLeft: scrollRef.current.scrollLeft,
              };
            }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      </div>

      {footer}
    </div>
  );
}
