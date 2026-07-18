import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { ImportarBenfeitoriasModal } from "@/components/ImportarBenfeitoriasModal";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { FD_PRIMARY } from "@/components/FormFields";
import { FarmRowActionButtons } from "@/components/icons/FarmActionIcons";
import {
  montarLinhaExportacaoBenfeitoria,
  montarLinhaPdfBenfeitoria,
  BENFEITORIA_EXPORT_COLUMN_ALIGNS,
  BENFEITORIA_EXPORT_COLUMN_NUM_FMTS,
  BENFEITORIA_EXPORT_INTEGER_COL_INDEXES,
  BENFEITORIA_PDF_HEADERS,
  BENFEITORIA_PDF_COLUMN_ALIGNS,
  formatVidaUtilListagem,
  formatValorListagem,
} from "@shared/benfeitoriaCampos";
import { ESTADOS_CONSERVACAO_BENFEITORIA } from "@shared/benfeitoria-types";
import { EXPORT_HEADERS, EXPORT_VALOR_COL_INDEX } from "@shared/importacaoBenfeitorias";
import { EXCEL_FMT_MOEDA_BRL } from "@shared/parseMoedaBr";
import { parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { cn } from "@/lib/utils";

type BenfeitoriaRow = {
  id: number;
  nome: string;
  fazendaId: number | null;
  anoConstrucao?: number | null;
  vidaUtil?: string | null;
  valorEstimado?: string | null;
  tipo?: string | null;
  estado?: string | null;
  observacoes?: string | null;
};

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: { key: string; label: string; align: ColAlign; width: string }[] = [
  { key: "nome", label: "Nome", align: "left", width: "20%" },
  { key: "tipo", label: "Tipo", align: "left", width: "15%" },
  { key: "anoConstrucao", label: "Ano de Construção", align: "center", width: "18%" },
  { key: "vidaUtil", label: "Vida Útil", align: "center", width: "12%" },
  { key: "estado", label: "Estado", align: "center", width: "14%" },
  { key: "valor", label: "Valor", align: "center", width: "13%" },
  { key: "acoes", label: "Ações", align: "center", width: "8%" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const LIST_ROUTE = "/fazendas/benfeitorias";
const CADASTRO_ROUTE = "/fazendas/benfeitorias/cadastro";
const BENFEITORIAS_LIST_FAZENDA_KEY = "fd-benfeitorias-list-fazenda-id";

type SortOption =
  | "mais-recentes"
  | "mais-antigas"
  | "maior-valor"
  | "menor-valor"
  | "nome-az";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "mais-recentes", label: "Mais recentes" },
  { value: "mais-antigas", label: "Mais antigas" },
  { value: "maior-valor", label: "Maior valor" },
  { value: "menor-valor", label: "Menor valor" },
  { value: "nome-az", label: "Nome A-Z" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function compareBenfeitorias(a: BenfeitoriaRow, b: BenfeitoriaRow, sort: SortOption): number {
  switch (sort) {
    case "mais-recentes": {
      const av = a.anoConstrucao ?? -Infinity;
      const bv = b.anoConstrucao ?? -Infinity;
      return bv - av;
    }
    case "mais-antigas": {
      const av = a.anoConstrucao ?? Infinity;
      const bv = b.anoConstrucao ?? Infinity;
      return av - bv;
    }
    case "maior-valor": {
      const av = parseValorDecimalBanco(a.valorEstimado) ?? -Infinity;
      const bv = parseValorDecimalBanco(b.valorEstimado) ?? -Infinity;
      return bv - av;
    }
    case "menor-valor": {
      const av = parseValorDecimalBanco(a.valorEstimado) ?? Infinity;
      const bv = parseValorDecimalBanco(b.valorEstimado) ?? Infinity;
      return av - bv;
    }
    case "nome-az":
      return a.nome.localeCompare(b.nome, "pt-BR");
    default:
      return 0;
  }
}

function benfeitoriasListUrl(fazendaId?: string) {
  if (!fazendaId) return LIST_ROUTE;
  return `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}`;
}

function cadastroUrl(fazendaId?: string) {
  if (!fazendaId) return CADASTRO_ROUTE;
  return `${CADASTRO_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}`;
}

function formatVidaUtil(vidaUtil: string | null | undefined): string {
  return formatVidaUtilListagem(vidaUtil);
}

function formatValor(valorEstimado: string | null | undefined): string {
  return formatValorListagem(valorEstimado, parseValorDecimalBanco);
}

function BenfeitoriaActionsCell({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <td data-col-key="acoes" className="px-3 py-2.5 align-middle text-center whitespace-nowrap">
      <div className="flex justify-center">
        <FarmRowActionButtons onEdit={onEdit} onDelete={onDelete} />
      </div>
    </td>
  );
}

function renderBenfeitoriaCell(b: BenfeitoriaRow, colKey: string) {
  switch (colKey) {
    case "nome":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle font-medium text-gray-800 truncate" title={b.nome}>
          {b.nome}
        </td>
      );
    case "tipo":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle text-gray-700 truncate" title={b.tipo || ""}>
          {b.tipo || "—"}
        </td>
      );
    case "anoConstrucao":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle text-center tabular-nums text-gray-700">
          {b.anoConstrucao ?? "—"}
        </td>
      );
    case "vidaUtil":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle text-center text-gray-700 truncate" title={formatVidaUtil(b.vidaUtil)}>
          {formatVidaUtil(b.vidaUtil)}
        </td>
      );
    case "estado":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle text-center text-gray-700 truncate" title={b.estado || ""}>
          {b.estado || "—"}
        </td>
      );
    case "valor":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2.5 align-middle text-center tabular-nums font-medium text-gray-800 whitespace-nowrap">
          {formatValor(b.valorEstimado)}
        </td>
      );
    default:
      return null;
  }
}

export default function BenfeitoriasListPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const urlParams = new URLSearchParams(window.location.search);
  const fazendaInicial = urlParams.get("fazendaId") || "";

  const [fazendaFilter, setFazendaFilter] = useState(fazendaInicial);
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [importarOpen, setImportarOpen] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("mais-recentes");

  const { data: list = [], isLoading, refetch } = trpc.benfeitorias.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.benfeitorias.delete.useMutation({
    onSuccess: () => {
      toast.success("Benfeitoria excluída!");
      utils.benfeitorias.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const byFazenda = useMemo(() => {
    if (!fazendaFilter) return [];
    const id = Number(fazendaFilter);
    if (Number.isNaN(id)) return [];
    return list.filter(b => b.fazendaId === id);
  }, [list, fazendaFilter]);

  const displayed = useMemo(() => {
    let rows = byFazenda;

    if (estadoFilter) {
      rows = rows.filter(b => (b.estado || "") === estadoFilter);
    }

    return [...rows].sort((a, b) => compareBenfeitorias(a, b, sortBy));
  }, [byFazenda, estadoFilter, sortBy]);

  const fazendaFilterNome = fazendaFilter
    ? fazendas.find(f => f.id === Number(fazendaFilter))?.nome ?? ""
    : "";

  const buildBenfeitoriasExportTitle = () =>
    fazendaFilterNome
      ? `${fazendaFilterNome} — Lista de Benfeitorias`
      : "Lista de Benfeitorias";

  const handleFazendaChange = (v: string) => {
    setFazendaFilter(v);
    setEstadoFilter("");
    setSortBy("mais-recentes");
    setPage(1);
    setLocation(benfeitoriasListUrl(v), { replace: true });
    try {
      if (v) localStorage.setItem(BENFEITORIAS_LIST_FAZENDA_KEY, v);
      else localStorage.removeItem(BENFEITORIAS_LIST_FAZENDA_KEY);
    } catch {
      // ignora falha de gravação
    }
  };

  useEffect(() => {
    if (fazendas.length === 0 || fazendaInitDone) return;

    if (fazendaFilter) {
      setFazendaInitDone(true);
      return;
    }

    if (fazendas.length === 1) {
      const id = String(fazendas[0].id);
      setFazendaFilter(id);
      setLocation(benfeitoriasListUrl(id), { replace: true });
      try {
        localStorage.setItem(BENFEITORIAS_LIST_FAZENDA_KEY, id);
      } catch {
        // ignora falha de gravação
      }
      setFazendaInitDone(true);
      return;
    }

    try {
      const stored = localStorage.getItem(BENFEITORIAS_LIST_FAZENDA_KEY);
      if (stored && fazendas.some(f => String(f.id) === stored)) {
        setFazendaFilter(stored);
        setLocation(benfeitoriasListUrl(stored), { replace: true });
        setFazendaInitDone(true);
        return;
      }
    } catch {
      // ignora falha de leitura
    }

    const id = String(fazendas[0].id);
    setFazendaFilter(id);
    setLocation(benfeitoriasListUrl(id), { replace: true });
    try {
      localStorage.setItem(BENFEITORIAS_LIST_FAZENDA_KEY, id);
    } catch {
      // ignora falha de gravação
    }

    setFazendaInitDone(true);
  }, [fazendas, fazendaFilter, fazendaInitDone, setLocation]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize));
  const pageItems = displayed.slice((page - 1) * pageSize, page * pageSize);
  const isEmpty = !isLoading && list.length === 0;
  const needsFazendaSelection = !isLoading && fazendas.length > 0 && !fazendaFilter;
  const isFazendaEmpty = !isLoading && !!fazendaFilter && byFazenda.length === 0;
  const isFilterEmpty = !isLoading && !!fazendaFilter && byFazenda.length > 0 && displayed.length === 0;
  const hasFazendaFilter = !!fazendaFilter;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const exportData = useMemo(
    () =>
      displayed.map(b =>
        montarLinhaExportacaoBenfeitoria(
          b,
          parseValorDecimalBanco,
        ),
      ),
    [displayed],
  );

  const exportPdfData = useMemo(
    () => displayed.map(b => montarLinhaPdfBenfeitoria(b, parseValorDecimalBanco)),
    [displayed],
  );

  const openEdit = (b: BenfeitoriaRow) => {
    const q = new URLSearchParams({ id: String(b.id) });
    if (fazendaFilter) q.set("fazendaId", fazendaFilter);
    setLocation(`${CADASTRO_ROUTE}?${q.toString()}`);
  };

  const openDelete = async (b: BenfeitoriaRow) => {
    const ok = await confirm({
      title: "Excluir benfeitoria",
      description: `Tem certeza que deseja excluir a benfeitoria "${b.nome}"? Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id: b.id });
  };

  const goCadastro = () => setLocation(cadastroUrl(fazendaFilter));

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-gray-800 shrink-0">Lista de Benfeitorias</h1>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={goCadastro}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold hover:brightness-95 active:scale-[0.97] transition shrink-0 min-h-[44px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              <span className="hidden sm:inline">Cadastrar Benfeitoria</span>
              <span className="sm:hidden">Cadastrar</span>
            </button>
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg border border-gray-200 bg-white text-gray-700 text-[12px] font-semibold hover:bg-gray-50 active:scale-[0.97] transition shrink-0 min-h-[44px]"
            >
              <span className="material-icons text-[16px] text-gray-500">upload_file</span>
              Importar
            </button>
            <ListExportButtons
              title="Lista de Benfeitorias"
              filename="benfeitorias"
              headers={EXPORT_HEADERS}
              rows={exportData}
              pdfHeaders={BENFEITORIA_PDF_HEADERS}
              pdfRows={exportPdfData}
              pdfColumnAligns={BENFEITORIA_PDF_COLUMN_ALIGNS}
              pdfLandscape
              pdfShowRegistrosSubtitle={false}
              spreadsheetSheetName="Lista de Benfeitorias"
              spreadsheetReportTitle={buildBenfeitoriasExportTitle}
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              spreadsheetAllowEmpty
              spreadsheetCurrencyCols={[EXPORT_VALOR_COL_INDEX]}
              spreadsheetCurrencyFormat={EXCEL_FMT_MOEDA_BRL}
              spreadsheetIntegerCols={BENFEITORIA_EXPORT_INTEGER_COL_INDEXES}
              spreadsheetColumnNumFmts={BENFEITORIA_EXPORT_COLUMN_NUM_FMTS}
              spreadsheetColumnAligns={BENFEITORIA_EXPORT_COLUMN_ALIGNS}
              fazendaNome={fazendaFilterNome}
              disabled={!hasFazendaFilter}
              variant="secondary"
            />
          </div>
        </div>

        {fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[12px] text-gray-600 whitespace-nowrap">Exibindo:</span>
              <FazendaOverviewSelect
                value={fazendaFilter}
                onChange={handleFazendaChange}
                fazendas={fazendas}
                showEmptyOption={fazendas.length > 1}
                className={cn(listControlClass, "min-w-[160px] h-9 py-0")}
              />
            </div>

            <select
              value={estadoFilter}
              onChange={e => {
                setEstadoFilter(e.target.value);
                setPage(1);
              }}
              disabled={!hasFazendaFilter}
              className={listControlClass}
              aria-label="Filtrar por estado de conservação"
            >
              <option value="">Todos os estados</option>
              {ESTADOS_CONSERVACAO_BENFEITORIA.map(estado => (
                <option key={estado} value={estado}>
                  {estado}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-gray-500 whitespace-nowrap hidden sm:inline">Ordenar por:</span>
              <select
                value={sortBy}
                onChange={e => {
                  setSortBy(e.target.value as SortOption);
                  setPage(1);
                }}
                disabled={!hasFazendaFilter}
                className={listControlClass}
                aria-label="Ordenar lista de benfeitorias"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <TableHorizontalScroll
          footer={
            !isEmpty && hasFazendaFilter && displayed.length > 0 ? (
              <TablePaginationFooter
                pageSize={pageSize}
                page={page}
                totalItems={displayed.length}
                onPageChange={setPage}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setPage(1);
                }}
                itemLabel="benfeitorias"
              />
            ) : null
          }
        >
          <table className="w-full min-w-[760px] text-[11px] border-collapse" data-benfeitorias-table>
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={col.width === "auto" ? undefined : { width: col.width }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    data-col-key={col.key}
                    className={cn(
                      "px-3 py-2.5 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
                      alignClass[col.align],
                      col.key === "valor" && "text-center",
                      col.key === "acoes" && "px-3",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Carregando...
                  </td>
                </tr>
              )}

              {!isLoading && needsFazendaSelection && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Selecione uma fazenda para visualizar as benfeitorias.
                  </td>
                </tr>
              )}

              {!isLoading && isFazendaEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-12 align-middle">
                    <div className="max-w-md mx-auto text-center">
                      <p className="text-[13px] font-medium text-gray-700 mb-2">
                        Nenhuma benfeitoria cadastrada para esta fazenda.
                      </p>
                      <p className="text-[11px] text-gray-500 leading-relaxed mb-4">
                        Cadastre estruturas físicas como currais, galpões, poços, cercas, caixas d&apos;água, casas,
                        estradas, pontes, bebedouros e sistemas de energia.
                      </p>
                      <button
                        type="button"
                        onClick={goCadastro}
                        disabled={!hasFazendaFilter}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition disabled:opacity-50"
                        style={{ backgroundColor: FD_PRIMARY }}
                      >
                        <span className="material-icons text-[16px]">add</span>
                        Cadastrar Benfeitoria
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && isFilterEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Nenhuma benfeitoria encontrada com os filtros aplicados.
                  </td>
                </tr>
              )}

              {!isLoading &&
                pageItems.map(b => (
                  <tr key={b.id} className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                    {TABLE_COLUMNS.map(col =>
                      col.key === "acoes" ? (
                        <BenfeitoriaActionsCell
                          key={col.key}
                          onEdit={() => openEdit(b)}
                          onDelete={() => openDelete(b)}
                        />
                      ) : (
                        renderBenfeitoriaCell(b, col.key)
                      ),
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </TableHorizontalScroll>
      </div>

      <ImportarBenfeitoriasModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportado={() => refetch()}
      />
    </AppLayout>
  );
}
