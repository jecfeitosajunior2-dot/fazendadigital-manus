import { Scale } from "lucide-react";
import { useScaleReader } from "@/hooks/useScaleReader";
import { formatPesoKgParaCampo } from "@/lib/hardware/scaleProtocol";
import { TRUTEST_S3_SCALE_PRESET } from "@/lib/hardware/scalePresets";
import { cn } from "@/lib/utils";

type ScaleReaderControlProps = {
  disabled?: boolean;
  /** Peso estável lido (serial ou simulação). */
  onStableWeight?: (kg: number) => void;
  /** hub: conexão + notas de setup; operacao: só conexão na sessão. */
  variant?: "hub" | "operacao";
  className?: string;
};

/**
 * Leitura de balança Tru-Test S3 via Web Serial (SCP, 9600 8N1, USB/COM virtual).
 */
export function ScaleReaderControl({
  disabled,
  onStableWeight,
  variant = "operacao",
  className,
}: ScaleReaderControlProps) {
  const {
    supported,
    status,
    statusLabel,
    preset,
    lastWeightKg,
    error,
    sessionActive,
    connect,
    disconnect,
  } = useScaleReader({ onStableWeight, presetId: "trutest-s3" });

  const handleConectar = () => {
    if (disabled || !supported) return;
    void connect().catch(() => undefined);
  };

  const handleDesconectar = () => {
    void disconnect().catch(() => undefined);
  };

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
              Conectar Tru-Test S3
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
        {statusLabel}
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

      {error ? (
        <p className="text-[10px] text-red-500 leading-snug">{error}</p>
      ) : null}

      {variant === "hub" ? (
        <div className="rounded-lg border border-gray-100 bg-white/80 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-700">
            Tru-Test S3 — {preset.baudRate} bps, 8N1 (USB → COM virtual)
          </p>
          <ul className="text-[10px] text-gray-500 leading-snug space-y-1 list-disc pl-4">
            {TRUTEST_S3_SCALE_PRESET.setupNotes.map(nota => (
              <li key={nota}>{nota}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
