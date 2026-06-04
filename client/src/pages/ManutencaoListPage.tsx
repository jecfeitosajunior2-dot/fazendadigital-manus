import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/date-utils";

const FD_PRIMARY = "#4ECDC4";

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const STATUS_STYLE: Record<string, string> = {
  agendada: "bg-amber-50 text-amber-600 border border-amber-100",
  em_andamento: "bg-blue-50 text-blue-600 border border-blue-100",
  concluida: "bg-emerald-50 text-emerald-600 border border-emerald-100",
};

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: { key: string; label: string; align: ColAlign; width: string }[] = [
  { key: "maquina", label: "Máquina", align: "left", width: "13%" },
  { key: "tipo", label: "Tipo", align: "left", width: "9%" },
  { key: "data", label: "Data", align: "left", width: "9%" },
  { key: "odometro", label: "Odômetro", align: "right", width: "9%" },
  { key: "pecas", label: "Peças (R$)", align: "right", width: "10%" },
  { key: "maoObra", label: "Mão de obra (R$)", align: "right", width: "11%" },
  { key: "total", label: "Total (R$)", align: "right", width: "10%" },
  { key: "prestador", label: "Prestador", align: "left", width: "12%" },
  { key: "proxima", label: "Próxima", align: "left", width: "9%" },
  { key: "status", label: "Status", align: "center", width: "8%" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

type Filtros = {
  tipo: string;
  maquinaId: string;
  status: string;
  dataInicio: string;
  dataFim: string;
};

const FILTROS_VAZIOS: Filtros = {
  tipo: "",
  maquinaId: "",
  status: "",
  dataInicio: "",
  dataFim: "",
};

function formatNum(value: unknown, decimals = 2): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function dataISO(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : "";
}

export default function ManutencaoListPage() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtrosRascunho, setFiltrosRascunho] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);

  const { data: registros = [], isLoading } = trpc.manutencoes.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.manutencoes.delete.useMutation({
    onSuccess: () => {
      toast.success("Manutenção excluída!");
      utils.manutencoes.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const maquinaMap = useMemo(() => {
    const m = new Map<number, (typeof maquinas)[0]>();
    maquinas.forEach(item => m.set(item.id, item));
    return m;
  }, [maquinas]);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    registros.forEach(r => { if (r.tipo?.trim()) set.add(r.tipo.trim()); });
    return Array.from(set).sort();
  }, [registros]);

  const filtered = useMemo(() => {
    return registros.filter(r => {
      const dataStr = dataISO(r.data);
      if (aplicados.tipo && r.tipo !== aplicados.tipo) return false;
      if (aplicados.maquinaId && String(r.maquinaId) !== aplicados.maquinaId) return false;
      if (aplicados.status && r.status !== aplicados.status) return false;
      if (aplicados.dataInicio && dataStr < aplicados.dataInicio) return false;
      if (aplicados.dataFim && dataStr > aplicados.dataFim) return false;
      return true;
    });
  }, [registros, aplicados]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const aplicarFiltros = () => {
    setAplicados({ ...filtrosRascunho });
    setPage(1);
  };

  const limparFiltros = () => {
    setFiltrosRascunho(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setPage(1);
  };

  const exportHeaders = TABLE_COLUMNS.map(c => c.label).concat("Descrição");
  const exportData = filtered.map(r => {
    const maquina = maquinaMap.get(r.maquinaId);
    return [
      maquina?.nome ?? `#${r.maquinaId}`,
      r.tipo ?? "",
      formatDateBR(r.data),
      r.horimetro ? formatNum(r.horimetro) : "",
      formatNum(r.valorPecas),
      formatNum(r.valorMaoObra),
      formatNum(r.valorTotal),
      r.prestadorNome ?? "",
      r.proximaManutencao ? formatDateBR(r.proximaManutencao) : "",
      r.status ? STATUS_LABEL[r.status] ?? r.status : "",
      r.descricao ?? "",
    ];
  });

  return (
    <AppLayout>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-gray-800">Manutenções</h1>
          <ListExportButtons
            title="Manutenções"
            filename="manutencoes"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={3}
          />
        </div>

        {/* Nova manutenção */}
        <div className="px-5 py-3 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/manutencao/cadastro")}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Nova Manutenção
          </button>
        </div>

        {/* Filtros */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFiltrosAbertos(o => !o)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50/60 transition"
          >
            <span className="text-[13px] font-semibold text-gray-800">Filtros</span>
            <span className="material-icons text-[20px] text-gray-400">
              {filtrosAbertos ? "expand_less" : "chevron_right"}
            </span>
          </button>

          {filtrosAbertos && (
            <div className="px-5 pb-4 border-t border-gray-50 pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Máquina</label>
                  <select
                    value={filtrosRascunho.maquinaId}
                    onChange={e => setFiltrosRascunho(f => ({ ...f, maquinaId: e.target.value }))}
                    className="w-full h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                  >
                    <option value="">Selecione a máquina</option>
                    {maquinas.map(m => (
                      <option key={m.id} value={String(m.id)}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Tipo</label>
                  <select
                    value={filtrosRascunho.tipo}
                    onChange={e => setFiltrosRascunho(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                  >
                    <option value="">Todos os tipos</option>
                    {tipos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Status</label>
                  <select
                    value={filtrosRascunho.status}
                    onChange={e => setFiltrosRascunho(f => ({ ...f, status: e.target.value }))}
                    className="w-full h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                  >
                    <option value="">Todos os status</option>
                    <option value="agendada">Agendada</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Data da manutenção</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={filtrosRascunho.dataInicio}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, dataInicio: e.target.value }))}
                      className="flex-1 h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                    />
                    <span className="text-[12px] text-gray-500 shrink-0">até</span>
                    <input
                      type="date"
                      value={filtrosRascunho.dataFim}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, dataFim: e.target.value }))}
                      className="flex-1 h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={aplicarFiltros}
                  className="h-9 px-6 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-white transition hover:brightness-95"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="h-9 px-6 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 transition"
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] table-fixed border-collapse text-[11px]">
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: "72px" }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-y border-gray-200">
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-3 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-[0.04em] whitespace-nowrap",
                      alignClass[col.align]
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-0.5", col.align === "right" && "justify-end w-full")}>
                      {col.label}
                      <span className="material-icons text-[13px] text-gray-300 leading-none">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-2 py-3 w-[72px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 text-center text-gray-400">
                    Nenhuma manutenção registrada.
                  </td>
                </tr>
              )}
              {pageItems.map(r => {
                const maquina = maquinaMap.get(r.maquinaId);
                return (
                  <tr key={r.id} className="group h-[48px] hover:bg-[#4ECDC4]/[0.06] transition-colors">
                    <td className="px-3 align-middle font-medium text-gray-800 truncate" title={maquina?.nome}>
                      {maquina?.nome ?? `#${r.maquinaId}`}
                    </td>
                    <td className="px-3 align-middle text-gray-600 truncate">{r.tipo ?? "—"}</td>
                    <td className="px-3 align-middle text-gray-600 tabular-nums whitespace-nowrap">
                      {formatDateBR(r.data)}
                    </td>
                    <td className="px-3 align-middle text-gray-600 text-right tabular-nums">
                      {r.horimetro ? formatNum(r.horimetro) : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums">
                      {formatNum(r.valorPecas)}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums">
                      {formatNum(r.valorMaoObra)}
                    </td>
                    <td className="px-3 align-middle text-gray-800 font-semibold text-right tabular-nums">
                      {formatNum(r.valorTotal)}
                    </td>
                    <td className="px-3 align-middle text-gray-600 truncate" title={r.prestadorNome ?? ""}>
                      {r.prestadorNome || "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 tabular-nums whitespace-nowrap">
                      {r.proximaManutencao ? formatDateBR(r.proximaManutencao) : "—"}
                    </td>
                    <td className="px-3 align-middle text-center">
                      {r.status ? (
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold", STATUS_STYLE[r.status] ?? "bg-gray-50 text-gray-500")}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 align-middle">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setLocation(`/maquinas/manutencao/cadastro?id=${r.id}`)}
                          className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-white hover:text-[#0f766e] hover:shadow-sm border border-transparent hover:border-gray-200 transition"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <span className="material-icons text-[16px] leading-none">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir esta manutenção?")) deleteMutation.mutate({ id: r.id });
                          }}
                          className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 transition"
                          aria-label="Excluir"
                          title="Excluir"
                        >
                          <span className="material-icons text-[16px] leading-none">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500">
          <span>{pageSize} itens por página</span>
          <div className="flex items-center gap-4">
            <span className="tabular-nums">
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="grid place-items-center w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 transition"
              >
                <span className="material-icons text-[16px] leading-none">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "grid place-items-center min-w-7 h-7 px-2 rounded-md text-[12px] font-semibold tabular-nums transition",
                    p === page ? "text-[#0f3d3a]" : "text-gray-500 hover:bg-gray-100"
                  )}
                  style={p === page ? { backgroundColor: FD_PRIMARY } : undefined}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="grid place-items-center w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 transition"
              >
                <span className="material-icons text-[16px] leading-none">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export { ManutencaoListPage };
