import { useConfirm } from "@/components/ConfirmDialog";
import { CurralBalancaTransportDialog } from "@/components/curral/CurralBalancaTransportDialog";
import { CurralEquipamentoCard } from "@/components/curral/CurralEquipamentoCard";
import { useScaleReader, type ScaleReaderSession } from "@/hooks/useScaleReader";
import type { TruTestBleReaderSession } from "@/hooks/useTruTestBleReader";
import { formatPesoKgParaCampo } from "@/lib/hardware/scaleProtocol";
import {
  ajudaScaleCard,
  mensagemScaleJaConectada,
  subtituloScaleCard,
  type ScaleTransport,
} from "@/lib/hardware/scaleTransport";
import { mensagemErroAberturaBalanca } from "@/lib/hardware/serialPortLabels";
import { cn } from "@/lib/utils";
import { Scale } from "lucide-react";
import { useState } from "react";

type ScaleReaderControlProps = {
  disabled?: boolean;
  /** Peso estável lido (serial ou simulação). Só usado sem `session` compartilhada. */
  onStableWeight?: (kg: number) => void;
  /** hub: card da pré-sessão; operacao: conexão na sessão. */
  variant?: "hub" | "operacao";
  className?: string;
  /** Sessão USB/Web Serial compartilhada (hub → operação no curral). */
  session?: ScaleReaderSession;
  /** Sessão BLE compartilhada. Sem ela, o card permanece só USB. */
  bleSession?: TruTestBleReaderSession;
};

export function ScaleReaderControl(props: ScaleReaderControlProps) {
  if (props.session) {
    return <ScaleReaderControlInner {...props} session={props.session} />;
  }
  return <ScaleReaderControlWithHook {...props} />;
}

function ScaleReaderControlWithHook({
  onStableWeight,
  ...rest
}: Omit<ScaleReaderControlProps, "session">) {
  const session = useScaleReader({ onStableWeight, presetId: "trutest-s3" });
  return <ScaleReaderControlInner {...rest} session={session} />;
}

function ScaleReaderControlInner({
  disabled,
  variant = "operacao",
  className,
  session,
  bleSession,
}: ScaleReaderControlProps & { session: ScaleReaderSession }) {
  const confirm = useConfirm();
  const [pickerOpen, setPickerOpen] = useState(false);
  const {
    supported,
    status,
    statusLabel,
    lastWeightKg,
    error,
    sessionActive,
    connect,
    disconnect,
    statusOperacional,
    connectedCom,
  } = session;

  const usbActive = sessionActive;
  const bleActive = Boolean(bleSession?.sessionActive);
  const connected = usbActive || bleActive;
  const connecting =
    status === "connecting" || bleSession?.status === "connecting";
  const transport: ScaleTransport | null = bleActive ? "ble" : usbActive ? "usb" : null;
  const bleSupported = Boolean(bleSession?.supported);

  const erroAmigavel = bleActive || bleSession?.lost
    ? bleSession?.error ?? null
    : status === "error"
      ? mensagemErroAberturaBalanca(error)
      : bleSession?.status === "error"
        ? bleSession.error
        : null;

  const statusVisual = connecting
    ? "Conectando..."
    : connected
      ? (bleSession?.statusOperacional ?? statusOperacional ?? "Conectada")
      : bleSession?.lost
        ? "Desconectada"
        : (statusOperacional ?? statusLabel);

  const modeloLinha = "Tru-Test S3";
  const subtitulo = subtituloScaleCard({
    connected,
    transport,
    usbCom: usbActive ? connectedCom ?? null : null,
  });
  const ajuda = ajudaScaleCard({
    connected,
    connecting,
    bleSupported: bleSession ? bleSupported : supported,
  });

  const startTransport = async (next: ScaleTransport) => {
    if (disabled) return;
    if (transport && transport !== next) {
      const ok = await confirm({
        title: "Trocar conexão da balança?",
        description: mensagemScaleJaConectada(transport),
        confirmText: "Trocar conexão",
        cancelText: "Manter conexão atual",
        variant: "warning",
      });
      if (!ok) return;
      if (transport === "ble") await bleSession?.disconnect().catch(() => undefined);
      else await disconnect().catch(() => undefined);
    }
    if (next === "ble") {
      await bleSession?.connect().catch(() => undefined);
      return;
    }
    await connect().catch(() => undefined);
  };

  const handleConectar = () => {
    if (disabled) return;
    if (bleSession) {
      setPickerOpen(true);
      return;
    }
    if (!supported) return;
    void connect().catch(() => undefined);
  };

  const handleDesconectar = () => {
    if (bleActive) {
      void bleSession?.disconnect().catch(() => undefined);
      return;
    }
    void disconnect().catch(() => undefined);
  };

  const btn =
    "inline-flex items-center justify-center px-3 py-2 rounded border text-[12px] font-semibold min-h-[36px] disabled:opacity-60 disabled:cursor-not-allowed";

  const acoes = (
    <div className="flex flex-col items-end gap-1">
      {!connected ? (
        <button
          type="button"
          disabled={disabled || connecting}
          onClick={handleConectar}
          className={cn(btn, "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}
        >
          Conectar
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={disabled || connecting}
            onClick={handleDesconectar}
            className={cn(btn, "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}
          >
            Desconectar
          </button>
          {variant === "hub" && bleSession ? (
            <button
              type="button"
              disabled={disabled || connecting}
              onClick={() => setPickerOpen(true)}
              className="text-[11px] font-semibold text-gray-500 underline underline-offset-2"
            >
              Trocar
            </button>
          ) : null}
        </>
      )}
    </div>
  );

  const card = (
    <>
      <CurralEquipamentoCard
        titulo="Balança"
        modeloLinha={modeloLinha}
        subtitulo={subtitulo}
        status={statusVisual}
        conectado={connected}
        erro={erroAmigavel}
        ajuda={ajuda}
        unsupported={
          !supported && !bleSupported
            ? "Não foi possível usar a balança neste navegador. Digite o peso manualmente."
            : null
        }
        acao={supported || bleSupported ? acoes : null}
      />
      {bleSession ? (
        <CurralBalancaTransportDialog
          open={pickerOpen}
          bleSupported={bleSupported}
          onCancel={() => setPickerOpen(false)}
          onConfirm={next => {
            setPickerOpen(false);
            void startTransport(next);
          }}
        />
      ) : null}
    </>
  );

  if (variant === "hub" || bleSession) {
    return <div className={cn(className)}>{card}</div>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {!supported ? (
        <p className="text-[11px] text-gray-500 leading-snug">
          Web Serial indisponível neste navegador. Digite o peso manualmente no campo abaixo.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!sessionActive ? (
            <button
              type="button"
              disabled={disabled || status === "connecting"}
              onClick={handleConectar}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 min-h-[36px] hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Scale className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Conectar
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || status === "connecting"}
              onClick={handleDesconectar}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-gray-200 bg-white text-[12px] font-semibold text-gray-600 min-h-[36px] hover:bg-gray-50 disabled:opacity-60"
            >
              Desconectar
            </button>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
        {statusOperacional ?? statusLabel}
        {lastWeightKg != null ? (
          <>
            {" "}
            · último:{" "}
            <span className="font-semibold text-gray-600">
              {formatPesoKgParaCampo(lastWeightKg)} kg
            </span>
          </>
        ) : null}
      </p>

      {erroAmigavel ? (
        <p className="text-[10px] text-red-500 leading-snug">{erroAmigavel}</p>
      ) : null}
    </div>
  );
}
