import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [fazendaId, setFazendaId] = useState<string>("");
  const [pastoId, setPastoId] = useState<string>("");

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: open });
  const fazendaNum = fazendaId ? parseInt(fazendaId) : 0;
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaNum },
    { enabled: open && fazendaNum > 0 }
  );

  const moveMutation = trpc.lotes.moveToPasto.useMutation({
    onSuccess: () => {
      toast.success("Lote movido com sucesso!");
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
    setPastoId(defaultPastoId ? String(defaultPastoId) : "");
  }, [open, defaultFazendaId, defaultPastoId]);

  const handleMove = () => {
    if (!lote) return;
    if (!pastoId) { toast.error("Selecione o pasto de destino"); return; }
    moveMutation.mutate({ loteId: lote.id, pastoId: parseInt(pastoId) });
  };

  const handleRemove = () => {
    if (!lote) return;
    if (!confirm("Remover lote do pasto atual?")) return;
    moveMutation.mutate({ loteId: lote.id, pastoId: null });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Mover lote — {lote?.nome}</DialogTitle>
        </DialogHeader>
        {lote?.pastoNome && (
          <p className="text-[11px] text-gray-500 -mt-2">
            Atualmente em: <span className="font-medium text-gray-700">{lote.pastoNome}</span>
          </p>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-[10px]">Fazenda</Label>
            <Select value={fazendaId} onValueChange={v => { setFazendaId(v); setPastoId(""); }}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
              <SelectContent>
                {fazendas.map(f => (
                  <SelectItem key={f.id} value={String(f.id)} className="text-[12px]">{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Pasto destino</Label>
            <Select value={pastoId} onValueChange={setPastoId} disabled={!fazendaId}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione o pasto" /></SelectTrigger>
              <SelectContent>
                {pastos.map(p => (
                  <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">
                    {p.nome}{p.capacidade ? ` (${p.capacidade} UA)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            {lote?.pastoAtualId && (
              <Button type="button" variant="outline" onClick={handleRemove} className="h-8 text-[11px] text-red-600">
                Remover do pasto
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} className="h-8 text-[11px] flex-1">Cancelar</Button>
            <Button
              type="button"
              onClick={handleMove}
              disabled={moveMutation.isPending || !pastoId}
              className="h-8 text-[11px] flex-1 text-gray-800"
              style={{ backgroundColor: "#4ECDC4" }}
            >
              {moveMutation.isPending ? "Movendo..." : "Mover"}
            </Button>
          </div>
        </div>
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
  const { data: lotes = [] } = trpc.lotes.list.useQuery(undefined, { enabled: open });
  const disponiveis = useMemo(
    () => lotes.filter(l => l.pastoAtualId !== pastoId),
    [lotes, pastoId]
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Alocar lote — {pastoNome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[10px]">Lote</Label>
            <Select value={loteId} onValueChange={setLoteId}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione o lote" /></SelectTrigger>
              <SelectContent>
                {disponiveis.map(l => (
                  <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">
                    {l.nome}{l.pastoNome ? ` (em ${l.pastoNome})` : ""} · {l.qtdAnimais ?? 0} cab.
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-8 text-[11px] flex-1">Cancelar</Button>
            <Button
              type="button"
              onClick={() => loteId && moveMutation.mutate({ loteId: parseInt(loteId), pastoId })}
              disabled={!loteId || moveMutation.isPending}
              className="h-8 text-[11px] flex-1 text-gray-800"
              style={{ backgroundColor: "#4ECDC4" }}
            >
              {moveMutation.isPending ? "Alocando..." : "Alocar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
