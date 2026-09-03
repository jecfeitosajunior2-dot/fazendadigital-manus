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
  formatFazendaDeleteBlockerCount,
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

const SUBDIVISOES_ANCHOR = "fazenda-subdivisoes";

function irParaBlocker(key: FazendaDeleteBlocker["key"], fazendaId: number, currentPath: string, setLocation: (to: string) => void) {
  if (key === "subdivisoes") {
    const naVisaoGeral = currentPath.startsWith("/fazendas/visao-geral");
    const scroll = () => {
      document.getElementById(SUBDIVISOES_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (naVisaoGeral) {
      scroll();
      return;
    }
    setLocation(fazendaDeleteBlockerHref(key, fazendaId));
    window.setTimeout(scroll, 350);
    return;
  }
  setLocation(fazendaDeleteBlockerHref(key, fazendaId));
}

export default function FazendaDeleteBlockedDialog({ state, onClose }: Props) {
  const [location, setLocation] = useLocation();
  const blockers = state?.blockers ?? [];

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

        {state && blockers.length > 0 ? (
          <ul className="max-h-56 overflow-y-auto space-y-1.5 my-1">
            {blockers.map(blocker => (
              <li
                key={blocker.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
              >
                <span className="text-[13px] font-medium text-amber-700">
                  {formatFazendaDeleteBlockerCount(blocker.key, blocker.qtd)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    irParaBlocker(blocker.key, state.fazendaId, location, setLocation);
                  }}
                  className="text-[12px] font-medium text-[#2D5A5A] hover:text-[#4ECDC4] hover:underline shrink-0"
                >
                  {BLOCKER_ACTION_LABELS[blocker.key]}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button
            onClick={onClose}
            className="w-full text-white hover:opacity-95"
            style={{ backgroundColor: "#4ECDC4" }}
          >
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
