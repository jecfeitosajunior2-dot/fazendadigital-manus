import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
  inputClass,
} from "@/components/FormFields";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ListExportButtons from "@/components/ListExportButtons";
import {
  AddActionIcon,
  EditActionIcon,
  TableIconButton,
  ViewActionIcon,
} from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, {
  type TablePageSize,
} from "@/components/TablePaginationFooter";
import { formatDateBR } from "@/lib/date-utils";
import {
  SEMEN_ESTOQUE_EXPORT_CURRENCY_COLS,
  SEMEN_ESTOQUE_EXPORT_HEADERS,
  SEMEN_ESTOQUE_EXPORT_INTEGER_COLS,
  buildSemenEstoqueExportRows,
  semenEstoqueExportDisabled,
  semenEstoqueExportDisabledTitle,
  semenEstoqueExportFilenameBase,
} from "@/lib/semenEstoqueExport";
import {
  SEMEN_PARTIDA_HISTORICO_EXPORT_COLUMN_WIDTHS,
  SEMEN_PARTIDA_HISTORICO_EXPORT_CURRENCY_COLS,
  SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS,
  SEMEN_PARTIDA_HISTORICO_EXPORT_TEXT_COLS,
  appendSemenPartidaHistoricoExportFooter,
  buildSemenPartidaHistoricoExportRows,
  buildSemenPartidaHistoricoExportTitle,
  semenPartidaHistoricoExportDisabled,
  semenPartidaHistoricoExportDisabledTitle,
  semenPartidaHistoricoExportFilenameBase,
} from "@/lib/semenPartidaHistoricoExport";
import {
  SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT,
  paginateSemenEstoqueList,
  semenEstoqueEmptyMessage,
} from "@/lib/semenEstoqueListPagination";
import { semenEntradaModalLayout } from "@/lib/semenEntradaModalLayout";
import {
  buildSemenEntradaPrefillFromPartida,
  type SemenEntradaPrefill,
} from "@/lib/semenEstoqueEntradaPrefill";
import { isValidSemenMovimentacaoId, semenEntradaResumoPath } from "@/lib/semenRoutes";
import { invalidateSemenQueriesAfterAjuste, invalidateSemenQueriesAfterCorrecao } from "@/lib/invalidateSemenAfterConsumo";
import { trpc } from "@/lib/trpc";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import type { AnimalAutocompleteRow } from "@shared/animalAutocomplete";
import { EXCEL_FMT_MOEDA_BRL, formatMoedaBrlExcel, parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { formatValorAtualEstoqueSemenDisplay, formatValorTotalEstoqueSemenDisplay } from "@shared/semenEstoqueValor";
import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_STATUS_DISPONIVEL,
  SEMEN_STATUS_ESGOTADO,
  calcSemenCustoUnitarioEntrada,
  formatSemenCustoTotalDisplay,
  isSemenEntradaFormSubmittable,
  parseSemenCustoTotal,
  parseSemenQuantidadeDoses,
} from "@shared/semenEstoque";
import { shouldShowSemenMovimentacaoCustoTotal, buildSemenHistoricoVisual } from "@shared/semenMovimentacaoDisplay";
import { isSemenMovimentacaoAjusteEstoque } from "@shared/semenEstoqueAjuste";
import { filterMachosReprodutoresCandidatos } from "@shared/reproMachoSelect";
import { toDateOnlyISO } from "@shared/carenciaAnimal";
import { toast } from "sonner";
import CorrigirLancamentoSemenDialog, {
  type SemenLancamentoOriginal,
} from "@/components/semen/CorrigirLancamentoSemenDialog";
import AjustarEstoqueSemenDialog from "@/components/semen/AjustarEstoqueSemenDialog";

const fieldCls = inputClass;
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";
const sectionTitleCls = "text-[13px] font-semibold text-gray-800";
const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 w-full focus:outline-none focus:border-[#4ECDC4]";
const stickyReprodutorTh =
  "sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-200";
const stickyReprodutorTd =
  "sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-100";

type StatusFilter = "todos" | typeof SEMEN_STATUS_DISPONIVEL | typeof SEMEN_STATUS_ESGOTADO;

function formatCustoDisplay(val: string | null | undefined): string {
  if (val == null || val === "") return "—";
  const n = parseValorDecimalBanco(val);
  return n != null ? formatMoedaBrlExcel(n) : "—";
}

type SemenHistoricoMov = {
  id: number;
  tipo: string;
  tipoLabel: string;
  quantidadeLabel: string;
  dataEntrada: string;
  custoTotal: string;
  custoUnitario: string;
  contextoDisplay: string | null;
  createdAt?: string | Date | null;
  podeCorrigir?: boolean;
  jaCorrigida?: boolean;
  ehEstornoCorrecao?: boolean;
  ehNovaEntradaCorrigida?: boolean;
  motivoCorrecaoLabel?: string | null;
  correcaoResumo?: string | null;
  quantidadeDoses: number;
  ajusteLinhas?: { saldo: string; custoMedio: string; valor: string } | null;
  ajusteResumoTela?: { mudancas: string[]; linhaMudancas: string | null } | null;
  motivoCorrecaoExport?: string | null;
};

function SemenHistoricoMovLinha({
  mov,
  formatCustoDisplay: formatCusto,
  onCorrigir,
}: {
  mov: SemenHistoricoMov;
  formatCustoDisplay: (val: string | null | undefined) => string;
  onCorrigir: (mov: SemenLancamentoOriginal) => void;
}) {
  const showCustoTotal = shouldShowSemenMovimentacaoCustoTotal(mov.tipo);
  const isAjuste = isSemenMovimentacaoAjusteEstoque(mov.tipo);
  return (
    <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
      <div>
        <p className="text-gray-500">Data</p>
        <p className="font-medium text-gray-800">{formatDateBR(mov.dataEntrada)}</p>
      </div>
      <div>
        <p className="text-gray-500">Tipo</p>
        <p className="font-medium text-gray-800 inline-flex items-center gap-1.5 flex-wrap">
          {mov.tipoLabel}
          {mov.jaCorrigida ? (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium bg-amber-50 text-amber-800 border-amber-100">
              Corrigida
            </Badge>
          ) : null}
        </p>
      </div>
      {isAjuste ? (
        <div className="sm:col-span-3" />
      ) : (
        <>
      <div>
        <p className="text-gray-500">Quantidade</p>
        <p className="font-medium text-gray-800">{mov.quantidadeLabel}</p>
      </div>
      <div>
        <p className="text-gray-500">{showCustoTotal ? "Custo / dose" : "Custo da dose"}</p>
        <p className="font-medium text-gray-800">{formatCusto(mov.custoUnitario)}</p>
      </div>
      {showCustoTotal ? (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-gray-500">Custo total</p>
            <p className="font-medium text-gray-800">{formatCusto(mov.custoTotal)}</p>
          </div>
          {mov.podeCorrigir ? (
            <TableIconButton
              label="Corrigir lançamento"
              onClick={() =>
                onCorrigir({
                  id: mov.id,
                  dataEntrada: mov.dataEntrada,
                  quantidadeDoses: mov.quantidadeDoses,
                  custoTotal: mov.custoTotal,
                  custoUnitario: mov.custoUnitario,
                })
              }
              tone="neutral"
              compact
            >
              <EditActionIcon size={15} />
            </TableIconButton>
          ) : null}
        </div>
      ) : (
        <div />
      )}
        </>
      )}
      {isAjuste ? (
        <div className="sm:col-span-5 text-[11px] text-gray-600 leading-snug space-y-0.5">
          {mov.ajusteResumoTela?.linhaMudancas ? (
            <p>{mov.ajusteResumoTela.linhaMudancas}</p>
          ) : null}
          {mov.motivoCorrecaoExport ? <p>Motivo: {mov.motivoCorrecaoExport}</p> : null}
        </div>
      ) : null}
      {mov.contextoDisplay && !isSemenMovimentacaoAjusteEstoque(mov.tipo) ? (
        <div className="sm:col-span-5 text-gray-600">{mov.contextoDisplay}</div>
      ) : null}
      {mov.correcaoResumo ? (
        <div className="sm:col-span-5 text-[11px] text-gray-500 leading-snug">{mov.correcaoResumo}</div>
      ) : null}
    </div>
  );
}

export default function SemenEstoquePage() {
  const [, params] = useRoute("/reproducao/estoque-semen/:id");
  const [, setLocation] = useLocation();
  const detailId = params?.id ? Number(params.id) : null;

  const utils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [entradaPrefill, setEntradaPrefill] = useState<SemenEntradaPrefill | null>(null);
  const [corrigirMov, setCorrigirMov] = useState<SemenLancamentoOriginal | null>(null);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(SEMEN_ESTOQUE_PAGE_SIZE_DEFAULT);

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

  const { data: partidas = [], isLoading: loadingPartidas, refetch } = trpc.semen.list.useQuery(
    {
      fazendaId: fazendaNum,
      search: search.trim() || undefined,
      status: statusFilter,
    },
    { enabled: fazendaNum > 0 && !detailId },
  );

  const { data: detalhe, isLoading: loadingDetalhe } = trpc.semen.getById.useQuery(
    { id: detailId! },
    { enabled: detailId != null && detailId > 0 },
  );

  const { data: animaisFazenda = [], isLoading: carregandoAnimais } = trpc.animais.list.useQuery(
    { fazendaId: fazendaNum || undefined, status: "ativo" },
    { enabled: fazendaNum > 0 && entradaOpen },
  );

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== "todos";
  /** Lista já vem ordenada por última movimentação; a paginação só fatia. */
  const { pageItems, pageSafe, totalItems } = paginateSemenEstoqueList(
    partidas,
    page,
    pageSize,
  );
  const fazendaNome = fazendas.find(f => Number(f.id) === fazendaNum)?.nome ?? "";
  const exportRows = useMemo(() => buildSemenEstoqueExportRows(partidas), [partidas]);
  const exportDisabled = semenEstoqueExportDisabled({
    hasFazenda: fazendaNum > 0,
    loading: loadingPartidas,
    totalItems,
  });
  const exportDisabledTitle = semenEstoqueExportDisabledTitle({
    hasFazenda: fazendaNum > 0,
    totalItems,
  });
  const exportFilename = semenEstoqueExportFilenameBase(fazendaNome || "estoque");
  const valorTotalEstoque = formatValorTotalEstoqueSemenDisplay(partidas);
  const historicoVisual = useMemo(
    () => (detalhe ? buildSemenHistoricoVisual(detalhe.movimentacoes, { ordem: "desc" }) : []),
    [detalhe],
  );
  const historicoExportVisual = useMemo(
    () => (detalhe ? buildSemenHistoricoVisual(detalhe.movimentacoes, { ordem: "asc" }) : []),
    [detalhe],
  );
  const historicoExportRows = useMemo(() => {
    const rows = buildSemenPartidaHistoricoExportRows(historicoExportVisual);
    if (!detalhe) return rows;
    return appendSemenPartidaHistoricoExportFooter(rows, detalhe, detalhe.movimentacoes);
  }, [historicoExportVisual, detalhe]);
  const historicoExportDisabled = semenPartidaHistoricoExportDisabled({
    loading: loadingDetalhe,
    totalItems: historicoVisual.length,
  });
  const historicoExportDisabledTitle = semenPartidaHistoricoExportDisabledTitle({
    totalItems: historicoVisual.length,
  });
  const historicoExportFilename = semenPartidaHistoricoExportFilenameBase(
    detalhe?.partida || "partida",
  );
  const detalheFazendaNome =
    detalhe != null
      ? fazendas.find(f => Number(f.id) === Number(detalhe.fazendaId))?.nome ?? ""
      : "";
  const emptyMessage = semenEstoqueEmptyMessage({
    hasFazenda: fazendaNum > 0,
    loading: loadingPartidas,
    totalItems,
    hasActiveFilters,
  });

  useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
  }, [page, pageSafe]);

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    setPage(1);
    if (value) persistRebanhoFazendaId(value);
  };

  const abrirDetalhe = (id: number) => {
    setLocation(`/reproducao/estoque-semen/${id}`);
  };

  const abrirNovaEntrada = (prefill: SemenEntradaPrefill | null = null) => {
    setEntradaPrefill(prefill);
    setEntradaOpen(true);
  };

  const fecharNovaEntrada = (open: boolean) => {
    setEntradaOpen(open);
    if (!open) setEntradaPrefill(null);
  };

  const voltarLista = () => {
    setLocation("/reproducao/estoque-semen");
  };

  if (detailId && detailId > 0) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={voltarLista}
              className="mb-0 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
            >
              <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span className="text-[13px]">Voltar</span>
            </button>
            {!loadingDetalhe && detalhe ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAjusteOpen(true)}
                  title="Ajuste saldo ou custo atual sem alterar movimentações passadas."
                  className="inline-flex items-center min-h-[36px] px-3 rounded-lg text-[12px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                >
                  Ajustar estoque
                </button>
                <ListExportButtons
                title={`Histórico de sêmen — ${detalhe.partida}`}
                filename={historicoExportFilename}
                headers={[...SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS]}
                rows={historicoExportRows}
                fazendaNome={detalheFazendaNome || undefined}
                variant="secondary"
                className="shrink-0"
                disabled={historicoExportDisabled}
                disabledTitle={historicoExportDisabledTitle}
                spreadsheetSheetName="Histórico da partida"
                spreadsheetReportTitle={() =>
                  buildSemenPartidaHistoricoExportTitle({
                    fazendaNome: detalheFazendaNome,
                    partida: detalhe.partida,
                  })
                }
                spreadsheetBlankAfterMeta={false}
                spreadsheetAutoFilter={false}
                spreadsheetPlainHeader
                spreadsheetHeaderWrapText={false}
                spreadsheetFooterRowCount={historicoExportRows.length > 0 ? 1 : 0}
                spreadsheetColumnWidths={[...SEMEN_PARTIDA_HISTORICO_EXPORT_COLUMN_WIDTHS]}
                spreadsheetCurrencyCols={[...SEMEN_PARTIDA_HISTORICO_EXPORT_CURRENCY_COLS]}
                spreadsheetCurrencyFormat={EXCEL_FMT_MOEDA_BRL}
                spreadsheetTextCols={[...SEMEN_PARTIDA_HISTORICO_EXPORT_TEXT_COLS]}
                spreadsheetColumnAligns={[
                  "center",
                  "left",
                  "left",
                  "right",
                  "right",
                  "center",
                  "center",
                  "left",
                  "left",
                ]}
                pdfColumnAligns={[
                  "center",
                  "left",
                  "left",
                  "right",
                  "right",
                  "center",
                  "center",
                  "left",
                  "left",
                ]}
                pdfLandscape
                pdfWrapCols={[7, 8]}
                pdfShowRegistrosSubtitle={false}
                pdfIncludeSpreadsheetTitle={false}
              />
              </div>
            ) : null}
          </div>

          {loadingDetalhe ? (
            <p className="text-sm text-gray-500">Carregando partida…</p>
          ) : detalhe ? (
            <>
              <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">{detalhe.partida}</h1>
                    <p className="text-sm text-gray-600 mt-0.5">{detalhe.reprodutorDisplay}</p>
                  </div>
                  <Badge
                    variant={detalhe.status === SEMEN_STATUS_ESGOTADO ? "secondary" : "default"}
                    className={cn(
                      detalhe.status === SEMEN_STATUS_DISPONIVEL && "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {detalhe.statusLabel}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                  <div>
                    <p className="text-gray-500">Central / origem</p>
                    <p className="font-medium text-gray-800">{detalhe.centralOrigem || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Saldo</p>
                    <p className="font-medium text-gray-800">{detalhe.saldoDoses} doses</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Custo por dose</p>
                    <p className="font-medium text-gray-800">
                      {formatCustoDisplay(detalhe.custoUnitario)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Origem</p>
                    <p className="font-medium text-gray-800">
                      {detalhe.origemReprodutor === SEMEN_ORIGEM_INTERNO
                        ? "Rebanho"
                        : "Externo"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className={sectionTitleCls}>Histórico de movimentações</h2>
                </div>
                {detalhe.movimentacoes.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">Nenhuma movimentação registrada.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {historicoVisual.map(mov => (
                      <SemenHistoricoMovLinha
                        key={mov.id}
                        mov={mov}
                        formatCustoDisplay={formatCustoDisplay}
                        onCorrigir={setCorrigirMov}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">Partida não encontrada.</p>
          )}
        </div>
        <CorrigirLancamentoSemenDialog
          open={corrigirMov != null}
          original={corrigirMov}
          onClose={() => setCorrigirMov(null)}
          onAjustarEstoque={() => {
            setCorrigirMov(null);
            setAjusteOpen(true);
          }}
          onSuccess={async ({ partidaId }) => {
            setCorrigirMov(null);
            await invalidateSemenQueriesAfterCorrecao(utils, { partidaId });
          }}
        />
        <AjustarEstoqueSemenDialog
          open={ajusteOpen}
          partida={
            detalhe
              ? {
                  id: detalhe.id,
                  saldoDoses: detalhe.saldoDoses,
                  custoUnitario: detalhe.custoUnitario,
                  valorAtualEstoque: detalhe.valorAtualEstoque,
                }
              : null
          }
          onClose={() => setAjusteOpen(false)}
          onSuccess={async ({ partidaId }) => {
            setAjusteOpen(false);
            await invalidateSemenQueriesAfterAjuste(utils, { partidaId });
          }}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Estoque de sêmen
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => abrirNovaEntrada()}
              disabled={!fazendaNum}
              title={!fazendaNum ? "Selecione uma fazenda para continuar" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px]",
                fazendaNum
                  ? "hover:brightness-95 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              Nova entrada
            </button>
            <ListExportButtons
              title="Estoque de sêmen"
              filename={exportFilename}
              headers={[...SEMEN_ESTOQUE_EXPORT_HEADERS]}
              rows={exportRows}
              fazendaNome={fazendaNome || undefined}
              variant="secondary"
              disabled={exportDisabled}
              disabledTitle={exportDisabledTitle}
              spreadsheetSheetName="Estoque de sêmen"
              spreadsheetReportTitle={() =>
                fazendaNome ? `${fazendaNome} — Estoque de sêmen` : "Estoque de sêmen"
              }
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              spreadsheetCurrencyCols={[...SEMEN_ESTOQUE_EXPORT_CURRENCY_COLS]}
              spreadsheetCurrencyFormat={EXCEL_FMT_MOEDA_BRL}
              spreadsheetIntegerCols={[...SEMEN_ESTOQUE_EXPORT_INTEGER_COLS]}
              spreadsheetColumnAligns={[
                "left",
                "center",
                "center",
                "center",
                "center",
                "center",
                "center",
              ]}
              pdfColumnAligns={[
                "left",
                "center",
                "center",
                "center",
                "center",
                "center",
                "center",
              ]}
              pdfLandscape
              pdfShowRegistrosSubtitle={false}
              pdfIncludeSpreadsheetTitle={false}
            />
          </div>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-1 sm:grid-cols-[minmax(160px,220px)_1fr_minmax(140px,180px)] gap-3 items-end">
          <div className="min-w-0">
            <FormLabel>Fazenda</FormLabel>
            <FazendaOverviewSelect
              fazendas={fazendas}
              value={fazendaId}
              onChange={onChangeFazenda}
              className={cn(listControlClass, "min-w-0")}
            />
          </div>
          <div className="min-w-0">
            <FormLabel>Busca</FormLabel>
            <div className="relative">
              <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">
                search
              </span>
              <input
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Reprodutor, partida ou central..."
                className="w-full h-9 pl-8 pr-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>
          </div>
          <div className="min-w-0">
            <FormLabel>Status</FormLabel>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              className={listControlClass}
              aria-label="Status"
            >
              <option value="todos">Todos</option>
              <option value={SEMEN_STATUS_DISPONIVEL}>Disponível</option>
              <option value={SEMEN_STATUS_ESGOTADO}>Esgotado</option>
            </select>
          </div>
        </div>

        <TableHorizontalScroll
          fitWidth
          footer={
            fazendaNum > 0 ? (
              <div className="border-t border-gray-100">
                <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                  <span>
                    Valor total em estoque:{" "}
                    <span className="font-semibold text-gray-800 tabular-nums">
                      {valorTotalEstoque}
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
          <table className="w-full min-w-[920px] text-[12px] border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className={`pl-4 pr-2 py-2.5 text-left align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide min-w-[140px] ${stickyReprodutorTh}`}>
                  Reprodutor
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Partida
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Central
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Saldo
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Custo/dose
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Valor em estoque
                </th>
                <th className="px-3 py-2.5 text-center align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-2 py-2.5 text-right align-middle whitespace-nowrap text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {emptyMessage ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 align-middle">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageItems.map(p => (
                  <tr
                    key={p.id}
                    className="border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors group"
                    onClick={() => abrirDetalhe(p.id)}
                  >
                    <td className={`pl-4 pr-2 py-2 align-middle text-gray-800 ${stickyReprodutorTd}`}>
                      {p.reprodutorDisplay}
                    </td>
                    <td className="px-3 py-2 text-center align-middle font-medium text-gray-900">
                      {p.partida}
                    </td>
                    <td className="px-3 py-2 text-center align-middle text-gray-600">
                      {p.centralOrigem || "—"}
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800 whitespace-nowrap">
                      {p.saldoDoses} doses
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800 whitespace-nowrap">
                      {formatCustoDisplay(p.custoUnitario)}
                    </td>
                    <td className="px-3 py-2 text-center align-middle tabular-nums text-gray-800 whitespace-nowrap">
                      {formatValorAtualEstoqueSemenDisplay(p.valorAtualEstoque)}
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <Badge
                        variant={p.status === SEMEN_STATUS_ESGOTADO ? "secondary" : "default"}
                        className={cn(
                          p.status === SEMEN_STATUS_DISPONIVEL &&
                            "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
                        )}
                      >
                        {p.statusLabel}
                      </Badge>
                    </td>
                    <td
                      className="px-2 py-2 align-middle"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        <TableIconButton
                          label="Ver detalhes"
                          onClick={() => abrirDetalhe(p.id)}
                          tone="view"
                          compact
                        >
                          <ViewActionIcon size={16} />
                        </TableIconButton>
                        <TableIconButton
                          label="Registrar nova entrada"
                          onClick={() => {
                            const prefill = buildSemenEntradaPrefillFromPartida(p);
                            if (!prefill) {
                              toast.error("Não foi possível repor esta partida. Use Nova entrada no cabeçalho.");
                              return;
                            }
                            abrirNovaEntrada(prefill);
                          }}
                          tone="neutral"
                          compact
                        >
                          <AddActionIcon size={16} />
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

      <NovaEntradaSemenDialog
        open={entradaOpen}
        onOpenChange={fecharNovaEntrada}
        fazendaId={fazendaNum}
        animais={animaisFazenda as AnimalAutocompleteRow[]}
        loadingAnimais={carregandoAnimais}
        prefill={entradaPrefill}
        onSuccess={async result => {
          await refetch();
          utils.semen.list.invalidate();
          fecharNovaEntrada(false);
          toast.success("Entrada de sêmen registrada.");
          if (!isValidSemenMovimentacaoId(result.movimentacaoId)) {
            toast.error("Entrada registrada, mas não foi possível abrir o resumo.");
            return;
          }
          setLocation(semenEntradaResumoPath(result.movimentacaoId));
        }}
      />
    </AppLayout>
  );
}

function NovaEntradaSemenDialog({
  open,
  onOpenChange,
  fazendaId,
  animais,
  loadingAnimais,
  prefill,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: number;
  animais: AnimalAutocompleteRow[];
  loadingAnimais: boolean;
  prefill: SemenEntradaPrefill | null;
  onSuccess: (result: {
    movimentacaoId: number;
    partidaId: number;
    saldoAtual: number;
    custoMedioAtual: string | null;
    novaEntrada: boolean;
  }) => void;
}) {
  const locked = prefill != null;
  const [origem, setOrigem] = useState<"" | typeof SEMEN_ORIGEM_INTERNO | typeof SEMEN_ORIGEM_EXTERNO>(
    "",
  );
  const [machoSel, setMachoSel] = useState<AnimalAutocompleteRow | null>(null);
  const [reprodutorTexto, setReprodutorTexto] = useState("");
  const [partida, setPartida] = useState("");
  const [centralOrigem, setCentralOrigem] = useState("");
  const [quantidadeDoses, setQuantidadeDoses] = useState("");
  const [custoTotal, setCustoTotal] = useState("");
  const [dataEntrada, setDataEntrada] = useState(toDateOnlyISO(new Date()));

  const resetForm = useCallback(() => {
    setOrigem("");
    setMachoSel(null);
    setReprodutorTexto("");
    setPartida("");
    setCentralOrigem("");
    setQuantidadeDoses("");
    setCustoTotal("");
    setDataEntrada(toDateOnlyISO(new Date()));
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    setQuantidadeDoses("");
    setCustoTotal("");
    setDataEntrada(toDateOnlyISO(new Date()));
    if (prefill) {
      setOrigem(prefill.origem);
      setReprodutorTexto(prefill.reprodutorTexto);
      setPartida(prefill.partida);
      setCentralOrigem(prefill.centralOrigem);
      setMachoSel(null);
    } else {
      resetForm();
    }
  }, [open, prefill, resetForm]);

  useEffect(() => {
    if (!open || !prefill || prefill.origem !== SEMEN_ORIGEM_INTERNO || prefill.machoId == null) {
      return;
    }
    const found = animais.find(a => a.id === prefill.machoId) ?? null;
    if (found) setMachoSel(found);
  }, [open, prefill, animais]);

  const qtdNum = parseSemenQuantidadeDoses(quantidadeDoses);
  const custoNum = parseSemenCustoTotal(custoTotal);
  const custoPorDose =
    qtdNum != null && custoNum != null
      ? formatSemenCustoTotalDisplay(
          parseFloat(calcSemenCustoUnitarioEntrada(qtdNum, custoNum)),
        )
      : "—";

  const formCanSubmit = useMemo(
    () =>
      isSemenEntradaFormSubmittable({
        origem,
        machoId: machoSel?.id ?? prefill?.machoId ?? null,
        reprodutorTexto,
        partida,
        quantidadeDoses,
        custoTotal,
        dataEntrada,
      }),
    [origem, machoSel, prefill, reprodutorTexto, partida, quantidadeDoses, custoTotal, dataEntrada],
  );

  const filterMacho = useCallback(
    (a: AnimalAutocompleteRow) =>
      filterMachosReprodutoresCandidatos([a], { fazendaId }).length > 0,
    [fazendaId],
  );

  const registrar = trpc.semen.registrarEntrada.useMutation({
    onSuccess: result => onSuccess(result),
    onError: err => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCanSubmit || registrar.isPending) return;

    const custoParsed = parseSemenCustoTotal(custoTotal);
    const qtdParsed = parseSemenQuantidadeDoses(quantidadeDoses);
    if (custoParsed == null || qtdParsed == null || !origem) return;

    registrar.mutate({
      fazendaId,
      origemReprodutor: origem,
      machoId: origem === SEMEN_ORIGEM_INTERNO ? (machoSel?.id ?? prefill?.machoId ?? undefined) : undefined,
      reprodutorTexto: origem === SEMEN_ORIGEM_EXTERNO ? reprodutorTexto : undefined,
      partida,
      centralOrigem: centralOrigem || undefined,
      quantidadeDoses: qtdParsed,
      custoTotal: custoParsed,
      dataEntrada,
    });
  };

  const submitDisabled = !formCanSubmit || registrar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={semenEntradaModalLayout.content}
        data-semen-entrada-modal
      >
        <DialogHeader className={semenEntradaModalLayout.header}>
          <DialogTitle>Nova entrada de sêmen</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className={semenEntradaModalLayout.form}
          data-semen-entrada-form
        >
          <div className={semenEntradaModalLayout.body} data-semen-entrada-body>
          <div>
            <FormLabel required>Origem do reprodutor</FormLabel>
            <FormNativeSelect
              value={origem}
              onChange={v => {
                setOrigem(v as typeof origem);
                setMachoSel(null);
                setReprodutorTexto("");
              }}
              disabled={locked}
              placeholder="Selecione a origem"
              options={[
                { value: SEMEN_ORIGEM_INTERNO, label: "Animal do rebanho" },
                { value: SEMEN_ORIGEM_EXTERNO, label: "Sêmen / reprodutor externo" },
              ]}
            />
          </div>

          {origem === SEMEN_ORIGEM_INTERNO ? (
            locked ? (
              <div>
                <FormLabel required>Macho do rebanho</FormLabel>
                <input
                  type="text"
                  value={prefill?.reprodutorDisplay ?? ""}
                  disabled
                  className={cn(fieldCls, "bg-gray-50 text-gray-700")}
                />
              </div>
            ) : (
            <AnimalAutocomplete
              label="Macho do rebanho"
              required
              selected={machoSel}
              onSelect={setMachoSel}
              animals={animais}
              loading={loadingAnimais}
              disabled={!fazendaId}
              inputClassName={fieldCls}
              placeholder="Busque pelo brinco ou nome do touro"
              emptyMessage="Nenhum reprodutor elegível encontrado."
              filterCandidate={filterMacho}
            />
            )
          ) : null}

          {origem === SEMEN_ORIGEM_EXTERNO ? (
            <div>
              <label className={labelCls}>
                Reprodutor / Sêmen<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={reprodutorTexto}
                onChange={e => setReprodutorTexto(e.target.value)}
                placeholder="Ex.: GSC-7117 ou REM Armador"
                className={cn(fieldCls, locked && "bg-gray-50 text-gray-700")}
                maxLength={500}
                disabled={locked}
              />
            </div>
          ) : null}

          <div className={semenEntradaModalLayout.fieldGrid}>
            <div>
              <label className={labelCls}>Partida / lote</label>
              <input
                type="text"
                value={partida}
                onChange={e => setPartida(e.target.value)}
                placeholder="Opcional — ex.: L23081"
                className={cn(fieldCls, locked && "bg-gray-50 text-gray-700")}
                maxLength={120}
                disabled={locked}
              />
            </div>
            <div>
              <label className={labelCls}>Central / origem</label>
              <input
                type="text"
                value={centralOrigem}
                onChange={e => setCentralOrigem(e.target.value)}
                placeholder="Ex.: Alta Genetics"
                className={cn(fieldCls, locked && "bg-gray-50 text-gray-700")}
                maxLength={150}
                disabled={locked}
              />
            </div>
          </div>

          <div className={semenEntradaModalLayout.fieldGrid}>
            <div>
              <label className={labelCls}>
                Quantidade de doses<span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={quantidadeDoses}
                onChange={e => setQuantidadeDoses(e.target.value)}
                placeholder="Ex.: 10"
                className={fieldCls}
              />
            </div>
            <div className="min-w-0">
              <FormLabel required>Custo total (R$)</FormLabel>
              <FormInput
                value={custoTotal}
                onChange={v => setCustoTotal(formatCurrencyBrl(v))}
                placeholder="R$ 0,00"
                inputMode="decimal"
                required
                aria-label="Custo total em reais"
              />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-700">
            Custo por dose calculado: <strong>{custoPorDose}</strong>
          </div>

          <div>
            <FormLabel required>Data de entrada</FormLabel>
            <FormDatePicker
              value={dataEntrada}
              onChange={setDataEntrada}
              max={toDateOnlyISO(new Date())}
              required
            />
          </div>
          </div>

          <div className={semenEntradaModalLayout.footer} data-semen-entrada-footer>
            <div className={semenEntradaModalLayout.footerActions}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={registrar.isPending}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {registrar.isPending ? "Salvando…" : "Registrar entrada"}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
