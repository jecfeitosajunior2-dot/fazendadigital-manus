import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import { trpc } from "@/lib/trpc";
import {
  formatDataBr,
  formatQuantidadeMov,
  nomeUnidadeExibicao,
  sinalDoTipo,
  TIPOS_MOVIMENTACAO,
} from "@/lib/produto-types";

const FD_PRIMARY = "#4ECDC4";

type SortKey =
  | "data" | "tipo" | "produto" | "categoria" | "subcategoria"
  | "quantidade" | "unidade" | "idUnico" | "valor";

const fmtMoeda = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function tipoExibicao(mov: { tipo: string | null; quantidade: string | number }): string {
  if (mov.tipo) return mov.tipo;
  const q = Number(mov.quantidade);
  return q >= 0 ? "Compra" : "Consumo interno";
}

export default function InsumosMovimentacaoPanel() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();

  const deleteMutation = trpc.estoque.deleteMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação excluída.");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  // Filtros
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [fFazenda, setFFazenda] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fSubcategoria, setFSubcategoria] = useState("");
  const [fDestino, setFDestino] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fNotaFiscal, setFNotaFiscal] = useState("");
  const [fFrete, setFFrete] = useState("");
  const [fIdUnico, setFIdUnico] = useState("");
  const [fPeriodoIni, setFPeriodoIni] = useState("");
  const [fPeriodoFim, setFPeriodoFim] = useState("");
  const [fValidadeIni, setFValidadeIni] = useState("");
  const [fValidadeFim, setFValidadeFim] = useState("");
  const [busca, setBusca] = useState("");

  // Ordenação / paginação
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortAsc, setSortAsc] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  const fazendaNome = (id: number | null | undefined): string => {
    if (!id) return "";
    return fazendas.find(f => f.id === id)?.nome ?? "";
  };
  const origemDe = (m: { fazendaId: number | null; produtoFazendaId: number | null }) =>
    fazendaNome(m.fazendaId ?? m.produtoFazendaId);

  const categoriasDisponiveis = useMemo(
    () => [...new Set(movimentacoes.map(m => m.categoria).filter(Boolean) as string[])].sort(),
    [movimentacoes]
  );
  const subcategoriasDisponiveis = useMemo(
    () => [...new Set(movimentacoes.map(m => m.subcategoria).filter(Boolean) as string[])].sort(),
    [movimentacoes]
  );
  const destinosDisponiveis = useMemo(
    () => [...new Set(movimentacoes.map(m => m.destino).filter(Boolean) as string[])].sort(),
    [movimentacoes]
  );

  const filtradas = useMemo(() => {
    return movimentacoes.filter(m => {
      if (fFazenda && String(m.fazendaId ?? m.produtoFazendaId ?? "") !== fFazenda) return false;
      if (fCategoria && m.categoria !== fCategoria) return false;
      if (fSubcategoria && m.subcategoria !== fSubcategoria) return false;
      if (fDestino && m.destino !== fDestino) return false;
      if (fTipo && tipoExibicao(m) !== fTipo) return false;
      if (fNotaFiscal && !(m.notaFiscal ?? "").toLowerCase().includes(fNotaFiscal.toLowerCase())) return false;
      if (fFrete && !String(m.frete ?? "").includes(fFrete)) return false;
      if (fIdUnico && !String(m.identificadorUnico ?? "").toLowerCase().includes(fIdUnico.toLowerCase())) return false;
      const data = String(m.dataMovimentacao ?? "").slice(0, 10);
      if (fPeriodoIni && data < fPeriodoIni) return false;
      if (fPeriodoFim && data > fPeriodoFim) return false;
      const validade = String(m.dataValidade ?? "").slice(0, 10);
      if (fValidadeIni && (!validade || validade < fValidadeIni)) return false;
      if (fValidadeFim && (!validade || validade > fValidadeFim)) return false;
      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const campos = [
          m.nome, m.categoria, m.subcategoria, tipoExibicao(m), m.fornecedor,
          m.destino, m.manejo, m.notaFiscal, origemDe(m), String(m.identificadorUnico ?? ""),
        ];
        if (!campos.some(v => v && String(v).toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [
    movimentacoes, fFazenda, fCategoria, fSubcategoria, fDestino, fTipo,
    fNotaFiscal, fFrete, fIdUnico, fPeriodoIni, fPeriodoFim, fValidadeIni, fValidadeFim, busca,
  ]);

  const ordenadas = useMemo(() => {
    const rows = [...filtradas];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "data": va = String(a.dataMovimentacao); vb = String(b.dataMovimentacao); break;
        case "tipo": va = tipoExibicao(a); vb = tipoExibicao(b); break;
        case "produto": va = a.nome ?? ""; vb = b.nome ?? ""; break;
        case "categoria": va = a.categoria ?? ""; vb = b.categoria ?? ""; break;
        case "subcategoria": va = a.subcategoria ?? ""; vb = b.subcategoria ?? ""; break;
        case "quantidade": va = Math.abs(Number(a.quantidade)); vb = Math.abs(Number(b.quantidade)); break;
        case "unidade": va = nomeUnidadeExibicao(a.unidade); vb = nomeUnidadeExibicao(b.unidade); break;
        case "idUnico": va = Number(a.identificadorUnico ?? 0); vb = Number(b.identificadorUnico ?? 0); break;
        case "valor": va = Number(a.valor ?? 0); vb = Number(b.valor ?? 0); break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtradas, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / perPage));
  const paginaAtual = Math.min(page, totalPages);
  const inicio = (paginaAtual - 1) * perPage;
  const fim = Math.min(inicio + perPage, ordenadas.length);
  const pageItems = ordenadas.slice(inicio, fim);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const limparFiltros = () => {
    setFFazenda(""); setFCategoria(""); setFSubcategoria(""); setFDestino(""); setFTipo("");
    setFNotaFiscal(""); setFFrete(""); setFIdUnico("");
    setFPeriodoIni(""); setFPeriodoFim(""); setFValidadeIni(""); setFValidadeFim("");
    setBusca(""); setPage(1);
  };

  const exportHeaders = [
    "Data", "Tipo", "Produto", "Categoria", "Subcategoria", "Quantidade", "Unidade",
    "Origem", "Manejo", "Destino", "Nota Fiscal", "Frete", "Fornecedor", "ID Único", "Valor",
  ];
  const exportRows = ordenadas.map(m => [
    formatDataBr(m.dataMovimentacao),
    tipoExibicao(m),
    m.nome ?? "",
    m.categoria ?? "",
    m.subcategoria ?? "",
    formatQuantidadeMov(Math.abs(Number(m.quantidade))),
    nomeUnidadeExibicao(m.unidade),
    origemDe(m),
    m.manejo ?? "",
    m.destino ?? "",
    m.notaFiscal ?? "",
    fmtMoeda(m.frete),
    m.fornecedor ?? "",
    m.identificadorUnico ?? "",
    fmtMoeda(m.valor),
  ]);

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="material-icons text-[13px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass =
    "px-3 py-3 text-[10px] font-semibold text-gray-700 uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none";
  const selectClass = "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full";
  const inputClass = "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";

  const colunas: [SortKey, string][] = [
    ["data", "Data"],
    ["tipo", "Tipo"],
    ["produto", "Produto"],
    ["categoria", "Categoria"],
    ["subcategoria", "Subcategoria"],
    ["quantidade", "Qtd"],
    ["unidade", "Unidade"],
  ];

  return (
    <div className="space-y-4">
      {/* Painel de filtros */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltrosAbertos(o => !o)}
          className="w-full px-5 py-3 flex items-center justify-between text-left"
        >
          <span className="text-[13px] font-semibold text-gray-800">Filtros Movimentação de Insumos</span>
          <span className="material-icons text-gray-500 transition-transform" style={{ transform: filtrosAbertos ? "rotate(180deg)" : "none" }}>
            expand_more
          </span>
        </button>

        {filtrosAbertos && (
          <div className="px-5 pb-5 pt-1 border-t border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
              <div>
                <label className={labelClass}>Fazenda</label>
                <select value={fFazenda} onChange={e => { setFFazenda(e.target.value); setPage(1); }} className={selectClass}>
                  <option value="">Todas</option>
                  {fazendas.map(f => <option key={f.id} value={String(f.id)}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select value={fCategoria} onChange={e => { setFCategoria(e.target.value); setPage(1); }} className={selectClass}>
                  <option value="">Selecione uma categoria</option>
                  {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Subcategoria</label>
                <select value={fSubcategoria} onChange={e => { setFSubcategoria(e.target.value); setPage(1); }} className={selectClass}>
                  <option value="">Selecione uma subcategoria</option>
                  {subcategoriasDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Destino</label>
                <select value={fDestino} onChange={e => { setFDestino(e.target.value); setPage(1); }} className={selectClass}>
                  <option value="">Selecione um destino</option>
                  {destinosDisponiveis.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Tipo Movimentação</label>
                <select value={fTipo} onChange={e => { setFTipo(e.target.value); setPage(1); }} className={selectClass}>
                  <option value="">Selecione um tipo</option>
                  {TIPOS_MOVIMENTACAO.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className={labelClass}>Nota Fiscal</label>
                <input value={fNotaFiscal} onChange={e => { setFNotaFiscal(e.target.value); setPage(1); }} placeholder="nº nota fiscal" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Frete</label>
                <input value={fFrete} onChange={e => { setFFrete(e.target.value); setPage(1); }} placeholder="R$ frete" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>ID Único</label>
                <input value={fIdUnico} onChange={e => { setFIdUnico(e.target.value); setPage(1); }} placeholder="id único" className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className={labelClass}>Período</label>
                <div className="flex items-center gap-1">
                  <input type="date" value={fPeriodoIni} onChange={e => { setFPeriodoIni(e.target.value); setPage(1); }} className={inputClass} />
                  <span className="text-gray-400 text-[12px]">–</span>
                  <input type="date" value={fPeriodoFim} onChange={e => { setFPeriodoFim(e.target.value); setPage(1); }} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Data Validade</label>
                <div className="flex items-center gap-1">
                  <input type="date" value={fValidadeIni} onChange={e => { setFValidadeIni(e.target.value); setPage(1); }} className={inputClass} />
                  <span className="text-gray-400 text-[12px]">–</span>
                  <input type="date" value={fValidadeFim} onChange={e => { setFValidadeFim(e.target.value); setPage(1); }} className={inputClass} />
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-3 mt-4">
              <button
                type="button"
                onClick={() => setPage(1)}
                className="px-8 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Filtrar
              </button>
              <button
                type="button"
                onClick={limparFiltros}
                className="px-6 py-2 rounded text-[11px] font-semibold uppercase tracking-wide border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card Movimentações */}
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            Movimentações
          </h1>
          <ListExportButtons
            title="Movimentações"
            filename="movimentacoes-insumos"
            headers={exportHeaders}
            rows={exportRows}
            alignRightFrom={5}
          />
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setLocation("/insumos/nova-movimentacao")}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Nova Movimentação
          </button>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar"
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded pl-8 pr-3 py-1.5 text-[12px] w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white">
                {colunas.map(([key, label]) => (
                  <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center">{label}<SortIcon col={key} /></span>
                  </th>
                ))}
                <th className={thClass}>Origem</th>
                <th className={thClass}>Manejo</th>
                <th className={thClass}>Destino</th>
                <th className={thClass}>Nota Fiscal</th>
                <th className={thClass}>Frete</th>
                <th className={thClass}>Fornecedor</th>
                <th className={thClass} onClick={() => toggleSort("idUnico")}>
                  <span className="inline-flex items-center">ID Único<SortIcon col="idUnico" /></span>
                </th>
                <th className={thClass} onClick={() => toggleSort("valor")}>
                  <span className="inline-flex items-center">Valor<SortIcon col="valor" /></span>
                </th>
                <th className="w-20 px-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={17} className="px-4 py-12 text-center text-gray-400">Carregando...</td></tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr><td colSpan={17} className="px-4 py-14 text-center text-gray-400">Sem dados</td></tr>
              )}
              {pageItems.map(m => {
                const tipo = tipoExibicao(m);
                const entrada = m.tipo
                  ? sinalDoTipo(m.tipo) === "entrada"
                  : Number(m.quantidade) >= 0;
                return (
                  <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{formatDataBr(m.dataMovimentacao)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                          entrada ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {tipo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 uppercase whitespace-nowrap">{m.nome}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.categoria ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.subcategoria ?? ""}</td>
                    <td className={`px-3 py-2.5 tabular-nums font-medium ${entrada ? "text-green-700" : "text-red-700"}`}>
                      {formatQuantidadeMov(Math.abs(Number(m.quantidade)))}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeUnidadeExibicao(m.unidade)}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{origemDe(m)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.manejo ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.destino ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.notaFiscal ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabular-nums">{fmtMoeda(m.frete)}</td>
                    <td className="px-3 py-2.5 text-gray-700">{m.fornecedor ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabular-nums">{m.identificadorUnico ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabular-nums">{fmtMoeda(m.valor)}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setLocation(`/insumos/nova-movimentacao?id=${m.id}`)}
                          className="p-1 text-gray-600 hover:text-[#4ECDC4]"
                          title="Editar"
                        >
                          <span className="material-icons text-[18px]">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir esta movimentação? O estoque será recalculado.")) {
                              deleteMutation.mutate({ id: m.id });
                            }
                          }}
                          className="p-1 text-gray-600 hover:text-red-600"
                          title="Excluir"
                        >
                          <span className="material-icons text-[18px]">delete</span>
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
          <select
            value={perPage}
            onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
            className="border border-gray-300 rounded px-2 py-1 text-[11px] bg-white"
          >
            {[10, 20, 50].map(n => <option key={n} value={n}>{n} itens por página</option>)}
          </select>
          <div className="flex items-center gap-3 text-[12px] text-gray-600">
            <span>
              {ordenadas.length === 0 ? "Nenhum item" : `Mostrando ${inicio + 1}-${fim} de ${ordenadas.length} itens`}
            </span>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={paginaAtual === 1}
              className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              <span className="material-icons text-[16px]">chevron_left</span>
            </button>
            <span className="px-2 py-0.5 text-white rounded text-[12px] font-semibold" style={{ backgroundColor: FD_PRIMARY }}>
              {paginaAtual}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={paginaAtual === totalPages}
              className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              <span className="material-icons text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
