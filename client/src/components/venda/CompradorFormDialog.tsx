import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CompradorCadastroCampos, CompradorFormAcoes } from "@/components/venda/CompradorCadastroCampos";
import {
  documentoPodeSalvarComprador,
  emptyCompradorForm,
  payloadPessoaCliente,
  type CompradorFormValues,
} from "@/lib/compradoresCadastro";
import { trpc } from "@/lib/trpc";

export type { CompradorFormValues };

function emailValido(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type Props = {
  editId?: number | null;
  initial?: Partial<CompradorFormValues>;
  onClose: () => void;
  onSaved: (id: number) => void;
};

export function CompradorFormPage({ editId, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CompradorFormValues>(emptyCompradorForm);
  const utils = trpc.useUtils();

  useEffect(() => {
    setForm({
      ...emptyCompradorForm(),
      ...initial,
    });
  }, [editId, initial]);

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
    if (!documentoPodeSalvarComprador({
      documento: form.documento,
      documentoOriginal: initial?.documento,
      editando: Boolean(editId),
    })) {
      toast.error("Informe um CPF ou CNPJ válido.");
      return;
    }
    const email = form.email.trim();
    if (email && !emailValido(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    const payload = payloadPessoaCliente(form);
    if (editId) {
      await updateMutation.mutateAsync({ id: editId, ...payload });
      await utils.pessoas.list.invalidate();
      toast.success("Comprador atualizado.");
      onSaved(editId);
      return;
    }
    const created = await createMutation.mutateAsync(payload);
    await utils.pessoas.list.invalidate();
    toast.success("Comprador cadastrado.");
    onSaved(created.id);
  };

  const podeSalvarDocumento = documentoPodeSalvarComprador({
    documento: form.documento,
    documentoOriginal: initial?.documento,
    editando: Boolean(editId),
  });
  const acoes = (
    <CompradorFormAcoes
      isBusy={isBusy}
      saveDisabled={!podeSalvarDocumento}
      onCancel={onClose}
      onSave={() => void salvar()}
    />
  );

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={isBusy}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group disabled:opacity-50"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <div className="space-y-5 pb-10">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {titulo}
            </h1>
          </div>
          <div className="p-5 space-y-4">
            <CompradorCadastroCampos
              form={form}
              documentoOriginal={initial?.documento}
              editando={Boolean(editId)}
              onChange={patch => setForm(f => ({ ...f, ...patch }))}
            />
          </div>
        </div>
        {acoes}
      </div>
    </>
  );
}
