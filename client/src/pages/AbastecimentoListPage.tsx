import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { cn } from "@/lib/utils";
import { resolveValoresAbastecimento } from "@/lib/combustivel-estoque";

const FD_PRIMARY = "#4ECDC4";
const FD_PRIMARY_DARK = "#0f3d3a";

const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla: "Arla",
};

const COMBUSTIVEL_COLOR: Record<string, { bg: string; text: string }> = {
  diesel: { bg: "#FEF3C7", text: "#92400E" },
  gasolina: { bg: "#DBEAFE", text: "#1E40AF" },
  etanol: { bg: "#D1FAE5", text: "#065F46" },
  arla: { bg: "#EDE9FE", text: "#5B21B6" },
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

function formatCurrency(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Registro = {
  id: number;
  maquinaId: number;
  combustivel?: string | null;
  data?: Date | string | null;
  litros?: string | number | null;
  valorLitro?: string | number | null;
  valorTotal?: string | number | null;
  horimetro?: string | number | null;
  fazendaId?: number | null;
  abastecidoNaFazenda?: boolean | null;
  responsavel?: string | null;
  observacoes?: string | null;
};

function ExpandedRow({
  r,
  maquina,
  fazendaNome,
}: {
  r: Registro;
  maquina?: { nome?: string; tipo?: string } | null;
  fazendaNome: string;
}) {
  const items = [
    { label: "Tipo de Máquina", value: maquina?.tipo ?? "—" },
    { label: "Leitura Odômetro", value: r.horimetro ? `${formatNum(r.horimetro)} h` : "—" },
    { label: "Estoque de Origem", value: fazendaNome || "—" },
    { label: "Abastecido na Fazenda", value: r.abastecidoNaFazenda ? "Sim" : "Não" },
    { label: "Responsável", value: r.responsavel || "—" },
    { label: "Observações", value: r.observacoes || "—" },
  ];
  return (
    <tr>
      <td colSpan={7} className="px-0 pb-0">
        <div className="mx-4 mb-3 rounded-lg border border-gray-100 bg-gray-50/70 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2">
          {items.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-[12px] text-gray-700 truncate" title={String(value)}>{value}</p>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

export default function AbastecimentoListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [filtroMaquina, setFiltroMaquina] = useState("");
  const [filtroCombustivel, setFiltroCombustivel] = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim, setFiltroDataFim] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportHeaders = ["Máquina", "Tipo", "Combustível", "Data", "Qtd (L)", "Valor/L", "Valor Total", "Odômetro", "Estoque Origem", "Na Fazenda", "Responsável", "Observações"];
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

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold text-gray-900">Abastecimentos</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">Registro e histórico de abastecimentos de combustível</p>
          </div>
          <ListExportButtons
            title="Abastecimentos"
            filename="abastecimentos"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={4}
          />
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/40">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/abastecimento/cadastro")}
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-4 rounded-lg text-[12px] font-semibold text-white shadow-sm hover:brightness-95 active:scale-[0.97] transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px] leading-none">add</span>
            Novo Abastecimento
          </button>
          <div className="relative">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-gray-400 pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar..."
              className="h-9 pl-9 pr-3 text-[12px] border border-gray-200 rounded-lg w-56 bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4] transition"
            />
          </div>
        </div>

        {/* Filtros */}
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFiltrosAbertos(o => !o)}
            className="w-full px-6 py-2.5 flex items-center justify-between text-left hover:bg-gray-50/60 transition"
          >
            <span className="text-[12px] font-semibold text-gray-600">Filtros</span>
            <span className="material-icons text-[18px] text-gray-400 transition-transform duration-200" style={{ transform: filtrosAbertos ? "rotate(90deg)" : "rotate(0deg)" }}>
              chevron_right
            </span>
          </button>
          {filtrosAbertos && (
            <div className="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-gray-100 pt-3">
              {[
                {
                  label: "Máquina",
                  content: (
                    <select value={filtroMaquina} onChange={e => { setFiltroMaquina(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4]">
                      <option value="">Todas</option>
                      {maquinas.map(m => <option key={m.id} value={String(m.id)}>{m.nome}</option>)}
                    </select>
                  ),
                },
                {
                  label: "Combustível",
                  content: (
                    <select value={filtroCombustivel} onChange={e => { setFiltroCombustivel(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4]">
                      <option value="">Todos</option>
                      {Object.entries(COMBUSTIVEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ),
                },
                {
                  label: "Data início",
                  content: (
                    <input type="date" value={filtroDataInicio} onChange={e => { setFiltroDataInicio(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4]" />
                  ),
                },
                {
                  label: "Data fim",
                  content: (
                    <input type="date" value={filtroDataFim} onChange={e => { setFiltroDataFim(e.target.value); setPage(1); }}
                      className="w-full h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4]" />
                  ),
                },
              ].map(({ label, content }) => (
                <div key={label}>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
                  {content}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                {/* expand toggle col */}
                <th className="w-10 pl-4 pr-2 py-3" />
                {[
                  { label: "Máquina / Tipo", align: "left" },
                  { label: "Combustível", align: "left" },
                  { label: "Data", align: "left" },
                  { label: "Quantidade", align: "right" },
                  { label: "Valor / L", align: "right" },
                  { label: "Valor Total", align: "right" },
                ].map(col => (
                  <th
                    key={col.label}
                    className={cn(
                      "px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-[0.05em] whitespace-nowrap",
                      col.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                {/* actions col */}
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[12px] text-gray-400">
                    <span className="material-icons animate-spin text-[20px] text-gray-300 block mx-auto mb-2">refresh</span>
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <span className="material-icons text-[36px] text-gray-200 block mb-2">local_gas_station</span>
                    <p className="text-[13px] text-gray-400">Nenhum abastecimento registrado.</p>
                    <button
                      type="button"
                      onClick={() => setLocation("/maquinas/abastecimento/cadastro")}
                      className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold px-4 py-2 rounded-lg text-white transition hover:brightness-95"
                      style={{ backgroundColor: FD_PRIMARY }}
                    >
                      <span className="material-icons text-[15px]">add</span>
                      Registrar primeiro abastecimento
                    </button>
                  </td>
                </tr>
              )}
              {pageItems.map(r => {
                const maquina = maquinaMap.get(r.maquinaId);
                const fazendaNome = r.fazendaId ? fazendaMap.get(r.fazendaId) ?? "" : "";
                const isExpanded = expandedRows.has(r.id);
                const combColor = r.combustivel ? COMBUSTIVEL_COLOR[r.combustivel] : null;
                const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);

                return (
                  <>
                    <tr
                      key={r.id}
                      className={cn(
                        "group border-b border-gray-100 transition-colors cursor-pointer",
                        isExpanded ? "bg-[#4ECDC4]/[0.04]" : "hover:bg-gray-50/60"
                      )}
                      onClick={() => toggleRow(r.id)}
                    >
                      {/* expand icon */}
                      <td className="pl-4 pr-2 py-3.5 align-middle w-10">
                        <span
                          className="material-icons text-[16px] text-gray-400 transition-transform duration-200 block"
                          style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                        >
                          chevron_right
                        </span>
                      </td>

                      {/* Máquina / Tipo */}
                      <td className="px-4 py-3.5 align-middle min-w-[160px]">
                        <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">
                          {maquina?.nome ?? `#${r.maquinaId}`}
                        </p>
                        <p className="text-[11px] text-gray-400 capitalize mt-0.5 truncate">
                          {maquina?.tipo ?? "—"}
                        </p>
                      </td>

                      {/* Combustível */}
                      <td className="px-4 py-3.5 align-middle">
                        {r.combustivel ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={combColor ? { backgroundColor: combColor.bg, color: combColor.text } : {}}
                          >
                            {COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel}
                          </span>
                        ) : (
                          <span className="text-[12px] text-gray-400">—</span>
                        )}
                      </td>

                      {/* Data */}
                      <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                        <span className="text-[12px] text-gray-700 tabular-nums">{formatDate(r.data)}</span>
                      </td>

                      {/* Quantidade */}
                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        <span className="text-[12px] text-gray-700 tabular-nums">{formatNum(r.litros)} L</span>
                      </td>

                      {/* Valor / L */}
                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        <span className="text-[12px] text-gray-600 tabular-nums">
                          {valorLitro != null ? `R$ ${formatNum(valorLitro, 3)}` : "—"}
                        </span>
                      </td>

                      {/* Valor Total */}
                      <td className="px-4 py-3.5 align-middle text-right whitespace-nowrap">
                        <span className="text-[13px] font-semibold text-gray-800 tabular-nums">
                          {valorTotal != null ? formatCurrency(valorTotal) : "—"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`)}
                            className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-white hover:text-[#4ECDC4] border border-transparent hover:border-gray-200 transition"
                            title="Editar"
                          >
                            <span className="material-icons text-[15px] leading-none">edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Excluir este abastecimento?")) deleteMutation.mutate({ id: r.id });
                            }}
                            className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 transition"
                            title="Excluir"
                          >
                            <span className="material-icons text-[15px] leading-none">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {isExpanded && (
                      <ExpandedRow key={`exp-${r.id}`} r={r} maquina={maquina ? { nome: maquina.nome ?? undefined, tipo: maquina.tipo ?? undefined } : null} fazendaNome={fazendaNome} />
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400">
            {filtered.length === 0
              ? "Nenhum resultado"
              : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length} registros`}
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
              className="grid place-items-center min-w-7 h-7 px-2 rounded-md text-[12px] font-semibold tabular-nums"
              style={{ backgroundColor: FD_PRIMARY, color: FD_PRIMARY_DARK }}
            >
              {page}
            </span>
            <span className="text-[11px] text-gray-400">de {totalPages}</span>
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
    </AppLayout>
  );
}

export { AbastecimentoListPage };
