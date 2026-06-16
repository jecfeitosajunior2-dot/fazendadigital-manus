import { useState, useMemo, useEffect } from 'react';
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import MobileCard from "@/components/MobileCard";
import { ImportarAnimaisModal } from "@/components/ImportarAnimaisModal";
import ListaAnimaisFiltros from "@/components/animais/ListaAnimaisFiltros";
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { normalizarUnidade, nomeUnidadeExibicao } from '@/lib/produto-types';
import { useDebounce } from '@/hooks/useDebounce';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  ANIMAIS_LIST_FILTERS_STORAGE_KEY,
  INITIAL_ANIMAIS_LIST_FILTERS,
  animaisFiltersToApiParams,
} from '@shared/animal-filter-types';

// Tipo das colunas ordenáveis
type AnimaisSortKey = "brinco" | "rfid" | "categoria" | "lote" | "sexo" | "idade" | "diasFazenda" | "ultimoPeso" | "ganhoKg" | "gmd" | "emCarencia";

// Ícone de ordenação (igual ao padrão usado em LoteAnimaisTable)
function SortIcon({ col, sortKey, sortAsc }: { col: AnimaisSortKey; sortKey: AnimaisSortKey; sortAsc: boolean }) {
  return (
    <span className="material-icons text-[13px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );
}

// --- Animals Page ---
export function AnimaisPage() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = usePersistedState(ANIMAIS_LIST_FILTERS_STORAGE_KEY, INITIAL_ANIMAIS_LIST_FILTERS);
  const debouncedPesquisa = useDebounce(filters.pesquisa, 500);
  const [page, setPage] = useState(1);
  const [importarOpen, setImportarOpen] = useState(false);
  const [perPage, setPerPage] = useState(50);

  // Ordenação: padrão crescente por brinco
  const [sortKey, setSortKey] = useState<AnimaisSortKey>("brinco");
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: AnimaisSortKey) => {
    if (sortKey === key) {
      setSortAsc(prev => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const apiParams = useMemo(
    () => animaisFiltersToApiParams(filters, debouncedPesquisa),
    [filters, debouncedPesquisa],
  );

  const { data: animaisData, isLoading, refetch } = trpc.animais.list.useQuery(apiParams);
  const { data: lotesData } = trpc.lotes.list.useQuery();
  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const { data: marcasDistintas = [] } = trpc.animais.marcasDistintas.useQuery();
  const { data: pastosData } = trpc.pastos.list.useQuery();
  const deleteMutation = trpc.animais.delete.useMutation({ onSuccess: () => { toast.success("Animal removido!"); refetch(); } });

  const filtrosKey = JSON.stringify(apiParams);
  useEffect(() => {
    setPage(1);
  }, [filtrosKey]);

  const filteredAnimais = animaisData || [];

  // Ordenação client-side (após filtros do servidor)
  const sortedAnimais = useMemo(() => {
    const rows = [...filteredAnimais];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      // Função auxiliar: converte brinco para número se possível (ex: "04" -> 4)
      const parseBrinco = (v: string | null | undefined) => {
        const n = Number(v);
        return !isNaN(n) && v !== "" && v !== null && v !== undefined ? n : (v || "");
      };
      switch (sortKey) {
        case "brinco":    va = parseBrinco(a.brinco);  vb = parseBrinco(b.brinco);  break;
        case "rfid":      va = (a.brincoEletronico || "").toLowerCase();  vb = (b.brincoEletronico || "").toLowerCase();  break;
        case "categoria": va = (a.categoria || "").toLowerCase();  vb = (b.categoria || "").toLowerCase();  break;
        case "lote":      va = (a.loteNome || "").toLowerCase();  vb = (b.loteNome || "").toLowerCase();  break;
        case "sexo":      va = a.sexo || "";  vb = b.sexo || "";  break;
        case "idade":     va = a.idadeMeses ?? -1;  vb = b.idadeMeses ?? -1;  break;
        case "diasFazenda": va = a.diasNaFazenda ?? -1;  vb = b.diasNaFazenda ?? -1;  break;
        case "ultimoPeso":  va = a.ultimoPeso !== null && a.ultimoPeso !== undefined ? Number(a.ultimoPeso) : -1;  vb = b.ultimoPeso !== null && b.ultimoPeso !== undefined ? Number(b.ultimoPeso) : -1;  break;
        case "ganhoKg":    va = a.ganhoKg !== null && a.ganhoKg !== undefined ? Number(a.ganhoKg) : -Infinity;  vb = b.ganhoKg !== null && b.ganhoKg !== undefined ? Number(b.ganhoKg) : -Infinity;  break;
        case "gmd":       va = a.gmd !== null && a.gmd !== undefined ? Number(a.gmd) : -Infinity;  vb = b.gmd !== null && b.gmd !== undefined ? Number(b.gmd) : -Infinity;  break;
        case "emCarencia": va = a.emCarencia ? 1 : 0;  vb = b.emCarencia ? 1 : 0;  break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filteredAnimais, sortKey, sortAsc]);

  const limparFiltros = () => {
    setFilters({ ...INITIAL_ANIMAIS_LIST_FILTERS, maisFiltrosAbertos: filters.maisFiltrosAbertos });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sortedAnimais.length / perPage));
  const paginated = sortedAnimais.slice((page - 1) * perPage, page * perPage);

  // Helper: formata idade
  const formatIdade = (meses: number | null) => {
    if (meses === null || meses === undefined) return "-";
    if (meses < 1) return "< 1 m";
    if (meses < 24) return `${meses} m`;
    const anos = Math.floor(meses / 12);
    const resto = meses % 12;
    return resto > 0 ? `${anos}a ${resto}m` : `${anos} anos`;
  };

  // Nome da fazenda selecionada no filtro (para o cabeçalho do PDF)
  const fazendaNomePdf = useMemo(() => {
    if (!filters.fazendaId) return undefined;
    const f = (fazendasData || []).find((x: { id: number }) => String(x.id) === String(filters.fazendaId));
    return (f as { nome?: string } | undefined)?.nome;
  }, [filters.fazendaId, fazendasData]);

  const exportHeaders = ["Brinco", "Nº RFID", "Categoria", "Lote", "Sexo", "Idade", "Dias na Fazenda", "Últ. Peso (kg)", "Ganho (kg)", "GMD (kg/dia)", "Em Carência"];
  const exportData = sortedAnimais.map(a => [
    a.brinco || "",
    a.brincoEletronico || "",
    a.categoria || "",
    a.loteNome || "",
    a.sexo === "macho" ? "Macho" : "Fêmea",
    formatIdade(a.idadeMeses ?? null),
    a.diasNaFazenda !== null && a.diasNaFazenda !== undefined ? String(a.diasNaFazenda) : "",
    a.ultimoPeso !== null && a.ultimoPeso !== undefined ? Number(a.ultimoPeso).toFixed(1) : "",
    a.ganhoKg !== null && a.ganhoKg !== undefined ? Number(a.ganhoKg).toFixed(2) : "",
    a.gmd !== null && a.gmd !== undefined ? Number(a.gmd).toFixed(3) : "",
    a.emCarencia ? "Sim" : "Não",
  ]);

  return (
    <AppLayout>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de Animais</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Lista de Animais"
            filename="animais"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={6}
            fazendaNome={fazendaNomePdf}
            landscape
          />
          <button
            onClick={() => setImportarOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition w-full sm:w-auto"
            style={{ backgroundColor: "#0ea5e9", minHeight: 44 }}
          >
            <span className="material-icons text-[16px]">upload_file</span>
            Importar
          </button>
          <button onClick={() => setLocation("/rebanho/novo-animal")} className="flex items-center justify-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition w-full sm:w-auto" style={{ backgroundColor: "#2D5A5A", minHeight: 44 }}>
            <span className="material-icons text-[16px]">add</span>
            Novo Animal
          </button>
        </div>
      </div>

      <ListaAnimaisFiltros
        value={filters}
        onChange={setFilters}
        onClear={limparFiltros}
        fazendas={(fazendasData || []).map((f: { id: number; nome: string }) => ({ id: f.id, nome: f.nome }))}
        lotes={(lotesData || []).map((l: { id: number; nome: string; fazendaId?: number | null }) => ({
          id: l.id,
          nome: l.nome,
          fazendaId: l.fazendaId,
        }))}
        pastos={(pastosData || []).map((p: { id: number; nome: string; fazendaId?: number | null }) => ({
          id: p.id,
          nome: p.nome,
          fazendaId: p.fazendaId,
        }))}
        marcadoresDisponiveis={marcasDistintas}
      />

      {/* Cards no mobile */}
      <div className="lg:hidden space-y-3">
        {isLoading ? (
          <div className="py-10 text-center text-gray-400 text-[13px]">Carregando...</div>
        ) : paginated.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-[13px]">Nenhum animal encontrado.</div>
        ) : paginated.map(animal => (
          <MobileCard
            key={animal.id}
            title={animal.brinco || animal.nome || "—"}
            subtitle={[animal.loteNome, animal.raca].filter(Boolean).join(" · ") || undefined}
            badge={
              <div className="flex flex-col items-end gap-1">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${animal.sexo === "macho" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}>
                  {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                </span>
                {animal.emCarencia && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Carência</span>
                )}
              </div>
            }
            fields={[
              { label: "Idade", value: formatIdade(animal.idadeMeses ?? null) },
              { label: "Dias Fazenda", value: animal.diasNaFazenda !== null && animal.diasNaFazenda !== undefined ? String(animal.diasNaFazenda) : "-" },
              { label: "Últ. Peso", value: animal.ultimoPeso !== null && animal.ultimoPeso !== undefined ? `${Number(animal.ultimoPeso).toFixed(1)} kg` : "-" },
              { label: "GMD", value: animal.gmd !== null && animal.gmd !== undefined ? `${Number(animal.gmd).toFixed(3)} kg/d` : "-" },
            ]}
            actions={[
              { icon: "visibility", label: "Detalhes", onClick: () => setLocation(`/rebanho/detalhes-animal?id=${animal.id}`) },
              { icon: "edit", label: "Editar", onClick: () => setLocation(`/rebanho/editar-animal?id=${animal.id}`) },
              { icon: "delete", label: "Excluir", variant: "danger", onClick: () => { if (confirm("Remover animal?")) deleteMutation.mutate({ id: animal.id }); } },
            ]}
          />
        ))}
      </div>

      {/* Table no desktop */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Cabeçalhos ordensáveis */}
                {([
                  { key: "brinco",      label: "Brinco",         align: "center" },
                  { key: "rfid",        label: "Nº RFID",        align: "center" },
                  { key: "categoria",   label: "Categoria",      align: "center" },
                  { key: "lote",        label: "Lote",           align: "center" },
                  { key: "sexo",        label: "Sexo",           align: "center" },
                  { key: "idade",       label: "Idade",          align: "center" },
                  { key: "diasFazenda", label: "Dias na Fazenda",align: "center" },
                  { key: "ultimoPeso",  label: "Últ. Peso (kg)", align: "center" },
                  { key: "ganhoKg",     label: "Ganho (kg)",     align: "center" },
                  { key: "gmd",         label: "GMD (kg/dia)",   align: "center" },
                  { key: "emCarencia",  label: "Em Carência",    align: "center" },
                ] as { key: AnimaisSortKey; label: string; align: string }[]).map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors text-${col.align}`}
                  >
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortAsc={sortAsc} />
                  </th>
                ))}
                {/* Coluna Ações: sem ordenação */}
                <th className="text-center px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-400">Nenhum animal encontrado.</td></tr>
              ) : paginated.map((animal) => (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  {/* Brinco */}
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${animal.sexo === 'macho' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className="font-semibold text-gray-800">{animal.brinco || "-"}</span>
                    </div>
                  </td>
                  {/* Nº RFID */}
                  <td className="px-3 py-2 text-center text-gray-800 font-mono text-[11px]">{animal.brincoEletronico || <span className="text-gray-300">—</span>}</td>
                  {/* Categoria */}
                  <td className="px-3 py-2 text-center">
                    {animal.categoria ? (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-[11px]">{animal.categoria}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Lote */}
                  <td className="px-3 py-2 text-center">
                    {animal.loteNome ? (
                      <span className="px-2 py-0.5 rounded bg-[#2D5A5A]/10 text-[#2D5A5A] font-medium text-[11px]">{animal.loteNome}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Sexo */}
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${animal.sexo === "macho" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}>
                      {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                    </span>
                  </td>
                  {/* Idade */}
                  <td className="px-3 py-2 text-center tabular-nums text-gray-800">{formatIdade(animal.idadeMeses ?? null)}</td>
                  {/* Dias Fazenda */}
                  <td className="px-3 py-2 text-center tabular-nums text-gray-800">
                    {animal.diasNaFazenda !== null && animal.diasNaFazenda !== undefined ? animal.diasNaFazenda : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Último Peso */}
                  <td className="px-3 py-2 text-center tabular-nums font-medium text-gray-800">
                    {animal.ultimoPeso !== null && animal.ultimoPeso !== undefined ? Number(animal.ultimoPeso).toFixed(1) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Ganho KG */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {animal.ganhoKg !== null && animal.ganhoKg !== undefined ? (
                      <span className={Number(animal.ganhoKg) >= 0 ? "text-green-600" : "text-red-500"}>
                        {Number(animal.ganhoKg) >= 0 ? "+" : ""}{Number(animal.ganhoKg).toFixed(2)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* GMD */}
                  <td className="px-3 py-2 text-center tabular-nums">
                    {animal.gmd !== null && animal.gmd !== undefined ? (
                      <span className={Number(animal.gmd) >= 0.8 ? "text-green-600" : Number(animal.gmd) >= 0.4 ? "text-amber-600" : "text-red-500"}>
                        {Number(animal.gmd).toFixed(3)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Em Carência */}
                  <td className="px-3 py-2 text-center">
                    {animal.emCarencia ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[11px] font-medium">
                        <span className="material-icons text-[12px]">warning</span>Sim
                      </span>
                    ) : (
                      <span className="text-gray-400 text-[11px]">Não</span>
                    )}
                  </td>
                  {/* Ações */}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setLocation(`/rebanho/detalhes-animal?id=${animal.id}`)} className="p-1 text-gray-400 hover:text-[#2D5A5A] transition-colors" title="Ver detalhes">
                        <span className="material-icons text-[16px]">visibility</span>
                      </button>
                      <button onClick={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Editar">
                        <span className="material-icons text-[16px]">edit</span>
                      </button>
                      <button onClick={() => { if (confirm("Remover animal?")) deleteMutation.mutate({ id: animal.id }); }} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Remover">
                        <span className="material-icons text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Rodapé: contagem + paginação */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-200 bg-white text-[11px] text-gray-500">
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px] focus:outline-none focus:border-[#2D5A5A]"
          >
            <option value={10}>10 itens por página</option>
            <option value={25}>25 itens por página</option>
            <option value={50}>50 itens por página</option>
            <option value={100}>100 itens por página</option>
          </select>
          <div className="flex items-center gap-3">
            <span>Mostrando {sortedAnimais.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, sortedAnimais.length)} de {sortedAnimais.length} {sortedAnimais.length === 1 ? "animal" : "animais"}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <span className="material-icons text-[16px] text-gray-500">chevron_left</span>
              </button>
              <span
                className="w-7 h-7 flex items-center justify-center rounded text-[11px] font-semibold text-white"
                style={{ backgroundColor: "#2D5A5A" }}
              >
                {page}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <span className="material-icons text-[16px] text-gray-500">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de importação em massa */}
      <ImportarAnimaisModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportado={() => { refetch(); setImportarOpen(false); }}
      />
    </AppLayout>
  );
}

// ─── Lista de Produtos (iRancho fiel) ────────────────────────────────────────
const FD_PRIMARY = "#4ECDC4";

type SortKeyEstoque =
  | "nome" | "categoria" | "situacao" | "fabricante" | "identificadorUnico"
  | "quantidadeMinima" | "quantidadeMaxima" | "quantidade" | "unidade" | "valorUnitario";

export function EstoquePage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [estoqueFiltro, setEstoqueFiltro] = useState<string>("todos");
  const [statusFiltro, setStatusFiltro] = useState<"ativo" | "inativo" | "todos">("ativo");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<SortKeyEstoque>("nome");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: items = [], isLoading, refetch } = trpc.estoque.list.useQuery();
  const deleteMutation = trpc.estoque.delete.useMutation({
    onSuccess: () => { toast.success("Produto removido!"); refetch(); },
  });
  const inativarMutation = trpc.estoque.inativarProdutos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} produto(s) inativado(s)!`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: () => toast.error("Não foi possível inativar os produtos."),
  });
  const ativarMutation = trpc.estoque.ativarProdutos.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} produto(s) ativado(s)!`);
      setSelectedIds(new Set());
      refetch();
    },
    onError: () => toast.error("Não foi possível ativar os produtos."),
  });

  const acaoEmLote = useMemo((): "ativar" | "inativar" | null => {
    if (selectedIds.size === 0) return null;
    if (statusFiltro === "inativo") return "ativar";
    if (statusFiltro === "ativo") return "inativar";
    const selecionados = items.filter(i => selectedIds.has(i.id));
    if (selecionados.every(i => i.situacao === "inativo")) return "ativar";
    if (selecionados.every(i => (i.situacao ?? "ativo") === "ativo")) return "inativar";
    return null;
  }, [selectedIds, statusFiltro, items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (estoqueFiltro !== "todos") {
      const fazendaId = parseInt(estoqueFiltro, 10);
      list = list.filter(i => i.fazendaId === fazendaId);
    }
    if (statusFiltro !== "todos") {
      list = list.filter(i => (i.situacao ?? "ativo") === statusFiltro);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        [i.nome, i.categoria, i.fabricante, i.identificadorUnico].some(
          v => v && String(v).toLowerCase().includes(q)
        )
      );
    }
    list.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "nome": va = String(a.nome ?? "").toLowerCase(); vb = String(b.nome ?? "").toLowerCase(); break;
        case "categoria": va = String(a.categoria ?? "").toLowerCase(); vb = String(b.categoria ?? "").toLowerCase(); break;
        case "situacao": va = String(a.situacao ?? ""); vb = String(b.situacao ?? ""); break;
        case "fabricante": va = String(a.fabricante ?? "").toLowerCase(); vb = String(b.fabricante ?? "").toLowerCase(); break;
        case "identificadorUnico": va = Number(a.identificadorUnico ?? 0); vb = Number(b.identificadorUnico ?? 0); break;
        case "quantidadeMinima": va = Number(a.quantidadeMinima ?? 0); vb = Number(b.quantidadeMinima ?? 0); break;
        case "quantidadeMaxima": va = Number(a.quantidadeMaxima ?? 0); vb = Number(b.quantidadeMaxima ?? 0); break;
        case "quantidade": va = Number(a.quantidade ?? 0); vb = Number(b.quantidade ?? 0); break;
        case "unidade": va = nomeUnidadeExibicao(a.unidade).toLowerCase(); vb = nomeUnidadeExibicao(b.unidade).toLowerCase(); break;
        case "valorUnitario": va = Number(a.valorUnitario ?? 0); vb = Number(b.valorUnitario ?? 0); break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, estoqueFiltro, statusFiltro, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key: SortKeyEstoque) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
    setPage(1);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === pageItems.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pageItems.map(i => i.id)));
  };

  const exportHeaders = [
    "Nome", "Categoria", "Situação", "Fabricante", "Identif. Único",
    "Qtde Mínima", "Qtde Máxima", "Em Estoque", "Unidade", "Valor Residual",
  ];
  const exportRows = filtered.map(i => [
    i.nome,
    i.categoria ?? "",
    i.situacao === "inativo" ? "Inativa" : "Ativa",
    i.fabricante ?? "",
    i.identificadorUnico ?? "",
    Number(i.quantidadeMinima ?? 0).toFixed(2),
    Number(i.quantidadeMaxima ?? 0).toFixed(2),
    Number(i.quantidade ?? 0).toFixed(2),
    nomeUnidadeExibicao(i.unidade),
    i.valorUnitario ? `R$ ${Number(i.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
  ]);

  const SortIcon = ({ col }: { col: SortKeyEstoque }) => (
    <span className="material-icons text-[13px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass = "px-3 py-3 text-[10px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none text-left";

  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            Lista de produtos
          </h1>
          <div className="flex items-center gap-4 text-[10px] text-gray-600">
            <ListExportButtons title="Lista de produtos" filename="lista-produtos" headers={exportHeaders} rows={exportRows} alignRightFrom={5} />
          </div>
        </div>

        {/* Botões de ação */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setLocation(
              estoqueFiltro !== "todos"
                ? `/insumos/cadastro?fazendaId=${estoqueFiltro}`
                : "/insumos/cadastro"
            )}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Novo Produto
          </button>
          {acaoEmLote && (
            <button
              type="button"
              onClick={() => {
                const qtd = selectedIds.size;
                const ids = Array.from(selectedIds);
                if (acaoEmLote === "ativar") {
                  if (confirm(`Ativar ${qtd} produto(s) selecionado(s)?`)) {
                    ativarMutation.mutate({ ids });
                  }
                } else if (confirm(`Inativar ${qtd} produto(s) selecionado(s)?`)) {
                  inativarMutation.mutate({ ids });
                }
              }}
              disabled={inativarMutation.isPending || ativarMutation.isPending}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white bg-[#E85D5D] hover:bg-[#d44f4f] disabled:opacity-60 transition-colors"
            >
              {acaoEmLote === "ativar" ? "Ativar Produtos" : "Inativar Produtos"}
            </button>
          )}
        </div>

        {/* Filtros de status + busca */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <select
            value={estoqueFiltro}
            onChange={e => { setEstoqueFiltro(e.target.value); setPage(1); setSelectedIds(new Set()); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white min-w-[180px]"
          >
            <option value="todos">Todos Estoques</option>
            {fazendas.map(f => (
              <option key={f.id} value={String(f.id)}>{f.nome}</option>
            ))}
          </select>
          <select
            value={statusFiltro}
            onChange={e => { setStatusFiltro(e.target.value as "ativo" | "inativo" | "todos"); setPage(1); setSelectedIds(new Set()); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white min-w-[110px]"
          >
            <option value="ativo">Ativas</option>
            <option value="inativo">Inativas</option>
            <option value="todos">Todos</option>
          </select>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded pl-8 pr-3 py-1.5 text-[12px] w-52"
            />
          </div>
        </div>

        {/* Cards mobile */}
        <div className="lg:hidden px-4 py-3 space-y-2.5">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400 text-[13px]">Carregando...</div>
          ) : pageItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-[13px]">Sem dados</div>
          ) : pageItems.map(item => {
            const isInativoM = item.situacao === "inativo";
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-gray-900 uppercase truncate">{item.nome}</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">{item.categoria ?? "Sem categoria"}</p>
                  </div>
                  {isInativoM ? (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium shrink-0">Inativa</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium shrink-0">Ativa</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-[12px]">
                  <div><span className="text-gray-400">Em estoque: </span><span className="font-semibold text-gray-800 tabular-nums">{Number(item.quantidade ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {nomeUnidadeExibicao(item.unidade)}</span></div>
                  <div><span className="text-gray-400">Valor: </span><span className="font-semibold text-gray-800 tabular-nums">{item.valorUnitario ? `R$ ${Number(item.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-"}</span></div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button onClick={() => setLocation(`/insumos/historico-produto?id=${item.id}`)} className="flex-1 grid place-items-center rounded-lg bg-gray-50 text-gray-600 active:scale-95 transition" style={{ minHeight: 42 }} aria-label="Histórico"><span className="material-icons text-[20px]">format_list_bulleted</span></button>
                  <button onClick={() => setLocation(`/insumos/cadastro?id=${item.id}`)} className="flex-1 grid place-items-center rounded-lg bg-blue-50 text-blue-600 active:scale-95 transition" style={{ minHeight: 42 }} aria-label="Editar"><span className="material-icons text-[20px]">edit</span></button>
                  <button onClick={() => { if (confirm("Remover produto?")) deleteMutation.mutate({ id: item.id }); }} className="flex-1 grid place-items-center rounded-lg bg-red-50 text-red-600 active:scale-95 transition" style={{ minHeight: 42 }} aria-label="Excluir"><span className="material-icons text-[20px]">delete</span></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabela desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white">
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    className="accent-[#4ECDC4]"
                    checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="w-6 px-1" />
                {([
                  ["nome", "Nome"],
                  ["categoria", "Categoria"],
                  ["situacao", "Situação"],
                  ["fabricante", "Fabricante"],
                  ["identificadorUnico", "Identif. Único"],
                  ["quantidadeMinima", "Qtde Mínima"],
                  ["quantidadeMaxima", "Qtde Máxima"],
                  ["quantidade", "Em Estoque"],
                  ["unidade", "Unidade"],
                  ["valorUnitario", "Valor Residual"],
                ] as [SortKeyEstoque, string][]).map(([key, label]) => (
                  <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center">{label}<SortIcon col={key} /></span>
                  </th>
                ))}
                <th className="w-24 px-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">Carregando...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">Sem dados</td></tr>
              ) : pageItems.map(item => {
                const isInativo = item.situacao === "inativo";
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="accent-[#4ECDC4]"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-1 py-2.5 text-center">
                      <span className="material-icons text-[14px] text-gray-400">chevron_right</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 uppercase whitespace-nowrap">{item.nome}</td>
                    <td className="px-3 py-2.5 text-gray-700">{item.categoria ?? ""}</td>
                    <td className="px-3 py-2.5">
                      {isInativo ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Inativa</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Ativa</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{item.fabricante ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabular-nums">{item.identificadorUnico ?? ""}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{item.quantidadeMinima ? Number(item.quantidadeMinima).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{item.quantidadeMaxima ? Number(item.quantidadeMaxima).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">{Number(item.quantidade ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeUnidadeExibicao(item.unidade)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">
                      {item.valorUnitario ? `R$ ${Number(item.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setLocation(`/insumos/historico-produto?id=${item.id}`)}
                          className="p-1 text-gray-500 hover:text-[#4ECDC4]"
                          title="Ver histórico de movimentações"
                        >
                          <span className="material-icons text-[17px]">format_list_bulleted</span>
                        </button>
                        <button
                          onClick={() => setLocation(`/insumos/cadastro?id=${item.id}`)}
                          className="p-1 text-gray-500 hover:text-blue-600"
                          title="Editar"
                        >
                          <span className="material-icons text-[17px]">edit</span>
                        </button>
                        <button
                          onClick={() => { if (confirm("Remover produto?")) deleteMutation.mutate({ id: item.id }); }}
                          className="p-1 text-gray-500 hover:text-red-600"
                          title="Excluir"
                        >
                          <span className="material-icons text-[17px]">delete</span>
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
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[12px] text-gray-600">
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-[11px] bg-white"
            >
              {[10, 20, 50].map(n => (
                <option key={n} value={n}>{n} itens por página</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-gray-600">
            <span>
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | "...")[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`w-7 h-7 flex items-center justify-center rounded border text-[11px] font-medium ${page === n ? "border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10" : "border-gray-300 hover:bg-gray-50"}`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// --- Contas Page (placeholder for financial) ---
export function ContasPage() {
  return (
    <AppLayout>
      <div className="mb-3">
        <h1 className="text-[15px] font-medium text-gray-800">Contas Financeiras</h1>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
        <span className="material-icons text-[48px] mb-2 block">account_balance</span>
        <p>Acesse o módulo Financeiro para gerenciar contas.</p>
      </div>
    </AppLayout>
  );
}
