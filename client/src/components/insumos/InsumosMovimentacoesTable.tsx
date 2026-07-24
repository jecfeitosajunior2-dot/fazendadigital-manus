import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  agruparMovimentacoes,
  formatDataResumo,
  formatItensLabel,
  formatValorResumo,
  rotuloStatusMov,
  tipoBadgeClassMov,
  type MovimentacaoItemRaw,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";

const OVERVIEW_MAX_ROWS = 5;

type SortKey = "data" | "tipo" | "origemDestino" | "itens" | "valor" | "situacao";

type Props = {
  title: string;
  fazendaId: string;
  toolbar?: ReactNode;
};

export default function InsumosMovimentacoesTable({ title, fazendaId, toolbar }: Props) {
  const [, setLocation] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
    enabled: Boolean(fazendaId),
  });

  const resumos = useMemo(() => {
    if (!fazendaId) return [] as MovimentacaoResumo[];
    const daFazenda = (movimentacoes as MovimentacaoItemRaw[]).filter(
      m => String(m.fazendaId ?? m.produtoFazendaId ?? "") === fazendaId,
    );
    return agruparMovimentacoes(daFazenda);
  }, [movimentacoes, fazendaId]);

  const sorted = useMemo(() => {
    const rows = [...resumos];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "data":
          va = a.dataMovimentacao;
          vb = b.dataMovimentacao;
          break;
        case "tipo":
          va = a.tipo;
          vb = b.tipo;
          break;
        case "origemDestino":
          va = a.origemDestino;
          vb = b.origemDestino;
          break;
        case "itens":
          va = a.qtdItens;
          vb = b.qtdItens;
          break;
        case "valor":
          va = a.valorTotal ?? 0;
          vb = b.valorTotal ?? 0;
          break;
        case "situacao":
          va = a.status;
          vb = b.status;
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows.slice(0, OVERVIEW_MAX_ROWS);
  }, [resumos, sortKey, sortAsc]);

  const columns: [SortKey, string][] = [
    ["data", "Data"],
    ["tipo", "Tipo"],
    ["origemDestino", "Origem ou destino"],
    ["itens", "Itens"],
    ["valor", "Valor total"],
    ["situacao", "Situação"],
  ];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="material-icons text-[14px] text-gray-400 ml-1 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass =
    "px-4 py-3 text-[11px] font-semibold text-gray-700 uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none";

  const abrirMovimentacao = (resumo: MovimentacaoResumo) => {
    const params = new URLSearchParams();
    if (fazendaId) params.set("fazendaId", fazendaId);
    if (resumo.grupoId) params.set("grupoId", resumo.grupoId);
    else params.set("grupoId", resumo.movimentacaoId);
    setLocation(`/insumos/movimentacao?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="font-semibold text-gray-900 text-[16px]"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {title}
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Resumo das movimentações recentes — gestão completa em Movimentações
          </p>
        </div>
        {toolbar}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map(([key, label]) => (
                <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                  <span className="inline-flex items-center">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-400">
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-gray-400">
                  Sem movimentações registradas nesta fazenda
                </td>
              </tr>
            )}
            {sorted.map(resumo => (
              <tr
                key={resumo.movimentacaoId}
                className="border-b border-gray-100 hover:bg-gray-50/80 cursor-pointer transition-colors"
                onClick={() => abrirMovimentacao(resumo)}
                title="Ver na tela de Movimentações"
              >
                <td className="px-4 py-3 text-gray-800">{formatDataResumo(resumo.dataMovimentacao)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${tipoBadgeClassMov(resumo.tipo)}`}
                  >
                    {resumo.tipo}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-800">{resumo.origemDestino || "—"}</td>
                <td className="px-4 py-3 text-gray-700">{formatItensLabel(resumo.qtdItens)}</td>
                <td className="px-4 py-3 text-gray-800 tabular-nums font-medium">
                  {formatValorResumo(resumo.valorTotal)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                      resumo.status === "estornada"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {rotuloStatusMov(resumo.status === "estornada" ? "estornada" : "ativa")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
