import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  titulo: string;
  modeloLinha: string;
  /** Transporte visível: Bluetooth / USB. Sem COM no BLE. */
  subtitulo?: string | null;
  status: string;
  conectado: boolean;
  erro?: string | null;
  ajuda?: string;
  unsupported?: string | null;
  acao: ReactNode | null;
};

export function CurralEquipamentoCard({
  titulo,
  modeloLinha,
  subtitulo,
  status,
  conectado,
  erro,
  ajuda,
  unsupported,
  acao,
}: Props) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-gray-900">{titulo}</p>
          <p className="text-[11px] text-gray-600 mt-0.5">{modeloLinha}</p>
          {subtitulo ? (
            <p className="text-[11px] text-gray-500 mt-0.5">{subtitulo}</p>
          ) : null}
          <p className="flex items-center gap-1.5 text-[11px] text-gray-700 mt-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                conectado ? "bg-[#4ECDC4]" : "bg-gray-300",
              )}
              aria-hidden
            />
            {status}
          </p>
        </div>
        <div className="shrink-0">{acao}</div>
      </div>
      {unsupported ? (
        <p className="text-[10px] text-gray-500 leading-snug">{unsupported}</p>
      ) : null}
      {ajuda && !erro ? (
        <p className="text-[10px] text-gray-500 leading-snug">{ajuda}</p>
      ) : null}
      {erro ? (
        <p className="text-[10px] text-red-500 leading-snug">{erro}</p>
      ) : null}
    </div>
  );
}
