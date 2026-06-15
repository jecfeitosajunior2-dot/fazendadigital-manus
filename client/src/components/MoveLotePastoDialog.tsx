import { useEffect, useMemo, useRef, useState } from "react";
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
  const pastoSelectRef = useRef<HTMLSelectElement>(null);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: open });
  const fazendaNum = fazendaId ? parseInt(fazendaId) : 0;
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaNum },
    { enabled: open && fazendaNum > 0 }
  );

  // Quando os pastos carregam e já há fazenda selecionada, o painel de seleção fica sempre visível

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
          <DialogTitle className="text-[14px]">Mover Lote — {lote?.nome}</DialogTitle>
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
          {/* Lista de pastos sempre visível quando há fazenda selecionada */}
          {fazendaNum > 0 && (
            <div>
              <Label className="text-[10px]">Subdivisão Destino</Label>
              {pastos.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic mt-1">Nenhum pasto cadastrado nesta fazenda.</p>
              ) : (
                <div
                  className="mt-1 rounded border border-gray-200 overflow-hidden"
                  style={{ maxHeight: 220, overflowY: "auto" }}
                >
                  {pastos
                    .slice()
                    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" }))
                    .map(p => {
                      const isAtual = lote?.pastoAtualId === p.id;
                      const selected = pastoId === String(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isAtual}
                          onClick={() => setPastoId(selected ? "" : String(p.id))}
                          className="w-full flex items-center justify-between px-3 py-2 text-[12px] text-left transition border-b border-gray-100 last:border-b-0"
                          style={{
                            backgroundColor: selected ? "#d1fae5" : isAtual ? "#f9fafb" : "#fff",
                            color: isAtual ? "#9ca3af" : "#1f2937",
                            cursor: isAtual ? "not-allowed" : "pointer",
                            fontWeight: selected ? 700 : 400,
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {selected && (
                              <span className="material-icons" style={{ fontSize: 14, color: "#16a34a" }}>check_circle</span>
                            )}
                            {!selected && (
                              <span className="material-icons" style={{ fontSize: 14, color: isAtual ? "#d1d5db" : "#9ca3af" }}>radio_button_unchecked</span>
                            )}
                            {p.nome}
                          </span>
                          <span className="flex items-center gap-2 text-[10px] text-gray-400">
                            {p.capacidade ? `${p.capacidade} UA` : ""}
                            {isAtual && <span className="text-[10px] text-amber-500 font-medium">atual</span>}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {lote?.pastoAtualId && (
              <Button type="button" variant="outline" onClick={handleRemove} className="h-8 text-[11px] text-red-600">
                Remover do pasto
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-8 text-[11px] flex-1"
              style={{ backgroundColor: "#C0C0C0", borderColor: "#C0C0C0", color: "#1f2937" }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleMove}
              disabled={moveMutation.isPending || !pastoId}
              className="h-8 text-[11px] flex-1"
              style={{ backgroundColor: "#2D5A5A", color: "#fff", opacity: moveMutation.isPending || !pastoId ? 0.5 : 1 }}
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
