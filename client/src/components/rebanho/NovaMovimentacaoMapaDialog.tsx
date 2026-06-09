import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LoteOption = {
  loteId: number;
  loteNome: string;
  subdivisaoNome: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  lotes: LoteOption[];
};

export default function NovaMovimentacaoMapaDialog({ open, onClose, lotes }: Props) {
  const [, setLocation] = useLocation();

  const unicos = useMemo(() => {
    const map = new Map<number, LoteOption>();
    for (const l of lotes) map.set(l.loteId, l);
    return [...map.values()].sort((a, b) => a.loteNome.localeCompare(b.loteNome, "pt-BR"));
  }, [lotes]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Nova Movimentação</DialogTitle>
        </DialogHeader>
        <p className="text-[12px] text-gray-500 -mt-2 mb-3">
          Selecione o lote para movimentar animais entre lotes.
        </p>
        {unicos.length === 0 ? (
          <p className="text-[12px] text-gray-400 py-6 text-center">Nenhum lote disponível nos filtros atuais.</p>
        ) : (
          <div className="space-y-1">
            {unicos.map(l => (
              <button
                key={l.loteId}
                type="button"
                onClick={() => {
                  onClose();
                  setLocation(`/rebanho/editar-lote?id=${l.loteId}`);
                }}
                className="w-full text-left px-3 py-2.5 rounded-sm border border-gray-200 hover:bg-gray-50 transition"
              >
                <span className="block text-[13px] font-medium text-gray-800">{l.loteNome}</span>
                <span className="block text-[11px] text-gray-500">{l.subdivisaoNome}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
