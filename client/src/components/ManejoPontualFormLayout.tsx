import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const FAZENDA_SELECT_PLACEHOLDER = "Selecione uma fazenda";

const FD_PRIMARY = "#4ECDC4";

const btnPrimary =
  "inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90";
const btnSecondary =
  "px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors";

export function ManejoSectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-white border border-gray-200 rounded shadow-sm",
        className,
      )}
    >
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-[13px] font-semibold text-[#4ECDC4]">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

export function ManejoPontualFormShell({
  title,
  onCancel,
  cancelDisabled,
  cancelLabel = "Cancelar",
  onSave,
  saveDisabled,
  savePending,
  saveLabel = "Salvar",
  children,
}: {
  title: string;
  onCancel: () => void;
  cancelDisabled?: boolean;
  cancelLabel?: string;
  onSave: () => void;
  saveDisabled?: boolean;
  savePending?: boolean;
  saveLabel?: string;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group disabled:opacity-50"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>

      <div className="mb-5">
        <h1
          className="text-[20px] font-semibold text-gray-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {title}
        </h1>
      </div>

      <div className="space-y-5 pb-10">
        {children}

        <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelDisabled || savePending}
            className={btnSecondary}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || savePending}
            className={btnPrimary}
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {savePending ? "Salvando…" : saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}
