import { cn } from "@/lib/utils";
import { SessaoEquipamentoLinha } from "@/components/SessaoEquipamentoLinha";
import type { TruTestBleReaderSession } from "@/hooks/useTruTestBleReader";

type RecebimentoS3ReaderControlProps = {
  session: TruTestBleReaderSession;
  disabled?: boolean;
  className?: string;
};

/**
 * Conexão da Tru-Test S3 no Recebimento.
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

  const statusLinha = connecting
    ? "Conectando à balança..."
    : sessionActive
      ? "Balança conectada"
      : uiError
        ? "Erro na conexão"
        : "Balança desconectada";

  const btnSessao =
    "inline-flex items-center justify-center px-3 py-2 rounded border text-[12px] font-semibold min-h-[36px] disabled:opacity-60 disabled:cursor-not-allowed";

  if (!supported) {
    return (
      <SessaoEquipamentoLinha
        titulo="Balança"
        modelo="Tru-Test S3"
        status="Indisponível"
        conectado={false}
        unsupported="Bluetooth indisponível neste navegador"
        acao={null}
      />
    );
  }

  return (
    <div className={cn(className)}>
      <SessaoEquipamentoLinha
        titulo="Balança"
        modelo="Tru-Test S3"
        status={statusLinha}
        conectado={sessionActive}
        erro={uiError}
        acao={
          !sessionActive ? (
            <button
              type="button"
              disabled={disabled || connecting}
              onClick={() => void connect().catch(() => undefined)}
              className={cn(btnSessao, "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}
            >
              Conectar
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || connecting}
              onClick={() => void disconnect().catch(() => undefined)}
              className={cn(btnSessao, "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
            >
              Desconectar
            </button>
          )
        }
      />
    </div>
  );
}
