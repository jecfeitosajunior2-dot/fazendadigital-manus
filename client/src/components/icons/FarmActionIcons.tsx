import { cn } from "@/lib/utils";
import { Ban, CircleCheck, Eye, SquarePen, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export const FD_EDIT_ACTION_COLOR = "#586168";
export const FD_VIEW_ACTION_COLOR = "#586168";
export const FD_VIEW_ACTION_HOVER_COLOR = "#2D5A5A";
export const FD_DELETE_ACTION_COLOR = "#E28484";
export const FD_INACTIVATE_ACTION_COLOR = "#C9844A";
export const FD_ACTIVATE_ACTION_COLOR = "#16A34A";
const ICON_STROKE = 1.75;

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

/** Visualizar — ícone profissional (Lucide Eye) */
export function ViewActionIcon({ size = 17, className = "", style }: IconProps) {
  return (
    <Eye
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn("shrink-0 text-inherit", className)}
      style={style}
      aria-hidden
    />
  );
}
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

/** Inativar — círculo cortado (Lucide Ban) */
export function InactivateActionIcon({ size = 17, className = "", style }: IconProps) {
  return (
    <Ban
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn("shrink-0", className)}
      style={{ color: FD_INACTIVATE_ACTION_COLOR, ...style }}
      aria-hidden
    />
  );
}

/** Ativar — confirmação (Lucide CircleCheck) */
export function ActivateActionIcon({ size = 17, className = "", style }: IconProps) {
  return (
    <CircleCheck
      size={size}
      strokeWidth={ICON_STROKE}
      className={cn("shrink-0", className)}
      style={{ color: FD_ACTIVATE_ACTION_COLOR, ...style }}
      aria-hidden
    />
  );
}

type TableIconButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "neutral" | "view" | "danger" | "warning" | "success";
  compact?: boolean;
};
export function TableIconButton({
  label,
  onClick,
  children,
  tone = "neutral",
  compact = false,
}: TableIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "transition-all duration-150 ease-out cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        compact
          ? "grid place-items-center rounded active:scale-95 h-7 w-6"
          : "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent active:scale-[0.96]",
        tone === "neutral" && [
          compact ? "hover:bg-gray-100" : "text-[#586168] hover:text-[#434A54] hover:bg-slate-100/90",
          "focus-visible:ring-slate-300",
        ],
        tone === "view" && [
          compact
            ? "text-[#586168] hover:text-[#2D5A5A] hover:bg-[#4ECDC414] active:bg-[#4ECDC426]"
            : [
                "text-[#586168] hover:text-[#2D5A5A]",
                "hover:bg-[#4ECDC414] active:bg-[#4ECDC426]",
              ],
          "focus-visible:ring-[#4ECDC4]/30",
        ],
        tone === "danger" && [
          compact ? "hover:bg-red-50" : "text-[#E28484] hover:text-[#D46B6B] hover:bg-rose-50",
          "focus-visible:ring-rose-200",
        ],
        tone === "warning" && [
          compact ? "hover:bg-amber-50" : "hover:bg-amber-50",
          "focus-visible:ring-amber-200",
        ],
        tone === "success" && [
          compact ? "hover:bg-green-50" : "hover:bg-green-50",
          "focus-visible:ring-green-200",
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

type ViewEditRowActionButtonsProps = {
  onView: () => void;
  onEdit: () => void;
  iconSize?: number;
  className?: string;
  viewLabel?: string;
  editLabel?: string;
};

/** Botões Visualizar + Editar — mesmo padrão das demais listas */
export function ViewEditRowActionButtons({
  onView,
  onEdit,
  iconSize = 17,
  className = "",
  viewLabel = "Visualizar",
  editLabel = "Editar",
}: ViewEditRowActionButtonsProps) {
  return (
    <div className={cn("inline-flex items-center justify-center gap-1", className)}>
      <TableIconButton label={viewLabel} onClick={onView} tone="view">
        <ViewActionIcon size={iconSize} />
      </TableIconButton>
      <TableIconButton label={editLabel} onClick={onEdit} tone="neutral">
        <EditActionIcon size={iconSize} />
      </TableIconButton>
    </div>
  );
}

type ViewEditDeleteRowActionButtonsProps = {
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  iconSize?: number;
  className?: string;
  viewLabel?: string;
  editLabel?: string;
  deleteLabel?: string;
};

/** Botões Visualizar + Editar + Excluir — padrão da Lista de Animais */
export function ViewEditDeleteRowActionButtons({
  onView,
  onEdit,
  onDelete,
  iconSize = 17,
  className = "",
  viewLabel = "Visualizar",
  editLabel = "Editar",
  deleteLabel = "Excluir",
}: ViewEditDeleteRowActionButtonsProps) {
  return (
    <div className={cn("inline-flex items-center justify-center gap-1", className)}>
      <TableIconButton label={viewLabel} onClick={onView} tone="view">
        <ViewActionIcon size={iconSize} />
      </TableIconButton>
      <TableIconButton label={editLabel} onClick={onEdit} tone="neutral">
        <EditActionIcon size={iconSize} />
      </TableIconButton>
      <TableIconButton label={deleteLabel} onClick={onDelete} tone="danger">
        <DeleteActionIcon size={iconSize} />
      </TableIconButton>
    </div>
  );
}
