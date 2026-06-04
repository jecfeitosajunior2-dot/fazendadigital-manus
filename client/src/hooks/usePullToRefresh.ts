import { useEffect, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  enabled?: boolean;
}

interface PullToRefreshState {
  isRefreshing: boolean;
  pullDistance: number;
  showIndicator: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions) {
  const [state, setState] = useState<PullToRefreshState>({
    isRefreshing: false,
    pullDistance: 0,
    showIndicator: false,
  });

  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    let isAtTop = false;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      isAtTop = container.scrollTop === 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTop || state.isRefreshing) return;

      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - touchStartY.current);

      setState(prev => ({
        ...prev,
        pullDistance: distance,
        showIndicator: distance > 0,
      }));
    };

    const handleTouchEnd = async () => {
      if (state.pullDistance >= threshold && !state.isRefreshing) {
        setState(prev => ({ ...prev, isRefreshing: true }));
        try {
          await onRefresh();
        } finally {
          setState({
            isRefreshing: false,
            pullDistance: 0,
            showIndicator: false,
          });
        }
      } else {
        setState(prev => ({
          ...prev,
          pullDistance: 0,
          showIndicator: false,
        }));
      }
    };

    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchmove", handleTouchMove, { passive: true });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [enabled, state.isRefreshing, state.pullDistance, threshold, onRefresh]);

  return {
    containerRef,
    state,
  };
}
