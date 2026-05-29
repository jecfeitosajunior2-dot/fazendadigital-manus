import { useState } from 'react';
import AppLayout from "@/components/AppLayout";
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export function FinancialManagementPage() {
  const [activeTab, setActiveTab] = useState('movimentacoes');
  const [showContaForm, setShowContaForm] = useState(false);
  const [showMovForm, setShowMovForm] = useState(false);
  const [contaForm, setContaForm] = useState({ nome: "", tipo: "corrente" as "corrente"|"poupanca"|"caixa"|"investimento", banco: "", saldoInicial: "" });
  const [movForm, setMovForm] = useState({ contaId: 0, tipo: "receita", descricao: "", valor: "", data: new Date().toISOString().split('T')[0], categoria: "", observacoes: "" });

  const { data: contas, refetch: refetchContas } = trpc.financeiro.listContas.useQuery();
  const { data: movimentacoes, isLoading: movLoading, refetch: refetchMov } = trpc.financeiro.listMovimentacoes.useQuery();
  const { data: summary } = trpc.financeiro.summary.useQuery();

  const createContaMutation = trpc.financeiro.createConta.useMutation({ onSuccess: () => { toast.success("Conta criada!"); setShowContaForm(false); setContaForm({ nome: "", tipo: "corrente" as "corrente"|"poupanca"|"caixa"|"investimento", banco: "", saldoInicial: "" }); refetchContas(); } });
  
  const createMovMutation = trpc.financeiro.createMovimentacao.useMutation({ onSuccess: () => { toast.success("Movimentação registrada!"); setShowMovForm(false); setMovForm({ contaId: 0, tipo: "receita", descricao: "", valor: "", data: new Date().toISOString().split('T')[0], categoria: "", observacoes: "" }); refetchMov(); } });
  const deleteMovMutation = trpc.financeiro.deleteMovimentacao.useMutation({ onSuccess: () => { toast.success("Movimentação removida!"); refetchMov(); } });

  return (
    <AppLayout>
      <div className="mb-3">
        <h1 className="text-[15px] font-medium text-gray-800">Financeiro</h1>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Total Receitas</p>
            <p className="text-[18px] font-bold text-green-600">R$ {Number(summary.totalReceitas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Total Despesas</p>
            <p className="text-[18px] font-bold text-red-600">R$ {Number(summary.totalDespesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Saldo</p>
            <p className={`text-[18px] font-bold ${Number(summary.saldoTotal || 0) >= 0 ? 'text-[#2D5A5A]' : 'text-red-600'}`}>R$ {Number(summary.saldoTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {[
          { id: 'movimentacoes', label: 'Movimentações' },
          { id: 'contas', label: 'Contas' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-[#2D5A5A] text-[#2D5A5A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Movimentações Tab */}
      {activeTab === 'movimentacoes' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-gray-700">Movimentações</h2>
            <button onClick={() => setShowMovForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
              <span className="material-icons text-[14px]">add</span> Nova Movimentação
            </button>
          </div>

          {showMovForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                <h2 className="text-[14px] font-semibold text-gray-800 mb-4">Nova Movimentação</h2>
                <form onSubmit={e => { e.preventDefault(); createMovMutation.mutate({ contaId: movForm.contaId, tipo: movForm.tipo as "receita"|"despesa", descricao: movForm.descricao, valor: movForm.valor, data: movForm.data, observacoes: movForm.observacoes || undefined }); }} className="space-y-3">
                  <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo *</label>
                    <select required value={movForm.tipo} onChange={e => setMovForm(f => ({...f, tipo: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </div>
                  <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Descrição *</label><input required value={movForm.descricao} onChange={e => setMovForm(f => ({...f, descricao: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Valor (R$) *</label><input type="number" step="0.01" required value={movForm.valor || ""} onChange={e => setMovForm(f => ({...f, valor: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                    <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Data *</label><input type="date" required value={movForm.data} onChange={e => setMovForm(f => ({...f, data: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                  </div>
                  <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Categoria</label><input value={movForm.categoria} onChange={e => setMovForm(f => ({...f, categoria: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" placeholder="Ex: Venda de gado, Medicamentos..." /></div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setShowMovForm(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600 hover:bg-gray-50">Cancelar</button>
                    <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                      {createMovMutation.isPending ? "Salvando..." : "Salvar"}
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
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Descrição</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Categoria</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Valor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {movLoading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Carregando...</td></tr>
                  ) : (movimentacoes || []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhuma movimentação registrada.</td></tr>
                  ) : (movimentacoes || []).map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${m.tipo === 'receita' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{m.tipo}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{m.descricao}</td>
                      <td className="px-3 py-2 text-gray-500">{m.categoriaId || "-"}</td>
                      <td className="px-3 py-2">{m.data ? new Date(m.data).toLocaleDateString('pt-BR') : "-"}</td>
                      <td className={`px-3 py-2 font-medium ${m.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                        {m.tipo === 'receita' ? '+' : '-'} R$ {Number(m.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => { if (confirm("Remover movimentação?")) deleteMovMutation.mutate({ id: m.id }); }} className="p-1 text-gray-400 hover:text-red-600">
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
      )}

      {/* Contas Tab */}
      {activeTab === 'contas' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-gray-700">Contas Financeiras</h2>
            <button onClick={() => setShowContaForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
              <span className="material-icons text-[14px]">add</span> Nova Conta
            </button>
          </div>

          {showContaForm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                <h2 className="text-[14px] font-semibold text-gray-800 mb-4">Nova Conta</h2>
                <form onSubmit={e => { e.preventDefault(); createContaMutation.mutate(contaForm); }} className="space-y-3">
                  <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Nome *</label><input required value={contaForm.nome} onChange={e => setContaForm(f => ({...f, nome: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                  <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo</label>
                    <select value={contaForm.tipo} onChange={e => setContaForm(f => ({...f, tipo: e.target.value as "corrente"|"poupanca"|"caixa"|"investimento"}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                      <option value="">Selecione</option>
                      <option value="corrente">Conta Corrente</option>
                      <option value="poupanca">Poupança</option>
                      <option value="caixa">Caixa</option>
                      <option value="investimento">Investimento</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Banco</label><input value={contaForm.banco} onChange={e => setContaForm(f => ({...f, banco: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                    <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Saldo Inicial (R$)</label><input type="number" step="0.01" value={contaForm.saldoInicial || ""} onChange={e => setContaForm(f => ({...f, saldoInicial: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => setShowContaForm(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600 hover:bg-gray-50">Cancelar</button>
                    <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                      {createContaMutation.isPending ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(contas || []).length === 0 ? (
              <div className="col-span-3 bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
                <span className="material-icons text-[48px] mb-2 block">account_balance</span>
                <p>Nenhuma conta cadastrada.</p>
              </div>
            ) : (contas || []).map((c) => (
              <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-[13px] font-semibold text-gray-800">{c.nome}</h3>
                    <p className="text-[11px] text-gray-500">{c.banco || c.tipo || "-"}</p>
                  </div>
                  <span className="material-icons text-[24px] text-[#2D5A5A]/30">account_balance</span>
                </div>
                <p className="text-[16px] font-bold text-[#2D5A5A]">R$ {Number(c.saldoInicial || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <button onClick={() => { toast.info("Para remover contas, use o banco de dados diretamente"); }} className="mt-3 flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700">
                  <span className="material-icons text-[14px]">delete</span> Remover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default FinancialManagementPage;
