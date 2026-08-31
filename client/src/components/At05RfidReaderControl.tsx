import { useCallback, useRef, useState } from "react";
import { Bluetooth } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAt05Reader } from "@/hooks/useAt05Reader";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  MSG_RFID_CONEXAO_FALHOU,
  MSG_RFID_SUBSTITUIR,
  decidirAplicacaoRfidLido,
  textoStatusLeitorRfid,
  type StatusLeitorRfidCadastro,
} from "@/lib/rfidLeituraCadastro";

type At05RfidReaderControlProps = {
  currentValue: string;
  disabled?: boolean;
  onRfidRead: (rfid: string) => void;
};

/**
 * Leitura operacional de RFID via AT05.
 * Reutiliza useAt05Reader (mesmo parser/Web Serial do Manejo).
 * Não salva animal. Não assume animalId.
 */
export function At05RfidReaderControl({
  currentValue,
  disabled,
  onRfidRead,
}: At05RfidReaderControlProps) {
  const confirm = useConfirm();
  const [capturing, setCapturing] = useState(false);
  const [lastFilled, setLastFilled] = useState<string | null>(null);
  const capturingRef = useRef(false);
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  const applyRead = useCallback(
    async (rfid: string) => {
      if (!capturingRef.current) return;
      const key = normalizeRfidKey(rfid);
      if (!key) return;

      capturingRef.current = false;
      setCapturing(false);

      const decisao = decidirAplicacaoRfidLido(currentValueRef.current, key);
      if (decisao === "manter") {
        setLastFilled(key);
        return;
      }
      if (decisao === "confirmar") {
        const ok = await confirm({
          title: "Substituir RFID?",
          description: MSG_RFID_SUBSTITUIR,
          confirmText: "Substituir",
          cancelText: "Manter",
          variant: "warning",
        });
        if (!ok) return;
      }
      onRfidRead(key);
      setLastFilled(key);
    },
    [confirm, onRfidRead],
  );

  const {
    supported,
    status,
    sessionActive,
    connect,
  } = useAt05Reader({ onRead: applyRead });

  const uiStatus: StatusLeitorRfidCadastro = !supported
    ? "unsupported"
    : capturing
      ? "capturing"
      : status === "connecting"
        ? "connecting"
        : status === "listening" || status === "connected"
          ? "connected"
          : status === "error"
            ? "error"
            : "disconnected";

  const handleConectar = () => {
    if (disabled || !supported) return;
    void connect().catch(() => undefined);
  };

  const handleLerRfid = () => {
    if (disabled || !supported) return;
    capturingRef.current = true;
    setCapturing(true);
    if (!sessionActive) void connect().catch(() => undefined);
  };

  if (!supported) {
    return (
      <p className="mt-2 text-[11px] text-gray-500 leading-snug">
        {textoStatusLeitorRfid("unsupported")}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!sessionActive ? (
          <button
            type="button"
            disabled={disabled || status === "connecting"}
            onClick={handleConectar}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 min-h-[36px] hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Conectar bastão
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled || status === "connecting" || capturing}
          onClick={handleLerRfid}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#4ECDC4]/50 bg-[#4ECDC4]/10 text-[12px] font-semibold text-gray-800 min-h-[36px] hover:bg-[#4ECDC4]/15 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {capturing ? "Aguardando leitura..." : "Ler RFID"}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
        {textoStatusLeitorRfid(uiStatus)}
      </p>
      {uiStatus === "error" ? (
        <p className="text-[10px] text-red-500 leading-snug">{MSG_RFID_CONEXAO_FALHOU}</p>
      ) : null}
      {lastFilled ? (
        <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
          RFID lido: {lastFilled}
        </p>
      ) : null}
    </div>
  );
}
