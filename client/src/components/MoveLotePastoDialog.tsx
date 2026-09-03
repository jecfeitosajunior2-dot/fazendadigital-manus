import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FD_PRIMARY,
  FormInput,
  FormLabel,
  FormNativeSelect,
} from "@/components/FormFields";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Lote = {
  id: number;
  nome: string;
  pastoAtualId?: number | null;
  pastoNome?: string | null;
};

export function OccupancyBar({ pct, qtd, capacidade }: { pct: number | null; qtd: number; capacidade?: number | null }) {
  if (!capacidade) return null;
  const value = pct ?? Math.min(100, Math.round((qtd / capacidade) * 100));
  const color = value >= 90 ? "#EF4444" : value >= 70 ? "#F59E0B" : "#22C55E";
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
        <span>{qtd}/{capacidade} UA</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function MoveLotePastoDialog({
  lote,
  open,
  onClose,
  defaultFazendaId,
  defaultPastoId,
  onSuccess,
}: {
  lote: Lote | null;
  open: boolean;
  onClose: () => void;
  defaultFazendaId?: number;
  defaultPastoId?: number;
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();
  const [fazendaId, setFazendaId] = useState("");
  const [pastoId, setPastoId] = useState("");

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: open });
  const fazendaNum = fazendaId ? parseInt(fazendaId, 10) : 0;
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaNum },
    { enabled: open && fazendaNum > 0 },
  );

  const fazendaNome = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId)?.nome ?? "",
    [fazendas, fazendaId],
  );

  const fazendaOptions = useMemo(
    () => fazendas.map(f => ({ value: String(f.id), label: f.nome })),
    [fazendas],
  );

  const moveMutation = trpc.lotes.moveToPasto.useMutation({
    onSuccess: () => {
      toast.success("Subdivisão do Lote atualizada.");
      utils.lotes.list.invalidate();
      utils.pastos.list.invalidate();
      utils.pastos.listWithDetails.invalidate();
      if (fazendaNum) utils.pastos.listByFazenda.invalidate({ fazendaId: fazendaNum });
      onSuccess?.();
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) return;
    setFazendaId(defaultFazendaId ? String(defaultFazendaId) : "");
    setPastoId("");
  }, [open, defaultFazendaId, defaultPastoId]);

  const handleMove = () => {
    if (!lote) return;
    if (!pastoId) {
      toast.error("Selecione a subdivisão do Lote");
      return;
    }
    const novoPastoId = parseInt(pastoId, 10);
    if (lote.pastoAtualId != null && novoPastoId === lote.pastoAtualId) {
      toast.error("Selecione uma subdivisão diferente da atual");
      return;
    }
    moveMutation.mutate({ loteId: lote.id, pastoId: novoPastoId });
  };

  const temSubdivisaoAtual = Boolean(lote?.pastoAtualId);
  const pastosDisponiveis = useMemo(() => {
    const lista = temSubdivisaoAtual && lote?.pastoAtualId != null
      ? pastos.filter(p => p.id !== lote.pastoAtualId)
      : pastos;
    return lista
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }));
  }, [pastos, temSubdivisaoAtual, lote?.pastoAtualId]);

  const pastoOptions = useMemo(
    () =>
      pastosDisponiveis.map(p => ({
        value: String(p.id),
        label: p.capacidade ? `${p.nome} (${p.capacidade} UA)` : p.nome,
      })),
    [pastosDisponiveis],
  );

  const pastoSelecionadoNum = pastoId ? parseInt(pastoId, 10) : null;
  const mesmaSubdivisaoAtual =
    temSubdivisaoAtual
    && pastoSelecionadoNum != null
    && pastoSelecionadoNum === lote?.pastoAtualId;
  const podeConfirmar =
    Boolean(pastoId)
    && pastosDisponiveis.some(p => p.id === pastoSelecionadoNum)
    && !mesmaSubdivisaoAtual
    && !moveMutation.isPending;
  const fazendaSomenteLeitura = Boolean(defaultFazendaId);

  const tituloBase = temSubdivisaoAtual ? "Alterar subdivisão do Lote" : "Definir subdivisão do Lote";
  const confirmLabel = temSubdivisaoAtual ? "Alterar subdivisão" : "Definir subdivisão";

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !moveMutation.isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md p-0 gap-0" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader className="px-6 py-4 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">
            {tituloBase}
            {lote?.nome ? ` — ${lote.nome}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">
          <p className="text-[11px] text-amber-800/90 bg-amber-50 border border-amber-100 rounded px-2.5 py-2 leading-relaxed">
            Define a localização operacional deste Lote. Os animais continuam no Lote; a subdivisão é do Lote, não de cada animal.
          </p>

          <div>
            <FormLabel>Fazenda</FormLabel>
            {fazendaSomenteLeitura ? (
              <FormInput
                variant="light"
                readOnly
                value={fazendaNome || (fazendaId ? `Fazenda #${fazendaId}` : "—")}
                onChange={() => {}}
              />
            ) : (
              <FormNativeSelect
                variant="light"
                value={fazendaId}
                onChange={v => {
                  setFazendaId(v);
                  setPastoId("");
                }}
                placeholder="Selecione a Fazenda"
                options={fazendaOptions}
                required
                modal={false}
              />
            )}
          </div>

          {temSubdivisaoAtual && lote?.pastoNome ? (
            <p className="text-[12px] text-gray-600">
              Subdivisão atual:{" "}
              <span className="font-medium text-gray-800">{lote.pastoNome}</span>
            </p>
          ) : null}

          <div>
            <FormLabel required>
              {temSubdivisaoAtual ? "Nova subdivisão do Lote" : "Subdivisão do Lote"}
            </FormLabel>
            <FormNativeSelect
              variant="light"
              value={pastoId}
              onChange={setPastoId}
              placeholder="Selecione a subdivisão"
              options={pastoOptions}
              disabled={!fazendaId || pastosDisponiveis.length === 0}
              required
              modal={false}
            />
            {fazendaId && pastos.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Nenhuma subdivisão cadastrada para esta fazenda.
              </p>
            ) : null}
            {fazendaId && pastos.length > 0 && pastosDisponiveis.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Nenhuma outra subdivisão disponível.
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-gray-100 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={moveMutation.isPending}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={!podeConfirmar}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {moveMutation.isPending ? "Salvando..." : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignLotePastoDialog({
  open,
  onClose,
  fazendaId,
  pastoId,
  pastoNome,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  fazendaId: number;
  pastoId: number;
  pastoNome: string;
  onSuccess?: () => void;
}) {
  const utils = trpc.useUtils();
  const [loteId, setLoteId] = useState("");
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true }, { enabled: open });
  const disponiveis = useMemo(
    () => lotes.filter(l => l.pastoAtualId !== pastoId),
    [lotes, pastoId],
  );

  const loteOptions = useMemo(
    () =>
      disponiveis.map(l => ({
        value: String(l.id),
        label: `${l.nome}${l.pastoNome ? ` (em ${l.pastoNome})` : ""} · ${l.qtdAnimais ?? 0} cab.`,
      })),
    [disponiveis],
  );

  const moveMutation = trpc.lotes.moveToPasto.useMutation({
    onSuccess: () => {
      toast.success("Lote alocado no pasto!");
      utils.lotes.list.invalidate();
      utils.pastos.listByFazenda.invalidate({ fazendaId });
      utils.pastos.listWithDetails.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">
            Alocar Lote — {pastoNome}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4">
          <div>
            <FormLabel required>Lote</FormLabel>
            <FormNativeSelect
              variant="light"
              value={loteId}
              onChange={setLoteId}
              placeholder="Selecione o Lote"
              options={loteOptions}
              required
              modal={false}
            />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-gray-100 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={moveMutation.isPending}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => loteId && moveMutation.mutate({ loteId: parseInt(loteId, 10), pastoId })}
            disabled={!loteId || moveMutation.isPending}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {moveMutation.isPending ? "Alocando..." : "Alocar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
