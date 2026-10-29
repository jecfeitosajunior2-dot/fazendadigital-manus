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
  loading = false,
  wrapText = false,
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
  loading?: boolean;
  /** Título, valor e texto secundário em várias linhas, sem reticências. */
  wrapText?: boolean;
}) {
  const compact = size === "compact";
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "div";
  const valor = loading ? (
    <div
      className={cn(
        "rounded-md bg-slate-100 animate-pulse",
        wrapText ? "mt-1.5" : "mt-2",
        compact ? "h-5 w-16" : "h-7 w-20",
      )}
      aria-hidden
    />
  ) : (
    <p
      className={cn(
        "font-bold leading-tight tabular-nums",
        wrapText ? "mt-1.5 break-words whitespace-normal" : "mt-1 truncate",
        compact ? "text-[18px]" : "text-[22px]",
      )}
      style={{ color: valueColor ?? "#1F2937" }}
    >
      {value}
    </p>
  );

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
        "group text-left bg-white overflow-hidden flex w-full min-w-0 items-stretch border border-slate-100 transition-all",
        compact ? "rounded-xl shadow-sm" : "rounded-2xl shadow-[0_10px_24px_rgba(15,23,42,0.055)]",
        wrapText && "h-full",
        interactive &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(15,23,42,0.10)] hover:border-slate-200 active:scale-[0.995]",
        className,
      )}
    >
      <div className="w-1 self-stretch flex-shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <div className={cn("flex min-w-0 flex-1 flex-col", compact ? "p-3" : "p-4", wrapText && "h-full")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "font-medium uppercase text-gray-500",
                wrapText ? "tracking-normal leading-snug break-words whitespace-normal" : "tracking-wide truncate",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              {label}
            </p>
            {wrapText ? null : valor}
          </div>
          <span
            className={cn(
              "material-icons shrink-0 rounded-lg",
              wrapText
                ? "inline-flex items-center justify-center leading-none h-8 w-8 text-[20px]"
                : compact
                  ? "text-[18px] p-1"
                  : "text-[20px] p-1.5",
            )}
            style={{ color, backgroundColor: `${color}14` }}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        {wrapText ? valor : null}
        {sub ? (
          <div
            className={cn(
              "text-gray-400 leading-snug",
              wrapText ? "mt-auto break-words whitespace-normal pt-2" : "line-clamp-2",
              compact ? "text-[10px]" : "text-[11px]",
              !wrapText && (compact ? "mt-1.5" : "mt-2"),
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
    "text-left rounded-lg border p-3 hover:shadow-sm transition-shadow w-full h-full min-w-0";
  const cardStyle = { backgroundColor: cfg.bg, borderColor: cfg.border };

  const header = (
    <div className="mb-2 flex items-start justify-between gap-2">
      <span className="flex min-w-0 items-start gap-1.5 text-[12px] font-semibold leading-snug" style={{ color: cfg.color }}>
        <span className="material-icons mt-px shrink-0 text-[16px] leading-none">{icon}</span>
        <span className="break-words">{titulo}</span>
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold tabular-nums text-white"
        style={{ backgroundColor: cfg.color }}
      >
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
                <div className="break-words text-[11px] font-medium leading-snug text-gray-700">{it.texto}</div>
                {it.detalhe ? (
                  <div className="text-[11px] text-gray-500 leading-snug">{it.detalhe}</div>
                ) : null}
              </button>
            </li>
          );
        }

        return (
          <li key={i} className="text-[11px] min-w-0">
            <div className="break-words font-medium leading-snug text-gray-700">{it.texto}</div>
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
