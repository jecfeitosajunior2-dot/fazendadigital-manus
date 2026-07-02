import { cn } from "@/lib/utils";
import { SquarePen, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export const FD_EDIT_ACTION_COLOR = "#586168";
export const FD_DELETE_ACTION_COLOR = "#E28484";

const ICON_STROKE = 1.75;

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Editar — ícone profissional (Lucide SquarePen) */
export function EditActionIcon({ size = 17, className = "", style }: IconProps) {
  return (
    <SquarePen
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn("shrink-0", className)}
      style={{ color: FD_EDIT_ACTION_COLOR, ...style }}
      aria-hidden
    />
  );
}

/** Excluir — ícone profissional (Lucide Trash2) */
export function DeleteActionIcon({ size = 17, className = "", style }: IconProps) {
  return (
    <Trash2
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn("shrink-0", className)}
      style={{ color: FD_DELETE_ACTION_COLOR, ...style }}
      aria-hidden
    />
  );
}

type TableIconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "danger";
};

function TableIconButton({ label, onClick, children, tone = "neutral" }: TableIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "active:scale-[0.96]",
        tone === "neutral" && [
          "text-[#586168] hover:text-[#434A54] hover:bg-slate-100/90",
          "focus-visible:ring-slate-300",
        ],
        tone === "danger" && [
          "text-[#E28484] hover:text-[#D46B6B] hover:bg-rose-50",
          "focus-visible:ring-rose-200",
        ],
      )}
    >
      {children}
    </button>
  );
}

type FarmRowActionButtonsProps = {
  onEdit: () => void;
  onDelete: () => void;
  iconSize?: number;
  className?: string;
};

/** Botões Editar + Excluir — padrão profissional para tabelas */
export function FarmRowActionButtons({
  onEdit,
  onDelete,
  iconSize = 17,
  className = "",
}: FarmRowActionButtonsProps) {
  return (
    <div className={cn("inline-flex items-center justify-center gap-1", className)}>
      <TableIconButton label="Editar" onClick={onEdit} tone="neutral">
        <EditActionIcon size={iconSize} />
      </TableIconButton>
      <TableIconButton label="Excluir" onClick={onDelete} tone="danger">
        <DeleteActionIcon size={iconSize} />
      </TableIconButton>
    </div>
  );
}
