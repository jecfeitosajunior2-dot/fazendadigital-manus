import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormInput, FormLabel } from "@/components/FormFields";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

export type CompradorFormValues = {
  nome: string;
  documento: string;
  telefone: string;
  endereco: string;
};

const emptyForm = (): CompradorFormValues => ({
  nome: "",
  documento: "",
  telefone: "",
  endereco: "",
});

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
      telefone: initial?.telefone ?? "",
      endereco: initial?.endereco ?? "",
    });
  }, [open, initial?.nome, initial?.documento, initial?.telefone, initial?.endereco]);

  const createMutation = trpc.pessoas.create.useMutation({
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.pessoas.update.useMutation({
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Informe o nome / razão social.");
      return;
    }
    const payload = {
      nome,
      tipo: "cliente" as const,
      documento: form.documento.trim() || undefined,
      telefone: form.telefone.trim() || undefined,
      endereco: form.endereco.trim() || undefined,
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
      <DialogContent className="max-w-md gap-5">
        <DialogHeader className="pb-0">
          <DialogTitle>{editId ? "Editar comprador" : "Novo comprador"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <FormLabel required>Nome / Razão Social</FormLabel>
            <FormInput
              required
              variant="light"
              value={form.nome}
              onChange={v => setForm(f => ({ ...f, nome: v }))}
              placeholder="Nome ou razão social"
            />
          </div>
          <div>
            <FormLabel>CPF/CNPJ</FormLabel>
            <FormInput
              variant="light"
              value={form.documento}
              onChange={v => setForm(f => ({ ...f, documento: formatCpfCnpj(v) }))}
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
            <FormLabel>Endereço</FormLabel>
            <FormInput
              variant="light"
              value={form.endereco}
              onChange={v => setForm(f => ({ ...f, endereco: v }))}
              placeholder="Opcional"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void salvar()}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              style={{ backgroundColor: "#4ECDC4" }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
