import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssignLotePastoDialog, MoveLotePastoDialog, OccupancyBar } from "@/components/MoveLotePastoDialog";

const TIPOS_PASTO = ["Pasto", "Retiro", "Confinamento", "Curral", "Maternidade", "Reserva", "APP", "Sede", "Outro"] as const;

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ativo: { label: "Em uso", color: "#166534", bg: "#DCFCE7" },
  descanso: { label: "Descanso", color: "#92400E", bg: "#FEF3C7" },
  vazio: { label: "Vazio", color: "#6B7280", bg: "#F3F4F6" },
};

type Fazenda = {
  id: number;
  nome: string;
  area?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

export function FarmPastosSheet({
  fazenda,
  open,
  onClose,
}: {
  fazenda: Fazenda | null;
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const fazendaId = fazenda?.id ?? 0;

  const { data: pastosList = [], isLoading } = trpc.pastos.listWithDetails.useQuery(
    { fazendaId },
    { enabled: open && fazendaId > 0 }
  );

  const [assignPasto, setAssignPasto] = useState<{ id: number; nome: string } | null>(null);
  const [moveLote, setMoveLote] = useState<any>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nome: "",
    tipo: "Pasto",
    area: "",
    capacidade: "",
    status: "vazio" as "ativo" | "descanso" | "vazio",
    observacoes: "",
  });

  const resetForm = () => {
    setForm({ nome: "", tipo: "Pasto", area: "", capacidade: "", status: "vazio", observacoes: "" });
    setEditId(null);
    setShowForm(false);
  };

  const invalidate = () => {
    utils.pastos.listByFazenda.invalidate({ fazendaId });
    utils.pastos.listWithDetails.invalidate({ fazendaId });
    utils.pastos.list.invalidate();
    utils.lotes.list.invalidate();
  };

  const createMutation = trpc.pastos.create.useMutation({
    onSuccess: () => { toast.success("Pasto cadastrado!"); invalidate(); resetForm(); },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.pastos.update.useMutation({
    onSuccess: () => { toast.success("Pasto atualizado!"); invalidate(); resetForm(); },
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.pastos.delete.useMutation({
    onSuccess: () => { toast.success("Pasto removido!"); invalidate(); },
    onError: e => toast.error(e.message),
  });

  const areaPastos = pastosList.reduce((s, p) => s + parseFloat(String(p.area || "0")), 0);
  const areaFazenda = parseFloat(String(fazenda?.area || "0"));
  const pctArea = areaFazenda > 0 ? Math.min(100, (areaPastos / areaFazenda) * 100) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Nome do pasto é obrigatório"); return; }
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      area: form.area || undefined,
      capacidade: form.capacidade ? parseInt(form.capacidade) : undefined,
      status: form.status,
      observacoes: form.observacoes || undefined,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate({ fazendaId, ...payload });
    }
  };

  const startEdit = (p: typeof pastosList[0]) => {
    setEditId(p.id);
    setForm({
      nome: p.nome,
      tipo: p.tipo || "Pasto",
      area: p.area ? String(p.area) : "",
      capacidade: p.capacidade ? String(p.capacidade) : "",
      status: (p.status as "ativo" | "descanso" | "vazio") || "vazio",
      observacoes: p.observacoes || "",
    });
    setShowForm(true);
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const totalAnimais = pastosList.reduce((s, p) => s + (p.qtdAnimais ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <AssignLotePastoDialog
        open={!!assignPasto}
        onClose={() => setAssignPasto(null)}
        fazendaId={fazendaId}
        pastoId={assignPasto?.id ?? 0}
        pastoNome={assignPasto?.nome ?? ""}
        onSuccess={invalidate}
      />
      <MoveLotePastoDialog
        lote={moveLote}
        open={!!moveLote}
        onClose={() => setMoveLote(null)}
        defaultFazendaId={fazendaId}
        defaultPastoId={moveLote?.pastoAtualId ?? undefined}
        onSuccess={invalidate}
      />
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="p-4 pb-3 border-b border-gray-100">
          <SheetTitle className="text-[15px] font-semibold text-gray-800 flex items-center gap-2">
            <span className="material-icons text-[18px]" style={{ color: "#4ECDC4" }}>grass</span>
            Pastos — {fazenda?.nome}
          </SheetTitle>
          <SheetDescription className="text-[11px] text-gray-500">
            {[fazenda?.cidade, fazenda?.estado].filter(Boolean).join("/") || "Subdivisões da fazenda"}
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 space-y-4">
          {/* Resumo rápido — inspirado em AgriWebb/iRancho */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded p-2.5 text-center border border-gray-100">
              <div className="text-[16px] font-bold text-gray-800">{pastosList.length}</div>
              <div className="text-[9px] text-gray-500 uppercase">Pastos</div>
            </div>
            <div className="bg-gray-50 rounded p-2.5 text-center border border-gray-100">
              <div className="text-[16px] font-bold text-gray-800">{totalAnimais}</div>
              <div className="text-[9px] text-gray-500 uppercase">Cabeças</div>
            </div>
            <div className="bg-gray-50 rounded p-2.5 text-center border border-gray-100">
              <div className="text-[16px] font-bold text-gray-800">{areaPastos.toFixed(0)}</div>
              <div className="text-[9px] text-gray-500 uppercase">ha mapeados</div>
            </div>
            <div className="bg-gray-50 rounded p-2.5 text-center border border-gray-100">
              <div className="text-[16px] font-bold text-gray-800">{pctArea.toFixed(0)}%</div>
              <div className="text-[9px] text-gray-500 uppercase">da fazenda</div>
            </div>
          </div>

          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-1 py-2 rounded text-white text-[11px] font-medium uppercase"
              style={{ backgroundColor: "#4ECDC4" }}
            >
              <span className="material-icons text-[14px]">add</span>
              Novo Pasto
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
              <div className="text-[12px] font-semibold text-gray-700 mb-1">
                {editId ? "Editar pasto" : "Cadastrar pasto"}
              </div>
              <div>
                <Label className="text-[10px]">Nome *</Label>
                <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex. Pasto 1" className="h-8 text-[12px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_PASTO.map(t => <SelectItem key={t} value={t} className="text-[12px]">{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as typeof form.status }))}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo" className="text-[12px]">Em uso</SelectItem>
                      <SelectItem value="descanso" className="text-[12px]">Descanso</SelectItem>
                      <SelectItem value="vazio" className="text-[12px]">Vazio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Área (ha)</Label>
                  <Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} type="number" placeholder="0" className="h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Capacidade (UA)</Label>
                  <Input value={form.capacidade} onChange={e => setForm(f => ({ ...f, capacidade: e.target.value }))} type="number" placeholder="0" className="h-8 text-[12px]" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" onClick={resetForm} className="h-8 text-[11px] flex-1">Cancelar</Button>
                <Button type="submit" disabled={isBusy} className="h-8 text-[11px] flex-1 text-gray-800" style={{ backgroundColor: "#4ECDC4" }}>
                  {isBusy ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de pastos */}
          {isLoading && <p className="text-center text-[11px] text-gray-400 py-4">Carregando...</p>}
          {!isLoading && pastosList.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <span className="material-icons text-3xl block mb-2 opacity-30">landscape</span>
              <p className="text-[12px]">Nenhum pasto cadastrado</p>
              <p className="text-[10px] mt-1">Opcional — mapeie seus piquetes quando quiser</p>
            </div>
          )}
          <div className="space-y-2">
            {pastosList.map(p => {
              const st = STATUS_LABEL[p.status || "vazio"] || STATUS_LABEL.vazio;
              const lotesNoPasto = (p as any).lotes ?? [];
              return (
                <div key={p.id} className="border border-gray-100 rounded p-3 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-800">{p.nome}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ color: st.color, backgroundColor: st.bg }}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">
                        {p.tipo}{p.area ? ` · ${p.area} ha` : ""}{p.capacidade ? ` · ${p.capacidade} UA` : ""}
                        {(p as any).qtdAnimais > 0 && ` · ${(p as any).qtdAnimais} cabeças`}
                      </div>
                      {(p as any).diasPastejo != null && (
                        <div className="text-[10px] mt-0.5" style={{ color: "#4ECDC4" }}>
                          <span className="material-icons text-[11px] align-middle">schedule</span>
                          {" "}{((p as any).diasPastejo)} dias em pastejo
                        </div>
                      )}
                      {(p as any).diasDescanso != null && (
                        <div className="text-[10px] text-amber-700 mt-0.5">
                          {((p as any).diasDescanso)} dias de descanso
                        </div>
                      )}
                      <OccupancyBar pct={(p as any).pctOcupacao} qtd={(p as any).qtdAnimais ?? 0} capacidade={p.capacidade} />
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" onClick={() => setAssignPasto({ id: p.id, nome: p.nome })} className="p-1 rounded hover:bg-green-50 text-gray-500" title="Alocar lote">
                        <span className="material-icons text-[14px]" style={{ color: "#4ECDC4" }}>group_add</span>
                      </button>
                      <button type="button" onClick={() => startEdit(p)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                        <span className="material-icons text-[14px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm("Remover este pasto?")) deleteMutation.mutate({ id: p.id }); }}
                        className="p-1 rounded hover:bg-red-50 text-red-400"
                      >
                        <span className="material-icons text-[14px]">delete</span>
                      </button>
                    </div>
                  </div>
                  {lotesNoPasto.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-50 space-y-1">
                      {lotesNoPasto.map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between text-[10px] bg-gray-50 rounded px-2 py-1">
                          <span className="text-gray-700 font-medium">{l.nome} · {l.qtdAnimais} cab.</span>
                          <div className="flex items-center gap-2">
                            {l.diasNoPasto != null && <span className="text-gray-400">{l.diasNoPasto}d</span>}
                            <button type="button" onClick={() => setMoveLote(l)} className="text-[#4ECDC4] hover:underline">Mover</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default FarmPastosSheet;
