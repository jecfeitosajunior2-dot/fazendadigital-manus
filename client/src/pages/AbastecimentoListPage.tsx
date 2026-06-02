import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla: "Arla",
};

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: {
  key: string;
  label: string;
  align: ColAlign;
  width: string;
}[] = [
  { key: "maquina", label: "Máquina", align: "left", width: "11%" },
  { key: "tipo", label: "Tipo de Máquina", align: "left", width: "9%" },
  { key: "combustivel", label: "Combustível", align: "left", width: "8%" },
  { key: "data", label: "Data", align: "left", width: "8%" },
  { key: "qtd", label: "Qtd (L)", align: "right", width: "7%" },
  { key: "valorL", label: "Valor (L)", align: "right", width: "7%" },
  { key: "valorTotal", label: "Valor Total", align: "right", width: "8%" },
  { key: "odometro", label: "Leitura Odômetro", align: "right", width: "9%" },
  { key: "estoque", label: "Estoque de Origem", align: "left", width: "10%" },
  { key: "naFazenda", label: "Abastecido na Fazenda", align: "center", width: "8%" },
  { key: "responsavel", label: "Responsável", align: "left", width: "9%" },
  { key: "obs", label: "Observações", align: "left", width: "8%" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

function formatNum(value: unknown, decimals = 2): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function AbastecimentoListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtroMaquina, setFiltroMaquina] = useState("");
  const [filtroCombustivel, setFiltroCombustivel] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");

  const { data: registros = [], isLoading } = trpc.abastecimentos.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.abastecimentos.delete.useMutation({
    onSuccess: () => {
      toast.success("Abastecimento excluído!");
      utils.abastecimentos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const maquinaMap = useMemo(() => {
    const m = new Map<number, (typeof maquinas)[0]>();
    maquinas.forEach(item => m.set(item.id, item));
    return m;
  }, [maquinas]);

  const fazendaMap = useMemo(() => {
    const m = new Map<number, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registros.filter(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const fazendaNome = r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : "";
      const dataStr = r.data ? new Date(String(r.data)).toISOString().slice(0, 10) : "";

      if (filtroMaquina && String(r.maquinaId) !== filtroMaquina) return false;
      if (filtroCombustivel && r.combustivel !== filtroCombustivel) return false;
      if (filtroDataInicio && dataStr < filtroDataInicio) return false;
      if (filtroDataFim && dataStr > filtroDataFim) return false;

      if (!q) return true;
      return [
        maquina?.nome,
        maquina?.tipo,
        r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "",
        r.responsavel,
        fazendaNome,
        r.observacoes,
      ].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [registros, search, filtroMaquina, filtroCombustivel, filtroDataInicio, filtroDataFim, maquinaMap, fazendaMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const exportHeaders = TABLE_COLUMNS.map(c => c.label);
  const exportData = filtered.map(r => {
    const maquina = maquinaMap.get(r.maquinaId);
    return [
      maquina?.nome ?? "",
      maquina?.tipo ?? "",
      r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "",
      formatDate(r.data),
      formatNum(r.litros),
      formatNum(r.valorLitro, 3),
      formatNum(r.valorTotal),
      r.horimetro ?? "",
      r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : "",
      r.abastecidoNaFazenda ? "Sim" : "Não",
      r.responsavel ?? "",
      r.observacoes ?? "",
    ];
  });

  return (
    <AppLayout>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-gray-800">Abastecimentos</h1>
          <ListExportButtons
            title="Abastecimentos"
            filename="abastecimentos"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={4}
          />
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/40 min-h-[56px]">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/abastecimento/cadastro")}
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-4 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-white shrink-0 shadow-sm hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px] leading-none">add</span>
            Novo Abastecimento
          </button>
          <div className="relative shrink-0">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-gray-400 pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar..."
              className="h-9 pl-9 pr-3 text-[12px] border border-gray-200 rounded-lg w-56 bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4] transition"
            />
          </div>
        </div>

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
            <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Máquina</label>
                <select
                  value={filtroMaquina}
                  onChange={e => { setFiltroMaquina(e.target.value); setPage(1); }}
                  className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">Todas</option>
                  {maquinas.map(m => (
                    <option key={m.id} value={String(m.id)}>{m.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Combustível</label>
                <select
                  value={filtroCombustivel}
                  onChange={e => { setFiltroCombustivel(e.target.value); setPage(1); }}
                  className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white"
                >
                  <option value="">Todos</option>
                  {Object.entries(COMBUSTIVEL_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Data início</label>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={e => { setFiltroDataInicio(e.target.value); setPage(1); }}
                  className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Data fim</label>
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={e => { setFiltroDataFim(e.target.value); setPage(1); }}
                  className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white"
                />
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] table-fixed border-collapse">
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
                <th className="px-2 py-3 align-middle w-[72px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 text-center text-[12px] text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 text-center text-[12px] text-gray-400">
                    Nenhum abastecimento registrado.
                  </td>
                </tr>
              )}
              {pageItems.map(r => {
                const maquina = maquinaMap.get(r.maquinaId);
                return (
                  <tr key={r.id} className="group h-[52px] hover:bg-[#4ECDC4]/[0.06] transition-colors">
                    <td className="px-3 align-middle text-[12px] font-medium text-gray-800 truncate" title={maquina?.nome}>
                      {maquina?.nome ?? `#${r.maquinaId}`}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 capitalize truncate">
                      {maquina?.tipo ?? "—"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600">
                      {r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "—"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 tabular-nums whitespace-nowrap">
                      {formatDate(r.data)}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-700 text-right tabular-nums">
                      {formatNum(r.litros)}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-700 text-right tabular-nums">
                      {formatNum(r.valorLitro, 3)}
                    </td>
                    <td className="px-3 align-middle text-[12px] font-semibold text-gray-800 text-right tabular-nums">
                      {formatNum(r.valorTotal)}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 text-right tabular-nums">
                      {r.horimetro ? formatNum(r.horimetro) : "—"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 truncate" title={r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : ""}>
                      {r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "—" : "—"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 text-center">
                      {r.abastecidoNaFazenda ? "Sim" : "Não"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-600 truncate" title={r.responsavel ?? ""}>
                      {r.responsavel || "—"}
                    </td>
                    <td className="px-3 align-middle text-[12px] text-gray-500 truncate" title={r.observacoes ?? ""}>
                      {r.observacoes || "—"}
                    </td>
                    <td className="px-2 align-middle">
                      <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`)}
                          className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-white hover:text-[#0f766e] hover:shadow-sm border border-transparent hover:border-gray-200 transition"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <span className="material-icons text-[16px] leading-none">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir este abastecimento?")) deleteMutation.mutate({ id: r.id });
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
              <span
                className="grid place-items-center min-w-7 h-7 px-2 rounded-md font-semibold tabular-nums"
                style={{ backgroundColor: FD_PRIMARY, color: "#0f3d3a" }}
              >
                {page}
              </span>
              <span className="text-gray-400">de {totalPages}</span>
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

export { AbastecimentoListPage };
