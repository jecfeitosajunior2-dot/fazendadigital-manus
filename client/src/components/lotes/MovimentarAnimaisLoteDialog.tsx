import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FormLabel, FormDatePicker, FormNativeSelect } from "@/components/FormFields";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const IRANCHO_BTN_GREEN = "#8ab83d";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  loteOrigemId: number;
  fazendaId?: number | null;
  animalIds: number[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function MovimentarAnimaisLoteDialog({
  loteOrigemId,
  fazendaId,
  animalIds,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [dataMovimentacao, setDataMovimentacao] = useState(hojeISO());
  const [loteDestinoId, setLoteDestinoId] = useState("");

  const utils = trpc.useUtils();
  const { data: lotes = [], isLoading: lotesLoading } = trpc.lotes.list.useQuery(undefined, { enabled: open });

  const movimentarMutation = trpc.lotes.movimentarAnimais.useMutation({
    onSuccess: data => {
      toast.success(
        `Movimentação realizada com sucesso.\n${data.count} ${data.count === 1 ? "animal foi transferido" : "animais foram transferidos"} para o lote ${data.loteDestinoNome}.`,
      );
      utils.animais.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.lotes.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const lotesDestino = useMemo(() => {
    return lotes
      .filter(l => {
        if (l.id === loteOrigemId) return false;
        if (l.ativo === false) return false;
        if (fazendaId != null && l.fazendaId != null && l.fazendaId !== fazendaId) return false;
        return true;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lotes, loteOrigemId, fazendaId]);

  const destinoOptions = useMemo(
    () => lotesDestino.map(l => ({ value: String(l.id), label: l.nome })),
    [lotesDestino],
  );

  useEffect(() => {
    if (!open) return;
    setDataMovimentacao(hojeISO());
    setLoteDestinoId("");
  }, [open]);

  const handleConfirm = () => {
    if (!dataMovimentacao) {
      toast.error("Data da movimentação é obrigatória.");
      return;
    }
    if (!loteDestinoId) {
      toast.error("Selecione o lote de destino.");
      return;
    }
    movimentarMutation.mutate({
      loteOrigemId,
      loteDestinoId: Number(loteDestinoId),
      animalIds,
      dataMovimentacao,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="px-6 py-4 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">Movimentação</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FormLabel required>Data de Movimentação</FormLabel>
            <FormDatePicker
              value={dataMovimentacao}
              onChange={setDataMovimentacao}
              placeholder="Selecione uma data"
              required
            />
          </div>

          <div>
            <FormLabel required>Lote de Destino</FormLabel>
            {lotesLoading ? (
              <p className="text-[12px] text-gray-400 py-2">Carregando lotes...</p>
            ) : destinoOptions.length === 0 ? (
              <p className="text-[12px] text-amber-700 py-2">Nenhum lote de destino disponível.</p>
            ) : (
              <FormNativeSelect
                value={loteDestinoId}
                onChange={setLoteDestinoId}
                placeholder="Selecione o lote de destino"
                required
                options={destinoOptions}
              />
            )}
          </div>

          <div className="rounded-sm border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[12px] text-gray-600">
              Animais selecionados:{" "}
              <span className="font-semibold text-gray-900">{animalIds.length}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={movimentarMutation.isPending}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={movimentarMutation.isPending || destinoOptions.length === 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50"
            style={{ backgroundColor: IRANCHO_BTN_GREEN }}
          >
            {movimentarMutation.isPending ? "Movimentando..." : "Realizar Movimentação"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
