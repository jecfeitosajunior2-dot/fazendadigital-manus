import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { X } from "lucide-react";
import { FarmRowActionButtons } from "@/components/icons/FarmActionIcons";
import { FD_PRIMARY, FormLabel } from "@/components/FormFields";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import { toast } from "sonner";
import {
  buildLoteGerenciamentoExportRows,
  loteGerenciamentoGroupedTableHeader,
  loteGerenciamentoPdfHeadRows,
  LOTE_GERENCIAMENTO_COLUMN_ALIGNS,
  LOTE_GERENCIAMENTO_FLAT_HEADERS,
  LOTE_GERENCIAMENTO_INTEGER_COLS,
} from "@shared/loteGerenciamentoExport";
import {
  FAIXAS_IDADE_LOTE,
  FAIXA_IDADE_LOTE_LABELS,
  faixaIdadeLoteRange,
  totalPorSexoFaixas,
  type ContagemPorFaixa,
  type FaixaIdadeLote,
} from "@shared/lote-faixas-idade";
import {
  editarLoteAnimaisUrl,
  descricaoConfirmacaoExclusaoLote,
  mensagemExclusaoLoteSucesso,
  parseExclusaoLoteBloqueada,
} from "@shared/loteExclusaoBloqueada";
import { LoteExclusaoBloqueadaDialog } from "@/components/lotes/LoteExclusaoBloqueadaDialog";
import {
  avaliacaoParaDeleteBlocked,
  avaliacaoParaDeleteConfirm,
  type DeleteBlockedState,
} from "@/lib/loteExclusaoFlow";

interface LoteItem {
  id: number;
  nome: string;
  descricao?: string | null;
  localizacao?: string | null;
  capacidade?: number | null;
  ativo?: boolean | null;
  qtdAnimais?: number | null;
  diasNoPasto?: number | null;
  pastoNome?: string | null;
  pastoCapacidade?: number | null;
  fazendaNome?: string | null;
  fazendaId?: number | null;
}

type LoteGerenciamento = {
  id: number;
  nome: string;
  fazendaId: number | null;
  fazendaNome: string | null;
  ativo: boolean | null;
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
  machosSemIdade: number;
  femeasSemIdade: number;
  capacidade: number | null;
  totalAnimais: number;
  pctOcupacao: number | null;
  superlotado: boolean;
};

function lotesListUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/lotes?fazendaId=${fazendaId}` : "/rebanho/lotes";
}

function novoLoteUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/novo-lote?fazendaId=${fazendaId}` : "/rebanho/novo-lote";
}

function ContagemCell({
  value,
  onClick,
  label,
}: {
  value: number;
  onClick?: () => void;
  label: string;
}) {
  if (value <= 0) {
    return <span className="text-gray-300 tabular-nums text-[12px]">—</span>;
  }
  if (!onClick) {
    return <span className="font-semibold text-gray-800 tabular-nums text-[12px]">{value}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="font-semibold text-gray-800 tabular-nums text-[12px] cursor-pointer hover:text-[#2D5A5A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D5A5A]/30 rounded"
    >
      {value}
    </button>
  );
}

export default function LotsManagementPage() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const fazendaInicial = urlParams.get("fazendaId") || "";
  const apenasSuperlotadosInicial = urlParams.get("apenasSuperlotados") === "true";

  const [fazendaFilter, setFazendaFilter] = useState(fazendaInicial);
  const [fazendaReady, setFazendaReady] = useState(Boolean(fazendaInicial));
  const [apenasSuperlotados, setApenasSuperlotados] = useState(apenasSuperlotadosInicial);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState | null>(null);
  const confirm = useConfirm();

  const queryInput = useMemo(() => ({
    fazendaId: fazendaFilter ? Number(fazendaFilter) : undefined,
  }), [fazendaFilter]);

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const fazendasList = fazendas as { id: number; nome: string }[];

  // Resolve o seletor: 1 fazenda → auto; várias → "Todas as fazendas" (visão consolidada já suportada pela API).
  useEffect(() => {
    if (loadingFazendas) return;
    if (fazendaFilter) {
      setFazendaReady(true);
      return;
    }
    if (fazendasList.length === 1) {
      const id = String(fazendasList[0].id);
      setFazendaFilter(id);
      setFazendaReady(true);
      const url = new URLSearchParams();
      url.set("fazendaId", id);
      if (apenasSuperlotados) url.set("apenasSuperlotados", "true");
      setLocation(`/rebanho/lotes?${url.toString()}`, { replace: true });
      return;
    }
    setFazendaReady(true);
  }, [loadingFazendas, fazendasList, fazendaFilter, apenasSuperlotados, setLocation]);

  const {
    data: gerenciamento = [],
    isLoading,
    refetch,
  } = trpc.lotes.gerenciamento.useQuery(queryInput, { enabled: fazendaReady });

  const sorted = useMemo(() => {
    let lista = [...(gerenciamento as LoteGerenciamento[])];
    if (apenasSuperlotados) {
      lista = lista.filter(l => l.superlotado);
    }
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return lista;
  }, [gerenciamento, apenasSuperlotados]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const goAnimais = (opts: {
    loteId: number;
    fazendaId?: number | null;
    sexo?: "macho" | "femea";
    faixa?: FaixaIdadeLote;
    semDataNascimento?: boolean;
  }) => {
    const qs = new URLSearchParams();
    qs.set("loteId", String(opts.loteId));
    if (opts.fazendaId) qs.set("fazendaId", String(opts.fazendaId));
    else if (fazendaFilter) qs.set("fazendaId", fazendaFilter);
    if (opts.sexo) qs.set("sexo", opts.sexo);
    if (opts.semDataNascimento) {
      qs.set("semDataNascimento", "true");
    } else if (opts.faixa) {
      const range = faixaIdadeLoteRange(opts.faixa);
      qs.set("idadeMesesMin", String(range.min));
      if (range.max != null) qs.set("idadeMesesMax", String(range.max));
    }
    setLocation(`/rebanho/lista-animais?${qs.toString()}`);
  };

  const utils = trpc.useUtils();

  const excluirMutation = trpc.lotes.excluir.useMutation({
    onSuccess: (data) => {
      toast.success(mensagemExclusaoLoteSucesso(data.nomeLote));
      refetch();
      utils.lotes.list.invalidate();
    },
    onError: (err, variables) => {
      if (err.data?.code === "PRECONDITION_FAILED") {
        const parsed = parseExclusaoLoteBloqueada(err.message);
        const row = (gerenciamento as LoteGerenciamento[]).find(l => l.id === variables.id);
        setDeleteBlocked({
          loteId: variables.id,
          nomeLote: parsed?.nomeLote ?? row?.nome ?? "—",
          qtdAnimais: parsed?.qtdAnimais ?? 1,
          fazendaId: row?.fazendaId ?? (fazendaFilter ? Number(fazendaFilter) : null),
        });
      } else {
        toast.error(err.message || "Erro ao excluir o Lote.");
      }
    },
  });

  const handleDeleteRequest = async (row: LoteGerenciamento) => {
    try {
      const avaliacao = await utils.lotes.verificarExclusao.fetch({ id: row.id });
      if (avaliacao.situacao === "bloqueado_animais") {
        setDeleteBlocked(avaliacaoParaDeleteBlocked(avaliacao));
        return;
      }
      const confirmState = avaliacaoParaDeleteConfirm(avaliacao);
      const ok = await confirm({
        title: "Excluir Lote",
        description: descricaoConfirmacaoExclusaoLote(confirmState.nomeLote, confirmState.fazendaNome),
        confirmText: "Excluir Lote",
        cancelText: "Cancelar",
        variant: "danger",
      });
      if (ok) excluirMutation.mutate({ id: confirmState.loteId });
    } catch {
      toast.error("Não foi possível verificar a situação do Lote.");
    }
  };

  const exportHeaders = [...LOTE_GERENCIAMENTO_FLAT_HEADERS];

  const exportData = useMemo(
    () => buildLoteGerenciamentoExportRows(sorted),
    [sorted],
  );

  const exportFazendaNome = fazendaFilter
    ? fazendasList.find(f => f.id === Number(fazendaFilter))?.nome ?? "Todas as fazendas"
    : "Todas as fazendas";

  const buildExportIdentityLine = () => `${exportFazendaNome} — Gerenciamento de Lotes`;

  const qtdSuperlotados = (gerenciamento as LoteGerenciamento[]).filter(l => l.superlotado).length;

  const COL_COUNT = 14; // nome + 5M + 5F + total + ações

  const headerBorderR = "border-r border-gray-200";
  const headerTopSpacerClass =
    `sticky top-0 z-30 px-1.5 py-1 border-b ${headerBorderR} bg-gray-50`;
  const groupThClass =
    `sticky top-0 z-20 px-1.5 py-1 text-center text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-b ${headerBorderR} bg-gray-50 leading-tight`;
  const bandThClass =
    `sticky top-[26px] z-20 px-1.5 py-1.5 text-center border-b ${headerBorderR} bg-gray-50 leading-tight whitespace-nowrap`;
  const sideBandThClass =
    `${bandThClass} z-30 text-[11px] font-semibold text-gray-600 uppercase tracking-wide`;
  const faixaBandThClass =
    `${bandThClass} px-1 text-[10px] font-medium text-gray-500`;
  const faixaTdClass = `px-1 py-2 text-center ${headerBorderR}`;

  const faixaAriaLabel = (
    sexo: "macho" | "femea",
    faixa: FaixaIdadeLote,
    qtd: number,
    nomeLote: string,
  ) => {
    const range = faixaIdadeLoteRange(faixa);
    const sexoLabel = sexo === "femea"
      ? (qtd === 1 ? "fêmea" : "fêmeas")
      : (qtd === 1 ? "macho" : "machos");
    const idadeTxt = range.max != null
      ? `${range.min} a ${range.max} meses`
      : `${range.min} ou mais meses`;
    return `Ver ${qtd} ${sexoLabel} de ${idadeTxt} do Lote ${nomeLote}`;
  };

  return (
    <div className="min-w-0">
      <LoteExclusaoBloqueadaDialog
        state={deleteBlocked}
        onClose={() => setDeleteBlocked(null)}
        onGerenciarAnimais={blocked => {
          setDeleteBlocked(null);
          setLocation(editarLoteAnimaisUrl(blocked.loteId, blocked.fazendaId));
        }}
      />

      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden min-w-0">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Gerenciamento de Lotes
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocation(novoLoteUrl(fazendaFilter || undefined))}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold hover:brightness-95 active:scale-[0.97] transition shrink-0 min-h-[44px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              <span className="hidden sm:inline">Novo Lote</span>
              <span className="sm:hidden">Novo</span>
            </button>
            <ListExportButtons
              title="Gerenciamento de Lotes"
              filename="gerenciamento-lotes"
              headers={exportHeaders}
              rows={exportData}
              alignRightFrom={1}
              landscape
              pdfLandscape
              fazendaNome={exportFazendaNome}
              variant="secondary"
              spreadsheetSheetName="Gerenciamento de Lotes"
              spreadsheetReportTitle={buildExportIdentityLine}
              spreadsheetGroupedTableHeader={loteGerenciamentoGroupedTableHeader()}
              spreadsheetAllowEmpty
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetIntegerCols={LOTE_GERENCIAMENTO_INTEGER_COLS}
              spreadsheetColumnAligns={LOTE_GERENCIAMENTO_COLUMN_ALIGNS}
              spreadsheetPlainHeader
              pdfIncludeSpreadsheetTitle={false}
              pdfShowRegistrosSubtitle={false}
              pdfHeadRows={loteGerenciamentoPdfHeadRows()}
              pdfColumnAligns={LOTE_GERENCIAMENTO_COLUMN_ALIGNS}
            />
          </div>
        </div>

      {apenasSuperlotados && (
        <div className="mx-5 mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-[12px]">
          <span className="material-icons text-[16px] text-red-500">warning</span>
          <span className="font-medium">
            Exibindo apenas Lotes superlotados
            {qtdSuperlotados > 0 ? ` (${qtdSuperlotados} ${qtdSuperlotados === 1 ? "Lote" : "Lotes"})` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setApenasSuperlotados(false);
              setPage(1);
              setLocation(lotesListUrl(fazendaFilter), { replace: true });
            }}
            className="ml-auto flex items-center gap-1 text-red-600 hover:text-red-800 transition-colors"
            title="Remover filtro"
          >
            <X className="w-3.5 h-3.5" />
            <span>Remover filtro</span>
          </button>
        </div>
      )}

      <div className="px-5 py-4 border-b border-gray-100">
        <div className="min-w-0 max-w-[220px]">
          <FormLabel>Fazenda</FormLabel>
          <FazendaOverviewSelect
            fazendas={fazendasList}
            value={fazendaFilter}
            onChange={v => {
              setFazendaFilter(v);
              setPage(1);
              const url = new URLSearchParams();
              if (v) url.set("fazendaId", v);
              if (apenasSuperlotados) url.set("apenasSuperlotados", "true");
              setLocation(`/rebanho/lotes${url.toString() ? `?${url.toString()}` : ""}`, { replace: true });
            }}
            emptyLabel="Todas as fazendas"
            className="min-w-0"
          />
        </div>
      </div>

      <div className="overflow-y-auto overflow-x-hidden max-h-[min(78vh,820px)]">
          <table className="w-full table-fixed text-[12px] border-separate border-spacing-0">
            <colgroup>
              <col style={{ width: "17%" }} />
              {FAIXAS_IDADE_LOTE.map(f => (
                <col key={`m-col-${f}`} />
              ))}
              {FAIXAS_IDADE_LOTE.map(f => (
                <col key={`f-col-${f}`} />
              ))}
              <col style={{ width: "3.75rem" }} />
              <col style={{ width: "5rem" }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50">
                <th className={headerTopSpacerClass} aria-hidden="true" />
                <th colSpan={5} className={groupThClass} title="Machos">
                  Machos
                </th>
                <th colSpan={5} className={groupThClass} title="Fêmeas">
                  Fêmeas
                </th>
                <th className={`${headerTopSpacerClass} z-20`} aria-hidden="true" />
                <th className={`${headerTopSpacerClass} z-20 border-r-0`} aria-hidden="true" />
              </tr>
              <tr className="bg-gray-50">
                <th className={sideBandThClass}>Lote</th>
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th
                    key={`m-${f}`}
                    className={faixaBandThClass}
                    title={`Machos — ${FAIXA_IDADE_LOTE_LABELS[f]} meses completos`}
                  >
                    {FAIXA_IDADE_LOTE_LABELS[f]}
                  </th>
                ))}
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th
                    key={`f-${f}`}
                    className={faixaBandThClass}
                    title={`Fêmeas — ${FAIXA_IDADE_LOTE_LABELS[f]} meses completos`}
                  >
                    {FAIXA_IDADE_LOTE_LABELS[f]}
                  </th>
                ))}
                <th className={`${sideBandThClass} z-20`}>Total</th>
                <th className={`${sideBandThClass} z-20 text-gray-500 border-r-0`}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaReady || loadingFazendas) && (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-gray-400">Carregando...</td>
                </tr>
              )}
              {!isLoading && fazendaReady && !loadingFazendas && paginated.length === 0 && (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-gray-400">
                    {apenasSuperlotados ? "Nenhum Lote superlotado encontrado" : "Nenhum Lote encontrado"}
                  </td>
                </tr>
              )}
              {fazendaReady && !loadingFazendas && !isLoading && paginated.map(lote => {
                const totalMachos = totalPorSexoFaixas(lote.machos, lote.machosSemIdade ?? 0);
                const totalFemeas = totalPorSexoFaixas(lote.femeas, lote.femeasSemIdade ?? 0);
                const totalGeral = totalMachos + totalFemeas;
                const semNasc = (lote.machosSemIdade ?? 0) + (lote.femeasSemIdade ?? 0);

                return (
                  <tr
                    key={lote.id}
                    className="group border-t border-gray-100 hover:bg-gray-50/50"
                  >
                    <td className={`px-1.5 py-2.5 text-center ${headerBorderR} bg-white group-hover:bg-gray-50 max-w-0`}>
                      <button
                        type="button"
                        onClick={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)}
                        className="block w-full truncate text-center font-medium text-gray-800 hover:underline mx-auto"
                        title={lote.nome}
                      >
                        {lote.nome}
                      </button>
                      {semNasc > 0 && (
                        <button
                          type="button"
                          onClick={() => goAnimais({
                            loteId: lote.id,
                            fazendaId: lote.fazendaId,
                            semDataNascimento: true,
                          })}
                          className="mt-0.5 block w-full truncate text-[10px] text-amber-700 hover:underline text-center mx-auto"
                          title={`${semNasc} sem data de nascimento (M: ${lote.machosSemIdade || 0} · F: ${lote.femeasSemIdade || 0})`}
                          aria-label={`Ver ${semNasc} animal${semNasc === 1 ? "" : "is"} sem data de nascimento do Lote ${lote.nome}`}
                        >
                          Sem nasc.: {semNasc}
                        </button>
                      )}
                    </td>
                    {FAIXAS_IDADE_LOTE.map(f => {
                      const qtd = lote.machos[f] ?? 0;
                      return (
                        <td key={`m-${lote.id}-${f}`} className={faixaTdClass}>
                          <ContagemCell
                            value={qtd}
                            label={faixaAriaLabel("macho", f, qtd, lote.nome)}
                            onClick={() => goAnimais({
                              loteId: lote.id,
                              fazendaId: lote.fazendaId,
                              sexo: "macho",
                              faixa: f,
                            })}
                          />
                        </td>
                      );
                    })}
                    {FAIXAS_IDADE_LOTE.map(f => {
                      const qtd = lote.femeas[f] ?? 0;
                      return (
                        <td key={`f-${lote.id}-${f}`} className={faixaTdClass}>
                          <ContagemCell
                            value={qtd}
                            label={faixaAriaLabel("femea", f, qtd, lote.nome)}
                            onClick={() => goAnimais({
                              loteId: lote.id,
                              fazendaId: lote.fazendaId,
                              sexo: "femea",
                              faixa: f,
                            })}
                          />
                        </td>
                      );
                    })}
                    <td className={`px-1.5 py-2 text-center ${headerBorderR} bg-gray-50/60`}>
                      <ContagemCell
                        value={totalGeral}
                        label={
                          totalGeral > 0
                            ? `Ver ${totalGeral} animais do Lote ${lote.nome} (${totalMachos} ${totalMachos === 1 ? "macho" : "machos"} · ${totalFemeas} ${totalFemeas === 1 ? "fêmea" : "fêmeas"})`
                            : `Nenhum animal no Lote ${lote.nome}`
                        }
                        onClick={() => goAnimais({
                          loteId: lote.id,
                          fazendaId: lote.fazendaId,
                        })}
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <FarmRowActionButtons
                        iconSize={17}
                        onEdit={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)}
                        onDelete={() => handleDeleteRequest(lote)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Faixas etárias em meses completos
        </div>

        <div className="border-t border-gray-100">
          <TablePaginationFooter
            pageSize={perPage}
            page={pageSafe}
            totalItems={total}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPerPage(size);
              setPage(1);
            }}
            itemLabel="Lotes"
          />
        </div>
      </div>
    </div>
  );
}
