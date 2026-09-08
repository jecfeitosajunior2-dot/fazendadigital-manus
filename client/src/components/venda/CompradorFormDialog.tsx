import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FD_PRIMARY, FormInput, FormLabel, FormTextarea } from "@/components/FormFields";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export type CompradorFormValues = {
  nome: string;
  documento: string;
  endereco: string;
  telefone: string;
  email: string;
  observacoes: string;
};

const emptyForm = (): CompradorFormValues => ({
  nome: "",
  documento: "",
  endereco: "",
  telefone: "",
  email: "",
  observacoes: "",
});

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editId?: number | null;
  initial?: Partial<CompradorFormValues>;
  onSaved: (id: number) => void;
};

export function CompradorFormDialog({
  open,
  onOpenChange,
  editId,
  initial,
  onSaved,
}: Props) {
  const [form, setForm] = useState<CompradorFormValues>(emptyForm);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm(),
      nome: initial?.nome ?? "",
      documento: initial?.documento ?? "",
      endereco: initial?.endereco ?? "",
      telefone: initial?.telefone ?? "",
      email: initial?.email ?? "",
      observacoes: initial?.observacoes ?? "",
    });
  }, [
    open,
    initial?.nome,
    initial?.documento,
    initial?.endereco,
    initial?.telefone,
    initial?.email,
    initial?.observacoes,
  ]);

  const createMutation = trpc.pessoas.create.useMutation({
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.pessoas.update.useMutation({
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const titulo = editId ? "Editar Comprador" : "Novo Comprador";

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Informe o nome / razão social.");
      return;
    }
    const documento = form.documento.trim();
    if (!documento) {
      toast.error("Informe o CPF/CNPJ.");
      return;
    }
    const documentoDigitos = documento.replace(/\D/g, "");
    if (documentoDigitos.length !== 11 && documentoDigitos.length !== 14) {
      toast.error("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) completo.");
      return;
    }
    const email = form.email.trim();
    if (email && !emailValido(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    const payload = {
      nome,
      tipo: "cliente" as const,
      documento,
      endereco: form.endereco.trim() || undefined,
      telefone: form.telefone.trim() || undefined,
      email: email || undefined,
      observacoes: form.observacoes.trim() || undefined,
    };
    if (editId) {
      await updateMutation.mutateAsync({ id: editId, ...payload });
      await utils.pessoas.list.invalidate();
      toast.success("Comprador atualizado.");
      onSaved(editId);
      onOpenChange(false);
      return;
    }
    const created = await createMutation.mutateAsync(payload);
    await utils.pessoas.list.invalidate();
    toast.success("Comprador cadastrado.");
    onSaved(created.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden border border-gray-200 shadow-none sm:max-w-md">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0 pr-8"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {titulo}
          </h1>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <FormLabel required>Nome / Razão social</FormLabel>
            <FormInput
              required
              variant="light"
              value={form.nome}
              onChange={v => setForm(f => ({ ...f, nome: v }))}
              placeholder="Nome ou razão social"
            />
          </div>
          <div>
            <FormLabel required>CPF/CNPJ</FormLabel>
            <FormInput
              required
              variant="light"
              value={form.documento}
              onChange={v => setForm(f => ({ ...f, documento: formatCpfCnpj(v) }))}
              placeholder={
                form.documento.replace(/\D/g, "").length > 11
                  ? "00.000.000/0000-00"
                  : "000.000.000-00"
              }
            />
          </div>
          <div>
            <FormLabel>Endereço</FormLabel>
            <FormInput
              variant="light"
              value={form.endereco}
              onChange={v => setForm(f => ({ ...f, endereco: v }))}
              placeholder="Opcional"
            />
          </div>
          <div>
            <FormLabel>Telefone</FormLabel>
            <FormInput
              variant="light"
              value={form.telefone}
              onChange={v => setForm(f => ({ ...f, telefone: formatPhoneBR(v) }))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </div>
          <div>
            <FormLabel>E-mail</FormLabel>
            <FormInput
              variant="light"
              value={form.email}
              onChange={v => setForm(f => ({ ...f, email: v }))}
            />
          </div>
          <div>
            <FormLabel>Observações</FormLabel>
            <FormTextarea
              variant="light"
              value={form.observacoes}
              onChange={v => setForm(f => ({ ...f, observacoes: v }))}
              rows={2}
              placeholder="Informações complementares"
            />
          </div>
          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isBusy}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void salvar()}
              className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
