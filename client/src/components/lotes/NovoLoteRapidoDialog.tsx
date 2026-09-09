import { FD_PRIMARY, FormInput, FormLabel } from "@/components/FormFields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const NOME_MAX = 100;

export const NOVO_LOTE_RAPIDO_TITULO = "Novo Lote";
export const NOVO_LOTE_RAPIDO_HINT =
  "Criação rápida para uso no manejo. Detalhes completos podem ser ajustados depois em Rebanho → Lotes.";

function hojeISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type NovoLoteRapidoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: number;
  fazendaNome?: string | null;
  dataCriacao?: string;
  onCreated: (payload: { id: number; nome: string }) => void;
};

export function NovoLoteRapidoDialog({
  open,
  onOpenChange,
  fazendaId,
  fazendaNome,
  dataCriacao,
  onCreated,
}: NovoLoteRapidoDialogProps) {
  const [nome, setNome] = useState("");
  const trpcUtils = trpc.useUtils();

  const fechar = (next: boolean) => {
    if (!next) setNome("");
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) setNome("");
  }, [open]);

  const createMutation = trpc.lotes.create.useMutation({
    onError: err => {
      toast.error(err.message || "Não foi possível criar o lote.");
    },
  });

  const salvar = async () => {
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      toast.error("Informe o nome do lote.");
      return;
    }
    if (nomeTrim.length > NOME_MAX) {
      toast.error(`O nome do lote deve ter no máximo ${NOME_MAX} caracteres.`);
      return;
    }
    if (!fazendaId) {
      toast.error("Fazenda não definida.");
      return;
    }

    const result = await createMutation.mutateAsync({
      nome: nomeTrim,
      fazendaId,
      dataCriacao: dataCriacao?.trim() || hojeISODate(),
    });

    await Promise.all([
      trpcUtils.lotes.list.refetch(),
      trpcUtils.lotes.gerenciamento.invalidate(),
    ]);

    toast.success(`Lote "${nomeTrim}" criado.`);
    onCreated({ id: result.id, nome: nomeTrim });
    fechar(false);
  };

  const pending = createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{NOVO_LOTE_RAPIDO_TITULO}</DialogTitle>
          <DialogDescription className="text-[12px]">
            {fazendaNome ? `${fazendaNome} · ` : ""}
            {NOVO_LOTE_RAPIDO_HINT}
          </DialogDescription>
        </DialogHeader>
        <div className="py-1">
          <FormLabel required>Nome do Lote</FormLabel>
          <FormInput
            variant="light"
            value={nome}
            onChange={setNome}
            placeholder="Ex.: Bezerras descarte"
            maxLength={NOME_MAX}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                void salvar();
              }
            }}
          />
        </div>
        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => fechar(false)}
            disabled={pending}
            className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 min-h-[34px] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={pending || fazendaId <= 0 || !nome.trim()}
            className="px-4 py-1.5 rounded text-[12px] font-semibold text-white min-h-[34px] disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {pending ? "Criando…" : "Criar Lote"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type NovoLoteRapidoTriggerProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

/** Link compacto "+ Novo Lote" abaixo do select de destino. */
export function NovoLoteRapidoTrigger({
  onClick,
  disabled,
  className,
}: NovoLoteRapidoTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        className ??
        "inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 disabled:opacity-40 transition-colors mt-1.5"
      }
    >
      <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
      Novo Lote
    </button>
  );
}
