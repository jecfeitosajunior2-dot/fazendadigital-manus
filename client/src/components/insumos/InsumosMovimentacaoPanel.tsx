import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import {
  DeleteActionIcon,
  EditActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import { trpc } from "@/lib/trpc";
import {
  formatDataBr,
  formatQuantidadeMov,
  nomeUnidadeExibicao,
  sinalDoTipo,
  TIPOS_MOVIMENTACAO,
} from "@/lib/produto-types";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

const FD_PRIMARY = "#4ECDC4";

type SortKey = "data" | "tipo" | "produto" | "quantidade" | "unidade" | "documento" | "responsavel";

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

function tipoExibicao(mov: { tipo: string | null; quantidade: string | number }): string {
  if (mov.tipo) return mov.tipo;
  const q = Number(mov.quantidade);
  return q >= 0 ? "Compra" : "Consumo interno";
}

/** Cores dos badges por tipo — entrada (verde/teal) vs saída (âmbar), sem vermelho de erro. */
function tipoBadgeClass(tipo: string): string {
  const norm = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("ajuste")) return "bg-slate-100 text-slate-600";
  if (norm.includes("transfer")) return "bg-sky-100 text-sky-800";
  if (norm.includes("compra")) return "bg-teal-100 text-teal-800";
  if (norm.includes("consumo")) return "bg-amber-100 text-amber-800";
  if (norm.includes("entrada")) return "bg-green-100 text-green-700";
  if (
    norm.includes("saida") ||
    norm.includes("venda") ||
    norm.includes("perda") ||
    norm.includes("descarte")
  ) {
    return "bg-amber-100 text-amber-800";
  }
  if (norm.includes("producao")) return "bg-green-100 text-green-700";

  return sinalDoTipo(tipo) === "entrada"
    ? "bg-green-100 text-green-700"
    : "bg-amber-100 text-amber-800";
}

function produtoSubtitulo(categoria?: string | null, subcategoria?: string | null): string {
  const cat = categoria?.trim();
  const sub = subcategoria?.trim();
  if (cat && sub) return `${cat} · ${sub}`;
  if (cat) return cat;
  return "—";
}

function rotuloUnidadeOuEmbalagem(unidade?: string | null): string {
  return nomeUnidadeExibicao(unidade) || "—";
}

function rotuloDocumento(notaFiscal?: string | null): string {
  const doc = notaFiscal?.trim();
  return doc || "—";
}

function rotuloResponsavel(fornecedor?: string | null): string {
  const nome = fornecedor?.trim();
  return nome || "—";
}

type MovRow = {
  id: number;
  fazendaId?: number | null;
  produtoFazendaId?: number | null;
  fornecedor?: string | null;
  destino?: string | null;
  manejo?: string | null;
  situacao?: string | null;
  [key: string]: unknown;
};

function rotuloOrigem(m: MovRow, origemDe: (m: MovRow) => string): string {
  if (m.fornecedor && String(m.fornecedor).trim()) return String(m.fornecedor).trim();
  return origemDe(m);
}

const SORT_TIPS: Record<SortKey, string> = {
  data: "Ordenar por data",
  tipo: "Ordenar por tipo",
  produto: "Ordenar por produto",
  quantidade: "Ordenar por quantidade",
  unidade: "Ordenar por unidade",
  documento: "Ordenar por documento",
  responsavel: "Ordenar por responsável",
};

function formatDataHoraExportacao(d = new Date()): string {
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InsumosMovimentacaoPanel() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
  });
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();

  const deleteMutation = trpc.estoque.deleteMovimentacao.useMutation({
    onSuccess: async () => {
      toast.success("Movimentação excluída.");
      await Promise.all([
        utils.estoque.listMovimentacoes.invalidate(),
        utils.estoque.list.invalidate(),
        utils.estoque.resumo.invalidate(),
      ]);
      await utils.estoque.listMovimentacoes.refetch();
    },
    onError: e => toast.error(e.message),
  });

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
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved =
      fromStorage ||
      (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFFazenda(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaSelecionada = Boolean(fFazenda);
  const fazendaSelecionadaNome = useMemo(
    () => fazendas.find(f => String(f.id) === fFazenda)?.nome,
    [fazendas, fFazenda],
  );

  const fazendaNome = (id: number | null | undefined): string => {
    if (!id) return "";
    return fazendas.find(f => f.id === id)?.nome ?? "";
  };
  const origemDe = (m: MovRow) => fazendaNome(m.fazendaId ?? m.produtoFazendaId);

  const produtosDaFazenda = useMemo(() => {
    if (!fFazenda) return [];
    return [...produtos]
      .filter(p => String(p.fazendaId ?? "") === fFazenda)
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? ""));
  }, [produtos, fFazenda]);

  const movimentacoesDaFazenda = useMemo(() => {
    if (!fFazenda) return [];
    return movimentacoes.filter(
      m => String(m.fazendaId ?? m.produtoFazendaId ?? "") === fFazenda,
    );
  }, [movimentacoes, fFazenda]);

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
  };

  const filtradas = useMemo(() => {
    if (!fFazenda) return [];
    return movimentacoesDaFazenda.filter(m => {
      if (aplicados.categoria && m.categoria !== aplicados.categoria) return false;
      if (aplicados.subcategoria && m.subcategoria !== aplicados.subcategoria) return false;
      if (aplicados.origem) {
        const o = rotuloOrigem(m, origemDe).toLowerCase();
        if (!o.includes(aplicados.origem.toLowerCase())) return false;
      }
      if (aplicados.destino && m.destino !== aplicados.destino) return false;
      if (aplicados.tipo && tipoExibicao(m) !== aplicados.tipo) return false;
      if (aplicados.notaFiscal && !(m.notaFiscal ?? "").toLowerCase().includes(aplicados.notaFiscal.toLowerCase())) return false;
      if (aplicados.produto && String(m.estoqueId ?? "") !== aplicados.produto) return false;
      const data = String(m.dataMovimentacao ?? "").slice(0, 10);
      if (aplicados.periodoIni && data < aplicados.periodoIni) return false;
      if (aplicados.periodoFim && data > aplicados.periodoFim) return false;
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const campos = [
          m.nome,
          m.categoria,
          m.subcategoria,
          tipoExibicao(m),
          m.fornecedor,
          m.destino,
          m.manejo,
          m.notaFiscal,
          rotuloUnidadeOuEmbalagem(m.unidade),
        ];
        if (!campos.some(v => v && String(v).toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [movimentacoesDaFazenda, aplicados, busca, fFazenda, fazendas]);

  const ordenadas = useMemo(() => {
    const rows = [...filtradas];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "data":
          va = String(a.dataMovimentacao);
          vb = String(b.dataMovimentacao);
          break;
        case "tipo":
          va = tipoExibicao(a);
          vb = tipoExibicao(b);
          break;
        case "produto":
          va = a.nome ?? "";
          vb = b.nome ?? "";
          break;
        case "quantidade":
          va = Math.abs(Number(a.quantidade));
          vb = Math.abs(Number(b.quantidade));
          break;
        case "unidade":
          va = rotuloUnidadeOuEmbalagem(a.unidade);
          vb = rotuloUnidadeOuEmbalagem(b.unidade);
          break;
        case "documento":
          va = a.notaFiscal ?? "";
          vb = b.notaFiscal ?? "";
          break;
        case "responsavel":
          va = a.fornecedor ?? "";
          vb = b.fornecedor ?? "";
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtradas, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / perPage));
  const paginaAtual = Math.min(page, totalPages);
  const pageItems = ordenadas.slice((paginaAtual - 1) * perPage, paginaAtual * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
    setPage(1);
  };

  const aplicarFiltros = () => {
    if (!fazendaSelecionada) return;
    setAplicados(filtrosRascunho);
    setPage(1);
  };

  const limparFiltros = () => {
    limparFiltrosSecundarios();
  };

  const exportHeaders = [
    "Data",
    "Produto",
    "Tipo de movimentação",
    "Quantidade",
    "Unidade ou embalagem",
    "Documento",
    "Responsável",
    "Categoria",
    "Subcategoria",
  ];
  const exportRows = ordenadas.map(m => [
    formatDataBr(m.dataMovimentacao),
    m.nome ?? "",
    tipoExibicao(m),
    formatQuantidadeMov(Math.abs(Number(m.quantidade))),
    rotuloUnidadeOuEmbalagem(m.unidade),
    m.notaFiscal ?? "",
    m.fornecedor ?? "",
    m.categoria ?? "",
    m.subcategoria ?? "",
  ]);

  const periodoExportacao = (() => {
    const ini = aplicados.periodoIni || fPeriodoIni;
    const fim = aplicados.periodoFim || fPeriodoFim;
    if (ini && fim) return `${formatDataBr(ini)} a ${formatDataBr(fim)}`;
    if (ini) return `A partir de ${formatDataBr(ini)}`;
    if (fim) return `Até ${formatDataBr(fim)}`;
    return "Todo o período";
  })();

  const filtrosExportacao = (() => {
    const partes: string[] = [];
    const produtoNome = produtosDaFazenda.find(p => String(p.id) === (aplicados.produto || fProduto))?.nome;
    if (produtoNome) partes.push(`Produto: ${produtoNome}`);
    if (aplicados.tipo || fTipo) partes.push(`Tipo: ${aplicados.tipo || fTipo}`);
    if (busca.trim()) partes.push(`Busca: ${busca.trim()}`);
    if (aplicados.categoria || fCategoria) partes.push(`Categoria: ${aplicados.categoria || fCategoria}`);
    if (aplicados.subcategoria || fSubcategoria) partes.push(`Subcategoria: ${aplicados.subcategoria || fSubcategoria}`);
    if (aplicados.origem || fOrigem) partes.push(`Origem: ${aplicados.origem || fOrigem}`);
    if (aplicados.destino || fDestino) partes.push(`Destino: ${aplicados.destino || fDestino}`);
    if (aplicados.notaFiscal || fNotaFiscal) partes.push(`NF: ${aplicados.notaFiscal || fNotaFiscal}`);
    return partes.length ? partes.join(" · ") : "Nenhum filtro adicional";
  })();

  const exportSubtitles = [
    `Fazenda: ${fazendaSelecionadaNome ?? "—"}`,
    `Período consultado: ${periodoExportacao}`,
    `Filtros aplicados: ${filtrosExportacao}`,
    `Exportado em: ${formatDataHoraExportacao()}`,
  ];

  const isEmptySemFazenda = !isLoading && !fazendaSelecionada;
  const isEmptyMovimentacoes =
    !isLoading && fazendaSelecionada && movimentacoesDaFazenda.length === 0;
  const isEmptyFiltro =
    !isLoading &&
    fazendaSelecionada &&
    movimentacoesDaFazenda.length > 0 &&
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
    "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none text-left hover:bg-gray-100 transition-colors group/th";
  const selectClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const inputClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";

  const stickyProdutoTh =
    "sticky left-0 z-20 bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-200";
  const stickyProdutoTd =
    "sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)] border-r border-gray-100";

  const colunas: [SortKey, string, string][] = [
    ["data", "Data", "min-w-[88px]"],
    ["produto", "Produto", "min-w-[160px]"],
    ["tipo", "Tipo de movimentação", "min-w-[120px]"],
    ["quantidade", "Quantidade", "min-w-[96px]"],
    ["unidade", "Unidade ou embalagem", "min-w-[110px]"],
    ["documento", "Documento", "min-w-[100px]"],
    ["responsavel", "Responsável", "min-w-[120px]"],
  ];

  const tituloQuadro = fazendaSelecionadaNome
    ? `Movimentações — ${fazendaSelecionadaNome}`
    : "Movimentações";

  const irNovaMovimentacao = () => {
    if (!fFazenda) {
      toast.error("Selecione uma fazenda antes de registrar uma movimentação.");
      return;
    }
    setLocation(`/insumos/nova-movimentacao?fazendaId=${encodeURIComponent(fFazenda)}`);
  };

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden px-4 py-3">
        {/* Linha 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

        {/* Linha 2 */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
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
          <div className="lg:col-span-7 flex flex-wrap items-center gap-2 lg:justify-end pb-0.5">
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
              alignRightFrom={3}
              variant="secondary"
              disabled={!fazendaSelecionada || ordenadas.length === 0}
              fazendaNome={fazendaSelecionadaNome}
              spreadsheetReportTitle={tituloQuadro}
              spreadsheetReportSubtitles={exportSubtitles}
            />
          </div>
        </div>

        {isEmptySemFazenda ? (
          <div className="py-14 px-6 text-center">
            <span className="material-icons text-[40px] text-gray-300 block mb-3">agriculture</span>
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
            <table className="w-full min-w-[960px] text-[12px] border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {colunas.map(([key, label, minW]) => {
                    const isProduto = key === "produto";
                    const sortTitle =
                      sortKey === key
                        ? `${SORT_TIPS[key]} (${sortAsc ? "crescente" : "decrescente"})`
                        : SORT_TIPS[key];
                    return (
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
                  })}
                  <th className="px-2 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap text-center w-[72px]">
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
                  pageItems.map(m => {
                    const tipo = tipoExibicao(m);
                    const inativo = m.situacao === "inativo";

                    return (
                      <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                        <td className="px-3 py-2 text-gray-800 whitespace-nowrap align-middle">
                          {formatDataBr(m.dataMovimentacao)}
                        </td>
                        <td className={`px-3 py-2 align-middle ${stickyProdutoTd}`}>
                          <div className="flex items-start gap-1.5 flex-wrap">
                            <div className="font-medium text-[13px] text-gray-900 leading-snug">{m.nome}</div>
                            {inativo && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 shrink-0">
                                Inativo
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                            {produtoSubtitulo(m.categoria, m.subcategoria)}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${tipoBadgeClass(tipo)}`}>
                            {tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-900 whitespace-nowrap align-middle">
                          {formatQuantidadeMov(Math.abs(Number(m.quantidade)))}
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap align-middle">
                          {rotuloUnidadeOuEmbalagem(m.unidade)}
                        </td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap align-middle">
                          {rotuloDocumento(m.notaFiscal)}
                        </td>
                        <td className="px-3 py-2 text-gray-700 align-middle min-w-[120px] leading-snug">
                          {rotuloResponsavel(m.fornecedor)}
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="flex items-center justify-center gap-0.5">
                            <TableIconButton
                              label="Editar movimentação"
                              onClick={() =>
                                setLocation(
                                  `/insumos/nova-movimentacao?id=${m.id}${fFazenda ? `&fazendaId=${encodeURIComponent(fFazenda)}` : ""}`,
                                )
                              }
                              tone="neutral"
                              compact
                            >
                              <EditActionIcon size={16} />
                            </TableIconButton>
                            <TableIconButton
                              label="Excluir movimentação"
                              onClick={() => {
                                if (confirm("Excluir esta movimentação? O estoque será recalculado.")) {
                                  deleteMutation.mutate({ id: m.id });
                                }
                              }}
                              tone="danger"
                              compact
                            >
                              <DeleteActionIcon size={16} />
                            </TableIconButton>
                          </div>
                        </td>
                      </tr>
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
