import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, MapPin, Users, ArrowRightLeft, History } from "lucide-react";
import { toast } from "sonner";
import { MoveLotePastoDialog, OccupancyBar } from "@/components/MoveLotePastoDialog";

export default function LotsManagementPage() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [moveLote, setMoveLote] = useState<any>(null);
  const [historyLote, setHistoryLote] = useState<any>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", localizacao: "", capacidade: "" });

  const { data: lotes, isLoading, refetch } = trpc.lotes.list.useQuery();
  const { data: movimentacoes = [] } = trpc.lotes.listMovimentacoes.useQuery(
    { loteId: historyLote?.id ?? 0 },
    { enabled: !!historyLote }
  );

  const createMutation = trpc.lotes.create.useMutation({ onSuccess: () => { toast.success("Lote criado!"); setOpen(false); resetForm(); refetch(); } });
  const updateMutation = trpc.lotes.update.useMutation({ onSuccess: () => { toast.success("Lote atualizado!"); setOpen(false); resetForm(); refetch(); } });
  const deleteMutation = trpc.lotes.delete.useMutation({ onSuccess: () => { toast.success("Lote excluído!"); refetch(); } });

  const resetForm = () => { setForm({ nome: "", descricao: "", localizacao: "", capacidade: "" }); setEditId(null); };

  const handleSubmit = () => {
    if (!form.nome) { toast.error("Nome é obrigatório"); return; }
    if (editId) {
      updateMutation.mutate({ id: editId, nome: form.nome, descricao: form.descricao, localizacao: form.localizacao, capacidade: form.capacidade ? parseInt(form.capacidade) : undefined });
    } else {
      createMutation.mutate({ nome: form.nome, descricao: form.descricao, localizacao: form.localizacao, capacidade: form.capacidade ? parseInt(form.capacidade) : undefined });
    }
  };

  const handleEdit = (lote: any) => {
    setEditId(lote.id);
    setForm({ nome: lote.nome || "", descricao: lote.descricao || "", localizacao: lote.localizacao || "", capacidade: lote.capacidade?.toString() || "" });
    setOpen(true);
  };

  return (
    <div className="p-6">
      <MoveLotePastoDialog
        lote={moveLote}
        open={!!moveLote}
        onClose={() => setMoveLote(null)}
        onSuccess={() => refetch()}
      />

      <Dialog open={!!historyLote} onOpenChange={v => !v && setHistoryLote(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {historyLote?.nome}</DialogTitle>
          </DialogHeader>
          {movimentacoes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-2">
              {movimentacoes.map((m: any) => (
                <div key={m.id} className="border rounded p-3 text-sm">
                  <div className="font-medium text-gray-800">
                    {m.pastoOrigemNome ? `${m.pastoOrigemNome} → ` : ""}{m.pastoDestinoNome || "—"}
                  </div>
                  <div className="text-gray-500 text-xs mt-1">
                    Entrada: {m.dataEntrada}
                    {m.dataSaida && ` · Saída: ${m.dataSaida}`}
                    {m.diasNoPasto != null && ` · ${m.diasNoPasto} dias`}
                    {m.qtdAnimais > 0 && ` · ${m.qtdAnimais} cabeças`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Lotes</h1>
          <p className="text-gray-500 text-sm mt-1">Alocie lotes nos pastos e acompanhe dias de pastejo</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button style={{ backgroundColor: "#4ECDC4" }} className="hover:opacity-90 text-gray-800">
              <Plus className="w-4 h-4 mr-2" />Novo Lote
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editId ? "Editar Lote" : "Novo Lote"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome do lote" /></div>
              <div><Label>Descrição</Label><Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição" /></div>
              <div><Label>Localização</Label><Input value={form.localizacao} onChange={e => setForm(p => ({ ...p, localizacao: e.target.value }))} placeholder="Ex: Setor Norte" /></div>
              <div><Label>Capacidade (animais)</Label><Input type="number" value={form.capacidade} onChange={e => setForm(p => ({ ...p, capacidade: e.target.value }))} placeholder="0" /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} style={{ backgroundColor: "#4ECDC4" }} className="text-gray-800">
                  {editId ? "Salvar" : "Criar Lote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "#4ECDC4" }} /></div>
      ) : !lotes?.length ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum lote cadastrado</p>
          <p className="text-sm">Clique em &quot;Novo Lote&quot; para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lotes.map(lote => (
            <div key={lote.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{lote.nome}</h3>
                  {lote.pastoNome ? (
                    <p className="text-sm flex items-center gap-1 mt-1" style={{ color: "#4ECDC4" }}>
                      <MapPin className="w-3 h-3" />{lote.pastoNome}
                      {lote.fazendaNome && <span className="text-gray-400"> · {lote.fazendaNome}</span>}
                    </p>
                  ) : lote.localizacao ? (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{lote.localizacao}</p>
                  ) : (
                    <p className="text-sm text-gray-400 mt-1">Sem pasto alocado</p>
                  )}
                </div>
                <Badge variant={lote.ativo ? "default" : "secondary"} className={lote.ativo ? "bg-green-100 text-green-700" : ""}>
                  {lote.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 mb-2 text-xs">
                <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{lote.qtdAnimais ?? 0} cabeças</span>
                {lote.diasNoPasto != null && (
                  <span className="px-2 py-0.5 rounded" style={{ backgroundColor: "#E8FAF8", color: "#2D5A5A" }}>
                    {lote.diasNoPasto} dias no pasto
                  </span>
                )}
              </div>

              {lote.pastoCapacidade && (
                <OccupancyBar
                  pct={lote.pastoCapacidade ? Math.min(100, Math.round(((lote.qtdAnimais ?? 0) / lote.pastoCapacidade) * 100)) : null}
                  qtd={lote.qtdAnimais ?? 0}
                  capacidade={lote.pastoCapacidade}
                />
              )}

              {lote.descricao && <p className="text-sm text-gray-600 mb-2">{lote.descricao}</p>}
              {lote.capacidade && <p className="text-sm text-gray-500">Capacidade lote: <span className="font-medium">{lote.capacidade} animais</span></p>}

              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => setMoveLote(lote)} className="flex-1 min-w-[80px]">
                  <ArrowRightLeft className="w-3 h-3 mr-1" />Mover
                </Button>
                <Button size="sm" variant="outline" onClick={() => setHistoryLote(lote)}>
                  <History className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEdit(lote)}><Edit className="w-3 h-3" /></Button>
                <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate({ id: lote.id })} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
