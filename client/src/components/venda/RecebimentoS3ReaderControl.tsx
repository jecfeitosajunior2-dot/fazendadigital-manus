import { Bluetooth } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TruTestBleReaderSession } from "@/hooks/useTruTestBleReader";

type RecebimentoS3ReaderControlProps = {
  session: TruTestBleReaderSession;
  disabled?: boolean;
  className?: string;
};

/**
 * Conexão compacta da Tru-Test S3 no Recebimento.
 * Reusa a sessão BLE do pai. Não lê peso por botão. Não confirma animal.
 */
export function RecebimentoS3ReaderControl({
  session,
  disabled,
  className,
}: RecebimentoS3ReaderControlProps) {
  const { supported, status, sessionActive, connect, disconnect, error } = session;

  const connecting = status === "connecting";
  const uiError = status === "error" ? error : null;

  const statusCompacto = connecting
    ? "Conectando à balança..."
    : sessionActive
      ? "Balança conectada"
      : uiError
        ? "Erro na conexão"
        : "Balança desconectada";

  if (!supported) {
    return (
      <p className={cn("text-[10px] text-gray-400 truncate", className)}>
        Bluetooth indisponível neste navegador
      </p>
    );
  }

  const btnCompact =
    "inline-flex items-center justify-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold !min-h-7 !min-w-0 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className={cn("flex items-center gap-2 min-w-0", className)}>
      {!sessionActive ? (
        <button
          type="button"
          disabled={disabled || connecting}
          onClick={() => void connect().catch(() => undefined)}
          className={cn(btnCompact, "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}
        >
          <Bluetooth className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          Conectar
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled || connecting}
          onClick={() => void disconnect().catch(() => undefined)}
          className={cn(btnCompact, "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
        >
          <span className="h-2 w-2 rounded-full bg-[#4ECDC4] shrink-0" aria-hidden />
          Desconectar
        </button>
      )}
      <p className="text-[10px] text-gray-400 truncate min-w-0" aria-live="polite" title={statusCompacto}>
        {statusCompacto}
      </p>
      {uiError ? (
        <span className="text-[10px] text-red-500 shrink-0" title={uiError}>
          !
        </span>
      ) : null}
    </div>
  );
}
