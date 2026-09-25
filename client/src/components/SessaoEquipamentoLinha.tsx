import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SessaoEquipamentoLinhaProps = {
  titulo: string;
  modelo: string;
  status: string;
  conectado: boolean;
  erro?: string | null;
  unsupported?: string | null;
  acao: ReactNode | null;
};

/** Faixa fina de sessão: título, modelo e status à esquerda; Conectar à direita. Sem texto de ajuda. */
export function SessaoEquipamentoLinha({
  titulo,
  modelo,
  status,
  conectado,
  erro,
  unsupported,
  acao,
}: SessaoEquipamentoLinhaProps) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-900">{titulo}</p>
        <p className="mt-0.5 text-[11px] text-gray-600">{modelo}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-700">
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              conectado ? "bg-[#4ECDC4]" : "bg-gray-300",
            )}
            aria-hidden
          />
          {status}
        </p>
        {unsupported ? (
          <p className="mt-1 text-[10px] text-gray-500 leading-snug">{unsupported}</p>
        ) : null}
        {erro ? <p className="mt-1 text-[10px] text-red-500 leading-snug">{erro}</p> : null}
      </div>
      {acao ? <div className="shrink-0">{acao}</div> : null}
    </div>
  );
}
