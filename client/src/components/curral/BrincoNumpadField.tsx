import { useCallback, useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

type BrincoNumpadFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  disabled?: boolean;
  confirmPending?: boolean;
};

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function BrincoNumpadField({
  value,
  onChange,
  onConfirm,
  disabled = false,
  confirmPending = false,
}: BrincoNumpadFieldProps) {
  const appendDigit = useCallback(
    (digit: string) => {
      if (disabled || confirmPending) return;
      if (value.length >= 12) return;
      onChange(value + digit);
    },
    [confirmPending, disabled, onChange, value],
  );

  const backspace = useCallback(() => {
    if (disabled || confirmPending) return;
    onChange(value.slice(0, -1));
  }, [confirmPending, disabled, onChange, value]);

  const clearAll = useCallback(() => {
    if (disabled || confirmPending) return;
    onChange("");
  }, [confirmPending, disabled, onChange]);

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
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [appendDigit, backspace, confirmPending, disabled, onConfirm]);

  const keyBtn =
    "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 font-semibold min-h-[52px] text-[20px] transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50";

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-xl border-2 px-4 py-4 text-center min-h-[64px] flex items-center justify-center",
          value ? "border-[#4ECDC4]/50 bg-[#4ECDC4]/[0.04]" : "border-gray-200 bg-gray-50",
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "font-bold tracking-wider tabular-nums",
            value ? "text-[28px] sm:text-[32px] text-gray-900" : "text-[14px] text-gray-400 font-medium",
          )}
        >
          {value || "Digite o brinco visual"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
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
        <button
          type="button"
          disabled={disabled || confirmPending || !value}
          onClick={onConfirm}
          className={cn(
            keyBtn,
            "border-transparent text-white text-[13px] uppercase tracking-wide",
          )}
          style={{ backgroundColor: FD_PRIMARY }}
          aria-label="Confirmar brinco"
        >
          {confirmPending ? "…" : "OK"}
        </button>
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
