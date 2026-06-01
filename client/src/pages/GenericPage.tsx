import { useState, useMemo } from 'react';
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { useLocation, useSearch } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { normalizarUnidade, nomeUnidadeExibicao } from '@/lib/produto-types';

// --- Animals Page ---
export function AnimaisPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sexoFilter, setSexoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  const { data: animaisData, isLoading, refetch } = trpc.animais.list.useQuery({ status: statusFilter || undefined });
  const deleteMutation = trpc.animais.delete.useMutation({ onSuccess: () => { toast.success("Animal removido!"); refetch(); } });

  const animais = animaisData || [];
  const filteredAnimais = useMemo(() => {
    const q = search.trim().toLowerCase();
    return animais.filter(a => {
      if (sexoFilter && a.sexo !== sexoFilter) return false;
      if (!q) return true;
      return [a.brinco, a.nome, a.raca].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [animais, search, sexoFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAnimais.length / perPage));
  const paginated = filteredAnimais.slice((page - 1) * perPage, page * perPage);

  const exportHeaders = ["Brinco", "Nome", "Sexo", "Raça", "Status", "Peso (kg)"];
  const exportData = filteredAnimais.map(a => [
    a.brinco || "",
    a.nome || "",
    a.sexo === "macho" ? "Macho" : "Fêmea",
    a.raca || "",
    a.status || "",
    a.pesoAtual ? Number(a.pesoAtual).toFixed(1) : "",
  ]);

  return (
    <AppLayout>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de animais</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Lista de Animais"
            filename="animais"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={5}
          />
          <button onClick={() => setLocation("/rebanho/novo-animal")} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
            <span className="material-icons text-[14px]">add</span>
            Novo Animal
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Buscar por brinco, nome ou raça..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded px-3 py-1.5 text-[12px] focus:outline-none focus:border-[#2D5A5A] w-full sm:w-64"
        />
        <select value={sexoFilter} onChange={e => { setSexoFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1.5 text-[12px] focus:outline-none">
          <option value="">Sexo</option>
          <option value="macho">Macho</option>
          <option value="femea">Fêmea</option>
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="border border-gray-300 rounded px-2 py-1.5 text-[12px] focus:outline-none">
          <option value="">Status</option>
          <option value="ativo">Ativo</option>
          <option value="vendido">Vendido</option>
          <option value="morto">Morto</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Brinco</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Nome</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Sexo</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Raça</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Peso (kg)</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum animal encontrado.</td></tr>
              ) : paginated.map((animal) => (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-[#2D5A5A]">{animal.brinco || "-"}</td>
                  <td className="px-3 py-2">{animal.nome || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${animal.sexo === "macho" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}>
                      {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{animal.raca || "-"}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${animal.status === "ativo" ? "bg-green-100 text-green-700" : animal.status === "vendido" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                      {animal.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{animal.pesoAtual ? Number(animal.pesoAtual).toFixed(1) : "-"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setLocation(`/rebanho/detalhes-animal?id=${animal.id}`)} className="p-1 text-gray-400 hover:text-[#2D5A5A]" title="Ver detalhes">
                        <span className="material-icons text-[16px]">visibility</span>
                      </button>
                      <button onClick={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)} className="p-1 text-gray-400 hover:text-blue-600" title="Editar">
                        <span className="material-icons text-[16px]">edit</span>
                      </button>
                      <button onClick={() => { if (confirm("Remover animal?")) deleteMutation.mutate({ id: animal.id }); }} className="p-1 text-gray-400 hover:text-red-600" title="Remover">
                        <span className="material-icons text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
            <span className="text-[11px] text-gray-500">{filteredAnimais.length} animais</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 text-[11px] border rounded disabled:opacity-40">Anterior</button>
              <span className="text-[11px] px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 text-[11px] border rounded disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Lista de Produtos (iRancho fiel) ────────────────────────────────────────
const FD_PRIMARY = "#4ECDC4";

type SortKeyEstoque =
  | "nome" | "categoria" | "situacao" | "fabricante" | "identificadorUnico"
  | "quantidadeMinima" | "quantidadeMaxima" | "quantidade" | "unidade" | "valorUnitario";

export function EstoquePage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"ativo" | "inativo" | "todos">("ativo");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<SortKeyEstoque>("nome");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: items = [], isLoading, refetch } = trpc.estoque.list.useQuery();
  const deleteMutation = trpc.estoque.delete.useMutation({
    onSuccess: () => { toast.success("Produto removido!"); refetch(); },
  });

  const filtered = useMemo(() => {
    let list = [...items];
    if (statusFiltro !== "todos") {
      list = list.filter(i => (i.situacao ?? "ativo") === statusFiltro);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        [i.nome, i.categoria, i.fabricante, i.identificadorUnico].some(
          v => v && String(v).toLowerCase().includes(q)
        )
      );
    }
    list.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "nome": va = String(a.nome ?? "").toLowerCase(); vb = String(b.nome ?? "").toLowerCase(); break;
        case "categoria": va = String(a.categoria ?? "").toLowerCase(); vb = String(b.categoria ?? "").toLowerCase(); break;
        case "situacao": va = String(a.situacao ?? ""); vb = String(b.situacao ?? ""); break;
        case "fabricante": va = String(a.fabricante ?? "").toLowerCase(); vb = String(b.fabricante ?? "").toLowerCase(); break;
        case "identificadorUnico": va = Number(a.identificadorUnico ?? 0); vb = Number(b.identificadorUnico ?? 0); break;
        case "quantidadeMinima": va = Number(a.quantidadeMinima ?? 0); vb = Number(b.quantidadeMinima ?? 0); break;
        case "quantidadeMaxima": va = Number(a.quantidadeMaxima ?? 0); vb = Number(b.quantidadeMaxima ?? 0); break;
        case "quantidade": va = Number(a.quantidade ?? 0); vb = Number(b.quantidade ?? 0); break;
        case "unidade": va = nomeUnidadeExibicao(a.unidade).toLowerCase(); vb = nomeUnidadeExibicao(b.unidade).toLowerCase(); break;
        case "valorUnitario": va = Number(a.valorUnitario ?? 0); vb = Number(b.valorUnitario ?? 0); break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [items, search, statusFiltro, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

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

  const exportHeaders = [
    "Nome", "Categoria", "Situação", "Fabricante", "Identif. Único",
    "Qtde Mínima", "Qtde Máxima", "Em Estoque", "Unidade", "Valor Residual",
  ];
  const exportRows = filtered.map(i => [
    i.nome,
    i.categoria ?? "",
    i.situacao === "inativo" ? "Inativo" : "Ativo",
    i.fabricante ?? "",
    i.identificadorUnico ?? "",
    Number(i.quantidadeMinima ?? 0).toFixed(2),
    Number(i.quantidadeMaxima ?? 0).toFixed(2),
    Number(i.quantidade ?? 0).toFixed(2),
    nomeUnidadeExibicao(i.unidade),
    i.valorUnitario ? `R$ ${Number(i.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
  ]);

  const SortIcon = ({ col }: { col: SortKeyEstoque }) => (
    <span className="material-icons text-[13px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass = "px-3 py-3 text-[10px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none text-left";

  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            Lista de produtos
          </h1>
          <div className="flex items-center gap-4 text-[10px] text-gray-600">
            <ListExportButtons title="Lista de produtos" filename="lista-produtos" headers={exportHeaders} rows={exportRows} alignRightFrom={5} />
          </div>
        </div>

        {/* Botão + Filtros */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setLocation("/insumos/cadastro")}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Novo Produto
          </button>
        </div>

        {/* Filtros de status + busca */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
          <select
            value="todos"
            disabled
            className="border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white min-w-[140px]"
          >
            <option value="todos">Todos Estoques</option>
          </select>
          <select
            value={statusFiltro}
            onChange={e => { setStatusFiltro(e.target.value as "ativo" | "inativo" | "todos"); setPage(1); }}
            className="border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white min-w-[110px]"
          >
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
            <option value="todos">Todos</option>
          </select>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              type="text"
              placeholder="Buscar"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded pl-8 pr-3 py-1.5 text-[12px] w-52"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-white">
                <th className="w-8 px-3 py-3">
                  <input
                    type="checkbox"
                    className="accent-[#4ECDC4]"
                    checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="w-6 px-1" />
                {([
                  ["nome", "Nome"],
                  ["categoria", "Categoria"],
                  ["situacao", "Situação"],
                  ["fabricante", "Fabricante"],
                  ["identificadorUnico", "Identif. Único"],
                  ["quantidadeMinima", "Qtde Mínima"],
                  ["quantidadeMaxima", "Qtde Máxima"],
                  ["quantidade", "Em Estoque"],
                  ["unidade", "Unidade"],
                  ["valorUnitario", "Valor Residual"],
                ] as [SortKeyEstoque, string][]).map(([key, label]) => (
                  <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                    <span className="inline-flex items-center">{label}<SortIcon col={key} /></span>
                  </th>
                ))}
                <th className="w-24 px-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">Carregando...</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-12 text-gray-400">Sem dados</td></tr>
              ) : pageItems.map(item => {
                const isLow = item.monitorarEstoque && Number(item.quantidadeMinima ?? 0) > 0 && Number(item.quantidade ?? 0) <= Number(item.quantidadeMinima ?? 0);
                const isInativo = item.situacao === "inativo";
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        className="accent-[#4ECDC4]"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    <td className="px-1 py-2.5 text-center">
                      <span className="material-icons text-[14px] text-gray-400">chevron_right</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 uppercase whitespace-nowrap">{item.nome}</td>
                    <td className="px-3 py-2.5 text-gray-700">{item.categoria ?? ""}</td>
                    <td className="px-3 py-2.5">
                      {isInativo ? (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">Inativo</span>
                      ) : isLow ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Estoque Baixo</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Ativo</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{item.fabricante ?? ""}</td>
                    <td className="px-3 py-2.5 text-gray-700 tabular-nums">{item.identificadorUnico ?? ""}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{item.quantidadeMinima ? Number(item.quantidadeMinima).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{item.quantidadeMaxima ? Number(item.quantidadeMaxima).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">{Number(item.quantidade ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeUnidadeExibicao(item.unidade)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">
                      {item.valorUnitario ? `R$ ${Number(item.valorUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => setLocation(`/insumos/historico-produto?id=${item.id}`)}
                          className="p-1 text-gray-500 hover:text-[#4ECDC4]"
                          title="Ver histórico de movimentações"
                        >
                          <span className="material-icons text-[17px]">format_list_bulleted</span>
                        </button>
                        <button
                          onClick={() => setLocation(`/insumos/cadastro?id=${item.id}`)}
                          className="p-1 text-gray-500 hover:text-blue-600"
                          title="Editar"
                        >
                          <span className="material-icons text-[17px]">edit</span>
                        </button>
                        <button
                          onClick={() => { if (confirm("Remover produto?")) deleteMutation.mutate({ id: item.id }); }}
                          className="p-1 text-gray-500 hover:text-red-600"
                          title="Excluir"
                        >
                          <span className="material-icons text-[17px]">delete</span>
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
          <div className="flex items-center gap-2 text-[12px] text-gray-600">
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-[11px] bg-white"
            >
              {[10, 20, 50].map(n => (
                <option key={n} value={n}>{n} itens por página</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-gray-600">
            <span>
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce<(number | "...")[]>((acc, n, i, arr) => {
                  if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("...");
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === "..." ? (
                    <span key={`dots-${i}`} className="px-1 text-gray-400">…</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n as number)}
                      className={`w-7 h-7 flex items-center justify-center rounded border text-[11px] font-medium ${page === n ? "border-[#4ECDC4] text-[#4ECDC4] bg-[#4ECDC4]/10" : "border-gray-300 hover:bg-gray-50"}`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
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
