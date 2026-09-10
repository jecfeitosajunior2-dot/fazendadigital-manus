import { SEMEN_ESTOQUE_PATH, SEMEN_UTILIZADO_PATH } from "@/lib/semenRoutes";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export type SemenReproducaoTabId = "utilizado" | "estoque";

type SemenReproducaoTabsProps = {
  active: SemenReproducaoTabId;
};

const TABS: { id: SemenReproducaoTabId; label: string; path: string }[] = [
  { id: "utilizado", label: "Utilizado", path: SEMEN_UTILIZADO_PATH },
  { id: "estoque", label: "Estoque", path: SEMEN_ESTOQUE_PATH },
];

export function SemenReproducaoTabs({ active }: SemenReproducaoTabsProps) {
  const [, setLocation] = useLocation();

  return (
    <div
      className="flex gap-1 px-5 pt-3 border-b border-gray-100"
      role="tablist"
      aria-label="Controle de sêmen"
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => {
            if (active !== tab.id) setLocation(tab.path);
          }}
          className={cn(
            "px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors rounded-t",
            active === tab.id
              ? "border-[#4ECDC4] text-gray-900 bg-[#4ECDC4]/5"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50/80",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
