/**
 * Mapa do Rebanho — cópia fiel do iRancho
 * Rota: /rebanho/mapa-rebanho
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import { useDebounce } from "@/hooks/useDebounce";
import { usePersistedState } from "@/hooks/usePersistedState";
import { FAIXAS_IDADE_LOTE } from "@shared/lote-faixas-idade";
import type { ContagemPorFaixa } from "@shared/lote-faixas-idade";

const IRANCHO_BTN_GREEN = "#2D5A5A";

const FILTERS_KEY = "fd:mapa-rebanho-filtros";

type FiltersState = {
  fazendaId: string;
  pastoId: string;
  search: string;
};

const INITIAL_FILTERS: FiltersState = {
  fazendaId: "",
  pastoId: "",
  search: "",
};

type MapaRow = {
  loteId: number;
  fazendaNome: string;
  subdivisaoNome: string;
  pastoId: number | null;
  loteNome: string;
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
  totalAnimaisSubdivisao: number;
  areaHa: string | null;
  taxaLotacao: number | null;
};

type SortKey =
  | "subdivisao"
  | "lote"
  | "totalAnimais"
  | "area"
  | "taxa"
  | `m-${string}`
  | `f-${string}`;

function celulaValor(v: number) {
  return v > 0 ? String(v) : "";
}

function formatArea(area: string | null) {
  if (!area) return "—";
  const n = Number(area);
  if (Number.isNaN(n)) return area;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatTaxa(taxa: number | null) {
  if (taxa === null || taxa === undefined) return "—";
  return taxa.toFixed(2);
}

export default function MapaRebanhoPage() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = usePersistedState(FILTERS_KEY, INITIAL_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 400);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortKey, setSortKey] = useState<SortKey>("subdivisao");
  const [sortAsc, setSortAsc] = useState(true);

  const fazendaNum = filters.fazendaId ? Number(filters.fazendaId) : 0;
  const pastoNum = filters.pastoId ? Number(filters.pastoId) : undefined;

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaNum > 0 },
  );

  const queryInput = useMemo(() => ({
    fazendaId: fazendaNum,
    pastoId: pastoNum,
    search: debouncedSearch.trim() || undefined,
  }), [fazendaNum, pastoNum, debouncedSearch]);

  const { data, isLoading } = trpc.lotes.mapaRebanho.useQuery(queryInput, {
    enabled: fazendaNum > 0,
  });

  const rows = (data?.rows ?? []) as MapaRow[];
  const totalAnimaisSubdivisao = data?.totalAnimaisSubdivisao ?? 0;

  useEffect(() => {
    setPage(1);
  }, [filters.fazendaId, filters.pastoId, debouncedSearch, sortKey, sortAsc]);


  const sorted = useMemo(() => {
    const lista = [...rows];
    lista.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "subdivisao") {
        va = a.subdivisaoNome;
        vb = b.subdivisaoNome;
      } else if (sortKey === "lote") {
        va = a.loteNome;
        vb = b.loteNome;
      } else if (sortKey === "totalAnimais") {
        va = a.totalAnimaisSubdivisao;
        vb = b.totalAnimaisSubdivisao;
      } else if (sortKey === "area") {
        va = a.areaHa ? Number(a.areaHa) : -1;
        vb = b.areaHa ? Number(b.areaHa) : -1;
      } else if (sortKey === "taxa") {
        va = a.taxaLotacao ?? -1;
        vb = b.taxaLotacao ?? -1;
      } else if (sortKey.startsWith("m-")) {
        const faixa = sortKey.slice(2) as keyof ContagemPorFaixa;
        va = a.machos[faixa];
        vb = b.machos[faixa];
      } else if (sortKey.startsWith("f-")) {
        const faixa = sortKey.slice(2) as keyof ContagemPorFaixa;
        va = a.femeas[faixa];
        vb = b.femeas[faixa];
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return a.loteNome.localeCompare(b.loteNome, "pt-BR");
    });
    return lista;
  }, [rows, sortKey, sortAsc]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const inicio = total === 0 ? 0 : (pageSafe - 1) * perPage + 1;
  const fim = Math.min(pageSafe * perPage, total);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="material-icons text-[14px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const exportHeaders = [
    "Subdivisão",
    "Lote",
    ...FAIXAS_IDADE_LOTE.map(f => `Machos ${f}`),
    ...FAIXAS_IDADE_LOTE.map(f => `Fêmeas ${f}`),
    "Total de Animais",
    "Área (Ha)",
    "Taxa de Lotação (UA/Ha)",
  ];

  const exportRows = useMemo(
    () => sorted.map(r => [
      r.subdivisaoNome,
      r.loteNome,
      ...FAIXAS_IDADE_LOTE.map(f => r.machos[f] || 0),
      ...FAIXAS_IDADE_LOTE.map(f => r.femeas[f] || 0),
      r.totalAnimaisSubdivisao,
      formatArea(r.areaHa),
      formatTaxa(r.taxaLotacao),
    ]),
    [sorted],
  );

  const resumoTexto = filters.pastoId
    ? `Total de animais nesta subdivisão: ${totalAnimaisSubdivisao}`
    : `Total de animais em subdivisões: ${totalAnimaisSubdivisao}`;

  const thSimple = "px-2 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200 cursor-pointer select-none whitespace-nowrap";
  const thGroup = "px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-b border-gray-200";
  const thFaixa = "px-1 py-1.5 text-center text-[10px] font-medium text-gray-500 border-r border-gray-100 w-10 whitespace-nowrap";

  const irParaAlocacao = () => {
    const params = new URLSearchParams();
    if (filters.fazendaId) params.set("fazendaId", filters.fazendaId);
    if (filters.pastoId) params.set("pastoId", filters.pastoId);
    const qs = params.toString();
    setLocation(`/rebanho/alocacao-animais${qs ? `?${qs}` : ""}`);
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-[15px] font-semibold text-gray-800">Mapa do Rebanho</h1>
          <ListExportButtons
            title="Mapa do Rebanho"
            filename="mapa-rebanho"
            headers={exportHeaders}
            rows={exportRows}
            alignRightFrom={17}
            fazendaNome={fazendaNum > 0 ? (fazendas as { id: number; nome: string }[]).find(f => f.id === fazendaNum)?.nome ?? "Todas as Fazendas" : "Todas as Fazendas"}
          />
        </div>

        {/* Ações e busca */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            type="button"
            onClick={irParaAlocacao}
            disabled={fazendaNum <= 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_GREEN, minHeight: 40 }}
          >
            Nova Movimentação
          </button>

          <div className="flex-1 min-w-[180px] sm:max-w-xs ml-auto">
            <div className="relative">
              <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Buscar"
                disabled={fazendaNum <= 0}
                className="w-full h-[40px] pl-9 pr-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] placeholder:text-gray-400 focus:outline-none focus:border-[#2D5A5A] disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Fazenda</label>
            <select
              value={filters.fazendaId}
              onChange={e => setFilters(f => ({ ...f, fazendaId: e.target.value, pastoId: "" }))}
              className="w-full h-[40px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]"
            >
              <option value="">Selecione uma fazenda</option>
              {fazendas.map((f: { id: number; nome: string }) => (
                <option key={f.id} value={String(f.id)}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <label className="block text-[11px] font-medium text-gray-600 mb-1">Subdivisão</label>
            <select
              value={filters.pastoId}
              onChange={e => setFilters(f => ({ ...f, pastoId: e.target.value }))}
              disabled={!filters.fazendaId}
              className="w-full h-[40px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A] disabled:opacity-50"
            >
              <option value="">Selecione a Subdivisão</option>
              {[...pastos].sort((a: { id: number; nome: string }, b: { id: number; nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR')).map((p: { id: number; nome: string }) => (
                <option key={p.id} value={String(p.id)}>{p.nome}</option>
              ))}
            </select>
          </div>
          {fazendaNum > 0 && (
            <p className="text-[12px] text-gray-600 sm:ml-auto">{resumoTexto}</p>
          )}
        </div>

        {/* Tabela */}
        <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[1060px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th rowSpan={2} className={`${thSimple} min-w-[140px]`} onClick={() => toggleSort("subdivisao")}>
                    Subdivisão <SortIcon col="subdivisao" />
                  </th>
                  <th rowSpan={2} className={`${thSimple} min-w-[160px]`} onClick={() => toggleSort("lote")}>
                    Lote <SortIcon col="lote" />
                  </th>
                  <th colSpan={5} className={thGroup}>Machos</th>
                  <th colSpan={5} className={`${thGroup} border-r-0`}>Fêmeas</th>
                  <th rowSpan={2} className={`${thSimple} text-center min-w-[100px]`} onClick={() => toggleSort("totalAnimais")}>
                    Total de Animais <SortIcon col="totalAnimais" />
                  </th>
                  <th rowSpan={2} className={`${thSimple} text-center min-w-[80px]`} onClick={() => toggleSort("area")}>
                    Área (Ha) <SortIcon col="area" />
                  </th>
                  <th rowSpan={2} className={`${thSimple} text-center min-w-[120px] border-r-0`} onClick={() => toggleSort("taxa")}>
                    Taxa de Lotação (UA/Ha) <SortIcon col="taxa" />
                  </th>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {FAIXAS_IDADE_LOTE.map(f => (
                    <th key={`m-h-${f}`} className={thFaixa}>
                      {f}
                    </th>
                  ))}
                  {FAIXAS_IDADE_LOTE.map(f => (
                    <th key={`f-h-${f}`} className={thFaixa}>
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fazendaNum <= 0 && (
                  <tr>
                    <td colSpan={17} className="px-4 py-10 text-center text-gray-400">
                      Selecione uma fazenda para visualizar o mapa do rebanho.
                    </td>
                  </tr>
                )}
                {fazendaNum > 0 && isLoading && (
                  <tr><td colSpan={17} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>
                )}
                {fazendaNum > 0 && !isLoading && paginated.length === 0 && (
                  <tr><td colSpan={17} className="px-4 py-10 text-center text-gray-400">Nenhum Lote encontrado</td></tr>
                )}
                {paginated.map(row => (
                  <tr key={row.loteId} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-2 py-2 text-gray-700 border-r border-gray-50">{row.subdivisaoNome}</td>
                    <td className="px-2 py-2 text-gray-800 font-medium border-r border-gray-50">{row.loteNome}</td>
                    {FAIXAS_IDADE_LOTE.map(f => (
                      <td key={`m-${row.loteId}-${f}`} className="px-2 py-2 text-center text-gray-700 border-r border-gray-50 tabular-nums">
                        {celulaValor(row.machos[f])}
                      </td>
                    ))}
                    {FAIXAS_IDADE_LOTE.map(f => (
                      <td key={`f-${row.loteId}-${f}`} className="px-2 py-2 text-center text-gray-700 border-r border-gray-50 tabular-nums">
                        {celulaValor(row.femeas[f])}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center text-gray-800 font-medium border-r border-gray-50 tabular-nums">
                      {row.totalAnimaisSubdivisao > 0 ? row.totalAnimaisSubdivisao : ""}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-700 border-r border-gray-50 tabular-nums">
                      {formatArea(row.areaHa)}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-700 tabular-nums">
                      {formatTaxa(row.taxaLotacao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-600">
            <div className="flex items-center gap-2">
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px]"
              >
                <option value={10}>10 itens por página</option>
                <option value={25}>25 itens por página</option>
                <option value={50}>50 itens por página</option>
                <option value={100}>100 itens por página</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-500">Mostrando {inicio}–{fim} de {total} itens</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  <span className="material-icons text-[16px]">chevron_left</span>
                </button>
                <span
                  className="w-7 h-7 flex items-center justify-center rounded text-[11px] font-semibold text-white"
                  style={{ backgroundColor: '#2D5A5A' }}
                >{pageSafe}</span>
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  <span className="material-icons text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
