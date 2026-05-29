import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, MapPin, Users } from "lucide-react";
import { toast } from "sonner";

export default function LotsManagementPage() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", localizacao: "", capacidade: "" });

  const { data: lotes, isLoading, refetch } = trpc.lotes.list.useQuery();
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Lotes</h1>
          <p className="text-gray-500 text-sm mt-1">Gerencie os lotes e piquetes da propriedade</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4 mr-2" />Novo Lote</Button>
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
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                  {editId ? "Salvar" : "Criar Lote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : !lotes?.length ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum lote cadastrado</p>
          <p className="text-sm">Clique em "Novo Lote" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lotes.map(lote => (
            <div key={lote.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{lote.nome}</h3>
                  {lote.localizacao && <p className="text-sm text-gray-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{lote.localizacao}</p>}
                </div>
                <Badge variant={lote.ativo ? "default" : "secondary"} className={lote.ativo ? "bg-green-100 text-green-700" : ""}>
                  {lote.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              {lote.descricao && <p className="text-sm text-gray-600 mb-3">{lote.descricao}</p>}
              {lote.capacidade && <p className="text-sm text-gray-500">Capacidade: <span className="font-medium">{lote.capacidade} animais</span></p>}
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
                <Button size="sm" variant="outline" onClick={() => handleEdit(lote)} className="flex-1"><Edit className="w-3 h-3 mr-1" />Editar</Button>
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
