import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type FazendaDeleteBlocker,
  fazendaDeleteBlockerHref,
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

const BLOCKER_ACTION_LABELS: Record<FazendaDeleteBlocker["key"], string> = {
  subdivisoes: "Ver subdivisões",
  animais: "Ver animais",
  lotes: "Ver lotes",
  maquinas: "Ver máquinas",
  benfeitorias: "Ver benfeitorias",
  estoque: "Ver estoque",
};

export default function FazendaDeleteBlockedDialog({ state, onClose }: Props) {
  const [, setLocation] = useLocation();

  return (
    <Dialog open={!!state} onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <DialogTitle className="text-gray-900">Não é possível excluir</DialogTitle>
          </div>
          <DialogDescription className="text-gray-600 leading-relaxed">
            A fazenda{" "}
            <span className="font-semibold text-gray-900">&quot;{state?.nome ?? "—"}&quot;</span>{" "}
            ainda possui cadastros vinculados. Resolva os itens abaixo antes de excluir:
          </DialogDescription>
        </DialogHeader>

        {state && (
          <ul className="space-y-2 my-1">
            {state.blockers.map(blocker => (
              <li
                key={blocker.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2"
              >
                <span className="text-[12px] text-gray-700">
                  <span className="font-semibold tabular-nums text-amber-700">{blocker.qtd}</span>{" "}
                  {blocker.label}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setLocation(fazendaDeleteBlockerHref(blocker.key, state.fazendaId));
                  }}
                  className="text-[11px] font-medium text-[#2D5A5A] hover:underline shrink-0"
                >
                  {BLOCKER_ACTION_LABELS[blocker.key]}
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full">
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
