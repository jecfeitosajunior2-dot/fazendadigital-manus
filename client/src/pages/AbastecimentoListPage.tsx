import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import MobileCard from "@/components/MobileCard";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";
import { resolveValoresAbastecimento } from "@/lib/combustivel-estoque";

const FD_PRIMARY = "#4ECDC4";

const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla: "Arla",
};

type ColAlign = "left" | "right" | "center";

type DisplayCol = {
  key: string;
  label: string;
  align: ColAlign;
  /** Esconde primeiro em telas médias (ex.: Tipo). */
  hideBelowXl?: boolean;
};

const DISPLAY_COLUMNS: DisplayCol[] = [
  { key: "data", label: "Data", align: "left" },
  { key: "maquina", label: "Máquina", align: "left" },
  { key: "tipo", label: "Tipo", align: "left", hideBelowXl: true },
  { key: "combustivel", label: "Combustível", align: "left" },
  { key: "qtd", label: "Quantidade", align: "right" },
  { key: "valorL", label: "Valor por litro", align: "right" },
  { key: "valorTotal", label: "Valor total", align: "right" },
  { key: "odometro", label: "Horímetro / Quilometragem", align: "right" },
  { key: "responsavel", label: "Responsável", align: "left" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

type Filtros = {
  tipoMaquina: string;
  maquinaId: string;
  dataInicio: string;
  dataFim: string;
};

const FILTROS_VAZIOS: Filtros = {
  tipoMaquina: "",
  maquinaId: "",
  dataInicio: "",
  dataFim: "",
};

function formatDate(value: unknown): string {
  if (!value) return "—";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/** Extrai YYYY-MM-DD sem deslocar timezone. */
function toDateKey(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function formatNum(value: unknown, decimals = 2): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatMoney(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export default function AbastecimentoListPage() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtrosRascunho, setFiltrosRascunho] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);

  const { data: registros = [], isLoading, refetch } = trpc.abastecimentos.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: movimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery();
  const utils = trpc.useUtils();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast.success("Atualizado!");
    },
    enabled: true,
  });

  const deleteMutation = trpc.abastecimentos.delete.useMutation({
    onSuccess: () => {
      toast.success("Abastecimento excluído!");
      utils.abastecimentos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const irParaCadastro = () => setLocation("/maquinas/abastecimento/cadastro");

  const maquinaMap = useMemo(() => {
    const m = new Map<number, (typeof maquinas)[0]>();
    maquinas.forEach(item => m.set(item.id, item));
    return m;
  }, [maquinas]);

  const maquinasOrdenadas = useMemo(
    () => [...maquinas].sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")),
    [maquinas],
  );

  const tiposMaquina = useMemo(() => {
    const set = new Set<string>();
    maquinasOrdenadas.forEach(m => {
      if (m.tipo?.trim()) set.add(m.tipo.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [maquinasOrdenadas]);

  const maquinasOpcoes = useMemo(() => {
    if (!filtrosRascunho.tipoMaquina) return maquinasOrdenadas;
    return maquinasOrdenadas.filter(m => m.tipo === filtrosRascunho.tipoMaquina);
  }, [maquinasOrdenadas, filtrosRascunho.tipoMaquina]);

  const onChangeTipo = (tipo: string) => {
    setFiltrosRascunho(f => {
      const next = { ...f, tipoMaquina: tipo };
      if (f.maquinaId) {
        const m = maquinasOrdenadas.find(x => String(x.id) === f.maquinaId);
        if (!m || (tipo && m.tipo !== tipo)) next.maquinaId = "";
      }
      return next;
    });
  };

  const filtered = useMemo(() => {
    return registros.filter(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const dataStr = toDateKey(r.data);

      if (aplicados.tipoMaquina && maquina?.tipo !== aplicados.tipoMaquina) return false;
      if (aplicados.maquinaId && String(r.maquinaId) !== aplicados.maquinaId) return false;
      if (aplicados.dataInicio && dataStr && dataStr < aplicados.dataInicio) return false;
      if (aplicados.dataFim && dataStr && dataStr > aplicados.dataFim) return false;
      return true;
    });
  }, [registros, aplicados, maquinaMap]);

  const precisaPaginacao = filtered.length > pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = precisaPaginacao
    ? filtered.slice((page - 1) * pageSize, page * pageSize)
    : filtered;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const aplicarFiltros = () => {
    setAplicados({ ...filtrosRascunho });
    setPage(1);
  };

  const limparFiltros = () => {
    setFiltrosRascunho(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setPage(1);
  };

  const exportHeaders = [
    "Data",
    "Máquina",
    "Tipo",
    "Combustível",
    "Quantidade (L)",
    "Valor por litro",
    "Valor total",
    "Horímetro / Quilometragem",
    "Responsável",
  ];
  const exportData = filtered.map(r => {
    const maquina = maquinaMap.get(r.maquinaId);
    const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
    return [
      formatDate(r.data),
      maquina?.nome ?? "",
      maquina?.tipo ?? "",
      r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "",
      formatNum(r.litros),
      valorLitro != null ? formatNum(valorLitro, 2) : "",
      valorTotal != null ? formatNum(valorTotal) : "",
      r.horimetro ? formatNum(r.horimetro) : "",
      r.responsavel ?? "",
    ];
  });

  const emptyTotal = !isLoading && registros.length === 0;
  const emptyFiltro = !isLoading && registros.length > 0 && filtered.length === 0;
  // Filtros só aparecem quando já existe pelo menos um abastecimento cadastrado
  const mostrarFiltros = !isLoading && registros.length > 0;
  const exportDisabled = !isLoading && exportData.length === 0;

  const labelClass = "block text-[11px] font-medium text-gray-600 mb-2";
  const fieldClass =
    "w-full h-9 px-3 text-[12px] border border-gray-300 rounded bg-white text-gray-700 focus:outline-none focus:border-[#4ECDC4]";

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div ref={containerRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Cabeçalho compacto: título + ações */}
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold text-gray-900 leading-tight">Abastecimentos</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={irParaCadastro}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white shadow-sm hover:brightness-95 active:scale-[0.97] transition min-h-[44px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[18px]">add</span>
              Novo abastecimento
            </button>
            <ListExportButtons
              title="Abastecimentos"
              filename="abastecimentos"
              headers={exportHeaders}
              rows={exportData}
              variant="secondary"
              alignRightFrom={4}
              disabled={exportDisabled}
              disabledTitle="Nenhum abastecimento disponível para exportação."
            />
          </div>
        </div>

        {/* Filtros — ocultos só quando o sistema não tem nenhum abastecimento */}
        {mostrarFiltros && (
          <div className="border-b border-gray-100">
            <button
              type="button"
              onClick={() => setFiltrosAbertos(o => !o)}
              className="w-full px-6 py-2.5 flex items-center justify-between text-left hover:bg-gray-50/60 transition"
            >
              <span className="text-[12px] font-semibold text-gray-800 flex items-center gap-1.5">
                <span className="material-icons text-[16px] text-gray-400">tune</span>
                Filtros
              </span>
              <span className="material-icons text-[18px] text-gray-400">
                {filtrosAbertos ? "expand_less" : "expand_more"}
              </span>
            </button>

            {filtrosAbertos && (
              <div className="px-6 pb-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
                  <div className="xl:col-span-3">
                    <label className={labelClass}>Tipo de máquina</label>
                    <select
                      value={filtrosRascunho.tipoMaquina}
                      onChange={e => onChangeTipo(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Todos os tipos</option>
                      {tiposMaquina.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="xl:col-span-3">
                    <label className={labelClass}>Máquina</label>
                    <select
                      value={filtrosRascunho.maquinaId}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, maquinaId: e.target.value }))}
                      className={fieldClass}
                    >
                      <option value="">Todas as máquinas</option>
                      {maquinasOpcoes.map(m => (
                        <option key={m.id} value={String(m.id)}>
                          {m.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="xl:col-span-2">
                    <label className={labelClass}>Data inicial</label>
                    <input
                      type="date"
                      value={filtrosRascunho.dataInicio}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, dataInicio: e.target.value }))}
                      className={fieldClass}
                      title="Período do abastecimento — data inicial"
                    />
                  </div>
                  <div className="xl:col-span-2">
                    <label className={labelClass}>Data final</label>
                    <input
                      type="date"
                      value={filtrosRascunho.dataFim}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, dataFim: e.target.value }))}
                      className={fieldClass}
                      title="Período do abastecimento — data final"
                    />
                  </div>
                  <div className="xl:col-span-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={aplicarFiltros}
                      className="inline-flex items-center justify-center px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 active:scale-[0.97] transition min-h-9"
                      style={{ backgroundColor: FD_PRIMARY }}
                    >
                      Filtrar
                    </button>
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="inline-flex items-center justify-center px-4 rounded-lg text-[12px] font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:scale-[0.97] transition min-h-9"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
                <p className="sr-only">Período do abastecimento</p>
              </div>
            )}
          </div>
        )}

        {/* Cards no mobile */}
        <div className="lg:hidden px-4 py-3 space-y-3">
          {isLoading && (
            <div className="py-8 text-center text-gray-400 text-[13px]">Carregando...</div>
          )}
          {emptyTotal && <EmptyTotal />}
          {emptyFiltro && <EmptyFiltro />}
          {!isLoading &&
            pageItems.map(r => {
              const maquina = maquinaMap.get(r.maquinaId);
              const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
              return (
                <MobileCard
                  key={r.id}
                  title={maquina?.nome ?? `#${r.maquinaId}`}
                  subtitle={
                    [
                      r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "",
                      formatDate(r.data),
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  badge={
                    valorTotal != null ? (
                      <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
                        {formatMoney(valorTotal)}
                      </span>
                    ) : undefined
                  }
                  fields={[
                    { label: "Quantidade", value: formatNum(r.litros) !== "—" ? `${formatNum(r.litros)} L` : "" },
                    {
                      label: "Valor por litro",
                      value: valorLitro != null ? formatMoney(valorLitro) : "",
                    },
                    {
                      label: "Horímetro / Quilometragem",
                      value: r.horimetro ? formatNum(r.horimetro) : "",
                    },
                    { label: "Responsável", value: r.responsavel || "" },
                  ]}
                  actions={[
                    {
                      icon: "edit",
                      label: "Editar",
                      onClick: () => setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`),
                    },
                    {
                      icon: "delete",
                      label: "Excluir",
                      variant: "danger",
                      onClick: () => {
                        if (confirm("Excluir este abastecimento?")) deleteMutation.mutate({ id: r.id });
                      },
                    },
                  ]}
                />
              );
            })}
        </div>

        {/* Tabela no desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-gray-50/80 border-y border-gray-200">
                {DISPLAY_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-[0.04em] whitespace-nowrap",
                      alignClass[col.align],
                      col.hideBelowXl && "hidden xl:table-cell",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-2 py-2.5 w-[72px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={DISPLAY_COLUMNS.length + 1} className="px-4 py-12 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {emptyTotal && (
                <tr>
                  <td colSpan={DISPLAY_COLUMNS.length + 1} className="px-4 py-6">
                    <EmptyTotal />
                  </td>
                </tr>
              )}
              {emptyFiltro && (
                <tr>
                  <td colSpan={DISPLAY_COLUMNS.length + 1} className="px-4 py-8">
                    <EmptyFiltro />
                  </td>
                </tr>
              )}
              {pageItems.map(r => {
                const maquina = maquinaMap.get(r.maquinaId);
                const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);

                return (
                  <tr key={r.id} className="group h-11 hover:bg-[#4ECDC4]/[0.06] transition-colors">
                    <td className="px-3 align-middle text-gray-600 tabular-nums whitespace-nowrap">
                      {formatDate(r.data)}
                    </td>
                    <td className="px-3 align-middle font-medium text-gray-800 truncate max-w-[160px]" title={maquina?.nome}>
                      {maquina?.nome ?? `#${r.maquinaId}`}
                    </td>
                    <td className="px-3 align-middle text-gray-600 capitalize truncate hidden xl:table-cell">
                      {maquina?.tipo ?? "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 capitalize">
                      {r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums whitespace-nowrap">
                      {formatNum(r.litros) !== "—" ? `${formatNum(r.litros)} L` : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums whitespace-nowrap">
                      {formatMoney(valorLitro)}
                    </td>
                    <td className="px-3 align-middle text-gray-800 font-semibold text-right tabular-nums whitespace-nowrap">
                      {formatMoney(valorTotal)}
                    </td>
                    <td className="px-3 align-middle text-gray-600 text-right tabular-nums">
                      {r.horimetro ? formatNum(r.horimetro) : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 truncate max-w-[120px]" title={r.responsavel ?? ""}>
                      {r.responsavel || "—"}
                    </td>
                    <td className="px-2 align-middle">
                      <div className="flex items-center justify-end gap-0.5 opacity-80 sm:opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`)}
                          className="grid place-items-center rounded-md text-gray-500 hover:bg-white hover:text-[#0f766e] hover:shadow-sm border border-transparent hover:border-gray-200 active:scale-95 transition"
                          style={{ minWidth: 36, minHeight: 36 }}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <span className="material-icons text-[17px] leading-none">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir este abastecimento?")) deleteMutation.mutate({ id: r.id });
                          }}
                          className="grid place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 active:scale-95 transition"
                          style={{ minWidth: 36, minHeight: 36 }}
                          aria-label="Excluir"
                          title="Excluir"
                        >
                          <span className="material-icons text-[17px] leading-none">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rodapé / paginação */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
            <span className="tabular-nums">
              {precisaPaginacao
                ? `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} abastecimentos`
                : `Mostrando ${filtered.length} ${filtered.length === 1 ? "abastecimento" : "abastecimentos"}`}
            </span>
            {precisaPaginacao && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="grid place-items-center rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 active:scale-95 transition"
                  style={{ minWidth: 36, minHeight: 36 }}
                >
                  <span className="material-icons text-[18px] leading-none">chevron_left</span>
                </button>
                <span className="px-2 tabular-nums text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="grid place-items-center rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 active:scale-95 transition"
                  style={{ minWidth: 36, minHeight: 36 }}
                >
                  <span className="material-icons text-[18px] leading-none">chevron_right</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EmptyTotal() {
  return (
    <div className="text-center py-1">
      <img
        src="/assets/icon-maquina-trator-green.png"
        alt=""
        width={40}
        height={40}
        className="mx-auto mb-3"
        aria-hidden
        style={{
          objectFit: "contain",
          /* Tom cinza-azulado padrão dos estados vazios de insumos */
          filter:
            "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
        }}
      />
      <p className="text-[13px] font-medium text-gray-700">Nenhum abastecimento registrado.</p>
      <p className="text-[12px] text-gray-500 mt-1.5 max-w-md mx-auto">
        Registre o primeiro abastecimento para acompanhar consumo, custos e uso das máquinas.
      </p>
    </div>
  );
}

function EmptyFiltro() {
  return (
    <div className="text-center py-2">
      <p className="text-[13px] text-gray-600">
        Nenhum abastecimento encontrado com os filtros aplicados.
      </p>
    </div>
  );
}

export { AbastecimentoListPage };
