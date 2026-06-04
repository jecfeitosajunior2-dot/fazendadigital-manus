import { useState } from 'react';
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { FormLabel, FieldBox, inputClassCompact } from '@/components/FormFields';
import { formatDateBR } from '@/lib/date-utils';

// Saúde Page
export function SaudePage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ animalId: 0, tipo: "vacinacao" as "vacinacao"|"tratamento"|"exame"|"cirurgia"|"outro", descricao: "", medicamento: "", veterinario: "", custo: "", dataRegistro: new Date().toISOString().split('T')[0], observacoes: "" });

  const { data: registros, isLoading, refetch } = trpc.saude.list.useQuery();
  const createMutation = trpc.saude.create.useMutation({ onSuccess: () => { toast.success("Registro criado!"); setShowForm(false); refetch(); } });
  const deleteMutation = trpc.saude.delete.useMutation({ onSuccess: () => { toast.success("Registro removido!"); refetch(); } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, custo: form.custo || undefined });
  };

  return (
    <AppLayout>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Saúde Animal</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Registros de Saúde"
            filename="saude"
            headers={["Animal", "Tipo", "Data", "Descrição", "Medicamento", "Custo (R$)"]}
            rows={(registros ?? []).map(r => [
              r.animalId,
              r.tipo,
              r.dataRegistro ? formatDateBR(r.dataRegistro) : "",
              r.descricao,
              r.medicamento || "",
              r.custo ? Number(r.custo).toFixed(2) : "",
            ])}
            alignRightFrom={5}
          />
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
            <span className="material-icons text-[14px]">add</span> Novo Registro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-[14px] font-semibold text-gray-800 mb-4">Novo Registro de Saúde</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <FormLabel required>ID do Animal</FormLabel>
                <FieldBox required>
                  <input required type="number" value={form.animalId || ""} onChange={e => setForm(f => ({...f, animalId: Number(e.target.value)}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value as any}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                  <option value="vacinacao">Vacinação</option>
                  <option value="tratamento">Tratamento</option>
                  <option value="exame">Exame</option>
                  <option value="cirurgia">Cirurgia</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <FormLabel required>Data</FormLabel>
                <FieldBox required>
                  <input required type="date" value={form.dataRegistro} onChange={e => setForm(f => ({...f, dataRegistro: e.target.value}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div>
                <FormLabel required>Descrição</FormLabel>
                <FieldBox required>
                  <input required value={form.descricao} onChange={e => setForm(f => ({...f, descricao: e.target.value}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Medicamento</label><input value={form.medicamento} onChange={e => setForm(f => ({...f, medicamento: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Veterinário</label><input value={form.veterinario} onChange={e => setForm(f => ({...f, veterinario: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Custo (R$)</label><input type="number" step="0.01" value={form.custo || ""} onChange={e => setForm(f => ({...f, custo: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Observações</label><textarea value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" rows={2} /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600">Cancelar</button>
                <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards mobile */}
      <div className="lg:hidden space-y-2.5">
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-[13px]">Carregando...</div>
        ) : (registros || []).length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-[13px]">Nenhum registro de saúde.</div>
        ) : (registros || []).map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] capitalize">{r.tipo}</span>
                  <span className="text-[12px] text-gray-400">{r.dataRegistro ? formatDateBR(r.dataRegistro) : '-'}</span>
                </div>
                <p className="text-[14px] font-semibold text-gray-800">Animal #{r.animalId}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">{r.descricao}</p>
                {r.medicamento && <p className="text-[12px] text-gray-400 mt-0.5">Medicamento: {r.medicamento}</p>}
              </div>
              <button onClick={() => { if (confirm('Remover registro?')) deleteMutation.mutate({ id: r.id }); }} className="grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition shrink-0" style={{ minWidth: 40, minHeight: 40 }} aria-label="Remover"><span className="material-icons text-[20px]">delete</span></button>
            </div>
            {r.custo && <div className="mt-2 pt-2 border-t border-gray-100 text-[13px] font-semibold text-gray-700">Custo: R$ {Number(r.custo).toFixed(2)}</div>}
          </div>
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Animal</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Descrição</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Medicamento</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Custo</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Carregando...</td></tr>
            ) : (registros || []).length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Nenhum registro de saúde.</td></tr>
            ) : (registros || []).map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700">#{r.animalId}</td>
                <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] capitalize">{r.tipo}</span></td>
                <td className="px-3 py-2 text-gray-600">{r.dataRegistro ? formatDateBR(r.dataRegistro) : "-"}</td>
                <td className="px-3 py-2 text-gray-700">{r.descricao}</td>
                <td className="px-3 py-2 text-gray-600">{r.medicamento || "-"}</td>
                <td className="px-3 py-2 text-right text-gray-700">{r.custo ? `R$ ${Number(r.custo).toFixed(2)}` : "-"}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => { if (confirm("Remover registro?")) deleteMutation.mutate({ id: r.id }); }} className="text-red-400 hover:text-red-600"><span className="material-icons text-[16px]">delete</span></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// Reproduction Page
export function ReproductionManagementPage() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ femeaId: 0, machoId: 0, tipo: "inseminacao" as "monta_natural"|"inseminacao"|"transferencia_embriao", dataCobertura: new Date().toISOString().split('T')[0], observacoes: "" });

  const { data: registros, isLoading, refetch } = trpc.reproducao.list.useQuery();
  const createMutation = trpc.reproducao.create.useMutation({ onSuccess: () => { toast.success("Registro criado!"); setShowForm(false); refetch(); } });
  const deleteMutation = trpc.reproducao.delete.useMutation({ onSuccess: () => { toast.success("Registro removido!"); refetch(); } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ ...form, machoId: form.machoId || undefined });
  };

  return (
    <AppLayout>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Reprodução</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Registros Reprodutivos"
            filename="reproducao"
            headers={["Fêmea", "Tipo", "Data Cobertura", "Resultado", "Macho"]}
            rows={(registros ?? []).map(r => [
              r.femeaId,
              r.tipo?.replace(/_/g, " ") ?? "",
              r.dataCobertura ? formatDateBR(r.dataCobertura) : "",
              r.resultado || "pendente",
              r.machoId ?? "",
            ])}
          />
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
            <span className="material-icons text-[14px]">add</span> Novo Registro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-[14px] font-semibold text-gray-800 mb-4">Novo Registro Reprodutivo</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <FormLabel required>ID da Fêmea</FormLabel>
                <FieldBox required>
                  <input required type="number" value={form.femeaId || ""} onChange={e => setForm(f => ({...f, femeaId: Number(e.target.value)}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({...f, tipo: e.target.value as any}))} className="w-full border rounded px-2 py-1.5 text-[12px]">
                  <option value="inseminacao">Inseminação</option>
                  <option value="monta_natural">Monta Natural</option>
                  <option value="transferencia_embriao">Transferência de Embrião</option>
                </select>
              </div>
              <div>
                <FormLabel required>Data da Cobertura</FormLabel>
                <FieldBox required>
                  <input required type="date" value={form.dataCobertura} onChange={e => setForm(f => ({...f, dataCobertura: e.target.value}))} className={inputClassCompact} />
                </FieldBox>
              </div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">ID do Macho</label><input type="number" value={form.machoId || ""} onChange={e => setForm(f => ({...f, machoId: Number(e.target.value)}))} className="w-full border rounded px-2 py-1.5 text-[12px]" /></div>
              <div><label className="block text-[11px] font-medium text-gray-600 mb-1">Observações</label><textarea value={form.observacoes} onChange={e => setForm(f => ({...f, observacoes: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-[12px]" rows={2} /></div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-3 py-2 border border-gray-300 rounded text-[12px] text-gray-600">Cancelar</button>
                <button type="submit" className="flex-1 px-3 py-2 rounded text-white text-[12px] font-medium" style={{ backgroundColor: "#2D5A5A" }}>
                  {createMutation.isPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cards mobile */}
      <div className="lg:hidden space-y-2.5">
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-[13px]">Carregando...</div>
        ) : (registros || []).length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 text-[13px]">Nenhum registro reprodutivo.</div>
        ) : (registros || []).map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] capitalize">{r.tipo?.replace(/_/g, ' ')}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${r.resultado === 'prenha' ? 'bg-green-100 text-green-700' : r.resultado === 'vazia' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{r.resultado || 'pendente'}</span>
                </div>
                <p className="text-[14px] font-semibold text-gray-800">Fêmea #{r.femeaId}</p>
                <p className="text-[12px] text-gray-400 mt-0.5">Cobertura: {r.dataCobertura ? formatDateBR(r.dataCobertura) : '-'}</p>
              </div>
              <button onClick={() => { if (confirm('Remover registro?')) deleteMutation.mutate({ id: r.id }); }} className="grid place-items-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 active:scale-95 transition shrink-0" style={{ minWidth: 40, minHeight: 40 }} aria-label="Remover"><span className="material-icons text-[20px]">delete</span></button>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela desktop */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fêmea</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data Cobertura</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Resultado</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Carregando...</td></tr>
            ) : (registros || []).length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Nenhum registro reprodutivo.</td></tr>
            ) : (registros || []).map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-700">#{r.femeaId}</td>
                <td className="px-3 py-2"><span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px] capitalize">{r.tipo?.replace(/_/g, ' ')}</span></td>
                <td className="px-3 py-2 text-gray-600">{r.dataCobertura ? formatDateBR(r.dataCobertura) : "-"}</td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${r.resultado === 'prenha' ? 'bg-green-100 text-green-700' : r.resultado === 'vazia' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.resultado || "pendente"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => { if (confirm("Remover registro?")) deleteMutation.mutate({ id: r.id }); }} className="text-red-400 hover:text-red-600"><span className="material-icons text-[16px]">delete</span></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export default ReproductionManagementPage;
