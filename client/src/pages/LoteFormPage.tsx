/**
 * Formulário de Lote — padrão iRancho (Novo / Editar)
 * Rotas: /rebanho/novo-lote | /rebanho/editar-lote?id=X
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FormLabel, FormInput, FormDatePicker } from "@/components/FormFields";

const IRANCHO_BTN_GREEN = "#C5D97E";

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

function LoteFormPage({ mode }: { mode: "create" | "edit" }) {
  const [, setLocation] = useLocation();
  const isEdit = mode === "edit";
  const loteId = isEdit ? Number(new URLSearchParams(window.location.search).get("id")) : 0;

  const [form, setForm] = useState<FormState>(INITIAL);

  const utils = trpc.useUtils();
  const { data: lote, isLoading } = trpc.lotes.getById.useQuery(
    { id: loteId },
    { enabled: isEdit && loteId > 0 },
  );

  const createMutation = trpc.lotes.create.useMutation({
    onSuccess: () => {
      toast.success("Lote criado com sucesso!");
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation("/rebanho/lotes");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.lotes.update.useMutation({
    onSuccess: () => {
      toast.success("Lote atualizado com sucesso!");
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation("/rebanho/lotes");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!isEdit || !lote) return;
    const dataCriacao = lote.dataCriacao
      || (lote.createdAt ? String(lote.createdAt).slice(0, 10) : hojeISO());
    setForm({
      nome: lote.nome || "",
      sigla: lote.sigla || "",
      dataCriacao,
    });
  }, [isEdit, lote]);

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

    const payload = {
      nome: form.nome.trim(),
      sigla: form.sigla.trim() || undefined,
      dataCriacao: form.dataCriacao,
    };

    if (isEdit && loteId > 0) {
      updateMutation.mutate({ id: loteId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-gray-400 text-[13px]">Carregando...</div>
      </AppLayout>
    );
  }

  if (isEdit && !isLoading && !lote) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-gray-400 text-[13px]">Lote não encontrado.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto">
        {/* Card — espelho iRancho */}
        <div className="bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h1 className="text-[15px] font-semibold text-gray-900">
              {isEdit ? "Editar lote" : "Novo lote"}
            </h1>
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
              onClick={() => setLocation("/rebanho/lotes")}
              disabled={isBusy}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isBusy}
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
              style={{ backgroundColor: IRANCHO_BTN_GREEN }}
            >
              {isBusy ? "Salvando..." : isEdit ? "Salvar Lote" : "Criar Lote"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export function NewLotePage() {
  return <LoteFormPage mode="create" />;
}

export function EditLotePage() {
  return <LoteFormPage mode="edit" />;
}

export default LoteFormPage;
