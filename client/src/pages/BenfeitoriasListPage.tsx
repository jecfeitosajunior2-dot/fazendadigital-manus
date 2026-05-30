import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

const emptyForm = () => ({
  nome: "",
  tipo: "",
  anoConstrucao: "",
  vidaUtil: "",
  valorEstimado: "",
});

export default function BenfeitoriasListPage() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const pageSize = 10;

  const { data: list = [], isLoading } = trpc.benfeitorias.list.useQuery();

  const createMutation = trpc.benfeitorias.create.useMutation({
    onSuccess: () => { toast.success("Benfeitoria cadastrada!"); utils.benfeitorias.list.invalidate(); closeForm(); },
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.benfeitorias.update.useMutation({
    onSuccess: () => { toast.success("Benfeitoria atualizada!"); utils.benfeitorias.list.invalidate(); closeForm(); },
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.benfeitorias.delete.useMutation({
    onSuccess: () => { toast.success("Benfeitoria excluída!"); utils.benfeitorias.list.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm(emptyForm()); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(b =>
      [b.nome, b.tipo].some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [list, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const handleSubmit = () => {
    if (!form.nome.trim()) { toast.error("Nome da benfeitoria é obrigatório"); return; }
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo || undefined,
      anoConstrucao: form.anoConstrucao ? parseInt(form.anoConstrucao) : undefined,
      vidaUtil: form.vidaUtil ? parseInt(form.vidaUtil) : undefined,
      valorEstimado: form.valorEstimado || undefined,
    };
    if (editId) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const startEdit = (b: typeof list[0]) => {
    setEditId(b.id);
    setForm({
      nome: b.nome,
      tipo: b.tipo || "",
      anoConstrucao: b.anoConstrucao ? String(b.anoConstrucao) : "",
      vidaUtil: b.vidaUtil ? String(b.vidaUtil) : "",
      valorEstimado: b.valorEstimado ? String(b.valorEstimado) : "",
    });
    setOpen(true);
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        {/* Cabeçalho — estilo iRancho */}
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold text-gray-800">Lista de benfeitorias</h1>
          <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <button type="button" onClick={() => toast.info("Exportação em desenvolvimento")} className="flex items-center gap-1 hover:text-gray-700">
              <span className="material-icons text-[14px]">table_chart</span>
              Exportar Planilha
            </button>
            <button type="button" onClick={() => toast.info("Exportação PDF em desenvolvimento")} className="flex items-center gap-1 hover:text-gray-700">
              <span className="material-icons text-[14px]">picture_as_pdf</span>
              PDF
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Cadastrar Benfeitoria
          </button>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar"
              className="h-8 pl-8 pr-3 text-[11px] border border-gray-200 rounded w-48 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Benfeitoria", "Tipo", "Ano de Construção", "Vida Útil", "Valor(R$)"].map(col => (
                  <th key={col} className={cn(
                    "px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide",
                    col === "Benfeitoria" || col === "Tipo" ? "text-left" : "text-right"
                  )}>
                    <span className="inline-flex items-center gap-0.5">
                      {col}
                      <span className="material-icons text-[12px] opacity-40">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
              {!isLoading && pageItems.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Sem dados</td></tr>
              )}
              {pageItems.map(b => (
                <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{b.nome}</td>
                  <td className="px-4 py-2.5 text-gray-600">{b.tipo || "-"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{b.anoConstrucao ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{b.vidaUtil ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {b.valorEstimado ? parseFloat(String(b.valorEstimado)).toFixed(2) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button type="button" onClick={() => startEdit(b)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                        <span className="material-icons text-[15px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm("Excluir esta benfeitoria?")) deleteMutation.mutate({ id: b.id }); }}
                        className="p-1 rounded hover:bg-red-50 text-red-400"
                      >
                        <span className="material-icons text-[15px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
          <span>{pageSize} itens por página</span>
          <div className="flex items-center gap-3">
            <span>
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100">
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              <span className="px-2 py-0.5 rounded font-medium text-gray-800" style={{ backgroundColor: FD_PRIMARY, color: "#1a1a1a" }}>{page}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100">
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={v => !v && closeForm()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">{editId ? "Editar benfeitoria" : "Cadastrar benfeitoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px]">Benfeitoria *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} className="h-9 text-[12px]" placeholder="Ex. Galpão" />
            </div>
            <div>
              <Label className="text-[10px]">Tipo</Label>
              <Input value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className="h-9 text-[12px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Ano de Construção</Label>
                <Input type="number" value={form.anoConstrucao} onChange={e => setForm(f => ({ ...f, anoConstrucao: e.target.value }))} className="h-9 text-[12px]" />
              </div>
              <div>
                <Label className="text-[10px]">Vida Útil (anos)</Label>
                <Input type="number" value={form.vidaUtil} onChange={e => setForm(f => ({ ...f, vidaUtil: e.target.value }))} className="h-9 text-[12px]" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Valor (R$)</Label>
              <Input type="number" step="0.01" value={form.valorEstimado} onChange={e => setForm(f => ({ ...f, valorEstimado: e.target.value }))} className="h-9 text-[12px]" />
            </div>
            <div className="flex gap-2 pt-1 justify-end">
              <button type="button" onClick={closeForm} className="px-4 py-1.5 rounded border text-[11px] text-gray-600">Cancelar</button>
              <button type="button" onClick={handleSubmit} disabled={isBusy} className="px-4 py-1.5 rounded text-[11px] font-medium text-gray-800 disabled:opacity-50" style={{ backgroundColor: FD_PRIMARY }}>
                {isBusy ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
