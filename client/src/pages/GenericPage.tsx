import { Fragment, useState, useMemo, useEffect } from 'react';
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { FD_PRIMARY, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { ImportarAnimaisModal } from "@/components/ImportarAnimaisModal";
import ListaAnimaisFiltros from "@/components/animais/ListaAnimaisFiltros";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  ViewEditDeleteRowActionButtons,
  EditActionIcon,
  DeleteActionIcon,
  InactivateActionIcon,
  ActivateActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { normalizarUnidade, formatQtdComSigla, formatDataBr, produtoControlaSaldo } from '@/lib/produto-types';
import { brl, diasAte } from '@/lib/dashboard-utils';
import { parseRetornoVisaoGeral } from '@/lib/insumosRoutes';
import { parseRetornoRebanhoVisaoGeral } from '@/lib/rebanhoRoutes';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ANIMAIS_LIST_FILTERS_STORAGE_KEY,
  INITIAL_ANIMAIS_LIST_FILTERS,
  animaisFiltersFromSearchParams,
  animaisFiltersToApiParams,
  clearAnimaisListFilters,
  hasActiveAnimaisFilters,
  persistRebanhoFazendaId,
  readPersistedAnimaisListFilters,
  readPersistedRebanhoFazendaId,
  type AnimaisListFiltersState,
} from '@shared/animal-filter-types';
import {
  EM_CARENCIA_NAO_TEXT_CLASS,
  EM_CARENCIA_SIM_BADGE_CLASS,
  formatUltimoPesoKg,
} from "@/lib/listaAnimaisTable";
import {
  MSG_ANIMAL_EXCLUSAO_BLOQUEADA,
  TOOLTIP_ANIMAL_EXCLUIR,
  TOOLTIP_ANIMAL_EXCLUIR_BLOQUEADO,
} from "@shared/animalExclusao";

// Tipo das colunas ordenáveis
type AnimaisSortKey = "brinco" | "rfid" | "categoria" | "lote" | "sexo" | "idade" | "diasFazenda" | "ultimoPeso" | "ganhoKg" | "gmd" | "emCarencia";

// Ícone de ordenação — visível apenas na coluna ativa
function SortIcon({ col, sortKey, sortAsc }: { col: AnimaisSortKey; sortKey: AnimaisSortKey; sortAsc: boolean }) {
  if (sortKey !== col) return null;
  return (
    <span className="material-icons text-[12px] text-gray-400 ml-0.5 align-middle leading-none" aria-hidden="true">
      {sortAsc ? "arrow_drop_up" : "arrow_drop_down"}
    </span>
  );
}

/** Em Carência — destaque discreto apenas quando Sim (alerta sanitário) */
function EmCarenciaCell({ emCarencia }: { emCarencia: boolean }) {
  if (!emCarencia) {
    return <span className={EM_CARENCIA_NAO_TEXT_CLASS}>Não</span>;
  }
  return <span className={EM_CARENCIA_SIM_BADGE_CLASS}>Sim</span>;
}

const LOTE_BADGE_PALETTE = [
  "bg-slate-100 text-slate-700",
  "bg-sky-50 text-sky-800",
  "bg-teal-50 text-teal-800",
  "bg-blue-50 text-blue-800",
  "bg-gray-100 text-gray-700",
];

function loteBadgeClass(nome: string): string {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h + nome.charCodeAt(i) * 17) % LOTE_BADGE_PALETTE.length;
  return LOTE_BADGE_PALETTE[h];
}

function AnimaisListEmptyState({
  hasActiveFilters,
  onNovoAnimal,
  onLimparFiltros,
  compact,
}: {
  hasActiveFilters: boolean;
  onNovoAnimal: () => void;
  onLimparFiltros: () => void;
  compact?: boolean;
}) {
  if (hasActiveFilters) {
    return (
      <div className={compact ? "py-8 px-4 text-center" : "py-10 px-4 text-center"}>
        <p className="text-gray-600 text-[13px] leading-relaxed">
          Nenhum animal encontrado com os filtros selecionados.
          <br />
          Tente ajustar ou limpar os filtros.
        </p>
        <button
          type="button"
          onClick={onLimparFiltros}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Limpar filtros
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? "py-8 px-4 text-center" : "py-10 px-4 text-center"}>
      <p className="text-gray-600 text-[13px] leading-relaxed">
        Nenhum animal cadastrado ainda.
        <br />
        Cadastre o primeiro animal do rebanho para começar o controle.
      </p>
      <button
        type="button"
        onClick={onNovoAnimal}
        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[12px] font-semibold transition-colors"
        style={{ backgroundColor: "#2D5A5A" }}
      >
        <span className="material-icons text-[16px]">add</span>
        Novo Animal
      </button>
    </div>
  );
}

// --- Animals Page ---
export function AnimaisPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const searchString = useSearch();
  const [filters, setFilters] = useState<AnimaisListFiltersState>(() => {
    const fromUrl = animaisFiltersFromSearchParams(searchString);
    if (fromUrl) return fromUrl;
    return readPersistedAnimaisListFilters();
  });
  const debouncedPesquisa = useDebounce(filters.pesquisa, 500);
  const [page, setPage] = useState(1);
  const [importarOpen, setImportarOpen] = useState(false);
  const [perPage, setPerPage] = useState(50);
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(ANIMAIS_LIST_FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // ignora quota excedida
    }
  }, [filters]);

  // Aplica filtros da URL ao navegar (ex.: clique nos cards da Visão Geral)
  useEffect(() => {
    const fromUrl = animaisFiltersFromSearchParams(searchString);
    if (fromUrl) setFilters(fromUrl);
  }, [searchString]);

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

  const handleDeleteAnimal = async (animal: {
    id?: unknown;
    brinco?: unknown;
    exclusaoBloqueada?: unknown;
  }) => {
    if (animal.exclusaoBloqueada) {
      toast.error(MSG_ANIMAL_EXCLUSAO_BLOQUEADA);
      return;
    }
    const id = Number(animal.id);
    const brinco = typeof animal.brinco === "string" ? animal.brinco.trim() : "";
    const label = brinco || `#${id}`;
    const ok = await confirm({
      title: "Excluir animal",
      description: `Tem certeza que deseja excluir o animal "${label}"? Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id });
  };

  const apiParams = useMemo(
    () => animaisFiltersToApiParams(filters, debouncedPesquisa),
    [filters, debouncedPesquisa],
  );

  const hasFazendaFilter = !!filters.fazendaId;
  const { data: animaisData, isLoading, refetch } = trpc.animais.list.useQuery(apiParams, {
    enabled: fazendaInitDone && hasFazendaFilter,
  });
  const utils = trpc.useUtils();
  const deleteMutation = trpc.animais.delete.useMutation({
    onSuccess: () => {
      toast.success("Animal excluído com sucesso!");
      utils.animais.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const { data: lotesData } = trpc.lotes.list.useQuery();
  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const { data: marcasDistintas = [] } = trpc.animais.marcasDistintas.useQuery();
  const { data: pastosData } = trpc.pastos.list.useQuery();

  useEffect(() => {
    if (fazendaInitDone) return;
    if (fazendasData === undefined) return;

    if (!fazendasData.length) {
      setFazendaInitDone(true);
      return;
    }

    if (filters.fazendaId) {
      setFazendaInitDone(true);
      return;
    }

    const ids = fazendasData.map((f: { id: number }) => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved =
      fromStorage ||
      (fazendasData.length === 1 ? String(fazendasData[0].id) : '');

    if (resolved) {
      setFilters(prev => ({ ...prev, fazendaId: resolved }));
      persistRebanhoFazendaId(resolved);
    }

    setFazendaInitDone(true);
  }, [fazendasData, fazendaInitDone, filters.fazendaId]);

  const handleFiltersChange = (next: AnimaisListFiltersState) => {
    if (next.fazendaId !== filters.fazendaId) {
      persistRebanhoFazendaId(next.fazendaId);
    }
    setFilters(next);
  };

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
    setFilters(clearAnimaisListFilters(filters));
    setPage(1);
  };

  const paginated = sortedAnimais.slice((page - 1) * perPage, page * perPage);

  // Helper: formata idade
  const formatIdade = (meses: number | null) => {
    if (meses === null || meses === undefined) return "—";
    if (meses < 1) return "< 1 m";
    if (meses < 24) return `${meses} m`;
    const anos = Math.floor(meses / 12);
    const resto = meses % 12;
    return resto > 0 ? `${anos}a ${resto}m` : `${anos} anos`;
  };

  const exportTextOrDash = (value: string | null | undefined) =>
    value != null && String(value).trim() !== "" ? String(value).trim() : "—";
  const exportNumOrDash = (value: number | null | undefined) =>
    value != null && Number.isFinite(value) ? value : "—";

  // Nome da fazenda selecionada no filtro (para o cabeçalho do PDF)
  const fazendaNomePdf = useMemo(() => {
    if (!filters.fazendaId) return undefined;
    const f = (fazendasData || []).find((x: { id: number }) => String(x.id) === String(filters.fazendaId));
    return (f as { nome?: string } | undefined)?.nome;
  }, [filters.fazendaId, fazendasData]);

  const buildAnimaisExportTitle = () =>
    fazendaNomePdf ? `${fazendaNomePdf} — Lista de Animais` : "Lista de Animais";

  const exportHeaders = ["Brinco", "Nº RFID", "Categoria", "Lote", "Sexo", "Idade", "Dias na Fazenda", "Últ. Peso (kg)", "Ganho (kg)", "GMD (kg/dia)", "Em Carência"];
  const exportColumnAligns = exportHeaders.map(() => "center" as const);
  const exportData = sortedAnimais.map(a => [
    exportTextOrDash(a.brinco),
    exportTextOrDash(a.brincoEletronico),
    exportTextOrDash(a.categoria),
    exportTextOrDash(a.loteNome),
    a.sexo === "macho" ? "Macho" : "Fêmea",
    formatIdade(a.idadeMeses ?? null),
    exportNumOrDash(a.diasNaFazenda),
    exportNumOrDash(a.ultimoPeso != null ? Number(a.ultimoPeso) : null),
    exportNumOrDash(a.ganhoKg != null ? Number(a.ganhoKg) : null),
    exportNumOrDash(a.gmd != null ? Number(a.gmd) : null),
    a.emCarencia ? "Sim" : "Não",
  ]);

  const hasActiveFilters = hasActiveAnimaisFilters(filters);
  const needsFazendaSelection = fazendaInitDone && !hasFazendaFilter;
  const isListLoading = !fazendaInitDone || (hasFazendaFilter && isLoading);
  const isEmptyList = fazendaInitDone && hasFazendaFilter && !isLoading && sortedAnimais.length === 0;
  const semFazendaHint = "Selecione uma fazenda para continuar";

  const goNovoAnimal = () => {
    if (!hasFazendaFilter) {
      toast.error("Selecione uma fazenda antes de cadastrar um animal.");
      return;
    }
    setLocation("/rebanho/novo-animal");
  };

  const retornoVisaoGeral = useMemo(() => {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    return parseRetornoRebanhoVisaoGeral(params.get("retorno"));
  }, [searchString]);

  return (
    <AppLayout>
      {retornoVisaoGeral ? (
        <button
          type="button"
          onClick={() => setLocation(retornoVisaoGeral)}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          aria-label="Voltar"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span className="text-[13px]">Voltar</span>
        </button>
      ) : null}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Lista de Animais
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goNovoAnimal}
              disabled={!hasFazendaFilter}
              title={!hasFazendaFilter ? semFazendaHint : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px]",
                hasFazendaFilter
                  ? "hover:brightness-95 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              <span className="hidden sm:inline">Novo Animal</span>
              <span className="sm:hidden">Novo</span>
            </button>
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              disabled={!hasFazendaFilter}
              title={!hasFazendaFilter ? semFazendaHint : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 rounded-lg border border-gray-200 bg-white text-gray-700 text-[12px] font-semibold transition shrink-0 min-h-[44px]",
                hasFazendaFilter
                  ? "hover:bg-gray-50 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
            >
              <span className="material-icons text-[16px] text-gray-500">upload_file</span>
              Importar
            </button>
            <ListExportButtons
              title="Lista de Animais"
              filename="animais"
              headers={exportHeaders}
              rows={exportData}
              alignRightFrom={6}
              pdfColumnAligns={exportColumnAligns}
              spreadsheetColumnAligns={exportColumnAligns}
              fazendaNome={fazendaNomePdf}
              landscape
              pdfShowRegistrosSubtitle={false}
              pdfIncludeSpreadsheetTitle={false}
              spreadsheetSheetName="Lista de Animais"
              spreadsheetReportTitle={buildAnimaisExportTitle}
              spreadsheetAllowEmpty
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              variant="secondary"
              spreadsheetIntegerCols={[6]}
              spreadsheetTextCols={[0, 1]}
              spreadsheetColumnNumFmts={{ 7: "0.0", 8: "0.00", 9: "0.000" }}
              disabled={!hasFazendaFilter}
              disabledTitle={semFazendaHint}
            />
          </div>
        </div>

        <ListaAnimaisFiltros
          value={filters}
          onChange={handleFiltersChange}
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
          embedded
        />
        <TableHorizontalScroll
          footer={
            <div className="border-t border-gray-100">
              <TablePaginationFooter
                pageSize={perPage}
                page={page}
                totalItems={sortedAnimais.length}
                onPageChange={setPage}
                onPageSizeChange={size => {
                  setPerPage(size);
                  setPage(1);
                }}
                itemLabel="animais"
              />
            </div>
          }
        >
          <table className="w-full min-w-[1180px] text-[12px] border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {/* Cabeçalhos ordensáveis */}
                {([
                  { key: "brinco",      label: "Brinco",          align: "center", minW: "min-w-[72px]" },
                  { key: "rfid",        label: "Nº RFID",         align: "center", minW: "min-w-[80px]" },
                  { key: "categoria",   label: "Categoria",       align: "center", minW: "min-w-[88px]" },
                  { key: "lote",        label: "Lote",            align: "center", minW: "min-w-[88px]" },
                  { key: "sexo",        label: "Sexo",            align: "center", minW: "min-w-[72px]" },
                  { key: "idade",       label: "Idade",           align: "center", minW: "min-w-[64px]" },
                  { key: "diasFazenda", label: "Dias na Fazenda", align: "center", minW: "min-w-[88px]" },
                  { key: "ultimoPeso",  label: "Últ. Peso (kg)",  align: "center", minW: "min-w-[96px]" },
                  { key: "ganhoKg",     label: "Ganho (kg)",      align: "center", minW: "min-w-[80px]" },
                  { key: "gmd",         label: "GMD (kg/dia)",    align: "center", minW: "min-w-[88px]" },
                  { key: "emCarencia",  label: "Em Carência",     align: "center", minW: "min-w-[88px]" },
                ] as { key: AnimaisSortKey; label: string; align: string; minW: string }[]).map((col, idx) => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2.5 text-[11px] font-semibold text-gray-600 whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors text-${col.align} ${col.minW} ${
                      idx === 0 ? "sticky left-0 z-[3] bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]" : ""
                    }`}
                  >
                    {col.label}
                    <SortIcon col={col.key} sortKey={sortKey} sortAsc={sortAsc} />
                  </th>
                ))}
                {/* Coluna Ações */}
                <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-gray-600 whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isListLoading ? (
                <tr><td colSpan={12} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : needsFazendaSelection ? (
                <tr>
                  <td colSpan={12} className="px-4 py-16 align-middle">
                    <div className="max-w-md mx-auto text-center">
                      <img
                        src="/assets/icon-nascimentos-green.png"
                        alt="Rebanho"
                        width={48}
                        height={48}
                        className="mx-auto mb-3"
                        style={{
                          objectFit: "contain",
                          /* Tom cinza-azulado do ícone de rebanho (#B0BEC5) */
                          filter:
                            "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
                        }}
                      />
                      <p className="text-[14px] font-medium text-gray-800">
                        Selecione uma fazenda para visualizar os animais.
                      </p>
                      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                        Escolha uma fazenda no filtro acima para consultar, cadastrar, importar e
                        exportar o rebanho.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : isEmptyList ? (
                <tr>
                  <td colSpan={12}>
                    <AnimaisListEmptyState
                      hasActiveFilters={hasActiveFilters}
                      onNovoAnimal={goNovoAnimal}
                      onLimparFiltros={limparFiltros}
                      compact
                    />
                  </td>
                </tr>
              ) : paginated.map((animal) => (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                  {/* Brinco — fixo à esquerda */}
                  <td className="px-3 py-2 text-center sticky left-0 z-[1] bg-white shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] group-hover:bg-gray-50">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${animal.sexo === 'macho' ? 'bg-blue-400' : 'bg-pink-400'}`} />
                      <span className="font-semibold text-gray-800">{animal.brinco || "-"}</span>
                    </div>
                  </td>
                  {/* Nº RFID */}
                  <td className="px-3 py-2 text-center text-gray-800 font-mono text-[11px]">{animal.brincoEletronico || <span className="text-gray-300">—</span>}</td>
                  {/* Categoria */}
                  <td className="px-3 py-2.5 text-center">
                    {animal.categoria ? (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-[11px]">{animal.categoria}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Lote */}
                  <td className="px-3 py-2.5 text-center min-w-[88px]">
                    {animal.loteNome ? (
                      <span className={`px-2 py-0.5 rounded font-medium text-[11px] ${loteBadgeClass(animal.loteNome)}`}>{animal.loteNome}</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-medium text-[11px]">Sem lote</span>
                    )}
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
                  <td className="px-3 py-2 text-center tabular-nums font-medium text-gray-800 min-w-[96px] whitespace-nowrap">
                    {animal.ultimoPeso !== null && animal.ultimoPeso !== undefined ? (
                      formatUltimoPesoKg(animal.ultimoPeso)
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  {/* Ganho KG */}
                  <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                    {animal.ganhoKg !== null && animal.ganhoKg !== undefined ? (
                      <span className={Number(animal.ganhoKg) >= 0 ? "text-green-600" : "text-red-500"}>
                        {Number(animal.ganhoKg) >= 0 ? "+" : ""}{Number(animal.ganhoKg).toFixed(2)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* GMD */}
                  <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                    {animal.gmd !== null && animal.gmd !== undefined ? (
                      <span className={Number(animal.gmd) >= 0 ? "text-green-600 font-medium" : "text-red-500"}>
                        {Number(animal.gmd).toFixed(3)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {/* Em Carência */}
                  <td className="px-3 py-2 text-center align-middle">
                    <EmCarenciaCell emCarencia={!!animal.emCarencia} />
                  </td>
                  {/* Ações */}
                  <td className="px-3 py-2.5 text-center align-middle whitespace-nowrap">
                    <div className="flex justify-center">
                      <ViewEditDeleteRowActionButtons
                        viewLabel="Visualizar animal"
                        editLabel="Editar animal"
                        deleteLabel={
                          !!animal.exclusaoBloqueada
                            ? TOOLTIP_ANIMAL_EXCLUIR_BLOQUEADO
                            : TOOLTIP_ANIMAL_EXCLUIR
                        }
                        deleteBlocked={!!animal.exclusaoBloqueada}
                        onView={() => setLocation(`/rebanho/detalhes-animal?id=${animal.id}`)}
                        onEdit={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)}
                        onDelete={() => void handleDeleteAnimal(animal)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableHorizontalScroll>
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

// ─── Lista de Produtos ───────────────────────────────────────────────────────

type SortKeyEstoque =
  | "nome" | "categoria" | "quantidade" | "quantidadeMinima"
  | "validade" | "valorEmEstoque" | "status";

type StatusProdutoExibicao = "ativo" | "inativo" | "abaixo_minimo" | "vencendo" | "vencido";

type EstoqueItem = {
  id: number;
  produtoId?: number | null;
  nome: string;
  categoria?: string | null;
  unidade?: string | null;
  quantidade?: string | number | null;
  quantidadeMinima?: string | number | null;
  quantidadeMaxima?: string | number | null;
  valorUnitario?: string | number | null;
  controlarSaldo?: boolean | null;
  monitorarEstoque?: boolean | null;
  situacao?: string | null;
  fabricante?: string | null;
  identificadorUnico?: string | number | null;
  fazendaId?: number | null;
  /** Quando agrega catálogo sem filtro de fazenda */
  fazendasVinculadas?: string[];
  idsEstoque?: number[];
  /** Alerta de mínimo em alguma fazenda (visão agregada) */
  alertaAbaixoAgregado?: boolean;
};

const numEstoque = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const formatEstoqueComUnidade = (qtd: number, unidade: string | null | undefined) =>
  formatQtdComSigla(qtd, unidade);

const resolverStatusProduto = (
  item: EstoqueItem,
  validade: string | null | undefined,
): StatusProdutoExibicao => {
  if (item.situacao === "inativo") return "inativo";
  const dias = validade ? diasAte(validade) : null;
  if (dias != null && dias < 0) return "vencido";
  if (dias != null && dias <= 30) return "vencendo";
  if (isAbaixoEstoqueMinimo(item)) return "abaixo_minimo";
  return "ativo";
};

/** Condição de estoque (alerta) — independente do status Ativo/Inativo. */
const isAbaixoEstoqueMinimo = (item: EstoqueItem): boolean => {
  if (item.alertaAbaixoAgregado) return true;
  return Boolean(
    item.monitorarEstoque &&
      produtoControlaSaldo(item.controlarSaldo) &&
      numEstoque(item.quantidadeMinima) > 0 &&
      numEstoque(item.quantidade) <= numEstoque(item.quantidadeMinima),
  );
};

const isAcimaEstoqueMaximo = (item: EstoqueItem): boolean =>
  Boolean(
    item.monitorarEstoque &&
      produtoControlaSaldo(item.controlarSaldo) &&
      numEstoque(item.quantidadeMaxima) > 0 &&
      numEstoque(item.quantidade) > numEstoque(item.quantidadeMaxima),
  );

type AlertaEstoqueFiltro = "todos" | "abaixo_minimo" | "acima_maximo";

type ControleSaldoFiltro = "todos" | "estocavel" | "consumo_direto";

const PRODUTO_FILTRO_SELECT_EMPTY = "__empty__";

const produtoFiltroInputCls =
  "border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white min-w-0 focus:outline-none focus:border-[#4ECDC4] transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

/** Mesmo visual dos `<select>` nativos — só troca o dropdown para destaque verde. */
const produtoFiltroTriggerCls =
  "w-full h-auto min-h-0 py-1.5 border-gray-300 text-[12px] text-gray-700 shadow-none focus-visible:ring-0";

function ProdutoListaFilterSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  widthClass,
  allowEmpty = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  widthClass: string;
  allowEmpty?: boolean;
}) {
  const current = String(value ?? "").trim();
  return (
    <div className={cn("min-w-0", widthClass)}>
      <FormSelect
        variant="light"
        disabled={disabled}
        value={allowEmpty && !current ? PRODUTO_FILTRO_SELECT_EMPTY : current}
        onChange={v => onChange(allowEmpty && v === PRODUTO_FILTRO_SELECT_EMPTY ? "" : v)}
        placeholder={placeholder}
        triggerClassName={produtoFiltroTriggerCls}
      >
        {allowEmpty ? (
          <SelectItem value={PRODUTO_FILTRO_SELECT_EMPTY} className="text-[12px] text-gray-400">
            {placeholder}
          </SelectItem>
        ) : null}
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </FormSelect>
    </div>
  );
}

const rotuloAlertaEstoque = (item: EstoqueItem): string => {
  if (isAbaixoEstoqueMinimo(item)) return "Abaixo do mínimo";
  if (isAcimaEstoqueMaximo(item)) return "Acima do máximo";
  return "—";
};

/** Badge compacto de alerta operacional (coluna Alerta) — separado do Status. */
type AlertaEstoqueTipo = "abaixo_minimo" | "acima_maximo" | "validade_proxima" | "vencido";

const ALERTA_ESTOQUE_BADGE_CLASS: Record<AlertaEstoqueTipo, string> = {
  // Urgência alta — risco de falta
  abaixo_minimo: "bg-red-50 text-red-800 border border-red-200/90",
  // Atenção moderada — excesso
  acima_maximo: "bg-amber-50 text-amber-900 border border-amber-200/90",
  // Padrão reservado (hierarquia); não inventar alertas novos na coluna
  validade_proxima: "bg-orange-50 text-orange-800 border border-orange-200/90",
  vencido: "bg-red-100 text-red-900 border border-red-300/80",
};

const ALERTA_ESTOQUE_BADGE_BASE =
  "inline-flex items-center justify-center h-[22px] max-w-full px-2 rounded text-[10px] font-medium leading-none whitespace-nowrap align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 focus-visible:ring-offset-1";

function tooltipAlertaEstoque(item: EstoqueItem, tipo: AlertaEstoqueTipo): string | null {
  const atual = formatEstoqueComUnidade(numEstoque(item.quantidade), item.unidade);
  if (tipo === "abaixo_minimo") {
    const minVal = numEstoque(item.quantidadeMinima);
    if (item.monitorarEstoque && minVal > 0) {
      const minimo = formatEstoqueComUnidade(minVal, item.unidade);
      return `Estoque atual: ${atual}. Mínimo configurado: ${minimo}.`;
    }
    // Agregado: não inventar mínimo zero como limite real
    if (item.alertaAbaixoAgregado) {
      return `Estoque atual: ${atual}. Abaixo do mínimo em ao menos uma fazenda.`;
    }
    return null;
  }
  if (tipo === "acima_maximo") {
    const maxVal = numEstoque(item.quantidadeMaxima);
    if (!(item.monitorarEstoque && maxVal > 0)) return null;
    const maximo = formatEstoqueComUnidade(maxVal, item.unidade);
    return `Estoque atual: ${atual}. Máximo configurado: ${maximo}.`;
  }
  return null;
}

function AlertaEstoqueBadge({
  tipo,
  label,
  tooltip,
}: {
  tipo: AlertaEstoqueTipo;
  label: string;
  tooltip?: string | null;
}) {
  const badgeClass = `${ALERTA_ESTOQUE_BADGE_BASE} ${ALERTA_ESTOQUE_BADGE_CLASS[tipo]}`;

  if (!tooltip) {
    return <span className={badgeClass}>{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={badgeClass} aria-label={`${label}. ${tooltip}`}>
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-[280px] text-[11px] leading-relaxed"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function renderAlertaEstoqueCell(item: EstoqueItem) {
  // Prioridade: abaixo do mínimo > acima do máximo (incompatíveis entre si).
  // Validade permanece na coluna Validade — não inventar tipos novos aqui.
  if (isAbaixoEstoqueMinimo(item)) {
    return (
      <AlertaEstoqueBadge
        tipo="abaixo_minimo"
        label="Abaixo do mínimo"
        tooltip={tooltipAlertaEstoque(item, "abaixo_minimo")}
      />
    );
  }
  if (isAcimaEstoqueMaximo(item)) {
    return (
      <AlertaEstoqueBadge
        tipo="acima_maximo"
        label="Acima do máximo"
        tooltip={tooltipAlertaEstoque(item, "acima_maximo")}
      />
    );
  }
  return <span className="text-gray-400">—</span>;
}

const statusOperacional = (item: EstoqueItem): "ativo" | "inativo" =>
  item.situacao === "inativo" ? "inativo" : "ativo";

const STATUS_PRODUTO_LABEL: Record<StatusProdutoExibicao, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  abaixo_minimo: "Abaixo do mínimo",
  vencendo: "Vencendo",
  vencido: "Vencido",
};

const STATUS_PRODUTO_CLASS: Record<StatusProdutoExibicao, string> = {
  ativo: "bg-green-100 text-green-700",
  inativo: "bg-gray-100 text-gray-600",
  abaixo_minimo: "bg-orange-100 text-orange-700",
  vencendo: "bg-amber-100 text-amber-800",
  vencido: "bg-red-100 text-red-700",
};

function StatusProdutoBadge({ status }: { status: StatusProdutoExibicao }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${STATUS_PRODUTO_CLASS[status]}`}>
      {STATUS_PRODUTO_LABEL[status]}
    </span>
  );
}

function ListaProdutosEmptyState() {
  return (
    <div className="py-12 sm:py-14 px-6 text-center">
      <img
        src="/assets/icon-insumo-saco-green.png"
        alt="Insumos"
        width={48}
        height={48}
        className="mx-auto"
        style={{
          objectFit: "contain",
          filter:
            "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
        }}
      />
      <h2 className="text-[18px] font-semibold text-gray-900 mt-4" style={{ fontFamily: "Fraunces, serif" }}>
        Nenhum produto cadastrado.
      </h2>
      <p className="text-[13px] text-gray-600 mt-2 max-w-xl mx-auto leading-relaxed">
        Cadastre insumos como sal mineral, medicamentos, vacinas, defensivos, sementes, ração ou outros produtos usados na fazenda.
      </p>
    </div>
  );
}

export function EstoquePage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const confirmAction = useConfirm();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  /** Vazio = nenhuma fazenda selecionada (obrigatório escolher) */
  const [estoqueFiltro, setEstoqueFiltro] = useState<string>("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [statusFiltro, setStatusFiltro] = useState<"ativo" | "inativo" | "todos">("ativo");
  /** Condição de estoque — dimensão separada do status operacional. */
  const [alertaFiltro, setAlertaFiltro] = useState<AlertaEstoqueFiltro>("todos");
  const [controleFiltro, setControleFiltro] = useState<ControleSaldoFiltro>("todos");
  /** Filtro opcional por categoria (vindo da Visão Geral / URL). */
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<SortKeyEstoque>("nome");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const retornoVisaoGeral = useMemo(() => {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    return parseRetornoVisaoGeral(params.get("retorno"));
  }, [searchString]);

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: items = [], isLoading, refetch } = trpc.estoque.list.useQuery();
  const { data: movs = [] } = trpc.estoque.listMovimentacoes.useQuery();

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    const fromUrl = params.get("fazendaId");
    const urlOk = fromUrl && ids.some(id => String(id) === fromUrl) ? fromUrl : "";
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved =
      urlOk ||
      fromStorage ||
      (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setEstoqueFiltro(resolved);
      persistRebanhoFazendaId(resolved);
    }
    const alerta = params.get("alerta");
    if (alerta === "abaixo_minimo" || alerta === "acima_maximo") {
      setAlertaFiltro(alerta);
      setStatusFiltro("ativo");
    }
    const statusUrl = params.get("status");
    if (statusUrl === "ativo" || statusUrl === "inativo" || statusUrl === "todos") {
      setStatusFiltro(statusUrl);
    }
    const buscaUrl = params.get("busca") || params.get("q");
    if (buscaUrl) setSearch(buscaUrl);
    const categoriaUrl = params.get("categoria");
    if (categoriaUrl) setCategoriaFiltro(categoriaUrl);
    const controleUrl = params.get("controle");
    if (controleUrl === "estocavel" || controleUrl === "consumo_direto") {
      setControleFiltro(controleUrl);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas, searchString]);

  const fazendaSelecionada = Boolean(estoqueFiltro);
  const fazendaSelecionadaNome = useMemo(
    () => fazendas.find(f => String(f.id) === estoqueFiltro)?.nome,
    [fazendas, estoqueFiltro]
  );

  const categoriasDisponiveis = useMemo(() => {
    if (!fazendaSelecionada) return [] as string[];
    const fazendaId = parseInt(estoqueFiltro, 10);
    const set = new Set<string>();
    for (const i of items as EstoqueItem[]) {
      if (Number(i.fazendaId) !== fazendaId) continue;
      set.add(i.categoria?.trim() || "Sem categoria");
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items, estoqueFiltro, fazendaSelecionada]);

  const deleteMutation = trpc.estoque.delete.useMutation({
    onSuccess: async (data) => {
      toast.success(
        data.escopo === "catalogo"
          ? "Produto removido do catálogo!"
          : "Produto desvinculado desta Fazenda!"
      );
      setSelectedIds(new Set());
      await utils.estoque.list.invalidate();
      await utils.estoque.listMovimentacoes.invalidate();
      await refetch();
    },
    onError: (e) => toast.error(e.message || "Não foi possível excluir o produto."),
  });

  const inativarMutation = trpc.estoque.inativarProdutos.useMutation({
    onSuccess: () => {
      toast.success("Produto(s) inativado(s) nesta Fazenda.");
      setSelectedIds(new Set());
      void utils.estoque.list.invalidate();
      void refetch();
    },
    onError: () => toast.error("Não foi possível inativar os produtos."),
  });
  const ativarMutation = trpc.estoque.ativarProdutos.useMutation({
    onSuccess: () => {
      toast.success("Produto(s) ativado(s) nesta Fazenda.");
      setSelectedIds(new Set());
      void utils.estoque.list.invalidate();
      void refetch();
    },
    onError: () => toast.error("Não foi possível ativar os produtos."),
  });

  const validadePorProduto = useMemo(() => {
    const map = new Map<number, string>();
    for (const mv of movs) {
      if (!mv.dataValidade) continue;
      const atual = map.get(mv.estoqueId);
      if (!atual || mv.dataValidade < atual) map.set(mv.estoqueId, mv.dataValidade);
    }
    return map;
  }, [movs]);

  const fornecedoresPorProduto = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const mv of movs) {
      if (!mv.fornecedor?.trim()) continue;
      const fornecedor = mv.fornecedor.trim().toLowerCase();
      if (!map.has(mv.estoqueId)) map.set(mv.estoqueId, new Set());
      map.get(mv.estoqueId)!.add(fornecedor);
    }
    return map;
  }, [movs]);

  const produtosComMovimentacao = useMemo(() => {
    const set = new Set<number>();
    for (const mv of movs) set.add(mv.estoqueId);
    return set;
  }, [movs]);

  const precoMedioImplicit = useMemo(() => {
    const totalQtd = new Map<number, number>();
    const totalVal = new Map<number, number>();
    for (const mv of movs) {
      const status = String(mv.status || "ativa").toLowerCase();
      if (status === "estornada" || status === "estorno") continue;
      const qtd = numEstoque(mv.quantidade);
      // Só entradas que ainda compõem o estoque (qtd > 0). Estornos técnicos têm qtd negativa.
      if (!(qtd > 0)) continue;
      const val = numEstoque(mv.valor);
      if (val > 0) {
        totalQtd.set(mv.estoqueId, (totalQtd.get(mv.estoqueId) ?? 0) + qtd);
        totalVal.set(mv.estoqueId, (totalVal.get(mv.estoqueId) ?? 0) + val);
      }
    }
    const map = new Map<number, number>();
    for (const [id, qtd] of totalQtd.entries()) {
      const val = totalVal.get(id) ?? 0;
      map.set(id, qtd > 0 ? val / qtd : 0);
    }
    return map;
  }, [movs]);

  const precoEfetivo = (item: EstoqueItem) =>
    numEstoque(item.valorUnitario) || (precoMedioImplicit.get(item.id) ?? 0);

  const valorEmEstoque = (item: EstoqueItem) =>
    numEstoque(item.quantidade) * precoEfetivo(item);

  const novoProdutoPath = fazendaSelecionada
    ? `/insumos/cadastro?fazendaId=${estoqueFiltro}`
    : "/insumos/cadastro";

  const handleNovoProduto = () => {
    if (!fazendaSelecionada) {
      toast.error("Selecione uma fazenda antes de cadastrar ou vincular um produto ao estoque.");
      return;
    }
    setLocation(novoProdutoPath);
  };

  const filtered = useMemo(() => {
    if (!fazendaSelecionada) return [] as EstoqueItem[];

    let list = [...items] as EstoqueItem[];
    const fazendaId = parseInt(estoqueFiltro, 10);
    list = list.filter(i => Number(i.fazendaId) === fazendaId);

    if (statusFiltro !== "todos") {
      list = list.filter(i => (i.situacao ?? "ativo") === statusFiltro);
    }
    if (alertaFiltro === "abaixo_minimo") {
      list = list.filter(i => isAbaixoEstoqueMinimo(i));
    } else if (alertaFiltro === "acima_maximo") {
      list = list.filter(i => isAcimaEstoqueMaximo(i));
    }
    if (categoriaFiltro.trim()) {
      const alvo = categoriaFiltro.trim().toLowerCase();
      list = list.filter(i => {
        const cat = i.categoria?.trim() || "Sem categoria";
        return cat.toLowerCase() === alvo;
      });
    }
    if (controleFiltro === "estocavel") {
      list = list.filter(i => produtoControlaSaldo(i.controlarSaldo));
    } else if (controleFiltro === "consumo_direto") {
      list = list.filter(i => !produtoControlaSaldo(i.controlarSaldo));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => {
        const campos = [
          i.nome,
          i.categoria,
          i.fabricante,
        ];
        const matchCampo = campos.some(v => v && String(v).toLowerCase().includes(q));
        const matchFornecedor = [...(fornecedoresPorProduto.get(i.id) ?? [])].some(f => f.includes(q));
        return matchCampo || matchFornecedor;
      });
    }
    list.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "nome": va = String(a.nome ?? "").toLowerCase(); vb = String(b.nome ?? "").toLowerCase(); break;
        case "categoria": va = String(a.categoria ?? "").toLowerCase(); vb = String(b.categoria ?? "").toLowerCase(); break;
        case "quantidadeMinima": va = numEstoque(a.quantidadeMinima); vb = numEstoque(b.quantidadeMinima); break;
        case "quantidade": va = numEstoque(a.quantidade); vb = numEstoque(b.quantidade); break;
        case "validade":
          va = validadePorProduto.get(a.id) ?? "";
          vb = validadePorProduto.get(b.id) ?? "";
          break;
        case "valorEmEstoque": va = valorEmEstoque(a); vb = valorEmEstoque(b); break;
        case "status":
          va = (a.situacao ?? "ativo") === "inativo" ? "inativo" : "ativo";
          vb = (b.situacao ?? "ativo") === "inativo" ? "inativo" : "ativo";
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, estoqueFiltro, fazendaSelecionada, statusFiltro, alertaFiltro, controleFiltro, categoriaFiltro, sortKey, sortAsc, fornecedoresPorProduto, validadePorProduto, precoMedioImplicit]);

  /** Soma do valor em estoque da lista filtrada — só estocáveis com valor > 0 (igual Visão Geral). */
  const valorTotalLista = useMemo(() => {
    let soma = 0;
    let comValor = 0;
    let estocaveis = 0;
    for (const item of filtered) {
      if (!produtoControlaSaldo(item.controlarSaldo)) continue;
      estocaveis += 1;
      const valor = valorEmEstoque(item);
      if (!(valor > 0)) continue;
      soma += valor;
      comValor += 1;
    }
    return { soma, comValor, estocaveis };
  }, [filtered, precoMedioImplicit]);

  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  const acaoEmLote = useMemo((): "ativar" | "inativar" | null => {
    if (selectedIds.size === 0) return null;
    if (statusFiltro === "inativo") return "ativar";
    if (statusFiltro === "ativo") return "inativar";
    const selecionados = filtered.filter(i => selectedIds.has(i.id));
    if (selecionados.every(i => i.situacao === "inativo")) return "ativar";
    if (selecionados.every(i => (i.situacao ?? "ativo") === "ativo")) return "inativar";
    return null;
  }, [selectedIds, statusFiltro, filtered]);

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

  const limparSelecao = () => setSelectedIds(new Set());

  const handleInativarIndividual = async (id: number) => {
    const ok = await confirmAction({
      title: "Inativar nesta Fazenda",
      description:
        "Deseja inativar este produto apenas na fazenda selecionada? O produto continuará existindo no catálogo geral e poderá permanecer ativo em outras Fazendas.",
      confirmText: "Inativar nesta Fazenda",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (ok) inativarMutation.mutate({ ids: [id], escopo: "fazenda" });
  };

  const handleInativarLote = async () => {
    const ids = Array.from(selectedIds);
    const qtd = ids.length;
    const ok = await confirmAction({
      title: "Inativar nesta Fazenda",
      description: `Deseja inativar ${qtd} produto(s) apenas na fazenda selecionada? Eles continuarão existindo no catálogo geral e poderão permanecer ativos em outras Fazendas.`,
      confirmText: "Inativar nesta Fazenda",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (ok) inativarMutation.mutate({ ids, escopo: "fazenda" });
  };

  const handleExcluirProduto = async (id: number, nome: string, bloqueado: boolean) => {
    if (bloqueado) {
      toast.error(
        "Produto com movimentações ou estoque não pode ser desvinculado. Inative o produto nesta fazenda para removê-lo da operação.",
      );
      return;
    }
    const fazendaNome = fazendaSelecionadaNome ?? "fazenda selecionada";
    const ok = await confirmAction({
      title: "Desvincular produto da fazenda",
      description: `O produto será removido da Fazenda ${fazendaNome}, mas continuará disponível no catálogo geral da conta. Deseja continuar?`,
      confirmText: "Confirmar desvínculo",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id, escopo: "fazenda" });
  };

  const handleAtivarIndividual = async (id: number) => {
    const ok = await confirmAction({
      title: "Ativar nesta Fazenda",
      description: "Deseja reativar este produto nesta Fazenda?",
      confirmText: "Ativar nesta Fazenda",
      cancelText: "Cancelar",
      variant: "default",
    });
    if (ok) ativarMutation.mutate({ ids: [id], escopo: "fazenda" });
  };

  const handleAtivarLote = async () => {
    const ids = Array.from(selectedIds);
    const qtd = ids.length;
    const ok = await confirmAction({
      title: "Ativar nesta Fazenda",
      description: `Deseja reativar ${qtd} produto(s) nesta Fazenda?`,
      confirmText: "Ativar nesta Fazenda",
      cancelText: "Cancelar",
      variant: "default",
    });
    if (ok) ativarMutation.mutate({ ids, escopo: "fazenda" });
  };

  const exportFazendaNomePdf = fazendaSelecionadaNome;

  const buildProdutosExportTitle = () =>
    exportFazendaNomePdf
      ? `${exportFazendaNomePdf} — Lista de Produtos`
      : "Lista de Produtos";

  const exportHeaders = [
    "Produto", "Categoria", "Estoque", "Mínimo", "Valor", "Validade", "Status", "Alerta",
  ];
  const exportRows = useMemo(() => {
    const detailRows = filtered.map(item => {
      const validade = validadePorProduto.get(item.id);
      const statusOp = statusOperacional(item);
      const valor = valorEmEstoque(item);
      const minimo =
        produtoControlaSaldo(item.controlarSaldo) &&
        item.monitorarEstoque &&
        numEstoque(item.quantidadeMinima) > 0
          ? formatEstoqueComUnidade(numEstoque(item.quantidadeMinima), item.unidade)
          : "—";

      return [
        item.nome,
        item.categoria?.trim() || "—",
        produtoControlaSaldo(item.controlarSaldo)
          ? formatEstoqueComUnidade(numEstoque(item.quantidade), item.unidade)
          : "Uso imediato",
        minimo,
        valor > 0 ? valor : "",
        validade ? formatDataBr(validade) : "—",
        STATUS_PRODUTO_LABEL[statusOp],
        rotuloAlertaEstoque(item),
      ];
    });

    if (detailRows.length === 0) return detailRows;

    return [
      ...detailRows,
      [
        "Valor em estoque",
        "",
        "",
        "",
        valorTotalLista.soma > 0 ? valorTotalLista.soma : "",
        "",
        "",
        "",
      ],
    ];
  }, [filtered, validadePorProduto, precoMedioImplicit, valorTotalLista]);

  const isEmptyCadastro = fazendaSelecionada && !isLoading && items.length === 0;
  const isEmptySemFazenda = !fazendaSelecionada && fazendaInitDone;
  const isEmptyFiltro =
    fazendaSelecionada && !isLoading && filtered.length === 0 && items.length > 0;

  const SORT_TIPS: Record<SortKeyEstoque, string> = {
    nome: "Ordenar por produto",
    categoria: "Ordenar por categoria",
    quantidade: "Ordenar por estoque",
    quantidadeMinima: "Ordenar por estoque mínimo",
    valorEmEstoque: "Ordenar por valor",
    validade: "Ordenar por validade",
    status: "Ordenar por status",
  };

  const SortIcon = ({ col }: { col: SortKeyEstoque }) => {
    if (sortKey === col) {
      return (
        <span className="material-icons text-[14px] text-gray-500 ml-0.5 align-middle leading-none">
          {sortAsc ? "arrow_drop_up" : "arrow_drop_down"}
        </span>
      );
    }
    return (
      <span className="material-icons text-[13px] text-gray-300 ml-0.5 align-middle leading-none opacity-0 group-hover/th:opacity-100 transition-opacity">
        unfold_more
      </span>
    );
  };

  const thClass =
    "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none text-left hover:bg-gray-100 transition-colors group/th";

  const stickyProdutoTh =
    "sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-200";
  const stickyProdutoTd =
    "sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-100";

  const produtoColunas: [SortKeyEstoque, string, string][] = [
    ["nome", "Produto", "min-w-[140px]"],
    ["categoria", "Categoria", "min-w-[100px]"],
    ["quantidade", "Estoque", "min-w-[88px]"],
    ["quantidadeMinima", "Mínimo", "min-w-[80px]"],
    ["valorEmEstoque", "Valor", "min-w-[96px]"],
    ["validade", "Validade", "min-w-[88px]"],
    ["status", "Status", "min-w-[88px]"],
  ];

  const renderProdutoRow = (item: EstoqueItem) => {
    const validade = validadePorProduto.get(item.id);
    const statusOp = statusOperacional(item);
    const valor = valorEmEstoque(item);
    const minimo =
      produtoControlaSaldo(item.controlarSaldo) &&
      item.monitorarEstoque &&
      numEstoque(item.quantidadeMinima) > 0
        ? formatEstoqueComUnidade(numEstoque(item.quantidadeMinima), item.unidade)
        : "—";
    const validadeDias = validade ? diasAte(validade) : null;
    const temMovimentacao = produtosComMovimentacao.has(item.id);
    const temEstoque = numEstoque(item.quantidade) !== 0;
    const desvinculoBloqueado = temMovimentacao || temEstoque;
    const tooltipDesvincular = desvinculoBloqueado
      ? "Produto com movimentações ou estoque não pode ser desvinculado. Inative o produto nesta fazenda para removê-lo da operação."
      : "Desvincular da fazenda";

    return (
      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
        <td className="px-2 py-2 text-center w-10">
          <input
            type="checkbox"
            className="accent-[#4ECDC4]"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleSelect(item.id)}
          />
        </td>
        <td className={`px-3 py-2 align-middle ${stickyProdutoTd}`}>
          <div className="font-medium text-[13px] text-gray-900 leading-snug">{item.nome}</div>
        </td>
        <td className="px-3 py-2 text-gray-700 align-middle">{item.categoria?.trim() || "—"}</td>
        <td className="px-3 py-2 tabular-nums text-gray-900 align-middle whitespace-nowrap">
          {produtoControlaSaldo(item.controlarSaldo) ? (
            formatEstoqueComUnidade(numEstoque(item.quantidade), item.unidade)
          ) : (
            <span className="text-gray-500 italic text-[12px]">Uso imediato</span>
          )}
        </td>
        <td className="px-3 py-2 tabular-nums text-gray-700 align-middle whitespace-nowrap">{minimo}</td>
        <td className="px-3 py-2 tabular-nums text-gray-700 align-middle whitespace-nowrap">
          {valor > 0 ? brl(valor) : "—"}
        </td>
        <td
          className={`px-3 py-2 tabular-nums align-middle whitespace-nowrap ${
            validadeDias != null && validadeDias <= 30
              ? validadeDias < 0
                ? "text-red-600 font-medium"
                : "text-amber-700"
              : "text-gray-700"
          }`}
        >
          {validade ? formatDataBr(validade) : "—"}
        </td>
        <td className="px-3 py-2 align-middle">
          <StatusProdutoBadge status={statusOp} />
        </td>
        <td className="px-3 py-2 align-middle whitespace-nowrap">
          {renderAlertaEstoqueCell(item)}
        </td>
        <td className="px-2 py-2 align-middle">
          <div className="flex items-center justify-end gap-0.5">
            <TableIconButton
              label="Editar"
              onClick={() => setLocation(`/insumos/cadastro?id=${item.id}`)}
              tone="neutral"
              compact
            >
              <EditActionIcon size={16} />
            </TableIconButton>
            {item.situacao === "inativo" ? (
              <TableIconButton
                label="Ativar nesta fazenda"
                onClick={() => void handleAtivarIndividual(item.id)}
                tone="success"
                compact
              >
                <ActivateActionIcon size={16} />
              </TableIconButton>
            ) : (
              <TableIconButton
                label="Inativar nesta fazenda"
                onClick={() => void handleInativarIndividual(item.id)}
                tone="warning"
                compact
              >
                <InactivateActionIcon size={16} />
              </TableIconButton>
            )}
            <TableIconButton
              label={tooltipDesvincular}
              onClick={() => void handleExcluirProduto(item.id, item.nome, desvinculoBloqueado)}
              tone={desvinculoBloqueado ? "neutral" : "danger"}
              blocked={desvinculoBloqueado}
              compact
            >
              <DeleteActionIcon
                size={16}
                style={desvinculoBloqueado ? { color: "#9CA3AF" } : undefined}
              />
            </TableIconButton>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <AppLayout>
      {retornoVisaoGeral ? (
        <button
          type="button"
          onClick={() => setLocation(retornoVisaoGeral)}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          aria-label="Voltar"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span className="text-[13px]">Voltar</span>
        </button>
      ) : null}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Lista de Produtos
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNovoProduto}
              aria-disabled={!fazendaSelecionada}
              title={
                fazendaSelecionada
                  ? "Cadastrar ou vincular produto à fazenda selecionada"
                  : "Selecione uma fazenda antes de cadastrar ou vincular um produto ao estoque"
              }
              className={`inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px] ${
                fazendaSelecionada
                  ? "hover:brightness-95 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed"
              }`}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              Novo Produto
            </button>
            <ListExportButtons
              title="Lista de Produtos"
              filename="lista-produtos"
              headers={exportHeaders}
              rows={fazendaSelecionada ? exportRows : []}
              fazendaNome={exportFazendaNomePdf}
              disabled={!fazendaSelecionada}
              variant="secondary"
              spreadsheetAllowEmpty
              spreadsheetSheetName="Lista de Produtos"
              spreadsheetReportTitle={buildProdutosExportTitle}
              spreadsheetPlainHeader
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetTextCols={[0, 1, 2, 3, 5, 6, 7]}
              spreadsheetCurrencyCols={[4]}
              spreadsheetColumnAligns={["center", "center", "center", "center", "center", "center", "center", "center"]}
              pdfColumnAligns={["center", "center", "center", "center", "center", "center", "center", "center"]}
              pdfIncludeSpreadsheetTitle={false}
              pdfShowRegistrosSubtitle={false}
            />
          </div>
        </div>

        {/* Filtros + busca */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.7fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,1.1fr)] gap-2 items-center">
            <div className="col-span-2 md:col-span-2 xl:col-span-1 min-w-0">
              <ProdutoListaFilterSelect
                value={estoqueFiltro}
                onChange={value => {
                  setEstoqueFiltro(value);
                  persistRebanhoFazendaId(value);
                  setCategoriaFiltro("");
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                placeholder="Selecione uma fazenda"
                widthClass="w-full"
                options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
              />
            </div>
            <div className="min-w-0">
              <ProdutoListaFilterSelect
                value={statusFiltro}
                onChange={value => {
                  setStatusFiltro(value as "ativo" | "inativo" | "todos");
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                placeholder="Ativos"
                allowEmpty={false}
                disabled={!fazendaSelecionada}
                widthClass="w-full"
                options={[
                  { value: "ativo", label: "Ativos" },
                  { value: "inativo", label: "Inativos" },
                  { value: "todos", label: "Todos" },
                ]}
              />
            </div>
            <div className="min-w-0">
              <ProdutoListaFilterSelect
                value={alertaFiltro}
                onChange={value => {
                  setAlertaFiltro(value as AlertaEstoqueFiltro);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                placeholder="Alerta: Todos"
                allowEmpty={false}
                disabled={!fazendaSelecionada}
                widthClass="w-full"
                options={[
                  { value: "todos", label: "Alerta: Todos" },
                  { value: "abaixo_minimo", label: "Abaixo do mínimo" },
                  { value: "acima_maximo", label: "Acima do máximo" },
                ]}
              />
            </div>
            <div className="min-w-0">
              <ProdutoListaFilterSelect
                value={controleFiltro}
                onChange={value => {
                  setControleFiltro(value as ControleSaldoFiltro);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                placeholder="Controle: Todos"
                allowEmpty={false}
                disabled={!fazendaSelecionada}
                widthClass="w-full"
                options={[
                  { value: "todos", label: "Controle: Todos" },
                  { value: "estocavel", label: "Estocável" },
                  { value: "consumo_direto", label: "Uso imediato" },
                ]}
              />
            </div>
            <div className="min-w-0">
              <ProdutoListaFilterSelect
                value={categoriaFiltro}
                onChange={value => {
                  setCategoriaFiltro(value);
                  setPage(1);
                  setSelectedIds(new Set());
                }}
                placeholder="Categoria: Todas"
                disabled={!fazendaSelecionada}
                widthClass="w-full"
                options={categoriasDisponiveis.map(c => ({ value: c, label: c }))}
              />
            </div>
            <div className="col-span-2 md:col-span-2 xl:col-span-1 min-w-0">
              <div className="relative w-full">
                <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">search</span>
                <input
                  type="text"
                  placeholder="Buscar produto"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  disabled={!fazendaSelecionada}
                  title={!fazendaSelecionada ? "Selecione uma fazenda para buscar produtos" : undefined}
                  className={`${produtoFiltroInputCls} pl-8 pr-3 w-full`}
                />
              </div>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && fazendaSelecionada && (
          <div className="border-b border-gray-100 bg-[#F8FAFA]">
            <div className="px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
              <span className="font-medium text-gray-700 shrink-0">
                {selectedIds.size === 1
                  ? "1 produto selecionado"
                  : `${selectedIds.size} produtos selecionados`}
              </span>
              {acaoEmLote === "inativar" && (
                <button
                  type="button"
                  onClick={() => void handleInativarLote()}
                  disabled={inativarMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 h-8 min-h-8 rounded-full text-[11px] font-semibold uppercase tracking-wide text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 hover:opacity-90 transition shrink-0"
                  style={{ backgroundColor: "#D97706" }}
                >
                  Inativar nesta Fazenda
                </button>
              )}
              {acaoEmLote === "ativar" && (
                <button
                  type="button"
                  onClick={() => void handleAtivarLote()}
                  disabled={ativarMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-4 h-8 min-h-8 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 hover:opacity-90 transition shrink-0"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Ativar nesta Fazenda
                </button>
              )}
              <button
                type="button"
                onClick={limparSelecao}
                aria-label="Limpar seleção de produtos"
                className="inline-flex items-center min-h-8 px-2 rounded text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 shrink-0"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        )}

        {isEmptySemFazenda ? (
          <div className="px-5 py-16 text-center">
            <img
              src="/assets/icon-insumo-saco-green.png"
              alt="Insumos"
              width={48}
              height={48}
              className="mx-auto mb-3"
              style={{
                objectFit: "contain",
                /* Tom cinza-azulado do ícone de rebanho (#B0BEC5) */
                filter:
                  "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
              }}
            />
            <p className="text-[14px] font-medium text-gray-800">
              Selecione uma fazenda para visualizar os produtos vinculados ao estoque.
            </p>
            <p className="text-[12px] text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
              Os produtos são cadastrados de forma universal, mas estoque, validade, mínimo, valor e status são controlados individualmente por fazenda.
            </p>
          </div>
        ) : isEmptyCadastro ? (
          <ListaProdutosEmptyState />
        ) : (
          <TableHorizontalScroll
            footer={
              <div className="border-t border-gray-100">
                {!isLoading && filtered.length > 0 ? (
                  <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                    <span>
                      Valor em estoque:{" "}
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {brl(valorTotalLista.soma)}
                      </span>
                    </span>
                    {controleFiltro === "consumo_direto" ? (
                      <span className="text-[10px] text-gray-500 italic">
                        Produtos de uso imediato não entram no valor em estoque.
                      </span>
                    ) : valorTotalLista.estocaveis > valorTotalLista.comValor ? (
                      <span className="text-[10px] text-gray-500">
                        {valorTotalLista.estocaveis - valorTotalLista.comValor}{" "}
                        {valorTotalLista.estocaveis - valorTotalLista.comValor === 1
                          ? "produto estocável sem valor em estoque"
                          : "produtos estocáveis sem valor em estoque"}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <TablePaginationFooter
                  pageSize={perPage}
                  page={page}
                  totalItems={filtered.length}
                  onPageChange={setPage}
                  onPageSizeChange={size => {
                    setPerPage(size);
                    setPage(1);
                  }}
                  itemLabel="produtos"
                />
              </div>
            }
          >
            <table className="w-full min-w-[920px] text-[12px] border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-2 py-2.5">
                    <input
                      type="checkbox"
                      className="accent-[#4ECDC4]"
                      checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
                      onChange={toggleAll}
                      aria-label="Selecionar todos da página"
                    />
                  </th>
                  {produtoColunas.map(([key, label, minW]) => {
                    const isProduto = key === "nome";
                    const sortTitle =
                      sortKey === key
                        ? `${SORT_TIPS[key]} (${sortAsc ? "crescente" : "decrescente"})`
                        : SORT_TIPS[key];
                    const th = (
                      <th
                        key={key}
                        title={sortTitle}
                        className={`${thClass} ${minW}${isProduto ? ` ${stickyProdutoTh}` : ""}`}
                        onClick={() => toggleSort(key)}
                      >
                        <span className="inline-flex items-center">
                          {label}
                          <SortIcon col={key} />
                        </span>
                      </th>
                    );
                    if (key === "status") {
                      return (
                        <Fragment key="status-alerta">
                          {th}
                          <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap text-left min-w-[132px]">
                            Alerta
                          </th>
                        </Fragment>
                      );
                    }
                    return th;
                  })}
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap text-center w-[108px]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">Carregando...</td></tr>
                ) : isEmptyFiltro ? (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-gray-500">
                      Nenhum produto vinculado a esta fazenda com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  pageItems.map(renderProdutoRow)
                )}
              </tbody>
            </table>
          </TableHorizontalScroll>
        )}
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
