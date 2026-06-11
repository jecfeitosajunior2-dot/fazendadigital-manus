/**
 * Formulário de Novo Lote — padrão iRancho
 * Rota: /rebanho/novo-lote
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FormLabel, FormInput, FormDatePicker } from "@/components/FormFields";

const IRANCHO_BTN_GREEN = "#2D5A5A";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  nome: string;
  sigla: string;
  dataCriacao: string;
};

const INITIAL: FormState = {
  nome: "",
  sigla: "",
  dataCriacao: hojeISO(),
};

function lotesListUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/lotes?fazendaId=${fazendaId}` : "/rebanho/lotes";
}

export function NewLotePage() {
  const [, setLocation] = useLocation();
  const fazendaId = new URLSearchParams(window.location.search).get("fazendaId") || "";
  const [form, setForm] = useState<FormState>(INITIAL);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaSelecionada = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId),
    [fazendas, fazendaId],
  );

  const utils = trpc.useUtils();
  const createMutation = trpc.lotes.create.useMutation({
    onSuccess: () => {
      toast.success("Lote criado com sucesso!");
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation(lotesListUrl(fazendaId));
    },
    onError: e => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    if (!form.nome.trim()) {
      toast.error("Nome do lote é obrigatório");
      return;
    }
    if (!form.dataCriacao) {
      toast.error("Data de criação é obrigatória");
      return;
    }

    createMutation.mutate({
      nome: form.nome.trim(),
      sigla: form.sigla.trim() || undefined,
      dataCriacao: form.dataCriacao,
      fazendaId: fazendaId ? Number(fazendaId) : undefined,
    });
  };

  const isBusy = createMutation.isPending;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-[15px] font-semibold text-gray-900">Novo lote</h1>
            {fazendaSelecionada && (
              <p className="text-[11px] text-gray-500 mt-1">
                Fazenda: <span className="font-medium text-gray-700">{fazendaSelecionada.nome}</span>
              </p>
            )}
          </div>

          <div className="px-6 py-5 space-y-4">
            <div>
              <FormLabel required>Nome do Lote</FormLabel>
              <FormInput
                value={form.nome}
                onChange={v => set("nome", v)}
                placeholder="Ex. Lote de prenhas"
                required
              />
            </div>

            <div>
              <FormLabel>Sigla do Lote</FormLabel>
              <FormInput
                value={form.sigla}
                onChange={v => set("sigla", v)}
                placeholder="Ex. LdP1"
              />
            </div>

            <div>
              <FormLabel required>Data de Criação</FormLabel>
              <FormDatePicker
                value={form.dataCriacao}
                onChange={v => set("dataCriacao", v)}
                required
              />
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setLocation(lotesListUrl(fazendaId))}
              disabled={isBusy}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50 transition"
              style={{ backgroundColor: IRANCHO_BTN_GREEN }}
            >
              {isBusy ? "Salvando..." : "Criar Lote"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default NewLotePage;
