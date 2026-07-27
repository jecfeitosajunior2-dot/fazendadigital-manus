import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import {
  EditActionIcon,
  EstornoActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import EstornarMovimentacaoDialog from "@/components/insumos/EstornarMovimentacaoDialog";
import { trpc } from "@/lib/trpc";
import { formatDataBr, TIPOS_MOVIMENTACAO } from "@/lib/produto-types";
import {
  agruparMovimentacoes,
  formatDataResumo,
  formatItensLabel,
  formatQtdItem,
  formatUnidadeItem,
  formatValorResumo,
  isMovimentacaoDeAbastecimento,
  rotuloStatusMov,
  statusBadgeClassMov,
  tipoBadgeClassMov,
  tipoExibicaoMov,
  valorProdutoLinha,
  valorUnitarioProdutoLinha,
  type MovimentacaoItemRaw,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";
import { exportListSpreadsheet } from "@/lib/exportList";
import { buildExportSpreadsheetWorkbook } from "@shared/buildExportSpreadsheet";
import { formatCurrencyBrl } from "@/lib/utils";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

const FD_PRIMARY = "#4ECDC4";

type SortKey =
  | "data"
  | "tipo"
  | "origemDestino"
  | "documento"
  | "itens"
  | "valor";

type FiltrosSecundarios = {
  categoria: string;
  subcategoria: string;
  origem: string;
  destino: string;
  tipo: string;
  notaFiscal: string;
  produto: string;
  periodoIni: string;
  periodoFim: string;
};

const FILTROS_SECUNDARIOS_VAZIOS: FiltrosSecundarios = {
  categoria: "",
  subcategoria: "",
  origem: "",
  destino: "",
  tipo: "",
  notaFiscal: "",
  produto: "",
  periodoIni: "",
  periodoFim: "",
};

const SORT_TIPS: Record<SortKey, string> = {
  data: "Ordenar por data",
  tipo: "Ordenar por tipo",
  origemDestino: "Ordenar por fornecedor",
  documento: "Ordenar por documento",
  itens: "Ordenar por quantidade de itens",
  valor: "Ordenar por valor total",
};

function formatMoedaOuTraco(valor: number | null): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return formatCurrencyBrl(String(Math.round(Math.abs(valor) * 100)));
}

export default function InsumosMovimentacaoPanel() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
  });
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();

  const estornarMutation = trpc.estoque.estornarMovimentacao.useMutation();

  const [maisFiltrosAbertos, setMaisFiltrosAbertos] = useState(false);
  const [fFazenda, setFFazenda] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [fCategoria, setFCategoria] = useState("");
  const [fSubcategoria, setFSubcategoria] = useState("");
  const [fOrigem, setFOrigem] = useState("");
  const [fDestino, setFDestino] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fNotaFiscal, setFNotaFiscal] = useState("");
  const [fProduto, setFProduto] = useState("");
  const [fPeriodoIni, setFPeriodoIni] = useState("");
  const [fPeriodoFim, setFPeriodoFim] = useState("");
  const [busca, setBusca] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [estornoAlvo, setEstornoAlvo] = useState<MovimentacaoResumo | null>(null);
  const [estornando, setEstornando] = useState(false);
  const [estornoSubmitError, setEstornoSubmitError] = useState<string | null>(null);
  const [vinculoAlvo, setVinculoAlvo] = useState<{
    resumo: MovimentacaoResumo;
    acao: "editar" | "excluir";
  } | null>(null);

  const filtrosRascunho: FiltrosSecundarios = {
    categoria: fCategoria,
    subcategoria: fSubcategoria,
    origem: fOrigem,
    destino: fDestino,
    tipo: fTipo,
    notaFiscal: fNotaFiscal,
    produto: fProduto,
    periodoIni: fPeriodoIni,
    periodoFim: fPeriodoFim,
  };
  const [aplicados, setAplicados] = useState<FiltrosSecundarios>(FILTROS_SECUNDARIOS_VAZIOS);

  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortAsc, setSortAsc] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("fazendaId");
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const urlOk = fromUrl && ids.some(id => String(id) === fromUrl) ? fromUrl : "";
    const resolved =
      urlOk ||
      fromStorage ||
      (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFFazenda(resolved);
      persistRebanhoFazendaId(resolved);
    }
    const grupoIdUrl = params.get("grupoId")?.trim();
    if (grupoIdUrl) {
      setExpandedIds(new Set([grupoIdUrl]));
    }

    const tipoUrl = params.get("tipo")?.trim() ?? "";
    const fornecedorUrl = (params.get("fornecedor") || params.get("origem") || "").trim();
    const periodoIniUrl = params.get("periodoIni")?.trim() ?? "";
    const periodoFimUrl = params.get("periodoFim")?.trim() ?? "";
    const produtoUrl = params.get("produto")?.trim() ?? "";
    const temFiltrosUrl = Boolean(tipoUrl || fornecedorUrl || periodoIniUrl || periodoFimUrl || produtoUrl);
    if (temFiltrosUrl) {
      setFTipo(tipoUrl);
      setFOrigem(fornecedorUrl);
      setFPeriodoIni(periodoIniUrl);
      setFPeriodoFim(periodoFimUrl);
      setFProduto(produtoUrl);
      setAplicados({
        ...FILTROS_SECUNDARIOS_VAZIOS,
        tipo: tipoUrl,
        origem: fornecedorUrl,
        periodoIni: periodoIniUrl,
        periodoFim: periodoFimUrl,
        produto: produtoUrl,
      });
      setMaisFiltrosAbertos(true);
    }

    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaSelecionada = Boolean(fFazenda);
  const fazendaSelecionadaNome = useMemo(
    () => fazendas.find(f => String(f.id) === fFazenda)?.nome,
    [fazendas, fFazenda],
  );

  const produtosDaFazenda = useMemo(() => {
    if (!fFazenda) return [];
    return [...produtos]
      .filter(p => String(p.fazendaId ?? "") === fFazenda)
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
  }, [produtos, fFazenda]);

  const movimentacoesDaFazenda = useMemo(() => {
    if (!fFazenda) return [];
    return (movimentacoes as MovimentacaoItemRaw[]).filter(
      m => String(m.fazendaId ?? m.produtoFazendaId ?? "") === fFazenda,
    );
  }, [movimentacoes, fFazenda]);

  const resumosDaFazenda = useMemo(
    () => agruparMovimentacoes(movimentacoesDaFazenda),
    [movimentacoesDaFazenda],
  );

  const categoriasDisponiveis = useMemo(
    () => [...new Set(movimentacoesDaFazenda.map(m => m.categoria).filter(Boolean) as string[])].sort(),
    [movimentacoesDaFazenda],
  );
  const subcategoriasDisponiveis = useMemo(
    () => [...new Set(movimentacoesDaFazenda.map(m => m.subcategoria).filter(Boolean) as string[])].sort(),
    [movimentacoesDaFazenda],
  );
  const destinosDisponiveis = useMemo(
    () => [...new Set(movimentacoesDaFazenda.map(m => m.destino).filter(Boolean) as string[])].sort(),
    [movimentacoesDaFazenda],
  );

  const limparFiltrosSecundarios = (opts?: { manterAplicados?: boolean }) => {
    setFCategoria("");
    setFSubcategoria("");
    setFOrigem("");
    setFDestino("");
    setFTipo("");
    setFNotaFiscal("");
    setFProduto("");
    setFPeriodoIni("");
    setFPeriodoFim("");
    setBusca("");
    setMaisFiltrosAbertos(false);
    if (!opts?.manterAplicados) {
      setAplicados(FILTROS_SECUNDARIOS_VAZIOS);
    }
    setPage(1);
  };

  const onChangeFazenda = (value: string) => {
    setFFazenda(value);
    if (value) persistRebanhoFazendaId(value);
    limparFiltrosSecundarios();
    setExpandedIds(new Set());
  };

  /** Filtros atuam sobre a movimentação completa: se um item casa, a nota inteira entra. */
  const filtradas = useMemo(() => {
    if (!fFazenda) return [] as MovimentacaoResumo[];

    return resumosDaFazenda.filter(resumo => {
      if (aplicados.tipo && resumo.tipo !== aplicados.tipo) return false;
      if (aplicados.periodoIni && resumo.dataMovimentacao < aplicados.periodoIni) return false;
      if (aplicados.periodoFim && resumo.dataMovimentacao > aplicados.periodoFim) return false;
      if (aplicados.notaFiscal) {
        const q = aplicados.notaFiscal.toLowerCase();
        const docOk = resumo.itens.some(i => (i.notaFiscal ?? "").toLowerCase().includes(q));
        if (!docOk) return false;
      }
      if (aplicados.origem) {
        const q = aplicados.origem.toLowerCase();
        if (!resumo.origemDestino.toLowerCase().includes(q)) return false;
      }
      if (aplicados.destino) {
        const ok = resumo.itens.some(i => (i.destino ?? "") === aplicados.destino);
        if (!ok) return false;
      }
      if (aplicados.produto) {
        const ok = resumo.itens.some(i => String(i.estoqueId ?? "") === aplicados.produto);
        if (!ok) return false;
      }
      if (aplicados.categoria) {
        const ok = resumo.itens.some(i => i.categoria === aplicados.categoria);
        if (!ok) return false;
      }
      if (aplicados.subcategoria) {
        const ok = resumo.itens.some(i => i.subcategoria === aplicados.subcategoria);
        if (!ok) return false;
      }
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const camposResumo = [
          resumo.tipo,
          resumo.origemDestino,
          resumo.documento,
          resumo.registradoPor,
          formatItensLabel(resumo.qtdItens),
        ];
        const camposItens = resumo.itens.flatMap(i => [
          i.nome,
          i.categoria,
          i.subcategoria,
          tipoExibicaoMov(i),
          i.fornecedor,
          i.destino,
          i.manejo,
          i.notaFiscal,
          formatUnidadeItem(i.unidade),
          i.registradoPor,
        ]);
        if (![...camposResumo, ...camposItens].some(v => v && String(v).toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });
  }, [resumosDaFazenda, aplicados, busca, fFazenda]);

  const ordenadas = useMemo(() => {
    const rows = [...filtradas];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "data":
          va = a.dataMovimentacao;
          vb = b.dataMovimentacao;
          break;
        case "tipo":
          va = a.tipo;
          vb = b.tipo;
          break;
        case "origemDestino":
          va = a.origemDestino;
          vb = b.origemDestino;
          break;
        case "documento":
          va = a.documento;
          vb = b.documento;
          break;
        case "itens":
          va = a.qtdItens;
          vb = b.qtdItens;
          break;
        case "valor":
          va = a.valorTotal ?? -1;
          vb = b.valorTotal ?? -1;
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return b.editId - a.editId;
    });
    return rows;
  }, [filtradas, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / perPage));
  const paginaAtual = Math.min(page, totalPages);
  const pageSlice = ordenadas.slice((paginaAtual - 1) * perPage, paginaAtual * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
    setPage(1);
  };

  const toggleExpand = (movimentacaoId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(movimentacaoId)) next.delete(movimentacaoId);
      else next.add(movimentacaoId);
      return next;
    });
  };

  const aplicarFiltros = () => {
    if (!fazendaSelecionada) return;
    setAplicados(filtrosRascunho);
    setPage(1);
  };

  const limparFiltros = () => {
    limparFiltrosSecundarios();
  };

  const irEditar = (resumo: MovimentacaoResumo) => {
    if (resumo.status !== "ativa") {
      toast.error("Movimentação estornada não pode ser editada.");
      return;
    }
    if (isMovimentacaoDeAbastecimento(resumo)) {
      setVinculoAlvo({ resumo, acao: "editar" });
      return;
    }
    setLocation(
      `/insumos/nova-movimentacao?id=${resumo.editId}${fFazenda ? `&fazendaId=${encodeURIComponent(fFazenda)}` : ""}`,
    );
  };

  const pedirEstorno = (resumo: MovimentacaoResumo) => {
    if (isMovimentacaoDeAbastecimento(resumo)) {
      setVinculoAlvo({ resumo, acao: "excluir" });
      return;
    }
    setEstornoAlvo(resumo);
  };

  const irParaAbastecimento = (resumo: MovimentacaoResumo) => {
    if (!resumo.abastecimentoId) return;
    setVinculoAlvo(null);
    setLocation(`/maquinas/abastecimento/cadastro?id=${resumo.abastecimentoId}`);
  };

  const confirmarEstorno = async (payload: { motivo: string; observacao?: string }) => {
    if (!estornoAlvo || estornando) return;
    setEstornando(true);
    setEstornoSubmitError(null);
    try {
      await estornarMutation.mutateAsync({
        itemIds: estornoAlvo.itemIds,
        motivo: payload.motivo,
        observacao: payload.observacao,
      });
      toast.success(
        "Movimentação estornada com sucesso. O estoque foi corrigido e o registro original foi preservado.",
      );
      setEstornoAlvo(null);
      setEstornoSubmitError(null);
      await Promise.all([
        utils.estoque.listMovimentacoes.invalidate(),
        utils.estoque.list.invalidate(),
        utils.estoque.resumo.invalidate(),
      ]);
      await utils.estoque.listMovimentacoes.refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message.trim() : "";
      const tecnica = /Failed query:|ECONNREFUSED|PROTOCOL_CONNECTION|ETIMEDOUT|ENOTFOUND/i.test(msg);
      const conhecida =
        !tecnica &&
        (/já foi estornada|lançamento de estorno|insuficiente|Informe o motivo|Usuário autenticado|Não é possível estornar|Movimentação não encontrada/i.test(
          msg,
        ));
      setEstornoSubmitError(
        conhecida && msg
          ? msg
          : "Não foi possível concluir o estorno. Nenhuma alteração foi realizada no estoque. Tente novamente.",
      );
      if (/insuficiente/i.test(msg)) {
        void utils.estoque.validarEstorno.invalidate({ itemIds: estornoAlvo.itemIds });
      }
    } finally {
      setEstornando(false);
    }
  };

  const tituloQuadro = fazendaSelecionadaNome
    ? `Movimentações — ${fazendaSelecionadaNome}`
    : "Movimentações";

  /** Colunas do relatório Excel — só o quadro da lista (sem campos de Nova Movimentação). */
  const exportHeaders = [
    "Data",
    "Tipo de movimentação",
    "Origem / Destino",
    "Documento",
    "Itens",
    "Valor total",
    "Situação",
    "Máquina",
    "Referência abastecimento",
    "Data do estorno",
    "Motivo do estorno",
  ];
  const exportRows = ordenadas.map(m => [
    formatDataResumo(m.dataMovimentacao),
    m.tipo,
    m.origemDestino,
    m.documento === "—" ? "" : m.documento,
    formatItensLabel(m.qtdItens),
    m.valorTotal != null ? formatValorResumo(m.valorTotal) : "",
    rotuloStatusMov(m.status === "estornada" ? "estornada" : "ativa"),
    m.maquinaNome || "",
    m.abastecimentoId != null ? `Abastecimento #${m.abastecimentoId}` : "",
    m.status === "estornada" ? (m.infoEstorno?.dataHoraLabel ?? "") : "",
    m.status === "estornada"
      ? (m.infoEstorno?.motivo || m.motivoEstorno || "")
      : "",
  ]);

  const exportItensHeaders = [
    "Data",
    "Tipo de movimentação",
    "Documento",
    "Produto",
    "Quantidade",
    "Unidade",
    "Valor unitário",
    "Valor total",
  ];
  const exportItensRows = ordenadas.flatMap(resumo =>
    resumo.itens.map(item => [
      formatDataResumo(resumo.dataMovimentacao),
      resumo.tipo,
      resumo.documento === "—" ? "" : resumo.documento,
      item.nome ?? "",
      formatQtdItem(item.quantidade),
      formatUnidadeItem(item.unidade),
      formatMoedaOuTraco(
        valorUnitarioProdutoLinha(item, { freteLegado: resumo.freteLegado }),
      ),
      formatMoedaOuTraco(
        valorProdutoLinha(item, { freteLegado: resumo.freteLegado }),
      ),
    ]),
  );

  /** Título único no padrão Animais do Lote / Lista de Produtos. */
  const exportIdentityLine = fazendaSelecionadaNome
    ? `${fazendaSelecionadaNome} — Movimentações`
    : "Movimentações";

  const exportColumnAligns = exportHeaders.map(() => "center" as const);
  const exportItensColumnAligns = exportItensHeaders.map(() => "center" as const);

  const exportarPlanilhaAgrupada = async () => {
    if (ordenadas.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    try {
      const simpleOpts = {
        blankAfterMeta: false as const,
        autoFilter: false as const,
        plainHeader: true as const,
      };
      const wb = await buildExportSpreadsheetWorkbook(exportHeaders, exportRows, {
        sheetName: "Movimentações",
        reportTitle: exportIdentityLine,
        columnAligns: exportColumnAligns,
        currencyColIndexes: [5],
        textColIndexes: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10],
        ...simpleOpts,
      });

      const wbItens = await buildExportSpreadsheetWorkbook(exportItensHeaders, exportItensRows, {
        sheetName: "Itens",
        reportTitle: exportIdentityLine,
        columnAligns: exportItensColumnAligns,
        currencyColIndexes: [6, 7],
        textColIndexes: [0, 1, 2, 3, 5],
        ...simpleOpts,
      });

      const srcItens = wbItens.getWorksheet("Itens") ?? wbItens.worksheets[0];
      if (srcItens) {
        const dest = wb.addWorksheet("Itens");
        dest.views = srcItens.views;
        srcItens.eachRow({ includeEmpty: true }, (row, rowNumber) => {
          const newRow = dest.getRow(rowNumber);
          newRow.height = row.height;
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const target = newRow.getCell(colNumber);
            target.value = cell.value;
            target.style = { ...cell.style };
          });
          newRow.commit?.();
        });
        srcItens.columns?.forEach((col, idx) => {
          if (col.width != null) dest.getColumn(idx + 1).width = col.width;
        });
      }

      const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const agora = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const carimbo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`;
      const base = `movimentacoes-${(fazendaSelecionadaNome ?? "insumos").toLowerCase().replace(/\s+/g, "-")}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${base}_${carimbo}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha exportada!");
    } catch (error) {
      console.error("[exportMovimentacoes]", error);
      await exportListSpreadsheet(
        exportHeaders,
        exportRows,
        `movimentacoes-${(fazendaSelecionadaNome ?? "insumos").toLowerCase().replace(/\s+/g, "-")}`,
        {
          reportTitle: exportIdentityLine,
          blankAfterMeta: false,
          autoFilter: false,
          plainHeader: true,
          columnAligns: exportColumnAligns,
          currencyColIndexes: [5],
        },
      );
    }
  };

  const isEmptySemFazenda = !isLoading && !fazendaSelecionada;
  const isEmptyMovimentacoes =
    !isLoading && fazendaSelecionada && resumosDaFazenda.length === 0;
  const isEmptyFiltro =
    !isLoading &&
    fazendaSelecionada &&
    resumosDaFazenda.length > 0 &&
    ordenadas.length === 0;

  const SortIcon = ({ col }: { col: SortKey }) => {
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
    "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none text-center hover:bg-gray-100 transition-colors group/th";
  const selectClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const inputClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";

  const colunas: [SortKey, string, string][] = [
    ["data", "Data", "min-w-[96px]"],
    ["tipo", "Tipo de movimentação", "min-w-[140px]"],
    ["origemDestino", "Fornecedor", "min-w-[200px]"],
    ["documento", "Documento", "min-w-[110px]"],
    ["itens", "Itens", "min-w-[96px]"],
    ["valor", "Valor total", "min-w-[110px]"],
  ];

  const irNovaMovimentacao = () => {
    if (!fFazenda) {
      toast.error("Selecione uma fazenda antes de registrar uma movimentação.");
      return;
    }
    setLocation(`/insumos/nova-movimentacao?fazendaId=${encodeURIComponent(fFazenda)}`);
  };

  return (
    <div className="space-y-3">
      <EstornarMovimentacaoDialog
        open={Boolean(estornoAlvo)}
        resumo={estornoAlvo}
        onClose={() => {
          if (!estornando) {
            setEstornoAlvo(null);
            setEstornoSubmitError(null);
          }
        }}
        onConfirm={confirmarEstorno}
        submitting={estornando}
        submitError={estornoSubmitError}
        onClearSubmitError={() => setEstornoSubmitError(null)}
      />

      {vinculoAlvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-lg shadow-xl border border-gray-200 max-w-md w-full p-5"
          >
            <h2 className="text-[15px] font-semibold text-gray-900 mb-2">
              Movimentação vinculada a abastecimento
            </h2>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {vinculoAlvo.acao === "editar"
                ? "Esta movimentação foi gerada por um abastecimento de máquina. Para alterá-la, edite o abastecimento original."
                : "Esta movimentação está vinculada a um abastecimento. Exclua o abastecimento original para realizar o estorno corretamente."}
            </p>
            {vinculoAlvo.resumo.abastecimentoId != null && (
              <p className="text-[12px] text-gray-500 mt-2">
                Referência: Abastecimento #{vinculoAlvo.resumo.abastecimentoId}
                {vinculoAlvo.resumo.maquinaNome ? ` · ${vinculoAlvo.resumo.maquinaNome}` : ""}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setVinculoAlvo(null)}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
              {vinculoAlvo.resumo.abastecimentoId != null && (
                <button
                  type="button"
                  onClick={() => irParaAbastecimento(vinculoAlvo.resumo)}
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white hover:brightness-95"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Ver abastecimento
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden px-4 py-3">
        {/* Linha 1 — Fazenda | Produto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fazenda</label>
            <select
              value={fFazenda}
              onChange={e => onChangeFazenda(e.target.value)}
              className={selectClass}
            >
              <option value="">Selecione uma fazenda</option>
              {fazendas.map(f => (
                <option key={f.id} value={String(f.id)}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Produto</label>
            <select
              value={fProduto}
              onChange={e => setFProduto(e.target.value)}
              className={selectClass}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
            >
              <option value="">Todos</option>
              {produtosDaFazenda.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.nome}{p.situacao === "inativo" ? " (Inativo)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha 2 — Tipo | Data inicial | Data final */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Tipo de movimentação</label>
            <select
              value={fTipo}
              onChange={e => setFTipo(e.target.value)}
              className={selectClass}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
            >
              <option value="">Todos</option>
              {TIPOS_MOVIMENTACAO.map(t => (
                <option key={t.value} value={t.value}>{t.value}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Data inicial</label>
            <input
              type="date"
              value={fPeriodoIni}
              onChange={e => setFPeriodoIni(e.target.value)}
              className={inputClass}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
            />
          </div>
          <div>
            <label className={labelClass}>Data final</label>
            <input
              type="date"
              value={fPeriodoFim}
              onChange={e => setFPeriodoFim(e.target.value)}
              className={inputClass}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
            />
          </div>
        </div>

        {/* Linha 3 — Busca em largura total */}
        <div className="mt-3">
          <label className={labelClass}>Buscar movimentação</label>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar movimentação"
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1); }}
              className={`${inputClass} pl-8`}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
            />
          </div>
        </div>

        {/* Linha 4 — Ações alinhadas à esquerda */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMaisFiltrosAbertos(o => !o)}
            disabled={!fazendaSelecionada}
            title={!fazendaSelecionada ? disabledHint : undefined}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-600 min-h-[34px] px-2"
          >
            <span className="material-icons text-[16px]">{maisFiltrosAbertos ? "expand_less" : "expand_more"}</span>
            Mais filtros
          </button>
          <button
            type="button"
            onClick={limparFiltros}
            disabled={!fazendaSelecionada}
            title={!fazendaSelecionada ? disabledHint : undefined}
            className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white min-h-[34px]"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={aplicarFiltros}
            disabled={!fazendaSelecionada}
            title={!fazendaSelecionada ? disabledHint : undefined}
            className="px-5 py-1.5 rounded text-[12px] font-semibold text-white hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[34px]"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Filtrar
          </button>
        </div>

        {maisFiltrosAbertos && fazendaSelecionada && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className={labelClass}>Categoria</label>
              <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {categoriasDisponiveis.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Subcategoria</label>
              <select value={fSubcategoria} onChange={e => setFSubcategoria(e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {subcategoriasDisponiveis.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Origem</label>
              <input value={fOrigem} onChange={e => setFOrigem(e.target.value)} placeholder="Fornecedor ou fazenda" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Destino</label>
              <select value={fDestino} onChange={e => setFDestino(e.target.value)} className={selectClass}>
                <option value="">Todos</option>
                {destinosDisponiveis.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Nota fiscal</label>
              <input value={fNotaFiscal} onChange={e => setFNotaFiscal(e.target.value)} placeholder="Nº nota fiscal" className={inputClass} />
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            {tituloQuadro}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={irNovaMovimentacao}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? "Selecione uma fazenda para registrar movimentações." : undefined}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 min-h-[44px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              Nova Movimentação
            </button>
            <ListExportButtons
              title={tituloQuadro}
              filename={`movimentacoes-${(fazendaSelecionadaNome ?? "insumos").toLowerCase().replace(/\s+/g, "-")}`}
              headers={exportHeaders}
              rows={exportRows}
              alignRightFrom={5}
              variant="secondary"
              disabled={!fazendaSelecionada || ordenadas.length === 0}
              fazendaNome={fazendaSelecionadaNome}
              spreadsheetSheetName="Movimentações"
              spreadsheetReportTitle={() => exportIdentityLine}
              spreadsheetAllowEmpty
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              spreadsheetCurrencyCols={[5]}
              spreadsheetTextCols={[0, 1, 2, 3, 4, 6, 7, 8]}
              spreadsheetColumnAligns={exportColumnAligns}
              pdfColumnAligns={exportColumnAligns}
              pdfIncludeSpreadsheetTitle={false}
              pdfShowRegistrosSubtitle={false}
              onExportSpreadsheet={() => {
                void exportarPlanilhaAgrupada();
              }}
            />
          </div>
        </div>

        {isEmptySemFazenda ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">swap_horiz</span>
            <h2 className="text-[16px] font-semibold text-gray-900">Selecione uma fazenda</h2>
            <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
              Escolha uma fazenda para visualizar e registrar as movimentações de estoque.
            </p>
          </div>
        ) : isEmptyMovimentacoes ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">swap_horiz</span>
            <h2 className="text-[16px] font-semibold text-gray-900">
              Nenhuma movimentação registrada nesta fazenda.
            </h2>
            <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
              Registre entradas, saídas, compras, consumo ou ajustes para acompanhar o estoque dos insumos.
            </p>
          </div>
        ) : isEmptyFiltro ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">search_off</span>
            <h2 className="text-[16px] font-semibold text-gray-900">Nenhuma movimentação encontrada.</h2>
            <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
              Não encontramos registros correspondentes aos filtros aplicados.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={limparFiltros}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        ) : (
          <TableHorizontalScroll
            footer={
              <div className="border-t border-gray-100">
                <TablePaginationFooter
                  pageSize={perPage}
                  page={paginaAtual}
                  totalItems={ordenadas.length}
                  onPageChange={setPage}
                  onPageSizeChange={size => {
                    setPerPage(size);
                    setPage(1);
                  }}
                  itemLabel="movimentações"
                />
              </div>
            }
          >
            <table className="w-full min-w-[860px] text-[12px] border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2.5 w-[40px]" aria-label="Expandir" />
                  {colunas.map(([key, label, minW]) => {
                    const sortTitle =
                      sortKey === key
                        ? `${SORT_TIPS[key]} (${sortAsc ? "crescente" : "decrescente"})`
                        : SORT_TIPS[key];
                    return (
                      <th
                        key={key}
                        title={sortTitle}
                        className={`${thClass} ${minW}`}
                        onClick={() => toggleSort(key)}
                      >
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {label}
                          <SortIcon col={key} />
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap text-center w-[100px]">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">Carregando...</td>
                  </tr>
                ) : (
                  pageSlice.map(resumo => {
                    const aberto = expandedIds.has(resumo.movimentacaoId);
                    const podeEditar = resumo.status === "ativa";
                    const podeEstornar = resumo.status === "ativa";
                    return (
                      <Fragment key={resumo.movimentacaoId}>
                        <tr
                          className={`border-b border-gray-100 hover:bg-gray-50 transition-colors group cursor-pointer ${
                            aberto ? "bg-[#4ECDC414]" : ""
                          }`}
                          onClick={() => toggleExpand(resumo.movimentacaoId)}
                        >
                          <td className="px-2 py-2.5 align-middle text-center">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100"
                              aria-label={aberto ? "Recolher detalhes" : "Ver detalhes"}
                              onClick={e => {
                                e.stopPropagation();
                                toggleExpand(resumo.movimentacaoId);
                              }}
                            >
                              <span className="material-icons text-[18px]">
                                {aberto ? "expand_less" : "expand_more"}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap align-middle text-center">
                            {formatDataResumo(resumo.dataMovimentacao)}
                          </td>
                          <td className="px-3 py-2.5 align-middle text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${tipoBadgeClassMov(resumo.tipo)}`}>
                                {resumo.tipo}
                              </span>
                              {isMovimentacaoDeAbastecimento(resumo) && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap bg-slate-100 text-slate-600"
                                  title={
                                    resumo.abastecimentoId
                                      ? `Abastecimento #${resumo.abastecimentoId}${resumo.maquinaNome ? ` — ${resumo.maquinaNome}` : ""}`
                                      : "Gerada por abastecimento"
                                  }
                                >
                                  Automática
                                </span>
                              )}
                              {resumo.status === "estornada" && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${statusBadgeClassMov(resumo.status)}`}>
                                  {rotuloStatusMov(resumo.status)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-800 align-middle text-center leading-snug max-w-[280px]">
                            <div>{resumo.origemDestino}</div>
                            {isMovimentacaoDeAbastecimento(resumo) && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {[resumo.maquinaNome, resumo.abastecimentoId != null ? `#${resumo.abastecimentoId}` : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap align-middle text-center">
                            {resumo.documento}
                          </td>
                          <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap align-middle text-center">
                            {formatItensLabel(resumo.qtdItens)}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-900 whitespace-nowrap align-middle text-center">
                            {formatValorResumo(resumo.valorTotal)}
                          </td>
                          <td className="px-2 py-2.5 align-middle text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-0.5">
                              {podeEditar && (
                                <TableIconButton
                                  label="Editar movimentação"
                                  onClick={() => irEditar(resumo)}
                                  tone="neutral"
                                  compact
                                >
                                  <EditActionIcon size={16} />
                                </TableIconButton>
                              )}
                              {podeEstornar && (
                                <TableIconButton
                                  label="Estornar movimentação"
                                  onClick={() => pedirEstorno(resumo)}
                                  tone="warning"
                                  compact
                                >
                                  <EstornoActionIcon size={16} />
                                </TableIconButton>
                              )}
                            </div>
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-slate-50/80 border-b border-gray-100">
                            <td colSpan={8} className="px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                                  Produtos da movimentação
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                                  <span>
                                    Registrado por:{" "}
                                    <span className="font-medium text-gray-800">{resumo.registradoPor}</span>
                                  </span>
                                  {resumo.status === "estornada" && (
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${statusBadgeClassMov(resumo.status)}`}>
                                      {rotuloStatusMov(resumo.status)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                                <table className="w-full text-[12px] border-collapse">
                                  <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Produto</th>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Quantidade</th>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Unidade</th>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Valor unitário</th>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Total</th>
                                      <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Validade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {resumo.itens.map(item => {
                                      const inativo = item.situacao === "inativo";
                                      const opts = { freteLegado: Boolean(resumo.freteLegado) };
                                      const vu = valorUnitarioProdutoLinha(item, opts);
                                      const vtProduto = valorProdutoLinha(item, opts);
                                      return (
                                        <tr key={item.id} className="border-b border-gray-50 last:border-0">
                                          <td className="px-3 py-2 align-middle text-center">
                                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                              <span className="font-medium text-gray-900">{item.nome ?? "—"}</span>
                                              {inativo && (
                                                <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                                                  Inativo
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-gray-800 whitespace-nowrap text-center align-middle">
                                            {formatQtdItem(item.quantidade)}
                                          </td>
                                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-center align-middle">
                                            {formatUnidadeItem(item.unidade)}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-gray-800 whitespace-nowrap text-center align-middle">
                                            {formatMoedaOuTraco(vu)}
                                          </td>
                                          <td className="px-3 py-2 tabular-nums text-gray-900 whitespace-nowrap text-center align-middle">
                                            {formatMoedaOuTraco(vtProduto)}
                                          </td>
                                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-center align-middle">
                                            {formatDataBr(item.dataValidade) || "—"}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              {(resumo.subtotalItens != null || resumo.freteTotal > 0 || resumo.valorTotal != null) && (
                                <div className="mt-3 flex justify-end">
                                  <div className="text-right text-[12px] space-y-1 min-w-[220px]">
                                    {resumo.freteTotal > 0 ? (
                                      <>
                                        <div className="text-gray-600">
                                          Subtotal dos itens:{" "}
                                          <span className="font-semibold text-gray-900 tabular-nums">
                                            {formatValorResumo(resumo.subtotalItens)}
                                          </span>
                                        </div>
                                        <div className="text-gray-600">
                                          Frete:{" "}
                                          <span className="font-semibold text-gray-900 tabular-nums">
                                            {formatValorResumo(resumo.freteTotal)}
                                          </span>
                                        </div>
                                        <div className="text-gray-800 pt-1 border-t border-gray-200">
                                          Total da movimentação:{" "}
                                          <span className="font-semibold tabular-nums">
                                            {formatValorResumo(resumo.valorTotal)}
                                          </span>
                                        </div>
                                      </>
                                    ) : resumo.valorTotal != null ? (
                                      <>
                                        <div className="text-gray-600">
                                          Total dos itens:{" "}
                                          <span className="font-semibold text-gray-900 tabular-nums">
                                            {formatValorResumo(resumo.subtotalItens ?? resumo.valorTotal)}
                                          </span>
                                        </div>
                                        <div className="text-gray-800 pt-1 border-t border-gray-200">
                                          Total da movimentação:{" "}
                                          <span className="font-semibold tabular-nums">
                                            {formatValorResumo(resumo.valorTotal)}
                                          </span>
                                        </div>
                                      </>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                              {resumo.status === "estornada" && resumo.infoEstorno && (
                                <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                    Informações do estorno
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                                    <div className="text-gray-600">
                                      Estornada em:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.infoEstorno.dataHoraLabel}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Estornada por:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.infoEstorno.usuario || "—"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600 sm:col-span-2">
                                      Motivo:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.infoEstorno.motivo || resumo.motivoEstorno || "—"}
                                      </span>
                                    </div>
                                    {resumo.infoEstorno.observacao && (
                                      <div className="text-gray-600 sm:col-span-2">
                                        Observação:{" "}
                                        <span className="font-medium text-gray-800">
                                          {resumo.infoEstorno.observacao}
                                        </span>
                                      </div>
                                    )}
                                    <div className="text-gray-600 sm:col-span-2">
                                      Resultado:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.infoEstorno.resultado}
                                      </span>
                                    </div>
                                    {resumo.infoEstorno.grupoIdInverso && (
                                      <div className="text-gray-500 sm:col-span-2 text-[11px]">
                                        Movimentação inversa:{" "}
                                        <span className="font-mono text-gray-700">
                                          {resumo.infoEstorno.grupoIdInverso}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {resumo.infoEstorno.itensRevertidos.length > 0 && (
                                    <div className="mt-2.5 overflow-x-auto rounded border border-gray-100">
                                      <table className="w-full text-[11px] border-collapse">
                                        <thead className="bg-slate-50">
                                          <tr>
                                            <th className="px-2 py-1.5 text-left font-semibold text-gray-600">
                                              Produto revertido
                                            </th>
                                            <th className="px-2 py-1.5 text-right font-semibold text-gray-600">
                                              Quantidade
                                            </th>
                                            <th className="px-2 py-1.5 text-left font-semibold text-gray-600">
                                              Unidade
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {resumo.infoEstorno.itensRevertidos.map((it, idx) => (
                                            <tr key={`${it.nome}-${idx}`} className="border-t border-gray-50">
                                              <td className="px-2 py-1.5 text-gray-800">{it.nome}</td>
                                              <td className="px-2 py-1.5 text-right tabular-nums text-gray-800">
                                                {formatQtdItem(it.quantidade)}
                                              </td>
                                              <td className="px-2 py-1.5 text-gray-700">
                                                {formatUnidadeItem(it.unidade)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableHorizontalScroll>
        )}
      </div>
    </div>
  );
}
