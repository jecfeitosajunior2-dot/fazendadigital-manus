import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Edit, ArrowRightLeft, History, AlertTriangle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { FormLabel, FieldBox } from "@/components/FormFields";
import { MoveLotePastoDialog } from "@/components/MoveLotePastoDialog";
import { FAIXAS_IDADE_LOTE } from "@shared/lote-faixas-idade";
import type { ContagemPorFaixa } from "@shared/lote-faixas-idade";

const FD_PRIMARY = "#4ECDC4";
const IRANCHO_BTN_GREEN = "#8ab83d";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface LoteItem {
  id: number;
  nome: string;
  descricao?: string | null;
  localizacao?: string | null;
  capacidade?: number | null;
  ativo?: boolean | null;
  qtdAnimais?: number | null;
  diasNoPasto?: number | null;
  pastoNome?: string | null;
  pastoCapacidade?: number | null;
  fazendaNome?: string | null;
}

type LoteGerenciamento = {
  id: number;
  nome: string;
  fazendaId: number | null;
  fazendaNome: string | null;
  ativo: boolean | null;
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
};

interface DeleteConfirmState { lote: LoteItem }
interface DeleteBlockedState { nomeLote: string; qtdAnimais: number }

function celulaValor(v: number) {
  return v > 0 ? String(v) : "";
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function LotsManagementPage() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [moveLote, setMoveLote] = useState<LoteItem | null>(null);
  const [historyLote, setHistoryLote] = useState<LoteItem | null>(null);
  const [form, setForm] = useState({ nome: "", descricao: "", localizacao: "", capacidade: "" });
  const [fazendaFilter, setFazendaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState | null>(null);

  const queryInput = useMemo(() => ({
    fazendaId: fazendaFilter ? Number(fazendaFilter) : undefined,
    search: search.trim() || undefined,
  }), [fazendaFilter, search]);

  const { data: gerenciamento = [], isLoading, refetch } = trpc.lotes.gerenciamento.useQuery(queryInput);
  const { data: lotesFull = [] } = trpc.lotes.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: movimentacoes = [] } = trpc.lotes.listMovimentacoes.useQuery(
    { loteId: historyLote?.id ?? 0 },
    { enabled: !!historyLote },
  );

  const loteById = useMemo(
    () => new Map((lotesFull as LoteItem[]).map(l => [l.id, l])),
    [lotesFull],
  );

  const sorted = useMemo(() => {
    const lista = [...(gerenciamento as LoteGerenciamento[])];
    lista.sort((a, b) => {
      const cmp = a.nome.localeCompare(b.nome, "pt-BR");
      return sortAsc ? cmp : -cmp;
    });
    return lista;
  }, [gerenciamento, sortAsc]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const createMutation = trpc.lotes.create.useMutation({
    onSuccess: () => { toast.success("Lote criado!"); setOpen(false); resetForm(); refetch(); },
  });
  const updateMutation = trpc.lotes.update.useMutation({
    onSuccess: () => { toast.success("Lote atualizado!"); setOpen(false); resetForm(); refetch(); },
  });
  const excluirMutation = trpc.lotes.excluir.useMutation({
    onSuccess: (data) => {
      toast.success(`Lote "${data.nomeLote}" excluído com sucesso.`);
      setDeleteConfirm(null);
      refetch();
    },
    onError: (err) => {
      const loteAtual = deleteConfirm?.lote;
      setDeleteConfirm(null);
      if (err.data?.code === "PRECONDITION_FAILED") {
        const match = err.message.match(/Existem (\d+) animal/);
        const qtd = match ? parseInt(match[1], 10) : (loteAtual?.qtdAnimais ?? 1);
        setDeleteBlocked({ nomeLote: loteAtual?.nome ?? "—", qtdAnimais: qtd });
      } else {
        toast.error(err.message || "Erro ao excluir o lote.");
      }
    },
  });

  const resetForm = () => {
    setForm({ nome: "", descricao: "", localizacao: "", capacidade: "" });
    setEditId(null);
  };

  const handleSubmit = () => {
    if (!form.nome) { toast.error("Nome é obrigatório"); return; }
    if (editId) {
      updateMutation.mutate({
        id: editId,
        nome: form.nome,
        descricao: form.descricao,
        localizacao: form.localizacao,
        capacidade: form.capacidade ? parseInt(form.capacidade) : undefined,
      });
    } else {
      createMutation.mutate({
        nome: form.nome,
        descricao: form.descricao,
        localizacao: form.localizacao,
        capacidade: form.capacidade ? parseInt(form.capacidade) : undefined,
      });
    }
  };

  const openEdit = (row: LoteGerenciamento) => {
    const lote = loteById.get(row.id);
    if (!lote) return;
    setEditId(lote.id);
    setForm({
      nome: lote.nome || "",
      descricao: lote.descricao || "",
      localizacao: lote.localizacao || "",
      capacidade: lote.capacidade?.toString() || "",
    });
    setOpen(true);
  };

  const handleDeleteRequest = (row: LoteGerenciamento) => {
    const lote = loteById.get(row.id);
    if (!lote) return;
    if ((lote.qtdAnimais ?? 0) > 0) {
      setDeleteBlocked({ nomeLote: lote.nome, qtdAnimais: lote.qtdAnimais ?? 1 });
      return;
    }
    setDeleteConfirm({ lote });
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(l => l.id)));
    }
  };

  const exportHeaders = [
    "Nome do Lote",
    ...FAIXAS_IDADE_LOTE.map(f => `Machos ${f}`),
    ...FAIXAS_IDADE_LOTE.map(f => `Fêmeas ${f}`),
  ];

  const exportData = useMemo(
    () => sorted.map(l => [
      l.nome,
      ...FAIXAS_IDADE_LOTE.map(f => l.machos[f] || 0),
      ...FAIXAS_IDADE_LOTE.map(f => l.femeas[f] || 0),
    ]),
    [sorted],
  );

  const inicio = total === 0 ? 0 : (pageSafe - 1) * perPage + 1;
  const fim = Math.min(pageSafe * perPage, total);

  return (
    <div className="p-4 sm:p-6">
      <MoveLotePastoDialog
        lote={moveLote}
        open={!!moveLote}
        onClose={() => setMoveLote(null)}
        onSuccess={() => refetch()}
      />

      {/* Histórico */}
      <Dialog open={!!historyLote} onOpenChange={v => !v && setHistoryLote(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {historyLote?.nome}</DialogTitle>
          </DialogHeader>
          {movimentacoes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhuma movimentação registrada</p>
          ) : (
            <div className="space-y-2">
              {(movimentacoes as any[]).map((m: any) => (
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

      {/* Confirmação exclusão */}
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-gray-900">Excluir lote</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed">
              Tem certeza que deseja excluir o lote{" "}
              <span className="font-semibold text-gray-900">&quot;{deleteConfirm?.lote.nome}&quot;</span>?
              <br />
              <span className="text-red-600 font-medium">Esta ação não poderá ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={excluirMutation.isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => deleteConfirm && excluirMutation.mutate({ id: deleteConfirm.lote.id })} disabled={excluirMutation.isPending}>
              {excluirMutation.isPending ? "Excluindo…" : "Excluir Lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bloqueio exclusão */}
      <Dialog open={!!deleteBlocked} onOpenChange={v => !v && setDeleteBlocked(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-gray-900">Não é possível excluir</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed">
              O lote <span className="font-semibold text-gray-900">&quot;{deleteBlocked?.nomeLote}&quot;</span> possui{" "}
              <span className="font-semibold text-amber-700">
                {deleteBlocked?.qtdAnimais} {deleteBlocked?.qtdAnimais === 1 ? "animal vinculado" : "animais vinculados"}
              </span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteBlocked(null)} className="w-full">Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cabeçalho — iRancho */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-[15px] font-semibold text-gray-800">Gerenciamento de Lotes</h1>
        <ListExportButtons
          title="Gerenciamento de Lotes"
          filename="gerenciamento-lotes"
          headers={exportHeaders}
          rows={exportData}
          alignRightFrom={1}
        />
      </div>

      {/* Barra de controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <button
              type="button"
              className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 transition"
              style={{ backgroundColor: IRANCHO_BTN_GREEN, minHeight: 40 }}
            >
              Novo Lote
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Lote" : "Novo Lote"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <FormLabel required>Nome</FormLabel>
                <FieldBox required>
                  <Input
                    value={form.nome}
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome do lote"
                    className="border-0 shadow-none bg-transparent h-auto px-2 py-1.5 text-[12px]"
                  />
                </FieldBox>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição" />
              </div>
              <div>
                <Label>Localização</Label>
                <Input value={form.localizacao} onChange={e => setForm(p => ({ ...p, localizacao: e.target.value }))} placeholder="Ex: Setor Norte" />
              </div>
              <div>
                <Label>Capacidade (animais)</Label>
                <Input type="number" value={form.capacidade} onChange={e => setForm(p => ({ ...p, capacidade: e.target.value }))} placeholder="0" />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} style={{ backgroundColor: FD_PRIMARY }} className="text-gray-800">
                  {editId ? "Salvar" : "Criar Lote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <div className="w-full sm:w-auto sm:min-w-[200px]">
          <select
            value={fazendaFilter}
            onChange={e => { setFazendaFilter(e.target.value); setPage(1); }}
            className="w-full h-[40px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#7CB342]"
          >
            <option value="">Selecione uma fazenda</option>
            {fazendas.map((f: { id: number; nome: string }) => (
              <option key={f.id} value={String(f.id)}>{f.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px] sm:max-w-xs ml-auto">
          <div className="relative">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar"
              className="w-full h-[40px] pl-9 pr-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] placeholder:text-gray-400 focus:outline-none focus:border-[#7CB342]"
            />
          </div>
        </div>
      </div>

      {/* Tabela — iRancho */}
      <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th rowSpan={2} className="w-10 px-2 py-2 border-r border-gray-200">
                  <Checkbox
                    checked={paginated.length > 0 && selected.size === paginated.length}
                    onCheckedChange={toggleSelectAll}
                    className="data-[state=checked]:bg-[#7CB342] data-[state=checked]:border-[#7CB342]"
                  />
                </th>
                <th rowSpan={2} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200 min-w-[180px]">
                  <button
                    type="button"
                    onClick={() => setSortAsc(v => !v)}
                    className="inline-flex items-center gap-1 hover:text-gray-900"
                  >
                    Nome do Lote
                    <span className="material-icons text-[14px] text-gray-400">
                      {sortAsc ? "arrow_upward" : "arrow_downward"}
                    </span>
                  </button>
                </th>
                <th colSpan={5} className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-b border-gray-200">
                  Machos
                </th>
                <th colSpan={5} className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-gray-200">
                  Fêmeas
                </th>
                <th rowSpan={2} className="w-24 px-2 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase border-l border-gray-200">
                  Ações
                </th>
              </tr>
              <tr className="bg-gray-50 border-b border-gray-200">
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th key={`m-${f}`} className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 border-r border-gray-100 w-12">
                    {f}
                  </th>
                ))}
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th key={`f-${f}`} className="px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 border-r border-gray-100 w-12">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>
              )}
              {!isLoading && paginated.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">Nenhum lote encontrado</td></tr>
              )}
              {paginated.map(lote => (
                <tr key={lote.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                  <td className="px-2 py-2 text-center border-r border-gray-50">
                    <Checkbox
                      checked={selected.has(lote.id)}
                      onCheckedChange={() => toggleSelect(lote.id)}
                      className="data-[state=checked]:bg-[#7CB342] data-[state=checked]:border-[#7CB342]"
                    />
                  </td>
                  <td className="px-3 py-2 border-r border-gray-50">
                    <button
                      type="button"
                      onClick={() => openEdit(lote)}
                      className="text-left font-medium text-[#2D5A5A] hover:underline"
                    >
                      {lote.nome}
                    </button>
                  </td>
                  {FAIXAS_IDADE_LOTE.map(f => (
                    <td key={`m-${lote.id}-${f}`} className="px-2 py-2 text-center text-gray-700 border-r border-gray-50 tabular-nums">
                      {celulaValor(lote.machos[f])}
                    </td>
                  ))}
                  {FAIXAS_IDADE_LOTE.map(f => (
                    <td key={`f-${lote.id}-${f}`} className="px-2 py-2 text-center text-gray-700 border-r border-gray-50 tabular-nums">
                      {celulaValor(lote.femeas[f])}
                    </td>
                  ))}
                  <td className="px-2 py-2 border-l border-gray-50">
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        title="Mover"
                        onClick={() => { const l = loteById.get(lote.id); if (l) setMoveLote(l); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Histórico"
                        onClick={() => { const l = loteById.get(lote.id); if (l) setHistoryLote(l); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Editar" onClick={() => openEdit(lote)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" title="Excluir" onClick={() => handleDeleteRequest(lote)} className="p-1 rounded hover:bg-red-50 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rodapé paginação — iRancho */}
        <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-600">
          <div className="flex items-center gap-2">
            <select
              value={perPage}
              onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
              className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px]"
            >
              <option value={10}>10 itens por página</option>
              <option value={25}>25 itens por página</option>
              <option value={50}>50 itens por página</option>
              <option value={100}>100 itens por página</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span>Mostrando {inicio}-{fim} de {total} itens</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={pageSafe <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              <span className="px-2 min-w-[24px] text-center">{pageSafe}</span>
              <button
                type="button"
                disabled={pageSafe >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="px-2 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
