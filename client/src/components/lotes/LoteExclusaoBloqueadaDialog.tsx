import { AlertCircle } from "lucide-react";
import { FD_PRIMARY } from "@/components/FormFields";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DeleteBlockedState } from "@/lib/loteExclusaoFlow";
import { LoteExclusaoBloqueadaMessage } from "@/components/lotes/LoteExclusaoBloqueadaMessage";

type Props = {
  state: DeleteBlockedState | null;
  onClose: () => void;
  onGerenciarAnimais: (state: DeleteBlockedState) => void;
};

export function LoteExclusaoBloqueadaDialog({ state, onClose, onGerenciarAnimais }: Props) {
  return (
    <Dialog open={!!state} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <DialogTitle className="text-gray-900">Não é possível excluir o Lote</DialogTitle>
          </div>
          <DialogDescription className="text-gray-600 leading-relaxed">
            {state ? (
              <LoteExclusaoBloqueadaMessage
                nomeLote={state.nomeLote}
                qtdAnimais={state.qtdAnimais}
              />
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => state && onGerenciarAnimais(state)}
            className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Gerenciar animais
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
