import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
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

const TABLE_COLUMNS: { key: string; label: string; align: ColAlign; width: string }[] = [
  { key: "maquina", label: "Máquina", align: "left", width: "10%" },
  { key: "tipo", label: "Tipo de Máquina", align: "left", width: "9%" },
  { key: "combustivel", label: "Combustível", align: "left", width: "8%" },
  { key: "data", label: "Data", align: "left", width: "7%" },
  { key: "qtd", label: "Qtd (L)", align: "right", width: "7%" },
  { key: "valorL", label: "Valor (L)", align: "right", width: "7%" },
  { key: "valorTotal", label: "Valor Total", align: "right", width: "8%" },
  { key: "odometro", label: "Leitura Odômetro", align: "right", width: "8%" },
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
  // Datas vindas do banco chegam como string "YYYY-MM-DD".
  // new Date("YYYY-MM-DD") interpreta como UTC meia-noite, o que causa
  // regressão de 1 dia em fusos negativos (ex: UTC-3 do Brasil).
  // Solução: parsear manualmente para evitar qualquer conversão de timezone.
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  // Fallback para Date objects sem string ISO
  const d = new Date(str);
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
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtrosRascunho, setFiltrosRascunho] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);

  const { data: registros = [], isLoading } = trpc.abastecimentos.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: movimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery();
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

  const tiposMaquina = useMemo(() => {
    const set = new Set<string>();
    maquinas.forEach(m => { if (m.tipo?.trim()) set.add(m.tipo.trim()); });
    return Array.from(set).sort();
  }, [maquinas]);

  const maquinasFiltradasPorTipo = useMemo(() => {
    if (!filtrosRascunho.tipoMaquina) return maquinas;
    return maquinas.filter(m => m.tipo === filtrosRascunho.tipoMaquina);
  }, [maquinas, filtrosRascunho.tipoMaquina]);

  const filtered = useMemo(() => {
    return registros.filter(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const dataStr = r.data ? new Date(String(r.data)).toISOString().slice(0, 10) : "";

      if (aplicados.tipoMaquina && maquina?.tipo !== aplicados.tipoMaquina) return false;
      if (aplicados.maquinaId && String(r.maquinaId) !== aplicados.maquinaId) return false;
      if (aplicados.dataInicio && dataStr < aplicados.dataInicio) return false;
      if (aplicados.dataFim && dataStr > aplicados.dataFim) return false;
      return true;
    });
  }, [registros, aplicados, maquinaMap]);

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

  const exportHeaders = TABLE_COLUMNS.map(c => c.label);
  const exportData = filtered.map(r => {
    const maquina = maquinaMap.get(r.maquinaId);
    const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
    return [
      maquina?.nome ?? "",
      maquina?.tipo ?? "",
      r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "",
      formatDate(r.data),
      formatNum(r.litros),
      valorLitro != null ? formatNum(valorLitro, 3) : "",
      valorTotal != null ? formatNum(valorTotal) : "",
      r.horimetro ? formatNum(r.horimetro) : "",
      r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : "",
      r.abastecidoNaFazenda ? "Sim" : "Não",
      r.responsavel ?? "",
      r.observacoes ?? "",
    ];
  });

  return (
    <AppLayout>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Cabeçalho */}
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

        {/* Novo abastecimento */}
        <div className="px-5 py-3 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/abastecimento/cadastro")}
            className="inline-flex items-center gap-2 px-5 rounded-lg text-[12px] font-semibold uppercase tracking-wide text-white shadow-sm hover:brightness-95 active:scale-[0.97] transition"
            style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
          >
            <span className="material-icons text-[18px]">add</span>
            Novo Abastecimento
          </button>
        </div>

        {/* Filtros — igual iRancho */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFiltrosAbertos(o => !o)}
            className="w-full px-5 flex items-center justify-between text-left hover:bg-gray-50/60 active:bg-gray-100 transition"
            style={{ minHeight: 52 }}
          >
            <span className="text-[13px] font-semibold text-gray-800 flex items-center gap-2">
              <span className="material-icons text-[18px] text-gray-400">tune</span>
              Filtros
            </span>
            <span className="material-icons text-[20px] text-gray-400">
              {filtrosAbertos ? "expand_less" : "chevron_right"}
            </span>
          </button>

          {filtrosAbertos && (
            <div className="px-5 pb-4 border-t border-gray-50 pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Tipo de Maquinário</label>
                  <select
                    value={filtrosRascunho.tipoMaquina}
                    onChange={e => setFiltrosRascunho(f => ({ ...f, tipoMaquina: e.target.value, maquinaId: "" }))}
                    className="w-full h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                  >
                    <option value="">Selecione o tipo de maquinário</option>
                    {tiposMaquina.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Máquina</label>
                  <select
                    value={filtrosRascunho.maquinaId}
                    onChange={e => setFiltrosRascunho(f => ({ ...f, maquinaId: e.target.value }))}
                    className="w-full h-[42px] px-3 text-[13px] border border-gray-200 rounded-sm bg-[#EEEEEE] focus:outline-none focus:border-[#4ECDC4]"
                  >
                    <option value="">Selecione a máquina</option>
                    {maquinasFiltradasPorTipo.map(m => (
                      <option key={m.id} value={String(m.id)}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1.5">Data de Abastecimento</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={filtrosRascunho.dataInicio}
                      onChange={e => setFiltrosRascunho(f => ({ ...f, dataInicio: e.target.value }))}
                      placeholder="De"
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

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={aplicarFiltros}
                  className="flex-1 sm:flex-none px-6 rounded-lg text-[12px] font-semibold uppercase tracking-wide text-white transition hover:brightness-95 active:scale-[0.97]"
                  style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
                >
                  Filtrar
                </button>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="flex-1 sm:flex-none px-6 rounded-lg text-[12px] font-semibold uppercase tracking-wide text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 active:scale-[0.97] transition"
                  style={{ minHeight: 48 }}
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tabela plana — todas as colunas visíveis */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] table-fixed border-collapse text-[11px]">
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
                    Nenhum abastecimento registrado.
                  </td>
                </tr>
              )}
              {pageItems.map(r => {
                const maquina = maquinaMap.get(r.maquinaId);
                const fazendaNome = r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : "";
                const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);

                return (
                  <tr key={r.id} className="group h-[48px] hover:bg-[#4ECDC4]/[0.06] transition-colors">
                    <td className="px-3 align-middle font-medium text-gray-800 truncate" title={maquina?.nome}>
                      {maquina?.nome ?? `#${r.maquinaId}`}
                    </td>
                    <td className="px-3 align-middle text-gray-600 capitalize truncate">
                      {maquina?.tipo ?? "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 capitalize">
                      {r.combustivel ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 tabular-nums whitespace-nowrap">
                      {formatDate(r.data)}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums">
                      {formatNum(r.litros)}
                    </td>
                    <td className="px-3 align-middle text-gray-700 text-right tabular-nums">
                      {valorLitro != null ? formatNum(valorLitro, 2) : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-800 font-semibold text-right tabular-nums">
                      {valorTotal != null ? formatNum(valorTotal) : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 text-right tabular-nums">
                      {r.horimetro ? formatNum(r.horimetro) : "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 truncate" title={fazendaNome}>
                      {fazendaNome || "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 text-center">
                      {r.abastecidoNaFazenda ? "Sim" : "Não"}
                    </td>
                    <td className="px-3 align-middle text-gray-600 truncate" title={r.responsavel ?? ""}>
                      {r.responsavel || "—"}
                    </td>
                    <td className="px-3 align-middle text-gray-500 truncate" title={r.observacoes ?? ""}>
                      {r.observacoes || "—"}
                    </td>
                    <td className="px-2 align-middle">
                      <div className="flex items-center justify-end gap-1 opacity-80 sm:opacity-60 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`)}
                          className="grid place-items-center rounded-md text-gray-500 hover:bg-white hover:text-[#0f766e] hover:shadow-sm border border-transparent hover:border-gray-200 active:scale-95 transition"
                          style={{ minWidth: 40, minHeight: 40 }}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <span className="material-icons text-[18px] leading-none">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir este abastecimento?")) deleteMutation.mutate({ id: r.id });
                          }}
                          className="grid place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 active:scale-95 transition"
                          style={{ minWidth: 40, minHeight: 40 }}
                          aria-label="Excluir"
                          title="Excluir"
                        >
                          <span className="material-icons text-[18px] leading-none">delete</span>
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
        <div className="px-4 sm:px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
          <span className="hidden sm:inline">{pageSize} itens por página</span>
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-between sm:justify-end">
            <span className="tabular-nums text-[11px]">
              {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="grid place-items-center rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 active:scale-95 transition"
                style={{ minWidth: 40, minHeight: 40 }}
              >
                <span className="material-icons text-[18px] leading-none">chevron_left</span>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "grid place-items-center px-2 rounded-md text-[13px] font-semibold tabular-nums active:scale-95 transition",
                    p === page ? "text-[#0f3d3a]" : "text-gray-500 hover:bg-gray-100"
                  )}
                  style={p === page ? { backgroundColor: FD_PRIMARY, minWidth: 40, minHeight: 40 } : { minWidth: 40, minHeight: 40 }}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="grid place-items-center rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 enabled:hover:bg-gray-50 active:scale-95 transition"
                style={{ minWidth: 40, minHeight: 40 }}
              >
                <span className="material-icons text-[18px] leading-none">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export { AbastecimentoListPage };
