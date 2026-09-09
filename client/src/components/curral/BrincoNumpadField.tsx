import { useCallback, useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

export type EntradaIdentOrigem = "rfid" | "manual" | null;

type BrincoNumpadFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onManualInput?: () => void;
  origem?: EntradaIdentOrigem;
  disabled?: boolean;
  confirmPending?: boolean;
  /** Texto quando vazio (padrão: identificação inicial do curral). */
  emptyHint?: string;
  /** Numpad menor, sem botão OK — uso em troca de brinco no curral. */
  compact?: boolean;
  /** Exibe botão OK (default true). */
  showConfirm?: boolean;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function BrincoNumpadField({
  value,
  onChange,
  onConfirm,
  onManualInput,
  origem = null,
  disabled = false,
  confirmPending = false,
  emptyHint = "Passe a tag ou digite o brinco visual",
  compact = false,
  showConfirm = true,
}: BrincoNumpadFieldProps) {
  const appendDigit = useCallback(
    (digit: string) => {
      if (disabled || confirmPending) return;
      if (value.length >= 12) return;
      onManualInput?.();
      onChange(value + digit);
    },
    [confirmPending, disabled, onChange, onManualInput, value],
  );

  const backspace = useCallback(() => {
    if (disabled || confirmPending) return;
    onManualInput?.();
    onChange(value.slice(0, -1));
  }, [confirmPending, disabled, onChange, onManualInput, value]);

  const clearAll = useCallback(() => {
    if (disabled || confirmPending) return;
    onManualInput?.();
    onChange("");
  }, [confirmPending, disabled, onChange, onManualInput]);

  useEffect(() => {
    if (disabled || confirmPending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        appendDigit(e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
        return;
      }
      if (e.key === "Enter" && showConfirm) {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendDigit, backspace, confirmPending, disabled, onConfirm, showConfirm]);

  const keyBtn = compact
    ? "inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-900 font-semibold min-h-[40px] text-[18px] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
    : "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 font-semibold min-h-[52px] sm:min-h-[56px] text-[20px] sm:text-[22px] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50";

  const origemLabel =
    origem === "rfid" ? "Tag RFID" : origem === "manual" ? "Brinco visual" : null;

  const displayBoxClass = compact
    ? "rounded-xl border-2 px-3 py-3 text-center min-h-[56px] flex items-center justify-center"
    : "rounded-xl border-2 px-4 py-4 sm:px-5 sm:py-5 text-center min-h-[72px] sm:min-h-[80px] flex items-center justify-center";

  const valueTextClass = compact
    ? value
      ? "text-[22px] sm:text-[26px] font-bold tracking-wider tabular-nums text-gray-900"
      : "text-[12px] text-gray-400 font-medium leading-snug px-1"
    : value
      ? "text-[28px] sm:text-[36px] lg:text-[40px] font-bold tracking-wider tabular-nums text-gray-900"
      : "text-[14px] sm:text-[15px] text-gray-400 font-medium";

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {origemLabel ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4ECDC4] text-center">
          {origemLabel}
        </p>
      ) : null}
      <div
        className={cn(
          displayBoxClass,
          value ? "border-[#4ECDC4]/50 bg-[#4ECDC4]/[0.04]" : "border-gray-200 bg-gray-50",
        )}
        aria-live="polite"
      >
        <span className={cn("break-all", valueTextClass)}>{value || emptyHint}</span>
      </div>

      <div
        className={cn(
          "grid grid-cols-3 gap-2 w-full",
          compact ? "gap-1.5 max-w-none" : "sm:gap-2.5 max-w-md sm:max-w-lg mx-auto",
        )}
      >
        {DIGITS.map(d => (
          <button
            key={d}
            type="button"
            disabled={disabled || confirmPending}
            onClick={() => appendDigit(d)}
            className={keyBtn}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || confirmPending || !value}
          onClick={backspace}
          className={cn(keyBtn, "text-[13px] text-gray-600")}
          aria-label="Apagar último dígito"
        >
          <Delete className="h-5 w-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          disabled={disabled || confirmPending}
          onClick={() => appendDigit("0")}
          className={keyBtn}
        >
          0
        </button>
        {showConfirm ? (
          <button
            type="button"
            disabled={disabled || confirmPending || !value}
            onClick={onConfirm}
            className={cn(
              keyBtn,
              "border-transparent text-white text-[13px] uppercase tracking-wide font-bold",
            )}
            style={{ backgroundColor: FD_PRIMARY }}
            aria-label="Confirmar identificação"
          >
            {confirmPending ? "…" : "OK"}
          </button>
        ) : (
          <div aria-hidden className="min-h-[40px]" />
        )}
      </div>

      {value ? (
        <button
          type="button"
          disabled={disabled || confirmPending}
          onClick={clearAll}
          className="w-full text-[11px] font-semibold text-gray-500 underline"
        >
          Limpar
        </button>
      ) : null}
    </div>
  );
}
