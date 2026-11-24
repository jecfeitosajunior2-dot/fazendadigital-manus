import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type FazendaDeleteBlocker,
  formatFazendaDeleteBlockersFrase,
} from "@shared/fazendaDeleteBlockers";

export type FazendaDeleteBlockedState = {
  nome: string;
  fazendaId: number;
  blockers: FazendaDeleteBlocker[];
};

type Props = {
  state: FazendaDeleteBlockedState | null;
  onClose: () => void;
};

export default function FazendaDeleteBlockedDialog({ state, onClose }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const vinculos = state ? formatFazendaDeleteBlockersFrase(state.blockers) : "";

  return (
    <AlertDialog open={!!state} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent
        className="max-w-[420px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-gray-900">
            <span className="material-icons text-[22px] text-red-500">warning</span>
            Excluir fazenda
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600">
            A fazenda &quot;{state?.nome ?? "selecionada"}&quot; ainda tem {vinculos || "cadastros vinculados"}.
            Ela não é excluída, e o histórico permanece.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            ref={cancelRef}
            className="rounded-full border-0 bg-gray-100 text-gray-800 shadow-none hover:bg-gray-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2"
            style={{ minHeight: 44 }}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="rounded-full text-white hover:opacity-95 focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2"
            style={{ minHeight: 44, backgroundColor: "#DC2626" }}
          >
            Entendi
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
