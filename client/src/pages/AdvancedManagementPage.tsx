import { useState } from 'react';
import AppLayout from "@/components/AppLayout";
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { FormLabel, FieldBox, inputClassCompact } from '@/components/FormFields';
import { useLocation } from 'wouter';

// Maquinas sub-page
function MaquinasPage() {
  const [, setLocation] = useLocation();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-medium text-gray-700">Máquinas e Equipamentos</h2>
        <button
          type="button"
          onClick={() => setLocation("/maquinas/cadastro")}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium"
          style={{ backgroundColor: "#2D5A5A" }}
        >
          <span className="material-icons text-[14px]">add</span> Nova Máquina
        </button>
      </div>
      <p className="text-[12px] text-gray-500">
        Use o{" "}
        <button type="button" onClick={() => setLocation("/maquinas/lista-maquinas")} className="text-[#4ECDC4] underline">
          cadastro de maquinário
        </button>{" "}
        para gerenciar máquinas e equipamentos.
      </p>
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
              <div>
                <FormLabel required>ID da Máquina</FormLabel>
                <FieldBox required>
                  <input type="number" required value={form.maquinaId || ""} onChange={e => setForm(f => ({...f, maquinaId: Number(e.target.value)}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div>
                <FormLabel required>Data</FormLabel>
                <FieldBox required>
                  <input type="date" required value={form.data} onChange={e => setForm(f => ({...f, data: e.target.value}))} className={inputClassCompact} />
                </FieldBox>
              </div>
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
