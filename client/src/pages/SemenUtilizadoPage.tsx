import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormDatePicker } from "@/components/FormFields";
import { CadastrarSemenExternoDialog } from "@/components/semen/CadastrarSemenExternoDialog";
import ListExportButtons from "@/components/ListExportButtons";
import { TableIconButton, ViewActionIcon } from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { formatDateBR } from "@/lib/date-utils";
import { getFichaAnimalPath } from "@/lib/fichaAnimalRoute";
import { SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT, paginateSemenEstoqueList } from "@/lib/semenEstoqueListPagination";
import {
  SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS,
  SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS,
  SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS,
  SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_WIDTHS,
  SEMEN_UTILIZADO_EXPORT_CURRENCY_COLS,
  SEMEN_UTILIZADO_EXPORT_HEADERS,
  SEMEN_UTILIZADO_EXPORT_INTEGER_COLS,
  SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS,
  SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS,
  buildSemenUtilizadoDetalheExcelRows,
  buildSemenUtilizadoDetalheExportIdentificacao,
  buildSemenUtilizadoDetalheExportTitle,
  buildSemenUtilizadoExportRows,
  semenUtilizadoDetalheExportFilenameBase,
  semenUtilizadoEmptyMessage,
  semenUtilizadoExportDisabled,
  semenUtilizadoExportDisabledTitle,
  semenUtilizadoExportFilenameBase,
} from "@/lib/semenUtilizadoExport";
import {
  SEMEN_UTILIZADO_PATH,
  semenUtilizadoDetalhePath,
} from "@/lib/semenRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { EXCEL_FMT_MOEDA_BRL, formatMoedaBrlExcel } from "@shared/parseMoedaBr";
import { formatSemenUtilizadoMatrizLabel, groupSemenUtilizadoUsosPorDia, semenUtilizadoDiasAbertosIniciais, type SemenUtilizadoUso } from "@shared/semenUtilizado";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";

const FILTROS_VAZIOS = {
  reprodutor: "",
  dataIni: "",
  dataFim: "",
};

const selectClass =
  "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
const inputClass =
  "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
const labelClass = "block text-[11px] font-medium text-gray-600 mb-0.5";
const stickyReprodutorTh =
  "sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-200";
const stickyReprodutorTd =
  "sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-100";

function formatCustoUso(val: number | null | undefined): string {
  if (val == null || !(val > 0)) return "—";
  return formatMoedaBrlExcel(val);
}

function custoParcialTitle(usosComCusto: number, doses: number): string | undefined {
  if (usosComCusto >= doses || doses <= 0) return undefined;
  return `${usosComCusto} de ${doses} utilizações com custo informado.`;
}

function rotuloContagem(n: number, singular: string, plural: string): string {
  return n === 1 ? `1 ${singular}` : `${n} ${plural}`;
}

function HistoricoUtilizacoesPorDia({ usos }: { usos: SemenUtilizadoUso[] }) {
  const dias = useMemo(() => groupSemenUtilizadoUsosPorDia(usos), [usos]);
  const [abertos, setAbertos] = useState<string[] | null>(null);
  const diasAbertos = abertos ?? semenUtilizadoDiasAbertosIniciais(dias);

  const alternarDia = (dataIso: string) => {
    const atuais = new Set(diasAbertos);
    if (atuais.has(dataIso)) atuais.delete(dataIso);
    else atuais.add(dataIso);
    setAbertos([...atuais]);
  };

  return (
    <div className="divide-y divide-gray-100">
      {dias.map(dia => {
        const aberto = diasAbertos.includes(dia.dataIso);
        return (
          <div key={dia.dataIso}>
            <button
              type="button"
              onClick={() => alternarDia(dia.dataIso)}
              aria-expanded={aberto}
              aria-label={`${aberto ? "Recolher" : "Expandir"} utilizações de ${formatDateBR(dia.dataIso)}`}
              className="w-full px-5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50/80 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-gray-900">{formatDateBR(dia.dataIso)}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {rotuloContagem(dia.matrizes, "matriz", "matrizes")}
                  {" · Custo total "}
                  {formatCustoUso(dia.custoTotal)}
                </p>
              </div>
              <ChevronDown
                aria-hidden
                className={cn(
                  "w-4 h-4 text-gray-400 shrink-0 transition-transform",
                  aberto && "rotate-180",
                )}
              />
            </button>
            {aberto ? (
              <div className="divide-y divide-gray-50 border-t border-gray-100 bg-gray-50/40">
                {dia.usos.map(uso => (
                  <div
                    key={uso.registroId}
                    className="px-5 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]"
                  >
                    <div>
                      <p className="text-gray-500">Matriz</p>
                      <Link
                        href={getFichaAnimalPath(uso.femeaId, "reproducao")}
                        className="font-medium text-[#4ECDC4] hover:underline cursor-pointer"
                      >
                        {formatSemenUtilizadoMatrizLabel(uso.matrizBrinco)}
                      </Link>
                    </div>
                    <div>
                      <p className="text-gray-500">Inseminador</p>
                      <p className="font-medium text-gray-800">{uso.inseminador || "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Custo da dose</p>
                      <p className="font-medium text-gray-800 tabular-nums">{formatCustoUso(uso.custoDose)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Resultado</p>
                      <p className="font-medium text-gray-800">{uso.resultado || "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function SemenUtilizadoPage() {
  const [isDetalhe, params] = useRoute("/reproducao/semen-utilizado/:key");
  const [, setLocation] = useLocation();
  const detalheKey = isDetalhe ? String(params?.key ?? "").trim() : "";

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [search, setSearch] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VAZIOS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT);
  const [novoSemenAberto, setNovoSemenAberto] = useState(false);

  const searchDebounced = useDebounce(search, 300);

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const temFazenda = fazendaNum > 0;
  const disabledHint = "Selecione uma fazenda para usar este filtro";
  const queryFiltros = {
    fazendaId: fazendaNum,
    search: searchDebounced.trim() || undefined,
    reprodutor: aplicados.reprodutor.trim() || undefined,
    dataIni: aplicados.dataIni || undefined,
    dataFim: aplicados.dataFim || undefined,
  };

  const { data: listagem, isLoading: loadingLista, isFetching } = trpc.semen.listUtilizado.useQuery(
    queryFiltros,
    { enabled: temFazenda && !detalheKey },
  );

  const { data: detalhe, isLoading: loadingDetalhe } = trpc.semen.getUtilizado.useQuery(
    { key: detalheKey, ...queryFiltros },
    { enabled: temFazenda && Boolean(detalheKey) },
  );

  const grupos = listagem?.grupos ?? [];
  const custoTotalFiltrado = listagem?.custoTotalFiltrado ?? null;
  const reprodutoresOpcoes = detalheKey
    ? detalhe?.reprodutoresOpcoes ?? []
    : listagem?.reprodutoresOpcoes ?? [];
  const hasActiveFilters =
    search.trim().length > 0 ||
    aplicados.reprodutor.trim().length > 0 ||
    Boolean(aplicados.dataIni) ||
    Boolean(aplicados.dataFim);
  const { pageItems, pageSafe, totalItems } = paginateSemenEstoqueList(grupos, page, pageSize);
  const fazendaNome = fazendas.find(f => Number(f.id) === fazendaNum)?.nome ?? "";

  useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
  }, [page, pageSafe]);

  const limparFiltrosSecundarios = () => {
    setFiltros(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setSearch("");
    setPage(1);
  };

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
    else persistRebanhoFazendaId("");
    limparFiltrosSecundarios();
  };

  const aplicarFiltros = () => {
    if (!temFazenda) return;
    if (filtros.dataIni && filtros.dataFim && filtros.dataIni > filtros.dataFim) {
      toast.error("Data inicial não pode ser maior que a data final.");
      return;
    }
    setAplicados({ ...filtros });
    setPage(1);
  };

  const abrirDetalhe = (key: string) => {
    setLocation(semenUtilizadoDetalhePath(key));
  };

  const emptyMessage = semenUtilizadoEmptyMessage({
    hasFazenda: temFazenda,
    loading: loadingLista,
    totalItems,
    hasActiveFilters,
  });

  const exportRows = useMemo(() => buildSemenUtilizadoExportRows(grupos), [grupos]);
  const exportDisabled = semenUtilizadoExportDisabled({
    hasFazenda: temFazenda,
    loading: loadingLista,
    totalItems,
  });
  const exportDisabledTitle = semenUtilizadoExportDisabledTitle({
    hasFazenda: temFazenda,
    totalItems,
  });
  const exportFilename = semenUtilizadoExportFilenameBase(fazendaNome || "fazenda");

  const filtrosCard = fazendaInitDone ? (
    <div className="bg-white border border-gray-200 rounded shadow-sm px-4 py-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Fazenda</label>
          <FazendaOverviewSelect
            fazendas={fazendas}
            value={fazendaId}
            onChange={onChangeFazenda}
            className={cn(selectClass, "min-w-0")}
            emptyLabel="Selecione uma fazenda"
          />
        </div>
        <div>
          <label className={labelClass}>Reprodutor</label>
          <select
            value={filtros.reprodutor}
            onChange={e => setFiltros(f => ({ ...f, reprodutor: e.target.value }))}
            className={selectClass}
            disabled={!temFazenda}
            title={!temFazenda ? disabledHint : undefined}
            aria-label="Filtrar por reprodutor"
          >
            <option value="">
              {temFazenda ? "Todos os reprodutores" : "Selecione primeiro uma Fazenda"}
            </option>
            {reprodutoresOpcoes.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div
          className={cn(!temFazenda && "opacity-60 pointer-events-none")}
          title={!temFazenda ? disabledHint : undefined}
        >
          <label className={labelClass}>Data inicial</label>
          <FormDatePicker
            value={filtros.dataIni}
            onChange={v => setFiltros(f => ({ ...f, dataIni: v }))}
          />
        </div>
        <div
          className={cn(!temFazenda && "opacity-60 pointer-events-none")}
          title={!temFazenda ? disabledHint : undefined}
        >
          <label className={labelClass}>Data final</label>
          <FormDatePicker
            value={filtros.dataFim}
            onChange={v => setFiltros(f => ({ ...f, dataFim: v }))}
          />
        </div>
      </div>

      <div className="mt-2">
        <label className={labelClass}>Buscar</label>
        <div className="relative">
          <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-gray-400">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Reprodutor, partida ou central..."
            className={`${inputClass} pl-8`}
            disabled={!temFazenda}
            title={!temFazenda ? disabledHint : undefined}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={limparFiltrosSecundarios}
          disabled={!temFazenda}
          title={!temFazenda ? disabledHint : undefined}
          className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white min-h-[34px]"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={aplicarFiltros}
          disabled={!temFazenda}
          title={!temFazenda ? disabledHint : undefined}
          className="px-5 py-1.5 rounded text-[12px] font-semibold text-white hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[34px]"
          style={{ backgroundColor: FD_PRIMARY }}
        >
          Filtrar
        </button>
      </div>
    </div>
  ) : null;

  if (detalheKey) {
    const grupo = detalhe?.grupo;
    const usos = detalhe?.usos ?? [];
    const historicoExcel = buildSemenUtilizadoDetalheExcelRows(usos);
    const detalheTitulo = buildSemenUtilizadoDetalheExportTitle({
      fazendaNome,
      reprodutor: grupo?.reprodutorDisplay || "Reprodutor",
      partida: grupo?.partida || "Partida",
    });
    const detalheIdentificacao = buildSemenUtilizadoDetalheExportIdentificacao({
      reprodutor: grupo?.reprodutorDisplay || "Não informado",
      partida: grupo?.partida || "—",
    });
    return (
      <AppLayout>
        <div className="space-y-2">
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
            <div>
              <button
                type="button"
                onClick={() => setLocation(SEMEN_UTILIZADO_PATH)}
                className="mb-1 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                <span className="text-[13px]">Voltar</span>
              </button>
              <h1
                className="text-[20px] font-semibold text-gray-900"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                Histórico de utilizações
              </h1>
              {grupo ? (
                <p className="text-[12px] text-gray-500 mt-0.5">
                  {grupo.reprodutorDisplay} · {grupo.partida}
                </p>
              ) : null}
            </div>
            <ListExportButtons
              title="Histórico de utilizações"
              filename={semenUtilizadoDetalheExportFilenameBase(
                fazendaNome || "Fazenda",
                grupo?.reprodutorDisplay || "reprodutor",
                grupo?.partida || "partida",
              )}
              headers={[...SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS]}
              rows={historicoExcel.rows}
              pdfRows={historicoExcel.rows}
              pdfRowMeta={historicoExcel.rowMeta}
              fazendaNome={fazendaNome || undefined}
              variant="secondary"
              disabled={usos.length === 0 || loadingDetalhe}
              disabledTitle={usos.length === 0 ? "Nenhum dado para exportar." : "Exportar"}
              spreadsheetSheetName="Utilizações"
              spreadsheetReportTitle={() => detalheTitulo}
              spreadsheetReportSubtitles={() => [detalheIdentificacao]}
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              spreadsheetCurrencyCols={[...SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS]}
              spreadsheetCurrencyFormat={EXCEL_FMT_MOEDA_BRL}
              spreadsheetCurrencyAsNumber
              spreadsheetColumnAligns={[...SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS]}
              spreadsheetColumnWidths={[...SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_WIDTHS]}
              spreadsheetRowMeta={historicoExcel.rowMeta}
              pdfColumnAligns={[...SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS]}
              pdfLandscape
              pdfShowRegistrosSubtitle={false}
              pdfIncludeSpreadsheetTitle={false}
            />
          </div>
          {loadingDetalhe ? (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">Carregando...</p>
          ) : !grupo ? (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">
              Utilização não encontrada para o filtro atual.
            </p>
          ) : (
            usos.length === 0 ? (
              <p className="px-5 py-10 text-center text-gray-400 text-sm">
                Nenhuma utilização encontrada.
              </p>
            ) : (
              <HistoricoUtilizacoesPorDia usos={usos} />
            )
          )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-2">
        {filtrosCard}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Sêmen utilizado
          </h1>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={!temFazenda}
              title={!temFazenda ? "Selecione uma fazenda para cadastrar" : undefined}
              onClick={() => setNovoSemenAberto(true)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px]",
                temFazenda
                  ? "hover:brightness-95 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              <span className="hidden sm:inline">Novo Sêmen</span>
              <span className="sm:hidden">Novo</span>
            </button>
            <ListExportButtons
            title="Sêmen utilizado"
            filename={exportFilename}
            headers={[...SEMEN_UTILIZADO_EXPORT_HEADERS]}
            rows={exportRows}
            fazendaNome={fazendaNome || undefined}
            variant="secondary"
            disabled={exportDisabled}
            disabledTitle={exportDisabledTitle}
            spreadsheetSheetName="Sêmen utilizado"
            spreadsheetReportTitle={() =>
              fazendaNome ? `${fazendaNome} — Sêmen utilizado` : "Sêmen utilizado"
            }
            spreadsheetBlankAfterMeta={false}
            spreadsheetAutoFilter={false}
            spreadsheetPlainHeader
            spreadsheetCurrencyCols={[...SEMEN_UTILIZADO_EXPORT_CURRENCY_COLS]}
            spreadsheetCurrencyFormat={EXCEL_FMT_MOEDA_BRL}
            spreadsheetIntegerCols={[...SEMEN_UTILIZADO_EXPORT_INTEGER_COLS]}
            spreadsheetColumnAligns={[...SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS]}
            spreadsheetFooterRowCount={exportRows.length > 0 ? 1 : 0}
            pdfColumnAligns={[...SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS]}
            pdfLandscape
            pdfShowRegistrosSubtitle={false}
            pdfIncludeSpreadsheetTitle={false}
          />
          </div>
        </div>
        <TableHorizontalScroll
          fitWidth
          footer={
            fazendaNum > 0 ? (
              <div className="border-t border-gray-100">
                <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                  <span>
                    Custo total utilizado:{" "}
                    <span className="font-semibold text-gray-800 tabular-nums">
                      {loadingLista || isFetching ? "…" : formatCustoUso(custoTotalFiltrado)}
                    </span>
                  </span>
                </div>
                <TablePaginationFooter
                  pageSize={pageSize}
                  page={pageSafe}
                  totalItems={totalItems}
                  onPageChange={setPage}
                  onPageSizeChange={size => {
                    setPageSize(size);
                    setPage(1);
                  }}
                  itemLabel="itens"
                />
              </div>
            ) : null
          }
        >
          <table className="w-full min-w-[1080px] text-[12px] border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className={`pl-4 pr-2 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide min-w-[140px] ${stickyReprodutorTh}`}>
                  Reprodutor
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Partida
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Central
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Doses utilizadas
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Matrizes
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Custo médio
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Custo total
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Último uso
                </th>
                <th className="px-2 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide min-w-[72px]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {emptyMessage ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 align-middle">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageItems.map(g => (
                  <tr
                    key={g.key}
                    className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors group"
                    onClick={() => abrirDetalhe(g.key)}
                  >
                    <td className={`pl-4 pr-2 py-2 text-center align-middle text-gray-800 whitespace-nowrap ${stickyReprodutorTd}`}>
                      <p className="font-medium leading-tight">{g.reprodutorDisplay}</p>
                    </td>
                    <td className="px-3 py-2 text-center align-middle font-medium text-gray-900">
                      {g.partida}
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-gray-600">
                      {g.central || "—"}
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800">
                      {g.dosesUtilizadas}
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800">
                      {g.matrizes}
                    </td>
                    <td
                      className="px-3 py-2 text-center align-middle tabular-nums text-gray-800 whitespace-nowrap"
                      title={custoParcialTitle(g.usosComCusto, g.dosesUtilizadas)}
                    >
                      {formatCustoUso(g.custoMedioUso)}
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800 whitespace-nowrap">
                      {formatCustoUso(g.custoTotalUtilizado)}
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-gray-800 whitespace-nowrap">
                      {formatDateBR(g.ultimoUso)}
                    </td>
                    <td
                      className="px-2 py-2 text-center align-middle"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center">
                        <TableIconButton
                          label="Ver utilizações"
                          onClick={() => abrirDetalhe(g.key)}
                          tone="view"
                          compact
                        >
                          <ViewActionIcon size={16} />
                        </TableIconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableHorizontalScroll>
        </div>
      </div>

      <CadastrarSemenExternoDialog
        open={novoSemenAberto}
        onOpenChange={setNovoSemenAberto}
        fazendaId={fazendaNum}
        onCreated={() => {
          toast.success("Sêmen cadastrado. Já estará disponível na Inseminação.");
        }}
      />
    </AppLayout>
  );
}
