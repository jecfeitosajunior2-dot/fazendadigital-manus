import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/ConfirmDialog";
import type { FazendaDeleteBlockedState } from "@/components/FazendaDeleteBlockedDialog";

type FazendaRef = { id: number; nome?: string | null };

export function useDeleteFazenda(options?: { onSuccess?: () => void }) {
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const [deleteBlocked, setDeleteBlocked] = useState<FazendaDeleteBlockedState | null>(null);

  const deleteMutation = trpc.fazendas.delete.useMutation({
    onSuccess: () => {
      utils.fazendas.list.invalidate();
      toast.success("Fazenda excluída!");
      options?.onSuccess?.();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleDeleteFazenda = async (fazenda: FazendaRef) => {
    try {
      const check = await utils.fazendas.deleteCheck.fetch({ id: fazenda.id });
      if (!check.canDelete) {
        setDeleteBlocked({
          nome: check.nome,
          fazendaId: fazenda.id,
          blockers: check.blockers,
        });
        return;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível verificar a exclusão.");
      return;
    }

    const ok = await confirm({
      title: "Excluir fazenda",
      description: `Tem certeza que deseja excluir a fazenda "${fazenda.nome ?? "selecionada"}"? Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id: fazenda.id });
  };

  return {
    handleDeleteFazenda,
    deleteMutation,
    deleteBlocked,
    setDeleteBlocked,
  };
}
