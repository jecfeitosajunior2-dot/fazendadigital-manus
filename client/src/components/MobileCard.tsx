import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

export interface MobileCardField {
  label: string;
  value: ReactNode;
  /** Destaca o valor (ex: total, valor monetário) */
  emphasis?: boolean;
}

export interface MobileCardAction {
  icon: string;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}

interface MobileCardProps {
  /** Título principal do card (ex: nome da máquina) */
  title: ReactNode;
  /** Subtítulo opcional abaixo do título (ex: tipo/marca) */
  subtitle?: ReactNode;
  /** Etiqueta/badge no canto superior direito (ex: status, valor) */
  badge?: ReactNode;
  /** Lista de campos exibidos em grade */
  fields?: MobileCardField[];
  /** Ações (editar/excluir) exibidas no rodapé */
  actions?: MobileCardAction[];
  /** Clique no corpo do card (ex: abrir detalhe) */
  onClick?: () => void;
}

/**
 * Card usado para representar uma linha de tabela no mobile.
 * Deve ser renderizado dentro de um container `lg:hidden`,
 * enquanto a `<table>` original fica `hidden lg:table`.
 */
export default function MobileCard({
  title,
  subtitle,
  badge,
  fields = [],
  actions = [],
  onClick,
}: MobileCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden",
        onClick && "active:scale-[0.99] transition"
      )}
    >
      <div
        className={cn("px-4 pt-3.5 pb-3", onClick && "cursor-pointer")}
        onClick={onClick}
        role={onClick ? "button" : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-gray-900 leading-tight truncate">
              {title}
            </div>
            {subtitle != null && subtitle !== "" && (
              <div className="text-[12.5px] text-gray-500 mt-0.5 truncate">
                {subtitle}
              </div>
            )}
          </div>
          {badge != null && badge !== "" && (
            <div className="shrink-0">{badge}</div>
          )}
        </div>

        {fields.length > 0 && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-3">
            {fields.map((f, i) => (
              <div key={i} className="min-w-0">
                <div className="text-[10.5px] font-medium uppercase tracking-wide text-gray-400">
                  {f.label}
                </div>
                <div
                  className={cn(
                    "text-[13.5px] mt-0.5 truncate",
                    f.emphasis
                      ? "font-semibold text-gray-900 tabular-nums"
                      : "text-gray-700"
                  )}
                >
                  {f.value === "" || f.value == null ? "—" : f.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {actions.length > 0 && (
        <div className="flex border-t border-gray-100 divide-x divide-gray-100">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 text-[13px] font-medium active:scale-[0.97] transition",
                a.variant === "danger"
                  ? "text-red-500 active:bg-red-50"
                  : "text-gray-600 active:bg-gray-50"
              )}
              style={{ minHeight: 48 }}
            >
              <span className="material-icons text-[18px] leading-none">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { FD_PRIMARY };
