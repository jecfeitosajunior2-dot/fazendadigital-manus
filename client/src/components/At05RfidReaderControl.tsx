import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAt05Reader, type At05ReaderSession } from "@/hooks/useAt05Reader";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  MSG_RFID_CONEXAO_FALHOU,
  MSG_RFID_SUBSTITUIR,
  decidirAplicacaoRfidLido,
  textoStatusBastaoRfid,
  textoStatusLeitorRfid,
  type StatusLeitorRfidCadastro,
} from "@/lib/rfidLeituraCadastro";

type At05RfidReaderControlProps = {
  currentValue?: string;
  disabled?: boolean;
  onRfidRead: (rfid: string) => void;
  /** cadastro: confirma substituição. identificar: só devolve o RFID lido. */
  mode?: "cadastro" | "identificar";
  /** Curral: após conectar, escuta tags sem botão "Ler RFID". */
  continuous?: boolean;
  /** compact: barra superior do curral · embedded: só conectar se necessário · hub: só conexão (pré-sessão). */
  variant?: "default" | "compact" | "embedded" | "hub";
  className?: string;
  /** Sessão serial compartilhada (ex.: Sessão no curral hub → operação). */
  session?: At05ReaderSession;
  /** Registra o handler de leitura na sessão compartilhada do pai. */
  bindReadHandler?: (handler: (rfid: string) => void) => () => void;
};

type At05RfidReaderControlInnerProps = At05RfidReaderControlProps & {
  session: At05ReaderSession;
};

/**
 * Leitura operacional de RFID via AT05.
 * Reutiliza useAt05Reader (mesmo parser/Web Serial).
 * Não salva animal. Não conhece Venda/Fazenda.
 */
export function At05RfidReaderControl(props: At05RfidReaderControlProps) {
  if (props.session) {
    return <At05RfidReaderControlInner {...props} session={props.session} />;
  }
  return <At05RfidReaderControlWithHook {...props} />;
}

function At05RfidReaderControlWithHook(props: At05RfidReaderControlProps) {
  const applyReadRef = useRef<(rfid: string) => void>(() => undefined);
  const session = useAt05Reader({
    onRead: rfid => applyReadRef.current(rfid),
  });
  return (
    <At05RfidReaderControlInner
      {...props}
      session={session}
      bindReadHandler={handler => {
        applyReadRef.current = handler;
        return () => {
          if (applyReadRef.current === handler) {
            applyReadRef.current = () => undefined;
          }
        };
      }}
    />
  );
}

function At05RfidReaderControlInner({
  currentValue = "",
  disabled,
  onRfidRead,
  mode = "cadastro",
  continuous = false,
  variant = "default",
  className,
  session,
  bindReadHandler,
}: At05RfidReaderControlInnerProps) {
  const confirm = useConfirm();
  const [capturing, setCapturing] = useState(false);
  const [lastFilled, setLastFilled] = useState<string | null>(null);
  const capturingRef = useRef(false);
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  const applyRead = useCallback(
    async (rfid: string) => {
      const key = normalizeRfidKey(rfid);
      if (!key) return;

      const escutaContinua = mode === "identificar" && continuous;
      if (!escutaContinua && !capturingRef.current) return;

      if (!escutaContinua) {
        capturingRef.current = false;
        setCapturing(false);
      }

      if (mode === "identificar") {
        onRfidRead(key);
        setLastFilled(key);
        return;
      }

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
    [confirm, continuous, mode, onRfidRead],
  );

  useEffect(() => {
    if (!bindReadHandler) return;
    return bindReadHandler(applyRead);
  }, [applyRead, bindReadHandler]);

  const { supported, status, sessionActive, connect, disconnect, isListening } = session;

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

  const statusTexto =
    variant === "hub" && uiStatus === "connected"
      ? "Bastão conectado — após iniciar a sessão, passe a tag para identificar o animal."
      : variant === "hub" && uiStatus === "disconnected"
        ? "Conecte o bastão antes de iniciar a sessão."
        : mode === "identificar" && continuous && isListening
          ? "Bastão conectado · passe a tag no animal"
          : mode === "identificar"
            ? textoStatusBastaoRfid(uiStatus)
            : textoStatusLeitorRfid(uiStatus);

  const statusCompacto =
    uiStatus === "connecting"
      ? "Conectando…"
      : uiStatus === "connected" && mode === "identificar" && continuous && isListening
        ? "Passe a tag"
        : uiStatus === "connected"
          ? "Conectado"
          : uiStatus === "error"
            ? "Erro na conexão"
            : uiStatus === "capturing"
              ? "Aguardando tag…"
              : "Bastão desconectado";

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
      <p
        className={cn(
          variant === "compact" ? "text-[10px] text-gray-400 truncate" : "mt-2 text-[11px] text-gray-500 leading-snug",
          className,
        )}
      >
        {variant === "compact" ? "Web Serial indisponível" : statusTexto}
      </p>
    );
  }

  const btnCompact =
    "inline-flex items-center justify-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold !min-h-7 !min-w-0 shrink-0 disabled:opacity-60 disabled:cursor-not-allowed";

  if (variant === "embedded") {
    if (uiStatus === "error") {
      return (
        <p className={cn("text-[10px] text-red-500 leading-snug", className)} aria-live="polite">
          {MSG_RFID_CONEXAO_FALHOU}
        </p>
      );
    }
    if (sessionActive) return null;
    return (
      <button
        type="button"
        disabled={disabled || status === "connecting"}
        onClick={handleConectar}
        className={cn(
          "inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 underline underline-offset-2 disabled:opacity-50",
          className,
        )}
      >
        <Bluetooth className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        Conectar bastão
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-2 min-w-0", className)}>
        {!sessionActive ? (
          <button
            type="button"
            disabled={disabled || status === "connecting"}
            onClick={handleConectar}
            className={cn(btnCompact, "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}
          >
            <Bluetooth className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            Conectar
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || status === "connecting"}
            onClick={() => void disconnect().catch(() => undefined)}
            className={cn(btnCompact, "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
          >
            <span
              className="h-2 w-2 rounded-full bg-[#4ECDC4] shrink-0"
              aria-hidden
            />
            Desconectar
          </button>
        )}
        <p className="text-[10px] text-gray-400 truncate min-w-0" aria-live="polite" title={statusTexto}>
          {statusCompacto}
        </p>
        {uiStatus === "error" ? (
          <span className="text-[10px] text-red-500 shrink-0" title={MSG_RFID_CONEXAO_FALHOU}>
            !
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("mt-2 space-y-2", className)}>
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
        ) : (
          <button
            type="button"
            disabled={disabled || status === "connecting"}
            onClick={() => void disconnect().catch(() => undefined)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 min-h-[36px] hover:bg-gray-50 disabled:opacity-60"
          >
            Desconectar
          </button>
        )}
        {variant !== "hub" && !(mode === "identificar" && continuous) ? (
          <button
            type="button"
            disabled={disabled || status === "connecting" || capturing}
            onClick={handleLerRfid}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-[#4ECDC4]/50 bg-[#4ECDC4]/10 text-[12px] font-semibold text-gray-800 min-h-[36px] hover:bg-[#4ECDC4]/15 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            {capturing ? "Aguardando leitura..." : "Ler RFID"}
          </button>
        ) : null}
      </div>
      <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
        {statusTexto}
      </p>
      {uiStatus === "error" ? (
        <p className="text-[10px] text-red-500 leading-snug">{MSG_RFID_CONEXAO_FALHOU}</p>
      ) : null}
      {mode === "cadastro" && lastFilled ? (
        <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
          RFID lido: {lastFilled}
        </p>
      ) : null}
    </div>
  );
}
