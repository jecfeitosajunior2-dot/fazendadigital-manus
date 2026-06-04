import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  const progress = Math.min(pullDistance / threshold, 1);
  const isReady = pullDistance >= threshold;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 z-50",
        "bg-gradient-to-b from-blue-50 to-transparent border-b border-blue-100"
      )}
      style={{
        height: `${Math.max(40, pullDistance)}px`,
        opacity: pullDistance > 0 ? 1 : 0,
      }}
    >
      <div className="flex flex-col items-center gap-1">
        {isRefreshing ? (
          <>
            <div className="animate-spin">
              <span className="material-icons text-blue-600 text-[20px]">
                refresh
              </span>
            </div>
            <span className="text-[11px] font-semibold text-blue-600">
              Atualizando...
            </span>
          </>
        ) : (
          <>
            <div
              className="transition-transform duration-200"
              style={{
                transform: `rotate(${isReady ? 180 : 0}deg)`,
              }}
            >
              <span
                className={cn(
                  "material-icons text-[20px]",
                  isReady ? "text-blue-600" : "text-gray-400"
                )}
              >
                arrow_downward
              </span>
            </div>
            <span
              className={cn(
                "text-[11px] font-semibold transition-colors",
                isReady ? "text-blue-600" : "text-gray-500"
              )}
            >
              {isReady ? "Solte para atualizar" : "Puxe para atualizar"}
            </span>
          </>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200">
        <div
          className="h-full bg-blue-500 transition-all duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
