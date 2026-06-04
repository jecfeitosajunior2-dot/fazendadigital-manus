import { useState } from "react";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { FormLabel, FieldBox } from "@/components/FormFields";
import { formatDateBR } from "@/lib/date-utils";

type FormState = { data: string; quantidade: string; responsavel: string; observacoes: string };

export default function SuppliesManagementPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ data: "", quantidade: "", responsavel: "", observacoes: "" });

  const { data: batidas, isLoading, refetch } = trpc.nutricao.listBatidas.useQuery();
  const createMutation = trpc.nutricao.createBatida.useMutation({
    onSuccess: () => { toast.success("Batida registrada!"); setOpen(false); setForm({ data: "", quantidade: "", responsavel: "", observacoes: "" }); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.nutricao.deleteBatida.useMutation({ onSuccess: () => { toast.success("Registro excluído!"); refetch(); } });

  const handleSubmit = () => {
    if (!form.data) { toast.error("Data é obrigatória"); return; }
    createMutation.mutate({ data: form.data, quantidade: form.quantidade || undefined, responsavel: form.responsavel.trim() || undefined, observacoes: form.observacoes.trim() || undefined });
  };

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nutrição / Cochos</h1>
          <p className="text-gray-500 text-sm mt-1">Registro de batidas e fornecimento de alimentação</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ListExportButtons
            title="Batidas de Nutrição"
            filename="batidas"
            headers={["Data", "Quantidade (kg)", "Responsável", "Observações"]}
            rows={(batidas ?? []).map(b => [
              String(b.data ?? ""),
              String(b.quantidade ?? ""),
              String(b.responsavel ?? ""),
              String(b.observacoes ?? ""),
            ])}
            alignRightFrom={1}
          />
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white"><Plus className="w-4 h-4 mr-2" />Nova Batida</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Batida</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <FormLabel required>Data</FormLabel>
                <FieldBox required>
                  <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className="border-0 shadow-none bg-transparent h-auto px-2 py-1.5 text-[12px]" />
                </FieldBox>
              </div>
              <div><Label>Quantidade (kg)</Label><Input type="number" step="0.01" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0.00" /></div>
              <div><Label>Responsável</Label><Input value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} placeholder="Nome do responsável" /></div>
              <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} /></div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">Registrar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" /></div>
      ) : !batidas?.length ? (
        <div className="text-center py-16 text-gray-400">
          <Utensils className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma batida registrada</p>
          <p className="text-sm">Clique em "Nova Batida" para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Data</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batidas.map(b => (
                <TableRow key={b.id}>
                  <TableCell>{b.data ? formatDateBR(b.data) : "-"}</TableCell>
                  <TableCell>{b.quantidade ? `${b.quantidade} kg` : "-"}</TableCell>
                  <TableCell>{b.responsavel || "-"}</TableCell>
                  <TableCell className="max-w-xs truncate">{b.observacoes || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate({ id: b.id })} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
