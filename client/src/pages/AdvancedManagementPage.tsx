import { useState } from 'react';
import AppLayout from "@/components/AppLayout";
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';

// Maquinas sub-page
function MaquinasPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", tipo: "", marca: "", modelo: "", ano: 0, placa: "", horimetro: "", status: "ativo" as "ativo"|"manutencao"|"inativo", observacoes: "" });

  const { data: maquinas, isLoading, refetch } = trpc.maquinas.list.useQuery();
  const createMutation = trpc.maquinas.create.useMutation({ onSuccess: () => { toast.success("Máquina cadastrada!"); setShowForm(false); resetForm(); refetch(); } });
  const updateMutation = trpc.maquinas.update.useMutation({ onSuccess: () => { toast.success("Máquina atualizada!"); setShowForm(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.maquinas.delete.useMutation({ onSuccess: () => { toast.success("Máquina removida!"); refetch(); } });

  const resetForm = () => { setForm({ nome: "", tipo: "", marca: "", modelo: "", ano: 0, placa: "", horimetro: "", status: "ativo" as "ativo"|"manutencao"|"inativo", observacoes: "" }); setEditItem(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-gray-700">Máquinas e Equipamentos</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
          <span className="material-icons text-[14px]">add</span> Nova Máquina
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-[14px] font-semibold text-gray-800 mb-4">{editItem ? "Editar Máquina" : "Nova Máquina"}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Nome *</label><input required value={form.nome} onChange={e => setForm(f => ({...f, nome: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                    <option value="">Selecione</option>
                    <option value="trator">Trator</option>
                    <option value="colheitadeira">Colheitadeira</option>
                    <option value="caminhao">Caminhão</option>
                    <option value="veiculo">Veículo</option>
                    <option value="implemento">Implemento</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value as "ativo"|"manutencao"|"inativo"}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                    <option value="ativo">Ativo</option>
                    <option value="manutencao">Em Manutenção</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Marca</label><input value={form.marca} onChange={e => setForm(f => ({...f, marca: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Modelo</label><input value={form.modelo} onChange={e => setForm(f => ({...f, modelo: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Ano</label><input type="number" value={form.ano || ""} onChange={e => setForm(f => ({...f, ano: Number(e.target.value)}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Placa</label><input value={form.placa} onChange={e => setForm(f => ({...f, placa: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Horímetro/Km</label><input type="number" value={form.horimetro || ""} onChange={e => setForm(f => ({...f, horimetro: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {isLoading ? (
          <div className="col-span-3 text-center py-8 text-gray-400">Carregando...</div>
        ) : (maquinas || []).length === 0 ? (
          <div className="col-span-3 bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
            <span className="material-icons text-[48px] mb-2 block">agriculture</span>
            <p>Nenhuma máquina cadastrada.</p>
          </div>
        ) : (maquinas || []).map((m) => (
          <div key={m.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-[13px] font-semibold text-gray-800">{m.nome}</h3>
                <p className="text-[11px] text-gray-500">{m.marca} {m.modelo} {m.ano ? `(${m.ano})` : ""}</p>
              </div>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.status === 'ativo' ? 'bg-green-100 text-green-700' : m.status === 'manutencao' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{m.status}</span>
            </div>
            {m.placa && <p className="text-[11px] text-gray-600">Placa: <strong>{m.placa}</strong></p>}
            {m.horimetro && <p className="text-[11px] text-gray-600">Horímetro: <strong>{m.horimetro}</strong></p>}
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <button onClick={() => { setEditItem(m); setForm({ nome: m.nome, tipo: m.tipo || "", marca: m.marca || "", modelo: m.modelo || "", ano: m.ano || 0, placa: m.placa || "", horimetro: m.horimetro || "", status: m.status || "ativo", observacoes: m.observacoes || "" }); setShowForm(true); }} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-gray-50">
                <span className="material-icons text-[14px]">edit</span> Editar
              </button>
              <button onClick={() => { if (confirm("Remover máquina?")) deleteMutation.mutate({ id: m.id }); }} className="flex items-center justify-center gap-1 px-2 py-1 border border-red-100 rounded text-[11px] text-red-500 hover:bg-red-50">
                <span className="material-icons text-[14px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Abastecimentos sub-page
function AbastecimentosPage() {
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ maquinaId: 0, data: new Date().toISOString().split('T')[0], combustivel: "", litros: "", valorLitro: "", horimetro: "", responsavel: "", observacoes: "" });

  const { data: registros, isLoading, refetch } = trpc.abastecimentos.list.useQuery({});
  const createMutation = trpc.abastecimentos.create.useMutation({ onSuccess: () => { toast.success("Abastecimento registrado!"); setShowForm(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.abastecimentos.delete.useMutation({ onSuccess: () => { toast.success("Registro removido!"); refetch(); } });

  const resetForm = () => { setForm({ maquinaId: 0, data: new Date().toISOString().split('T')[0], combustivel: "", litros: "", valorLitro: "", horimetro: "", responsavel: "", observacoes: "" }); setEditItem(null); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ maquinaId: form.maquinaId, data: form.data, litros: form.litros, combustivel: form.combustivel as "diesel"|"gasolina"|"etanol"|"arla", valorLitro: form.valorLitro || undefined, horimetro: form.horimetro || undefined, responsavel: form.responsavel || undefined, observacoes: form.observacoes || undefined });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-gray-700">Abastecimentos</h2>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
          <span className="material-icons text-[14px]">add</span> Registrar
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-[14px] font-semibold text-gray-800 mb-4">Novo Abastecimento</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">ID da Máquina *</label><input type="number" required value={form.maquinaId || ""} onChange={e => setForm(f => ({...f, maquinaId: Number(e.target.value)}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Data *</label><input type="date" required value={form.data} onChange={e => setForm(f => ({...f, data: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Combustível</label>
                  <select value={form.combustivel} onChange={e => setForm(f => ({...f, combustivel: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                    <option value="">Selecione</option>
                    <option value="diesel">Diesel</option>
                    <option value="gasolina">Gasolina</option>
                    <option value="etanol">Etanol</option>
                  </select>
                </div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Litros</label><input type="number" step="0.01" value={form.litros || ""} onChange={e => setForm(f => ({...f, litros: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Valor/Litro (R$)</label><input type="number" step="0.01" value={form.valorLitro || ""} onChange={e => setForm(f => ({...f, valorLitro: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Horímetro</label><input type="number" value={form.horimetro || ""} onChange={e => setForm(f => ({...f, horimetro: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Operador</label><input value={form.responsavel} onChange={e => setForm(f => ({...f, responsavel: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600">Máquina ID</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Combustível</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Litros</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Total</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : (registros || []).length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum abastecimento registrado.</td></tr>
              ) : (registros || []).map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium text-[#2D5A5A]">#{r.maquinaId}</td>
                  <td className="px-3 py-2">{r.data ? new Date(r.data).toLocaleDateString('pt-BR') : "-"}</td>
                  <td className="px-3 py-2 capitalize">{r.combustivel || "-"}</td>
                  <td className="px-3 py-2">{Number(r.litros || 0).toFixed(2)} L</td>
                  <td className="px-3 py-2">{r.litros && r.valorLitro ? `R$ ${(Number(r.litros) * Number(r.valorLitro)).toFixed(2)}` : "-"}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => { if (confirm("Remover registro?")) deleteMutation.mutate({ id: r.id }); }} className="p-1 text-gray-400 hover:text-red-600">
                      <span className="material-icons text-[16px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Main AdvancedManagementPage
export function AdvancedManagementPage() {
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (location.includes('abastecimento')) return 'abastecimento';
    if (location.includes('manutencao')) return 'manutencao';
    return 'maquinas';
  });

  return (
    <AppLayout>
      <div className="mb-3">
        <h1 className="text-[15px] font-medium text-gray-800">Máquinas e Manejos</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { id: 'maquinas', label: 'Máquinas', icon: 'agriculture' },
          { id: 'abastecimento', label: 'Abastecimento', icon: 'local_gas_station' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-[#2D5A5A] text-[#2D5A5A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            <span className="material-icons text-[16px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'maquinas' && <MaquinasPage />}
      {activeTab === 'abastecimento' && <AbastecimentosPage />}
    </AppLayout>
  );
}

export default AdvancedManagementPage;
