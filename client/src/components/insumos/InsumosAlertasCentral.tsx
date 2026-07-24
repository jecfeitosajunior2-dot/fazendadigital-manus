import { useState, type ReactNode } from "react";
import { SectionCard, TEAL, RED, GOLD, GREEN, type Severidade } from "@/components/dashboard/DashboardUI";

export type AlertaCentralItem = {
  id: string;
  titulo: string;
  detalhe: string;
  onClick?: () => void;
};

export type AlertaCentralGrupo = {
  id: string;
  titulo: string;
  icon: string;
  severidade: Severidade;
  itens: AlertaCentralItem[];
  onVerTodos?: () => void;
};

const PREVIEW = 5;

const sevCfg = {
  critico: { color: RED, bg: "#FEF2F2", border: "#FECACA" },
  alerta: { color: GOLD, bg: "#FFFBEB", border: "#FDE68A" },
  info: { color: TEAL, bg: "#F0FDFA", border: "#99F6E4" },
} as const;

function pluralProdutos(n: number) {
  return n === 1 ? "1 produto" : `${n} produtos`;
}

function seloPendencias(total: number): { text: string; color: string } {
  if (total <= 0) return { text: "nenhuma pendência", color: GREEN };
  if (total === 1) return { text: "1 pendência", color: RED };
  return { text: `${total} pendências`, color: RED };
}

function GrupoAlerta({
  grupo,
  highlight,
}: {
  grupo: AlertaCentralGrupo;
  highlight?: boolean;
}) {
  const [aberto, setAberto] = useState(true);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const cfg = sevCfg[grupo.severidade];
  const qtd = grupo.itens.length;
  if (qtd === 0) return null;

  const precisaRecolher = qtd > PREVIEW;
  const visiveis = !aberto ? [] : mostrarTodos || !precisaRecolher ? grupo.itens : grupo.itens.slice(0, PREVIEW);

  return (
    <div
      id={`alerta-grupo-${grupo.id}`}
      className="rounded-lg border overflow-hidden transition-shadow"
      style={{
        backgroundColor: cfg.bg,
        borderColor: highlight ? cfg.color : cfg.border,
        boxShadow: highlight ? `0 0 0 2px ${cfg.color}33` : undefined,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          onClick={() => setAberto(v => !v)}
          aria-expanded={aberto}
        >
          <span className="material-icons text-[16px] shrink-0" style={{ color: cfg.color }}>
            {grupo.icon}
          </span>
          <span className="text-[12px] font-semibold truncate" style={{ color: cfg.color }}>
            {grupo.titulo}
            <span className="font-medium text-gray-500"> — {pluralProdutos(qtd)}</span>
          </span>
          <span className="material-icons text-[18px] text-gray-400 shrink-0 ml-auto">
            {aberto ? "expand_less" : "expand_more"}
          </span>
        </button>
        {grupo.onVerTodos ? (
          <button
            type="button"
            onClick={grupo.onVerTodos}
            className="text-[11px] font-semibold shrink-0 px-2 py-1 rounded-md hover:bg-white/70"
            style={{ color: cfg.color }}
            title="Ver na lista de produtos"
          >
            Ver lista
          </button>
        ) : null}
      </div>

      {aberto ? (
        <ul className="border-t px-3 py-2 space-y-2" style={{ borderColor: cfg.border }}>
          {visiveis.map(it => {
            if (it.onClick) {
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={it.onClick}
                    className="w-full text-left rounded-md px-2 py-1.5 hover:bg-white/80 cursor-pointer"
                  >
                    <div className="text-[12px] font-medium text-gray-800 truncate">{it.titulo}</div>
                    {it.detalhe ? (
                      <div className="text-[11px] text-gray-600 leading-snug mt-0.5">{it.detalhe}</div>
                    ) : null}
                  </button>
                </li>
              );
            }
            return (
              <li key={it.id} className="px-2 py-1.5">
                <div className="text-[12px] font-medium text-gray-800 truncate">{it.titulo}</div>
                {it.detalhe ? (
                  <div className="text-[11px] text-gray-600 leading-snug mt-0.5">{it.detalhe}</div>
                ) : null}
              </li>
            );
          })}
          {precisaRecolher && aberto ? (
            <li>
              <button
                type="button"
                onClick={() => setMostrarTodos(v => !v)}
                className="text-[11px] font-semibold px-2 py-1"
                style={{ color: cfg.color }}
              >
                {mostrarTodos ? "Mostrar menos" : `Mostrar mais ${qtd - PREVIEW}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export function InsumosAlertasCentral({
  grupos,
  highlightId,
  emptyExtra,
}: {
  grupos: AlertaCentralGrupo[];
  highlightId?: string | null;
  emptyExtra?: ReactNode;
}) {
  const gruposComItens = grupos.filter(g => g.itens.length > 0);
  const total = gruposComItens.reduce((s, g) => s + g.itens.length, 0);
  const selo = seloPendencias(total);

  return (
    <SectionCard
      title="Alertas de Estoque"
      icon="notifications_active"
      action={
        <span
          className="text-[11px] font-bold rounded-full px-2.5 py-0.5 text-white"
          style={{ backgroundColor: selo.color }}
        >
          {selo.text}
        </span>
      }
    >
      {total === 0 ? (
        <div className="p-8 text-center">
          <span className="material-icons text-3xl" style={{ color: GREEN }}>
            check_circle
          </span>
          <p className="text-[13px] text-gray-600 mt-2 font-medium">
            Nenhuma pendência de estoque no momento.
          </p>
          {emptyExtra}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {gruposComItens.map(g => (
            <GrupoAlerta key={g.id} grupo={g} highlight={highlightId === g.id} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
