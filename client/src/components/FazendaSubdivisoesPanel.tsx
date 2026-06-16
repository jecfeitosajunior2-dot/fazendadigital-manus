import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { TIPOS_DIVISAO, TIPOS_PASTAGEM } from "@/lib/subdivisao-types";
import { SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormLabel, FormInput, FormSelect } from "@/components/FormFields";
import { ImportarCoordenadasModal } from "@/components/ImportarCoordenadasModal";

const FD_PRIMARY = "#4ECDC4";

type Fazenda = {
  id: number;
  nome: string;
  responsavel?: string | null;
};

const emptyForm = () => ({
  tipo: "Invernada",
  nome: "",
  sigla: "",
  area: "",
  capacidade: "",
  tipoPastagem: "",
  incluirArea: true,
});

export function FazendaSubdivisoesPanel({ fazenda }: { fazenda: Fazenda | null }) {
  const utils = trpc.useUtils();
  const fazendaId = fazenda?.id ?? 0;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [importarCoordenadasOpen, setImportarCoordenadasOpen] = useState(false);

  const { data: subdivisoes = [], isLoading } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId },
    { enabled: fazendaId > 0 }
  );

  const invalidate = () => {
    utils.pastos.listByFazenda.invalidate({ fazendaId });
    utils.pastos.list.invalidate();
    utils.pastos.listWithDetails.invalidate();
  };

  const createMutation = trpc.pastos.create.useMutation({
    onSuccess: () => {
      toast.success("Subdivisão cadastrada!");
      invalidate();
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.pastos.update.useMutation({
    onSuccess: () => {
      toast.success("Subdivisão atualizada!");
      invalidate();
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.pastos.delete.useMutation({
    onSuccess: () => { toast.success("Subdivisão excluída!"); invalidate(); },
    onError: e => toast.error(e.message),
  });

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
    setShowForm(false);
  };

  const handleSubmit = () => {
    if (!form.nome.trim()) { toast.error("Nome da subdivisão é obrigatório"); return; }
    if (!form.area.trim()) { toast.error("Área em hectare é obrigatória"); return; }
    const payload = {
      nome: form.nome.trim(),
      sigla: form.sigla.trim() || undefined,
      tipo: form.tipo,
      tipoPastagem: form.tipoPastagem || undefined,
      area: form.area,
      incluirArea: form.incluirArea,
      capacidade: form.capacidade ? parseInt(form.capacidade, 10) : undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate({ fazendaId, ...payload });
    }
  };

  const startEdit = (s: typeof subdivisoes[0]) => {
    setEditId(s.id);
    setForm({
      tipo: s.tipo || "Pasto",
      nome: s.nome,
      sigla: s.sigla || "",
      area: s.area ? String(s.area) : "",
      capacidade: s.capacidade ? String(s.capacidade) : "",
      tipoPastagem: s.tipoPastagem || "",
      incluirArea: s.incluirArea !== false,
    });
    setShowForm(true);
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  if (!fazenda) {
    return (
      <div className="mt-6 bg-white rounded border border-gray-200 p-8 text-center text-gray-400">
        <span className="material-icons text-4xl block mb-2 opacity-30">touch_app</span>
        <p className="text-[12px]">Selecione uma fazenda na lista acima para gerenciar subdivisões</p>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-white rounded border border-gray-200 shadow-sm">
      {/* Cabeçalho — estilo iRancho */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-gray-800">
          Subdivisões da fazenda{" "}
          <span className="font-normal text-gray-600">{fazenda.responsavel || fazenda.nome}</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportarCoordenadasOpen(true)}
            className="px-3 py-1.5 rounded border border-gray-300 bg-white text-[10px] font-semibold uppercase text-gray-700 hover:bg-gray-50"
          >
            Importar Coordenadas
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(v => !v); if (showForm) resetForm(); }}
            className="px-3 py-1.5 rounded text-[10px] font-semibold uppercase text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Nova Subdivisão
          </button>
        </div>
      </div>

      {/* Formulário inline — espelho iRancho */}
      {showForm && (
        <div className="px-4 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <FormLabel required className="text-[10px] font-medium text-gray-600 mb-1">Tipo de Divisão</FormLabel>
              <FormSelect compact value={form.tipo} onChange={v => setForm(f => ({ ...f, tipo: v }))} placeholder="Tipo" required>
                {TIPOS_DIVISAO.map(t => (
                  <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div>
              <FormLabel required className="text-[10px] font-medium text-gray-600 mb-1">Nome da Subdivisão</FormLabel>
              <FormInput
                compact
                required
                value={form.nome}
                onChange={v => setForm(f => ({ ...f, nome: v }))}
                placeholder="Ex. Pasto A"
              />
            </div>
            <div>
              <FormLabel className="text-[10px] font-medium text-gray-600 mb-1">Sigla da Subdivisão</FormLabel>
              <FormInput
                compact
                value={form.sigla}
                onChange={v => setForm(f => ({ ...f, sigla: v }))}
                placeholder="Ex. SSB"
              />
            </div>
            <div>
              <FormLabel required className="text-[10px] font-medium text-gray-600 mb-1">Área em Hectare</FormLabel>
              <FormInput
                compact
                required
                type="number"
                value={form.area}
                onChange={v => setForm(f => ({ ...f, area: v }))}
                placeholder="Ex. 65487"
              />
            </div>
            <div>
              <FormLabel className="text-[10px] font-medium text-gray-600 mb-1">Capacidade (UA)</FormLabel>
              <FormInput
                compact
                type="number"
                value={form.capacidade}
                onChange={v => setForm(f => ({ ...f, capacidade: v }))}
                placeholder="Ex. 50"
              />
            </div>
            <div>
              <FormLabel className="text-[10px] font-medium text-gray-600 mb-1">Tipo de Pastagem</FormLabel>
              <FormSelect
                compact
                value={form.tipoPastagem || "__none__"}
                onChange={v => setForm(f => ({ ...f, tipoPastagem: v === "__none__" ? "" : v }))}
                placeholder="Selecione o tipo de Pastagem"
              >
                <SelectItem value="__none__" className="text-[11px] text-gray-400">Selecione o tipo de Pastagem</SelectItem>
                {TIPOS_PASTAGEM.map(t => (
                  <SelectItem key={t} value={t} className="text-[11px]">{t}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div className="flex items-center gap-3 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.incluirArea}
                  onCheckedChange={v => setForm(f => ({ ...f, incluirArea: !!v }))}
                  className="data-[state=checked]:bg-[#4ECDC4] data-[state=checked]:border-[#4ECDC4]"
                />
                <span className="text-[10px] text-gray-600 flex items-center gap-1">
                  <span className="material-icons text-[14px] text-gray-400">map</span>
                  Incluir Área Subdivisão
                </span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-3 justify-end">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-1.5 rounded border border-gray-200 text-[11px] text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy}
              className="px-4 py-1.5 rounded text-[11px] font-medium text-gray-800 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : editId ? "Salvar" : "Incluir Subdivisão"}
            </button>
          </div>
        </div>
      )}

      {/* Tabela de subdivisões */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Sigla</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Área</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Cap. (UA)</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo de Divisão</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Tipo de Pastagem</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-20">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && subdivisoes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-[12px]">Sem dados</td>
              </tr>
            )}
            {subdivisoes.map(s => (
              <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-800">{s.nome}</td>
                <td className="px-4 py-2.5 text-gray-600">{s.sigla || "-"}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{s.area ?? "-"}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{s.capacidade ?? "-"}</td>
                <td className="px-4 py-2.5 text-gray-600">{s.tipo || "-"}</td>
                <td className="px-4 py-2.5 text-gray-600">{s.tipoPastagem || "-"}</td>
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      title="Editar"
                    >
                      <span className="material-icons text-[15px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm("Excluir esta subdivisão?")) deleteMutation.mutate({ id: s.id }); }}
                      className="p-1 rounded hover:bg-red-50 text-red-400"
                      title="Excluir"
                    >
                      <span className="material-icons text-[15px]">delete</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!s.coordenadas) {
                          toast.info("Esta subdivisão ainda não possui coordenadas importadas");
                          return;
                        }
                        try {
                          const dados = JSON.parse(s.coordenadas);
                          const pts = (dados.coordinates as string)?.split(/\s+/).filter(Boolean).length ?? 0;
                          toast.success(`Coordenadas importadas (${pts} ponto(s))`);
                        } catch {
                          toast.success("Coordenadas importadas");
                        }
                      }}
                      className={`p-1 rounded ${s.coordenadas ? 'hover:bg-green-50 text-[#7CB342]' : 'text-gray-300 cursor-default'}`}
                      title={s.coordenadas ? "Ver coordenadas" : "Sem coordenadas"}
                    >
                      <span className="material-icons text-[15px]">map</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ImportarCoordenadasModal
        open={importarCoordenadasOpen}
        onClose={() => setImportarCoordenadasOpen(false)}
        fazendaId={fazendaId}
        onImportado={invalidate}
      />
    </div>
  );
}

export default FazendaSubdivisoesPanel;
