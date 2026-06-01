import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  formatDataBr,
  formatQuantidadeMov,
  nomeUnidadeExibicao,
  parseObsMovimentacao,
} from "@/lib/produto-types";

type SortKey = "data" | "tipo" | "produto" | "quantidade" | "manejo" | "unidade";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) {
    return <span className="material-icons text-[13px] opacity-40 ml-0.5">unfold_more</span>;
  }
  return (
    <span className="material-icons text-[13px] ml-0.5">
      {sortDir === "asc" ? "keyboard_arrow_up" : "keyboard_arrow_down"}
    </span>
  );
}

function tipoMovimentacao(obs: string | null | undefined, quantidade: string): string {
  const parsed = parseObsMovimentacao(obs);
  if (parsed?.sinal === "saida") return "Saída";
  if (parsed?.sinal === "entrada") return "Entrada";
  const qty = parseFloat(String(quantidade).replace(",", "."));
  return qty < 0 ? "Saída" : "Entrada";
}

export default function InsumosHistoricoMovimentacaoPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const estoqueId = parseInt(params.get("id") ?? "0", 10);

  const [busca, setBusca] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [itensPorPagina, setItensPorPagina] = useState(10);
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const movQuery = trpc.estoque.listMovimentacoesByProduto.useQuery(
    { estoqueId },
    { enabled: estoqueId > 0 }
  );

  const deleteAllMut = trpc.estoque.deleteAllMovimentacoesByProduto.useMutation({
    onSuccess: () => movQuery.refetch(),
  });

  const deleteOneMut = trpc.estoque.deleteMovimentacao.useMutation({
    onSuccess: () => movQuery.refetch(),
  });

  const movs = movQuery.data ?? [];

  const nomeProduto = movs[0]?.nome ?? "—";

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPagina(1);
  }

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return movs.filter(m => {
      if (!q) return true;
      const tipo = tipoMovimentacao(m.observacoes, m.quantidade).toLowerCase();
      return (
        m.nome?.toLowerCase().includes(q) ||
        tipo.includes(q) ||
        formatDataBr(m.dataMovimentacao).includes(q) ||
        String(m.quantidade).includes(q)
      );
    });
  }, [movs, busca]);

  const ordenados = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "data") {
        va = a.dataMovimentacao ?? "";
        vb = b.dataMovimentacao ?? "";
      } else if (sortKey === "tipo") {
        va = tipoMovimentacao(a.observacoes, a.quantidade);
        vb = tipoMovimentacao(b.observacoes, b.quantidade);
      } else if (sortKey === "produto") {
        va = a.nome ?? "";
        vb = b.nome ?? "";
      } else if (sortKey === "quantidade") {
        va = parseFloat(String(a.quantidade).replace(",", ".")) || 0;
        vb = parseFloat(String(b.quantidade).replace(",", ".")) || 0;
      } else if (sortKey === "unidade") {
        va = nomeUnidadeExibicao(a.unidade);
        vb = nomeUnidadeExibicao(b.unidade);
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtrados, sortKey, sortDir]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / itensPorPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * itensPorPagina;
  const fim = Math.min(inicio + itensPorPagina, ordenados.length);
  const paginados = ordenados.slice(inicio, fim);

  function toggleSelecionado(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === paginados.length && paginados.length > 0) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(paginados.map(m => m.id)));
    }
  }

  const thClass =
    "px-3 py-3 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap";

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-4">
          <h1
            className="text-[22px] font-bold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Histórico de Movimentação{nomeProduto !== "—" ? ` - ${nomeProduto}` : ""}
          </h1>
          <button
            onClick={() => setLocation("/insumos/lista-produtos")}
            className="px-5 py-2 bg-gray-200 text-gray-700 text-sm font-semibold rounded hover:bg-gray-300 transition-colors"
          >
            VOLTAR
          </button>
        </div>

        {/* Card principal */}
        <div className="bg-white rounded shadow-sm">
          {/* Barra de ações */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 flex-wrap gap-2">
            <button
              onClick={() => {
                if (
                  confirm(
                    `Tem certeza que deseja excluir TODAS as movimentações de "${nomeProduto}"? O estoque será zerado.`
                  )
                ) {
                  deleteAllMut.mutate({ estoqueId });
                }
              }}
              className="px-4 py-1.5 bg-red-100 text-red-700 text-[12px] font-semibold rounded border border-red-300 hover:bg-red-200 transition-colors"
            >
              EXCLUIR TODAS AS MOVIMENTAÇÕES DESSE PRODUTO
            </button>

            {/* Busca */}
            <div className="relative">
              <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar"
                value={busca}
                onChange={e => { setBusca(e.target.value); setPagina(1); }}
                className="pl-7 pr-3 py-1.5 border border-gray-300 rounded text-[12px] focus:outline-none focus:ring-1 focus:ring-[#4ECDC4] w-[200px]"
              />
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={paginados.length > 0 && selecionados.size === paginados.length}
                      onChange={toggleTodos}
                      className="w-3.5 h-3.5 accent-[#4ECDC4]"
                    />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("data")}>
                    <span className="inline-flex items-center">
                      DATA DE MOVIMENTAÇÃO
                      <SortIcon col="data" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("tipo")}>
                    <span className="inline-flex items-center">
                      TIPO DE MOVIMENTAÇÃO
                      <SortIcon col="tipo" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("produto")}>
                    <span className="inline-flex items-center">
                      PRODUTO
                      <SortIcon col="produto" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("quantidade")}>
                    <span className="inline-flex items-center">
                      QUANTIDADE
                      <SortIcon col="quantidade" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("manejo")}>
                    <span className="inline-flex items-center">
                      MANEJO
                      <SortIcon col="manejo" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className={thClass} onClick={() => toggleSort("unidade")}>
                    <span className="inline-flex items-center">
                      UNIDADE
                      <SortIcon col="unidade" sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {movQuery.isLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-[13px] text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!movQuery.isLoading && paginados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-gray-400">
                      Nenhuma movimentação encontrada.
                    </td>
                  </tr>
                )}
                {paginados.map((mov, idx) => {
                  const tipo = tipoMovimentacao(mov.observacoes, mov.quantidade);
                  const qtdNum = parseFloat(String(mov.quantidade).replace(",", "."));
                  const qtdAbs = Math.abs(qtdNum);
                  const unidadeNome = nomeUnidadeExibicao(mov.unidade);
                  return (
                    <tr
                      key={mov.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selecionados.has(mov.id)}
                          onChange={() => toggleSelecionado(mov.id)}
                          className="w-3.5 h-3.5 accent-[#4ECDC4]"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-gray-700">
                        {formatDataBr(mov.dataMovimentacao)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-gray-700">{tipo}</td>
                      <td className="px-3 py-3 text-[13px] text-gray-700">{mov.nome}</td>
                      <td className="px-3 py-3 text-[13px] text-gray-700">
                        {formatQuantidadeMov(qtdAbs)}
                      </td>
                      <td className="px-3 py-3 text-[13px] text-gray-400">—</td>
                      <td className="px-3 py-3 text-[13px] text-gray-700">{unidadeNome}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => {
                            if (confirm("Excluir esta movimentação?")) {
                              deleteOneMut.mutate({ id: mov.id });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Excluir movimentação"
                        >
                          <span className="material-icons text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Rodapé paginação */}
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={itensPorPagina}
                onChange={e => { setItensPorPagina(Number(e.target.value)); setPagina(1); }}
                className="border border-gray-300 rounded text-[12px] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
              >
                <option value={10}>10 itens por página</option>
                <option value={20}>20 itens por página</option>
                <option value={50}>50 itens por página</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-gray-600">
              <span>
                {ordenados.length === 0
                  ? "Nenhum item"
                  : `Mostrando ${inicio + 1}-${fim} de ${ordenados.length} ${ordenados.length === 1 ? "item" : "itens"}`}
              </span>
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
              >
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              <span className="px-2 py-0.5 bg-[#4ECDC4] text-white rounded text-[12px] font-semibold">
                {paginaAtual}
              </span>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="p-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
              >
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-8 text-center text-[11px] text-gray-400">
          © Copyright 2026 | Fazenda Digital
        </div>
      </div>
    </div>
  );
}
