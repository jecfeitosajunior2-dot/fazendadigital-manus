import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { CompradorFormDialog, type CompradorFormValues } from "@/components/venda/CompradorFormDialog";
import { COMPRA_VENDA_VENDAS_PATH } from "@/lib/compraVendaCompradores";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type CompradorRow = {
  id: number;
  nome: string;
  documento?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  ativo?: boolean | null;
};

export default function VendasCompradoresPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: compradores = [], isLoading } = trpc.pessoas.list.useQuery({ tipo: "cliente" });
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [initial, setInitial] = useState<Partial<CompradorFormValues>>({});

  const deleteMutation = trpc.pessoas.delete.useMutation({
    onSuccess: async () => {
      toast.success("Comprador inativado.");
      await utils.pessoas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const abrirNovo = () => {
    setEditId(null);
    setInitial({});
    setFormOpen(true);
  };

  const abrirEditar = (p: CompradorRow) => {
    setEditId(p.id);
    setInitial({
      nome: p.nome,
      documento: formatCpfCnpj(p.documento ?? ""),
      telefone: formatPhoneBR(p.telefone ?? ""),
      endereco: p.endereco ?? "",
    });
    setFormOpen(true);
  };

  const inativar = async (p: CompradorRow) => {
    const ok = await confirm({
      title: "Inativar comprador?",
      description:
        "Ele deixa de aparecer nas novas vendas. As vendas já registradas continuam com o nome que foi salvo na época.",
      confirmText: "Inativar",
      variant: "warning",
    });
    if (!ok) return;
    deleteMutation.mutate({ id: p.id });
  };

  return (
    <AppLayout>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <button
            type="button"
            onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
            className="mb-1 flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-[#4ECDC4]"
          >
            <span className="material-icons text-[14px]">arrow_back</span>
            Voltar para Vendas
          </button>
          <h1 className="text-[15px] font-medium text-gray-800">Compradores</h1>
        </div>
        <button
          type="button"
          onClick={abrirNovo}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
          style={{ backgroundColor: "#4ECDC4" }}
        >
          <span className="material-icons text-[14px]">add</span>
          Novo comprador
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">Carregando...</p>
        </div>
      ) : compradores.length === 0 ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">groups</span>
          <p className="text-[12px] text-gray-400">Nenhum comprador cadastrado</p>
          <button
            type="button"
            onClick={abrirNovo}
            className="mt-3 text-[12px] font-medium text-[#4ECDC4] hover:underline"
          >
            Cadastrar agora
          </button>
        </div>
      ) : (
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                  Nome / Razão Social
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                  CPF/CNPJ
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                  Telefone
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {compradores.map((p: CompradorRow) => (
                <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-800 font-medium">{p.nome}</td>
                  <td className="px-3 py-2 text-gray-500">{p.documento ? formatCpfCnpj(p.documento) : "—"}</td>
                  <td className="px-3 py-2 text-gray-500">{p.telefone ? formatPhoneBR(p.telefone) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-100 text-green-700">
                      Ativo
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEditar(p)}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400"
                        title="Editar"
                      >
                        <span className="material-icons text-[14px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void inativar(p)}
                        className="p-0.5 rounded hover:bg-amber-50 text-amber-500"
                        title="Inativar"
                      >
                        <span className="material-icons text-[14px]">person_off</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CompradorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editId={editId}
        initial={initial}
        onSaved={() => undefined}
      />
    </AppLayout>
  );
}
