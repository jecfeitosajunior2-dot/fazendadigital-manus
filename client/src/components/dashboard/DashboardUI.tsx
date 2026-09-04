// Componentes visuais compartilhados entre os dashboards (Painel de Controle e Insumos).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const TEAL = "#1BC5BD";
export const NAVY = "#164E63";
export const GREEN = "#10B981";
export const RED = "#EF4444";
export const GOLD = "#D4AF37";

export function SectionCard({
  title,
  icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-gray-200 rounded shadow-sm overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#4ECDC4] flex items-center gap-2 min-w-0">
          {icon ? (
            <span className="material-icons text-[18px] shrink-0" style={{ color: TEAL }}>
              {icon}
            </span>
          ) : null}
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
  onClick,
  tooltip,
  valueColor,
  size = "default",
  className,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: string;
  color: string;
  onClick?: () => void;
  /** Dica ao passar o mouse / foco. */
  tooltip?: string;
  /** Cor do número principal (ex.: vermelho em alerta). */
  valueColor?: string;
  size?: "default" | "compact";
  className?: string;
}) {
  const compact = size === "compact";
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      title={tooltip}
      onKeyDown={
        interactive
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "group text-left bg-white overflow-hidden flex w-full min-w-0 border border-slate-100 transition-all",
        compact ? "rounded-xl shadow-sm" : "rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.055)]",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.10)] hover:border-slate-200 active:scale-[0.995]",
        className,
      )}
    >
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <div className={cn("flex-1 min-w-0", compact ? "p-3" : "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-medium uppercase tracking-wide text-gray-500 truncate",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              {label}
            </p>
            <p
              className={cn(
                "font-bold leading-tight mt-1 tabular-nums truncate",
                compact ? "text-[18px]" : "text-[22px]",
              )}
              style={{ color: valueColor ?? "#1F2937" }}
            >
              {value}
            </p>
          </div>
          <span
            className={cn(
              "material-icons flex-shrink-0 rounded-lg",
              compact ? "text-[18px] p-1" : "text-[20px] p-1.5",
            )}
            style={{ color, backgroundColor: `${color}14` }}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        {sub ? (
          <div
            className={cn(
              "text-gray-400 leading-snug line-clamp-2",
              compact ? "text-[10px] mt-1.5" : "text-[11px] mt-2",
            )}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </Tag>
  );
}

export type Severidade = "critico" | "alerta" | "info";

export type AlertItem = {
  texto: string;
  detalhe: string;
  /** ID interno do animal — habilita clique individual quando `onItemClick` é usado. */
  animalId?: number;
};

export function AlertGroup({
  icon,
  titulo,
  itens,
  severidade,
  onClick,
  onItemClick,
}: {
  icon: string;
  titulo: string;
  itens: AlertItem[];
  severidade: Severidade;
  onClick?: () => void;
  onItemClick?: (item: AlertItem, index: number) => void;
}) {
  const cfg = {
    critico: { color: RED, bg: "#FEF2F2", border: "#FECACA" },
    alerta: { color: GOLD, bg: "#FFFBEB", border: "#FDE68A" },
    info: { color: TEAL, bg: "#F0FDFA", border: "#99F6E4" },
  }[severidade];

  if (itens.length === 0) return null;

  const cardClassName =
    "text-left rounded-lg border p-3 hover:shadow-sm transition-shadow w-full";
  const cardStyle = { backgroundColor: cfg.bg, borderColor: cfg.border };

  const header = (
    <div className="flex items-center justify-between mb-2">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: cfg.color }}>
        <span className="material-icons text-[16px]">{icon}</span>
        {titulo}
      </span>
      <span className="text-[11px] font-bold rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: cfg.color }}>
        {itens.length}
      </span>
    </div>
  );

  const list = (
    <ul className="space-y-1.5">
      {itens.slice(0, 3).map((it, i) => {
        const itemClickable =
          onItemClick != null &&
          it.animalId != null &&
          Number.isFinite(it.animalId) &&
          it.animalId > 0;

        if (itemClickable) {
          return (
            <li key={`${it.animalId}-${i}`}>
              <button
                type="button"
                onClick={() => onItemClick(it, i)}
                className="w-full text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 cursor-pointer min-w-0"
                aria-label={`Ver ficha: ${it.texto}`}
              >
                <div className="text-[11px] text-gray-700 truncate font-medium">{it.texto}</div>
                {it.detalhe ? (
                  <div className="text-[11px] text-gray-500 leading-snug">{it.detalhe}</div>
                ) : null}
              </button>
            </li>
          );
        }

        return (
          <li key={i} className="text-[11px] min-w-0">
            <div className="text-gray-700 truncate font-medium">{it.texto}</div>
            {it.detalhe ? (
              <div className="text-gray-500 leading-snug">{it.detalhe}</div>
            ) : null}
          </li>
        );
      })}
      {itens.length > 3 && (
        <li className="text-[11px] font-medium pt-0.5" style={{ color: cfg.color }}>
          + {itens.length - 3} {itens.length - 3 === 1 ? "outro" : "outros"}
        </li>
      )}
    </ul>
  );

  if (onItemClick) {
    return (
      <div className={cardClassName} style={cardStyle}>
        {header}
        {list}
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cardClassName} style={cardStyle}>
      {header}
      {list}
    </button>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="p-8 text-center">
      <span className="material-icons text-3xl text-gray-200">{icon}</span>
      <p className="text-[12px] text-gray-400 mt-2">{text}</p>
    </div>
  );
}
