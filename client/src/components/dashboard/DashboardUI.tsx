// Componentes visuais compartilhados entre os dashboards (Painel de Controle e Insumos).
import type { ReactNode } from "react";

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
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-gray-800 flex items-center gap-2">
          {icon && <span className="material-icons text-[18px]" style={{ color: TEAL }}>{icon}</span>}
          {title}
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
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex hover:shadow-md hover:border-gray-200 transition-all"
    >
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="p-4 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide truncate">{label}</p>
            <p className="text-[22px] font-bold text-gray-800 leading-tight mt-1 truncate">{value}</p>
          </div>
          <span
            className="material-icons text-[20px] flex-shrink-0 rounded-lg p-1.5"
            style={{ color, backgroundColor: `${color}14` }}
          >
            {icon}
          </span>
        </div>
        {sub && <div className="text-[11px] text-gray-400 mt-2 leading-snug">{sub}</div>}
      </div>
    </button>
  );
}

export type Severidade = "critico" | "alerta" | "info";

export function AlertGroup({
  icon,
  titulo,
  itens,
  severidade,
  onClick,
}: {
  icon: string;
  titulo: string;
  itens: { texto: string; detalhe: string }[];
  severidade: Severidade;
  onClick?: () => void;
}) {
  const cfg = {
    critico: { color: RED, bg: "#FEF2F2", border: "#FECACA" },
    alerta: { color: GOLD, bg: "#FFFBEB", border: "#FDE68A" },
    info: { color: TEAL, bg: "#F0FDFA", border: "#99F6E4" },
  }[severidade];

  if (itens.length === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border p-3 hover:shadow-sm transition-shadow w-full"
      style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: cfg.color }}>
          <span className="material-icons text-[16px]">{icon}</span>
          {titulo}
        </span>
        <span className="text-[11px] font-bold rounded-full px-2 py-0.5 text-white" style={{ backgroundColor: cfg.color }}>
          {itens.length}
        </span>
      </div>
      <ul className="space-y-1">
        {itens.slice(0, 3).map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-gray-700 truncate">{it.texto}</span>
            <span className="text-gray-400 whitespace-nowrap">{it.detalhe}</span>
          </li>
        ))}
        {itens.length > 3 && (
          <li className="text-[11px] font-medium pt-0.5" style={{ color: cfg.color }}>
            + {itens.length - 3} {itens.length - 3 === 1 ? "outro" : "outros"}
          </li>
        )}
      </ul>
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
