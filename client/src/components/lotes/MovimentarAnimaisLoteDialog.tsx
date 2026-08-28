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

const FD_PRIMARY = "#4ECDC4";

function hojeISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatListaBrincos(brincos: string[]): string {
  const n = brincos.length;
  if (n === 0) return "";
  if (n === 1) return `Brinco: ${brincos[0]}`;
  if (n <= 5) {
    const head = brincos.slice(0, -1).join(", ");
    return `Brincos: ${head} e ${brincos[n - 1]}`;
  }
  const first5 = brincos.slice(0, 5).join(", ");
  return `Brincos: ${first5} e mais ${n - 5}`;
}

type Props = {
  loteOrigemId: number;
  loteOrigemNome: string;
  subdivisaoOrigemNome: string;
  fazendaId?: number | null;
  fazendaNome?: string | null;
  animalIds: number[];
  /** Brincos na mesma ordem de animalIds (ou só dos selecionados). */
  animaisBrincos: string[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function MovimentarAnimaisLoteDialog({
  loteOrigemId,
  loteOrigemNome,
  subdivisaoOrigemNome,
  fazendaId,
  fazendaNome,
  animalIds,
  animaisBrincos,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [dataMovimentacao, setDataMovimentacao] = useState(hojeISO());
  const [loteDestinoId, setLoteDestinoId] = useState("");

  const utils = trpc.useUtils();
  const { data: lotes = [], isLoading: lotesLoading } = trpc.lotes.list.useQuery(
    { somenteAtivos: true },
    { enabled: open },
  );

  const movimentarMutation = trpc.lotes.movimentarAnimais.useMutation({
    onSuccess: data => {
      toast.success(
        `Transferência realizada com sucesso.\n${data.count} ${data.count === 1 ? "animal foi transferido" : "animais foram transferidos"} para o Lote ${data.loteDestinoNome}.`,
      );
      utils.animais.list.invalidate();
      utils.animais.getById.invalidate();
      utils.animais.historicoPastos.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.lotes.list.invalidate();
      utils.lotes.listHistoricoMovimentacoesAnimais.invalidate();
      utils.lotes.ultimaMovimentacaoPorAnimais.invalidate();
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
        if (fazendaId != null && l.fazendaId !== fazendaId) return false;
        return true;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [lotes, loteOrigemId, fazendaId]);

  const destinoOptions = useMemo(
    () => lotesDestino.map(l => ({ value: String(l.id), label: l.nome })),
    [lotesDestino],
  );

  const loteDestino = useMemo(
    () => lotesDestino.find(l => String(l.id) === loteDestinoId) ?? null,
    [lotesDestino, loteDestinoId],
  );

  const subdivisaoDestinoLabel = loteDestino
    ? ((loteDestino as { pastoNome?: string | null }).pastoNome?.trim() || "Sem subdivisão")
    : null;

  const origemLinha = [
    (fazendaNome ?? "").trim() || "Fazenda",
    subdivisaoOrigemNome.trim() || "Sem subdivisão",
    `Lote ${loteOrigemNome.trim() || "—"}`,
  ].join(" · ");

  const textoExplicativo =
    animalIds.length === 1
      ? `O animal sairá do Lote ${loteOrigemNome} e passará para o Lote selecionado. A localização será atualizada conforme a subdivisão do Lote de destino.`
      : `Os animais sairão do Lote ${loteOrigemNome} e passarão para o Lote selecionado. A localização será atualizada conforme a subdivisão do Lote de destino.`;

  const qtdSelecionados = animaisBrincos.length;
  const brincosLabel = formatListaBrincos(animaisBrincos);

  const destinoValido = useMemo(() => {
    if (!loteDestinoId || loteDestinoId.trim() === "") return false;
    const idNum = Number(loteDestinoId);
    if (!Number.isFinite(idNum) || idNum <= 0) return false;
    if (idNum === loteOrigemId) return false;
    if (!loteDestino) return false;
    if (loteDestino.ativo === false) return false;
    if (fazendaId != null && loteDestino.fazendaId !== fazendaId) return false;
    return true;
  }, [loteDestinoId, loteDestino, loteOrigemId, fazendaId]);

  const podeConfirmar =
    destinoValido && Boolean(dataMovimentacao) && !movimentarMutation.isPending;

  useEffect(() => {
    if (!open) return;
    setDataMovimentacao(hojeISO());
    setLoteDestinoId("");
  }, [open]);

  const handleDataChange = (v: string) => {
    if (v && v > hojeISO()) {
      toast.error("A data da movimentação não pode ser futura.");
      return;
    }
    setDataMovimentacao(v);
  };

  const handleConfirm = () => {
    if (!dataMovimentacao) {
      toast.error("Data da movimentação é obrigatória.");
      return;
    }
    if (dataMovimentacao > hojeISO()) {
      toast.error("A data da movimentação não pode ser futura.");
      return;
    }
    if (!destinoValido || !loteDestino) {
      toast.error("Selecione o Lote de destino.");
      return;
    }
    movimentarMutation.mutate({
      loteOrigemId,
      loteDestinoId: loteDestino.id,
      animalIds,
      dataMovimentacao,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !movimentarMutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="px-6 py-4 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">
            Transferir animais para outro Lote
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-gray-600">{textoExplicativo}</p>

          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-0.5">
              Origem
            </p>
            <p className="text-[12px] text-gray-800">{origemLinha}</p>
          </div>

          <div>
            <FormLabel required>Data da movimentação</FormLabel>
            <FormDatePicker
              value={dataMovimentacao}
              onChange={handleDataChange}
              placeholder="DD/MM/AAAA"
              required
              max={hojeISO()}
            />
          </div>

          <div>
            <FormLabel required>Lote de destino</FormLabel>
            {lotesLoading ? (
              <p className="text-[12px] text-gray-400 py-2">Carregando Lotes...</p>
            ) : destinoOptions.length === 0 ? (
              <p className="text-[12px] text-amber-700 py-2">Nenhum Lote de destino disponível.</p>
            ) : (
              <FormNativeSelect
                value={loteDestinoId}
                onChange={setLoteDestinoId}
                placeholder="Selecione o Lote de destino"
                required
                options={destinoOptions}
              />
            )}
            {loteDestino && subdivisaoDestinoLabel && (
              <p className="mt-1.5 text-[12px] text-gray-500">
                Localização no destino: {subdivisaoDestinoLabel}
              </p>
            )}
          </div>

          {qtdSelecionados > 0 && (
            <div className="text-[12px] leading-snug">
              <p className="text-gray-800">
                <span className="font-semibold">{qtdSelecionados}</span>
                {qtdSelecionados === 1 ? " animal selecionado" : " animais selecionados"}
              </p>
              <p className="text-gray-500">{brincosLabel}</p>
            </div>
          )}
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
            disabled={!podeConfirmar}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-900 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {movimentarMutation.isPending ? "Transferindo..." : "Realizar transferência"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
