import { useState, useMemo } from 'react';
import AppLayout from "@/components/AppLayout";
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { FormLabel, FieldBox, inputClassCompact } from '@/components/FormFields';

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
  const totalPages = Math.max(1, Math.ceil(animais.length / perPage));
  const paginated = animais.slice((page - 1) * perPage, page * perPage);

  const handleExportCSV = () => {
    const headers = ["ID", "Brinco", "Nome", "Sexo", "Raça", "Status", "Peso Atual"];
    const rows = animais.map(a => [a.id, a.brinco || "", a.nome || "", a.sexo, a.raca || "", a.status, a.pesoAtual || ""]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `animais_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success("Lista exportada com sucesso!");
  };

  return (
    <AppLayout>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de animais</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleExportCSV} className="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 text-[11px]" title="Planilha">
            <span className="material-icons text-[16px]">grid_on</span>
            <span className="hidden md:inline">Planilha</span>
          </button>
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
            <span className="text-[11px] text-gray-500">{animais.length} animais</span>
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

// --- Estoque Page ---
export function EstoquePage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ nome: "", categoria: "", unidade: "", quantidade: "", quantidadeMinima: "", valorUnitario: "", localizacao: "", observacoes: "" });

  const { data: items, isLoading, refetch } = trpc.estoque.list.useQuery();
  const createMutation = trpc.estoque.create.useMutation({ onSuccess: () => { toast.success("Item criado!"); setShowForm(false); resetForm(); refetch(); } });
  const updateMutation = trpc.estoque.update.useMutation({ onSuccess: () => { toast.success("Item atualizado!"); setShowForm(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.estoque.delete.useMutation({ onSuccess: () => { toast.success("Item removido!"); refetch(); } });

  const resetForm = () => { setForm({ nome: "", categoria: "", unidade: "", quantidade: "", quantidadeMinima: "", valorUnitario: "", localizacao: "", observacoes: "" }); setEditItem(null); };

  const filtered = useMemo(() => (items || []).filter(i => !search || i.nome.toLowerCase().includes(search.toLowerCase())), [items, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Estoque</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
          <span className="material-icons text-[14px]">add</span> Novo Item
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-[14px] font-semibold text-gray-800 mb-4">{editItem ? "Editar Item" : "Novo Item de Estoque"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <FormLabel required>Nome</FormLabel>
                <FieldBox required>
                  <input required value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Categoria</label><input value={form.categoria} onChange={e => setForm(f => ({...f, categoria: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Unidade</label><input value={form.unidade} onChange={e => setForm(f => ({...f, unidade: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Quantidade</label><input type="number" step="0.01" value={form.quantidade} onChange={e => setForm(f => ({...f, quantidade: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Qtd. Mínima</label><input type="number" step="0.01" value={form.quantidadeMinima} onChange={e => setForm(f => ({...f, quantidadeMinima: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Valor Unitário (R$)</label><input type="number" step="0.01" value={form.valorUnitario} onChange={e => setForm(f => ({...f, valorUnitario: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Localização</label><input value={form.localizacao} onChange={e => setForm(f => ({...f, localizacao: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                  {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="mb-3">
        <input type="text" placeholder="Buscar item..." value={search} onChange={e => setSearch(e.target.value)} className="border border-gray-300 rounded px-3 py-1.5 text-[12px] w-full sm:w-64" />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Nome</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Categoria</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Quantidade</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Unidade</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Valor Unit.</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum item no estoque.</td></tr>
              ) : filtered.map((item) => {
                const isLow = item.quantidadeMinima && Number(item.quantidade) <= Number(item.quantidadeMinima);
                return (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{item.nome}</td>
                    <td className="px-3 py-2 text-gray-500">{item.categoria || "-"}</td>
                    <td className="px-3 py-2">{Number(item.quantidade).toFixed(2)}</td>
                    <td className="px-3 py-2">{item.unidade || "-"}</td>
                    <td className="px-3 py-2">{item.valorUnitario ? `R$ ${Number(item.valorUnitario).toFixed(2)}` : "-"}</td>
                    <td className="px-3 py-2">
                      {isLow ? <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px]">Estoque Baixo</span> : <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">OK</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditItem(item); setForm({ nome: item.nome, categoria: item.categoria || "", unidade: item.unidade || "", quantidade: item.quantidade?.toString() || "", quantidadeMinima: item.quantidadeMinima?.toString() || "", valorUnitario: item.valorUnitario?.toString() || "", localizacao: item.localizacao || "", observacoes: item.observacoes || "" }); setShowForm(true); }} className="p-1 text-gray-400 hover:text-blue-600">
                          <span className="material-icons text-[16px]">edit</span>
                        </button>
                        <button onClick={() => { if (confirm("Remover item?")) deleteMutation.mutate({ id: item.id }); }} className="p-1 text-gray-400 hover:text-red-600">
                          <span className="material-icons text-[16px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
