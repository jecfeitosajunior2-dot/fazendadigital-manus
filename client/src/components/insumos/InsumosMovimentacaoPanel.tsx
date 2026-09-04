import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import {
  EditActionIcon,
  EstornoActionIcon,
  ViewActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import EstornarMovimentacaoDialog from "@/components/insumos/EstornarMovimentacaoDialog";
import { FormDatePicker, FormLabel, FormNativeSelect } from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { formatDataBr, produtoControlaSaldo, TIPOS_MOVIMENTACAO } from "@/lib/produto-types";
import {
  agruparMovimentacoes,
  classificarMotivoEstornoAbastecimento,
  formatDataResumo,
  formatItensLabel,
  formatQtdItem,
  formatUnidadeItem,
  formatValorResumo,
  isMovimentacaoDeAbastecimento,
  movimentacaoResumoAlteraSaldo,
  MOTIVO_ESTORNO_ABASTECIMENTO,
  MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
  rotuloStatusMov,
  sinalResumoMovimentacao,
  statusBadgeClassMov,
  textoResultadoEstornoHistorico,
  textoMotivoEstornoAbastecimentoDetalhe,
  tipoBadgeClassMov,
  tipoExibicaoMov,
  valorProdutoLinha,
  valorUnitarioProdutoLinha,
  type MovimentacaoItemRaw,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";
import {
  buildPrecoMedioImplicit,
  buildValorUnitMap,
  valorItemMovimentacaoEfetivo,
  valorTotalResumoEfetivo,
} from "@/lib/movimentacao-valor";
import { exportListSpreadsheet } from "@/lib/exportList";
import { parseRetornoVisaoGeral } from "@/lib/insumosRoutes";
import { buildExportSpreadsheetWorkbook } from "@shared/buildExportSpreadsheet";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

const FD_PRIMARY = "#4ECDC4";

function MovimentacaoFilterSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <div title={title}>
      <FormNativeSelect
        variant="light"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        options={options}
        itemClassName="text-[12px]"
      />
    </div>
  );
}

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
  origemDestino: "Ordenar por referência",
  documento: "Ordenar por documento",
  itens: "Ordenar por quantidade de itens",
  valor: "Ordenar por valor total",
};

/** Linha secundária: Nome · Placa/Nº de série (sem #id do abastecimento). */
function rotuloMaquinaReferencia(
  maquinaNome: string | null | undefined,
  placaOuSerie: string | null | undefined,
): string {
  return [maquinaNome?.trim() || null, placaOuSerie?.trim() || null].filter(Boolean).join(" · ");
}

const MSG_ABAST_ORIGEM_NAO_ENCONTRADO =
  "Abastecimento de origem não encontrado. Verifique a integridade do vínculo.";

const MSG_MOV_AUTO_AVISO =
  "Movimentação automática vinculada a um abastecimento.";

/** Data do abastecimento + hora do registro (quando existir). Não inventa horário. */
function formatDataHoraAbastecimentoBloco(
  data: string | null | undefined,
  createdAt: string | Date | null | undefined,
): { rotulo: string; valor: string } {
  const dataFmt = formatDataBr(data) || "—";
  if (dataFmt === "—") return { rotulo: "Data", valor: "—" };

  if (createdAt == null || createdAt === "") {
    return { rotulo: "Data", valor: dataFmt };
  }

  const raw = String(createdAt);
  const temHoraNoTexto = /T\d{2}:\d{2}/.test(raw) || /\d{2}:\d{2}/.test(raw);
  if (!temHoraNoTexto && !(createdAt instanceof Date)) {
    return { rotulo: "Data", valor: dataFmt };
  }

  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) {
    return { rotulo: "Data", valor: dataFmt };
  }

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { rotulo: "Data e hora", valor: `${dataFmt} às ${hh}:${mm}` };
}

function formatMoedaOuTraco(valor: number | null): string {
  if (valor == null || !Number.isFinite(valor)) return "—";
  return formatCurrencyBrl(String(Math.round(Math.abs(valor) * 100)));
}

export default function InsumosMovimentacaoPanel() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const utils = trpc.useUtils();

  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
  });
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const controlaSaldoPorId = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const p of produtos) {
      m.set(p.id, produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo));
    }
    return m;
  }, [produtos]);
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: abastecimentos = [] } = trpc.abastecimentos.list.useQuery();

  const placaPorAbastecimentoId = useMemo(() => {
    const maqById = new Map(
      maquinas.map(m => [m.id, (m.placa ?? "").trim()] as const),
    );
    const map = new Map<number, string>();
    for (const a of abastecimentos) {
      const placa = maqById.get(a.maquinaId);
      if (placa) map.set(a.id, placa);
    }
    return map;
  }, [maquinas, abastecimentos]);

  const abastecimentoPorId = useMemo(() => {
    const map = new Map<number, (typeof abastecimentos)[number]>();
    for (const a of abastecimentos) map.set(a.id, a);
    return map;
  }, [abastecimentos]);

  const identMaquinaDoResumo = (resumo: MovimentacaoResumo) =>
    rotuloMaquinaReferencia(
      resumo.maquinaNome,
      resumo.abastecimentoId != null
        ? placaPorAbastecimentoId.get(resumo.abastecimentoId) ?? null
        : null,
    );

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
    const categoriaUrl = params.get("categoria")?.trim() ?? "";
    const subcategoriaUrl = params.get("subcategoria")?.trim() ?? "";
    const destinoUrl = params.get("destino")?.trim() ?? "";
    const notaFiscalUrl = params.get("notaFiscal")?.trim() ?? "";
    const buscaUrl = params.get("busca")?.trim() ?? "";
    const pageUrl = Number(params.get("page") || 0);
    const sortUrl = params.get("sort")?.trim() ?? "";
    const sortDirUrl = params.get("sortDir")?.trim() ?? "";
    const temFiltrosUrl = Boolean(
      tipoUrl ||
        fornecedorUrl ||
        periodoIniUrl ||
        periodoFimUrl ||
        produtoUrl ||
        categoriaUrl ||
        subcategoriaUrl ||
        destinoUrl ||
        notaFiscalUrl ||
        buscaUrl,
    );
    if (temFiltrosUrl) {
      setFTipo(tipoUrl);
      setFOrigem(fornecedorUrl);
      setFPeriodoIni(periodoIniUrl);
      setFPeriodoFim(periodoFimUrl);
      setFProduto(produtoUrl);
      setFCategoria(categoriaUrl);
      setFSubcategoria(subcategoriaUrl);
      setFDestino(destinoUrl);
      setFNotaFiscal(notaFiscalUrl);
      if (buscaUrl) setBusca(buscaUrl);
      setAplicados({
        ...FILTROS_SECUNDARIOS_VAZIOS,
        tipo: tipoUrl,
        origem: fornecedorUrl,
        periodoIni: periodoIniUrl,
        periodoFim: periodoFimUrl,
        produto: produtoUrl,
        categoria: categoriaUrl,
        subcategoria: subcategoriaUrl,
        destino: destinoUrl,
        notaFiscal: notaFiscalUrl,
      });
      setMaisFiltrosAbertos(
        Boolean(categoriaUrl || subcategoriaUrl || destinoUrl || notaFiscalUrl || fornecedorUrl || periodoIniUrl || periodoFimUrl || produtoUrl),
      );
    }
    if (pageUrl > 1) setPage(pageUrl);
    if (
      sortUrl === "data" ||
      sortUrl === "tipo" ||
      sortUrl === "origemDestino" ||
      sortUrl === "documento" ||
      sortUrl === "itens" ||
      sortUrl === "valor"
    ) {
      setSortKey(sortUrl);
    }
    if (sortDirUrl === "asc") setSortAsc(true);
    if (sortDirUrl === "desc") setSortAsc(false);

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

  const valorUnitMap = useMemo(() => buildValorUnitMap(produtosDaFazenda), [produtosDaFazenda]);

  const precoMedioImplicit = useMemo(
    () => buildPrecoMedioImplicit(movimentacoesDaFazenda),
    [movimentacoesDaFazenda],
  );

  const valorResumoEfetivo = (resumo: MovimentacaoResumo) =>
    valorTotalResumoEfetivo(resumo, valorUnitMap, precoMedioImplicit);

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
          va = valorResumoEfetivo(a) ?? -1;
          vb = valorResumoEfetivo(b) ?? -1;
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return b.editId - a.editId;
    });
    return rows;
  }, [filtradas, sortKey, sortAsc, valorUnitMap, precoMedioImplicit]);

  /** Totais da lista filtrada: entradas e saídas separadas, sem estornadas. */
  const totaisLista = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let qtdEstornadas = 0;
    for (const m of ordenadas) {
      if (m.status === "estornada") {
        qtdEstornadas += 1;
        continue;
      }
      const valorEfetivo = valorResumoEfetivo(m);
      if (valorEfetivo == null) continue;
      const valor = Math.abs(valorEfetivo);
      if (!(valor > 0)) continue;
      if (sinalResumoMovimentacao(m.tipo) === "saida") saidas += valor;
      else entradas += valor;
    }
    return { entradas, saidas, qtdEstornadas };
  }, [ordenadas, valorUnitMap, precoMedioImplicit]);

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
      toast.error(
        "Esta movimentação foi gerada automaticamente por um abastecimento. Edite o abastecimento de origem para atualizar as informações.",
      );
      return;
    }
    setLocation(
      `/insumos/nova-movimentacao?id=${resumo.editId}${fFazenda ? `&fazendaId=${encodeURIComponent(fFazenda)}` : ""}`,
    );
  };

  const pedirEstorno = (resumo: MovimentacaoResumo) => {
    if (isMovimentacaoDeAbastecimento(resumo)) {
      toast.error(
        "Esta movimentação foi gerada por um abastecimento e não pode ser excluída diretamente. Estorne o abastecimento de origem.",
      );
      return;
    }
    setEstornoAlvo(resumo);
  };

  const buildRetornoMovimentacoesUrl = (opts?: { expandedId?: string }) => {
    const qs = new URLSearchParams();
    if (fFazenda) qs.set("fazendaId", fFazenda);
    if (busca.trim()) qs.set("busca", busca.trim());
    if (aplicados.tipo) qs.set("tipo", aplicados.tipo);
    if (aplicados.origem) qs.set("origem", aplicados.origem);
    if (aplicados.destino) qs.set("destino", aplicados.destino);
    if (aplicados.categoria) qs.set("categoria", aplicados.categoria);
    if (aplicados.subcategoria) qs.set("subcategoria", aplicados.subcategoria);
    if (aplicados.notaFiscal) qs.set("notaFiscal", aplicados.notaFiscal);
    if (aplicados.produto) qs.set("produto", aplicados.produto);
    if (aplicados.periodoIni) qs.set("periodoIni", aplicados.periodoIni);
    if (aplicados.periodoFim) qs.set("periodoFim", aplicados.periodoFim);
    if (page > 1) qs.set("page", String(page));
    if (sortKey !== "data") qs.set("sort", sortKey);
    if (sortAsc) qs.set("sortDir", "asc");
    if (opts?.expandedId) qs.set("grupoId", opts.expandedId);
    const q = qs.toString();
    return q ? `/insumos/movimentacao?${q}` : "/insumos/movimentacao";
  };

  const irParaAbastecimento = (resumo: MovimentacaoResumo) => {
    if (!resumo.abastecimentoId) return;
    if (!abastecimentoPorId.has(resumo.abastecimentoId)) {
      console.warn("[movimentacoes] vínculo de abastecimento quebrado", {
        movimentacaoId: resumo.movimentacaoId,
        abastecimentoId: resumo.abastecimentoId,
      });
      toast.error(MSG_ABAST_ORIGEM_NAO_ENCONTRADO);
      return;
    }
    const retorno = encodeURIComponent(
      buildRetornoMovimentacoesUrl({ expandedId: resumo.movimentacaoId }),
    );
    setLocation(
      `/maquinas/abastecimento/cadastro?id=${resumo.abastecimentoId}&retorno=${retorno}`,
    );
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
      const alteraSaldo = movimentacaoResumoAlteraSaldo(estornoAlvo, controlaSaldoPorId);
      toast.success(
        alteraSaldo
          ? "Movimentação estornada com sucesso. O estoque foi corrigido e o registro original foi preservado."
          : "Movimentação estornada com sucesso. O lançamento foi revertido no histórico (sem alteração de saldo).",
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

  /** Colunas do relatório Excel — quadro principal (enxuto). */
  const exportHeaders = [
    "Data",
    "Tipo de movimentação",
    "Referência",
    "Documento",
    "Itens",
    "Valor total",
  ];

  const textoOuTraco = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t || "—";
  };

  const exportDetailRows = useMemo(
    () =>
      ordenadas.map(m => {
        const valorEfetivo = valorResumoEfetivo(m);
        const valor =
          valorEfetivo != null && Number.isFinite(valorEfetivo)
            ? formatValorResumo(Math.abs(valorEfetivo))
            : "";
        return [
          m.dataMovimentacao || "",
          m.tipo,
          textoOuTraco(m.origemDestino === "—" ? "" : m.origemDestino),
          textoOuTraco(m.documento === "—" ? "" : m.documento),
          formatItensLabel(m.qtdItens),
          valor,
        ];
      }),
    [ordenadas, valorUnitMap, precoMedioImplicit],
  );

  const exportRows = useMemo(() => {
    if (exportDetailRows.length === 0) return exportDetailRows;
    const empty = Array.from({ length: 5 }, () => "");
    return [
      ...exportDetailRows,
      [
        "Entradas (sem estornadas)",
        ...empty.slice(0, 4),
        formatValorResumo(totaisLista.entradas),
      ],
      [
        "Saídas (sem estornadas)",
        ...empty.slice(0, 4),
        formatValorResumo(totaisLista.saidas),
      ],
    ];
  }, [exportDetailRows, totaisLista]);

  const exportItensHeaders = [
    "Movimentação Nº",
    "Data",
    "Tipo de movimentação",
    "Produto",
    "Quantidade",
    "Unidade",
    "Valor total",
  ];

  const exportItensRows = useMemo(
    () =>
      ordenadas.flatMap(resumo =>
        resumo.itens.map(item => {
          const qtd = Math.abs(Number(item.quantidade ?? 0));
          const vt = valorItemMovimentacaoEfetivo(item, valorUnitMap, precoMedioImplicit);
          return [
            `Nº ${resumo.editId}`,
            resumo.dataMovimentacao || "",
            resumo.tipo,
            textoOuTraco(item.nome),
            Number.isFinite(qtd) ? qtd : "",
            formatUnidadeItem(item.unidade),
            vt > 0 ? formatValorResumo(Math.abs(vt)) : "",
          ];
        }),
      ),
    [ordenadas, valorUnitMap, precoMedioImplicit],
  );

  /** Título do relatório Excel/PDF. */
  const exportIdentityLine = fazendaSelecionadaNome
    ? `Movimentações - ${fazendaSelecionadaNome}`
    : "Movimentações";

  const exportColumnAligns = exportHeaders.map(() => "center" as const);
  const exportItensColumnAligns = exportItensHeaders.map(() => "center" as const);

  const exportColumnWidths = [12, 22, 28, 16, 12, 16];
  const exportItensColumnWidths = [16, 12, 20, 28, 12, 10, 16];

  const slugNomeArquivo = (nome: string) =>
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fazenda";

  const exportarPlanilhaAgrupada = async () => {
    if (ordenadas.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    try {
      /** Mesmo padrão visual de “Animais do Lote”: título central, cabeçalho claro, tudo centralizado. */
      const reportOpts = {
        blankAfterMeta: false as const,
        autoFilter: false as const,
        plainHeader: true as const,
        titleSubtleFill: true as const,
        currencyAsNumber: false as const,
        headerRowHeight: 28 as const,
      };

      const wb = await buildExportSpreadsheetWorkbook(exportHeaders, exportRows, {
        sheetName: "Movimentações",
        reportTitle: exportIdentityLine,
        columnAligns: [...exportColumnAligns],
        columnWidths: exportColumnWidths,
        currencyColIndexes: [5],
        dateColIndexes: [0],
        textColIndexes: [1, 2, 3, 4],
        wrapTextColIndexes: [2],
        footerRowCount: exportDetailRows.length > 0 ? 2 : 0,
        // Mescla Data…Itens para o rótulo; valor fica em “Valor total”.
        footerLabelMergeEndCol: 5,
        ...reportOpts,
      });

      const wbItens = await buildExportSpreadsheetWorkbook(exportItensHeaders, exportItensRows, {
        sheetName: "Itens",
        reportTitle: exportIdentityLine,
        columnAligns: [...exportItensColumnAligns],
        columnWidths: exportItensColumnWidths,
        currencyColIndexes: [6],
        dateColIndexes: [1],
        textColIndexes: [0, 2, 3, 5],
        wrapTextColIndexes: [3],
        ...reportOpts,
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
            if (cell.numFmt) target.numFmt = cell.numFmt;
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
      const dataArquivo = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
      const base = `movimentacoes-${slugNomeArquivo(fazendaSelecionadaNome ?? "fazenda")}-${dataArquivo}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${base}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Planilha exportada!");
    } catch (error) {
      console.error("[exportMovimentacoes]", error);
      await exportListSpreadsheet(
        exportHeaders,
        exportRows,
        `movimentacoes-${slugNomeArquivo(fazendaSelecionadaNome ?? "fazenda")}`,
        {
          reportTitle: exportIdentityLine,
          blankAfterMeta: false,
          autoFilter: false,
          plainHeader: true,
          titleSubtleFill: true,
          currencyAsNumber: false,
          headerRowHeight: 28,
          columnAligns: [...exportColumnAligns],
          columnWidths: exportColumnWidths,
          currencyColIndexes: [5],
          dateColIndexes: [0],
          wrapTextColIndexes: [2],
          footerRowCount: exportDetailRows.length > 0 ? 2 : 0,
          footerLabelMergeEndCol: 5,
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
  const inputClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] focus:outline-none focus:border-[#4ECDC4] transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";

  const colunas: [SortKey, string, string][] = [
    ["data", "Data", "min-w-[96px]"],
    ["tipo", "Tipo de movimentação", "min-w-[140px]"],
    ["origemDestino", "Referência", "min-w-[200px]"],
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

  const retornoVisaoGeral = useMemo(() => {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    return parseRetornoVisaoGeral(params.get("retorno"));
  }, [searchString]);

  return (
    <div className="space-y-5">
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
      <EstornarMovimentacaoDialog
        open={Boolean(estornoAlvo)}
        resumo={estornoAlvo}
        alteraSaldo={
          estornoAlvo ? movimentacaoResumoAlteraSaldo(estornoAlvo, controlaSaldoPorId) : true
        }
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

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Filtros</h2>
        </div>
        <div className="p-5">
        {/* Linha 1 — Fazenda | Produto */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fazenda</label>
            <MovimentacaoFilterSelect
              value={fFazenda}
              onChange={onChangeFazenda}
              placeholder="Selecione uma fazenda"
              options={fazendas.map(f => ({ value: String(f.id), label: f.nome }))}
            />
          </div>
          <div>
            <label className={labelClass}>Produto</label>
            <MovimentacaoFilterSelect
              value={fProduto}
              onChange={setFProduto}
              placeholder="Todos"
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
              options={produtosDaFazenda.map(p => ({
                value: String(p.id),
                label: `${p.nome}${p.situacao === "inativo" ? " (Inativo)" : ""}`,
              }))}
            />
          </div>
        </div>

        {/* Linha 2 — Tipo | Data inicial | Data final */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Tipo de movimentação</label>
            <MovimentacaoFilterSelect
              value={fTipo}
              onChange={setFTipo}
              placeholder="Todos"
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? disabledHint : undefined}
              options={TIPOS_MOVIMENTACAO.map(t => ({ value: t.value, label: t.value }))}
            />
          </div>
          <div
            className={cn(!fazendaSelecionada && "opacity-60 pointer-events-none")}
            title={!fazendaSelecionada ? disabledHint : undefined}
          >
            <FormLabel>Data inicial</FormLabel>
            <FormDatePicker
              value={fPeriodoIni}
              onChange={setFPeriodoIni}
            />
          </div>
          <div
            className={cn(!fazendaSelecionada && "opacity-60 pointer-events-none")}
            title={!fazendaSelecionada ? disabledHint : undefined}
          >
            <FormLabel>Data final</FormLabel>
            <FormDatePicker
              value={fPeriodoFim}
              onChange={setFPeriodoFim}
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
              <MovimentacaoFilterSelect
                value={fCategoria}
                onChange={setFCategoria}
                placeholder="Todas"
                options={categoriasDisponiveis.map(c => ({ value: c, label: c }))}
              />
            </div>
            <div>
              <label className={labelClass}>Subcategoria</label>
              <MovimentacaoFilterSelect
                value={fSubcategoria}
                onChange={setFSubcategoria}
                placeholder="Todas"
                options={subcategoriasDisponiveis.map(s => ({ value: s, label: s }))}
              />
            </div>
            <div>
              <label className={labelClass}>Referência</label>
              <input value={fOrigem} onChange={e => setFOrigem(e.target.value)} placeholder="Fornecedor, destino, máquina…" className={inputClass} />
            </div>
            {destinosDisponiveis.length > 0 ? (
              <div>
                <label className={labelClass}>Destino / Uso</label>
                <MovimentacaoFilterSelect
                  value={fDestino}
                  onChange={setFDestino}
                  placeholder="Todos"
                  options={destinosDisponiveis.map(d => ({ value: d, label: d }))}
                />
              </div>
            ) : null}
            <div>
              <label className={labelClass}>Nota fiscal</label>
              <input value={fNotaFiscal} onChange={e => setFNotaFiscal(e.target.value)} placeholder="Nº nota fiscal" className={inputClass} />
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
            style={{ fontFamily: "Fraunces, serif" }}
          >
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
              title={exportIdentityLine}
              filename={`movimentacoes-${slugNomeArquivo(fazendaSelecionadaNome ?? "fazenda")}`}
              headers={exportHeaders}
              rows={exportRows}
              alignRightCols={[5]}
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
              spreadsheetTextCols={[1, 2, 3, 4]}
              spreadsheetColumnAligns={[...exportColumnAligns]}
              pdfHeaders={exportHeaders}
              pdfRows={exportRows.map((r, idx) => [
                idx < exportDetailRows.length
                  ? formatDataResumo(String(r[0] ?? ""))
                  : String(r[0] ?? ""),
                r[1] ?? "",
                r[2] ?? "",
                r[3] ?? "",
                r[4] ?? "",
                r[5] ?? "",
              ])}
              pdfColumnAligns={["center", "center", "center", "center", "center", "center"]}
              pdfLandscape
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
            <img
              src="/assets/icon-insumo-saco-green.png"
              alt="Insumos"
              width={48}
              height={48}
              className="mx-auto mb-3"
              style={{
                objectFit: "contain",
                /* Tom cinza-azulado (#B0BEC5) */
                filter:
                  "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
              }}
            />
            <h2 className="text-[16px] font-semibold text-gray-900">Selecione uma fazenda</h2>
            <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
              Escolha uma fazenda para visualizar e registrar movimentações de insumos (estoque e compras de uso imediato).
            </p>
          </div>
        ) : isEmptyMovimentacoes ? (
          <div className="py-14 px-6 text-center">
            <img
              src="/assets/icon-insumo-saco-green.png"
              alt="Insumos"
              width={48}
              height={48}
              className="mx-auto mb-3"
              style={{
                objectFit: "contain",
                filter:
                  "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
              }}
            />
            <h2 className="text-[16px] font-semibold text-gray-900">
              Nenhuma movimentação registrada nesta fazenda.
            </h2>
            <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
              Registre compras, entradas, saídas e consumo. Produtos de uso imediato registram custo sem alterar saldo.
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
                {!isLoading && ordenadas.length > 0 ? (
                  <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                    <span>
                      Totais (sem estornadas):{" "}
                      <span className="text-gray-500">Entradas</span>{" "}
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {formatValorResumo(totaisLista.entradas)}
                      </span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      <span className="text-gray-500">Saídas</span>{" "}
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {formatValorResumo(totaisLista.saidas)}
                      </span>
                    </span>
                    {totaisLista.qtdEstornadas > 0 && (
                      <span className="text-[10px] text-gray-500">
                        Exclui {totaisLista.qtdEstornadas}{" "}
                        {totaisLista.qtdEstornadas === 1 ? "estornada" : "estornadas"}
                      </span>
                    )}
                  </div>
                ) : null}
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
                    const automaticaAbastecimento = isMovimentacaoDeAbastecimento(resumo);
                    const podeEditar = resumo.status === "ativa" && !automaticaAbastecimento;
                    const podeEstornar = resumo.status === "ativa" && !automaticaAbastecimento;
                    const abastOrigem =
                      resumo.abastecimentoId != null
                        ? abastecimentoPorId.get(resumo.abastecimentoId)
                        : undefined;
                    const abastExiste = resumo.abastecimentoId != null && !!abastOrigem;
                    const abastEstornado =
                      String(abastOrigem?.status ?? "registrado") === "estornado";
                    const motivoCodigo = classificarMotivoEstornoAbastecimento(resumo.motivoEstorno);
                    const estornoPorOrigem =
                      resumo.status === "estornada" &&
                      motivoCodigo === MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA;
                    const estornoPorAbastecimento =
                      abastEstornado ||
                      (resumo.status === "estornada" &&
                        motivoCodigo === MOTIVO_ESTORNO_ABASTECIMENTO);
                    const soConsultaAbastecimento =
                      automaticaAbastecimento &&
                      (resumo.status === "estornada" || abastEstornado || !abastExiste);
                    const labelAtalhoAbastecimento = !abastExiste
                      ? MSG_ABAST_ORIGEM_NAO_ENCONTRADO
                      : estornoPorAbastecimento && !estornoPorOrigem
                        ? "Ver abastecimento estornado"
                        : resumo.status === "estornada" || abastEstornado
                          ? "Ver abastecimento"
                          : "Editar abastecimento";
                    const textoMotivoEstornoDetalhe =
                      resumo.status === "estornada"
                        ? textoMotivoEstornoAbastecimentoDetalhe(resumo.motivoEstorno)
                        : null;
                    const placaOuSerie =
                      resumo.abastecimentoId != null
                        ? placaPorAbastecimentoId.get(resumo.abastecimentoId) ?? null
                        : null;
                    const responsavelAbastecimento =
                      abastOrigem?.responsavel?.trim() || "—";
                    const registradoPorResumo = (resumo.registradoPor || "").trim();
                    const mostrarRegistradoPor =
                      !!registradoPorResumo &&
                      registradoPorResumo !== "—" &&
                      (responsavelAbastecimento === "—" ||
                        registradoPorResumo.toLowerCase() !== responsavelAbastecimento.toLowerCase());
                    const dataHoraAbast = formatDataHoraAbastecimentoBloco(
                      abastOrigem?.data ?? resumo.dataMovimentacao,
                      abastOrigem?.createdAt ?? null,
                    );
                    const fazendaAbastecimentoNome =
                      (abastOrigem?.fazendaId != null
                        ? fazendas.find(f => f.id === abastOrigem.fazendaId)?.nome
                        : null) ||
                      fazendaSelecionadaNome ||
                      "—";
                    const origemCombustivel =
                      abastOrigem == null
                        ? "Estoque da Fazenda"
                        : abastOrigem.abastecidoNaFazenda
                          ? "Estoque da Fazenda"
                          : "Compra externa / Posto";
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
                                    identMaquinaDoResumo(resumo) ||
                                    (resumo.abastecimentoId
                                      ? `Abastecimento #${resumo.abastecimentoId}`
                                      : "Gerada por abastecimento")
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
                            {automaticaAbastecimento && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {identMaquinaDoResumo(resumo) || "—"}
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
                            {formatValorResumo(valorResumoEfetivo(resumo))}
                          </td>
                          <td className="px-2 py-2.5 align-middle text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-0.5">
                              {automaticaAbastecimento && (
                                <TableIconButton
                                  label={labelAtalhoAbastecimento}
                                  onClick={() => irParaAbastecimento(resumo)}
                                  tone="neutral"
                                  compact
                                  blocked={!abastExiste}
                                >
                                  {soConsultaAbastecimento ? (
                                    <ViewActionIcon size={16} />
                                  ) : (
                                    <EditActionIcon size={16} />
                                  )}
                                </TableIconButton>
                              )}
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
                              {automaticaAbastecimento && (
                                <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                                  <div className="mb-2">
                                    <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                                      Origem do abastecimento
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{MSG_MOV_AUTO_AVISO}</p>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                                    <div className="text-gray-600">
                                      Tipo de origem:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.origemDestino || "Abastecimento de máquina"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Máquina:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.maquinaNome || "—"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Identificação da máquina:{" "}
                                      <span className="font-medium text-gray-800">
                                        {placaOuSerie || "—"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Abastecimento:{" "}
                                      <span className="font-medium text-gray-800">
                                        {resumo.abastecimentoId != null
                                          ? `Nº ${resumo.abastecimentoId}`
                                          : "—"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Status do abastecimento:{" "}
                                      <span className="font-medium text-gray-800">
                                        {abastOrigem
                                          ? String(abastOrigem.status ?? "registrado") === "estornado"
                                            ? "Estornado"
                                            : "Registrado"
                                          : resumo.abastecimentoId != null
                                            ? "Não encontrado"
                                            : "—"}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Responsável pelo abastecimento:{" "}
                                      <span className="font-medium text-gray-800">
                                        {responsavelAbastecimento}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      {dataHoraAbast.rotulo}:{" "}
                                      <span className="font-medium text-gray-800">
                                        {dataHoraAbast.valor}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Fazenda:{" "}
                                      <span className="font-medium text-gray-800">
                                        {fazendaAbastecimentoNome}
                                      </span>
                                    </div>
                                    <div className="text-gray-600">
                                      Origem do combustível:{" "}
                                      <span className="font-medium text-gray-800">
                                        {origemCombustivel}
                                      </span>
                                    </div>
                                    {estornoPorOrigem && (
                                      <div className="text-gray-600">
                                        Origem anterior:{" "}
                                        <span className="font-medium text-gray-800">
                                          Estoque da Fazenda
                                        </span>
                                      </div>
                                    )}
                                    {textoMotivoEstornoDetalhe && (
                                      <div className="text-gray-600 sm:col-span-2">
                                        Motivo do estorno:{" "}
                                        <span className="font-medium text-gray-800">
                                          {textoMotivoEstornoDetalhe}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {!abastExiste && resumo.abastecimentoId != null && (
                                    <p className="text-[11px] text-amber-800 mt-2">
                                      {MSG_ABAST_ORIGEM_NAO_ENCONTRADO}
                                    </p>
                                  )}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                                  Produtos da movimentação
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                                  {(!automaticaAbastecimento || mostrarRegistradoPor) && (
                                    <span>
                                      Registrado por:{" "}
                                      <span className="font-medium text-gray-800">{resumo.registradoPor}</span>
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
                                      const vtGravado = valorProdutoLinha(item, opts);
                                      const vtEstimado = valorItemMovimentacaoEfetivo(
                                        item,
                                        valorUnitMap,
                                        precoMedioImplicit,
                                      );
                                      const vtProduto =
                                        vtGravado ?? (vtEstimado > 0 ? vtEstimado : null);
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
                              {(resumo.subtotalItens != null ||
                                resumo.freteTotal > 0 ||
                                valorResumoEfetivo(resumo) != null) && (
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
                                            {formatValorResumo(valorResumoEfetivo(resumo))}
                                          </span>
                                        </div>
                                      </>
                                    ) : valorResumoEfetivo(resumo) != null ? (
                                      <>
                                        <div className="text-gray-600">
                                          Total dos itens:{" "}
                                          <span className="font-semibold text-gray-900 tabular-nums">
                                            {formatValorResumo(
                                              resumo.subtotalItens ?? valorResumoEfetivo(resumo),
                                            )}
                                          </span>
                                        </div>
                                        <div className="text-gray-800 pt-1 border-t border-gray-200">
                                          Total da movimentação:{" "}
                                          <span className="font-semibold tabular-nums">
                                            {formatValorResumo(valorResumoEfetivo(resumo))}
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
                                      {movimentacaoResumoAlteraSaldo(resumo, controlaSaldoPorId)
                                        ? "Resultado no estoque:"
                                        : "Resultado no histórico:"}{" "}
                                      <span className="font-medium text-gray-800">
                                        {movimentacaoResumoAlteraSaldo(resumo, controlaSaldoPorId)
                                          ? resumo.infoEstorno.resultado
                                          : textoResultadoEstornoHistorico(
                                              resumo.infoEstorno.itensRevertidos,
                                            )}
                                      </span>
                                    </div>
                                    <div className="text-gray-600 sm:col-span-2">
                                      {resumo.infoEstorno.referenciaDevolucao === "ok" &&
                                      resumo.infoEstorno.idInverso != null ? (
                                        <>
                                          Movimentação de devolução:{" "}
                                          <span className="font-medium text-gray-800">
                                            Nº {resumo.infoEstorno.idInverso}
                                          </span>
                                        </>
                                      ) : resumo.infoEstorno.referenciaDevolucao === "nao_localizada" ? (
                                        <span className="font-medium text-gray-800">
                                          Movimentação de devolução não localizada.
                                        </span>
                                      ) : (
                                        <span className="font-medium text-gray-800">
                                          Movimentação de devolução registrada.
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {resumo.infoEstorno.itensRevertidos.length > 1 && (
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
