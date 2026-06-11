import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Edit, AlertTriangle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { FAIXAS_IDADE_LOTE } from "@shared/lote-faixas-idade";
import type { ContagemPorFaixa } from "@shared/lote-faixas-idade";

const IRANCHO_BTN_GREEN = "#2D5A5A";

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

function lotesListUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/lotes?fazendaId=${fazendaId}` : "/rebanho/lotes";
}

function novoLoteUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/novo-lote?fazendaId=${fazendaId}` : "/rebanho/novo-lote";
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function LotsManagementPage() {
  const [, setLocation] = useLocation();
  const fazendaInicial = new URLSearchParams(window.location.search).get("fazendaId") || "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaInicial);
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
        <button
          type="button"
          onClick={() => setLocation(novoLoteUrl(fazendaFilter))}
          className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 transition"
          style={{ backgroundColor: IRANCHO_BTN_GREEN, minHeight: 40 }}
        >
          Novo Lote
        </button>

        <div className="w-full sm:w-auto sm:min-w-[200px]">
          <select
            value={fazendaFilter}
            onChange={e => {
              const v = e.target.value;
              setFazendaFilter(v);
              setPage(1);
              setLocation(lotesListUrl(v), { replace: true });
            }}
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
                <th colSpan={5} className="px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-b border-gray-200">
                  Fêmeas
                </th>
                <th rowSpan={2} className="w-16 px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                  Total
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
                <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>
              )}
              {!isLoading && paginated.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-gray-400">Nenhum lote encontrado</td></tr>
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
                      onClick={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)}
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
                  {/* Coluna Total */}
                  <td className="px-2 py-2 text-center font-semibold text-gray-800 border-l border-r border-gray-200 tabular-nums bg-gray-50/60">
                    {(() => {
                      const totalMachos = FAIXAS_IDADE_LOTE.reduce((s, f) => s + (lote.machos[f] ?? 0), 0);
                      const totalFemeas = FAIXAS_IDADE_LOTE.reduce((s, f) => s + (lote.femeas[f] ?? 0), 0);
                      const total = totalMachos + totalFemeas;
                      return total > 0 ? total : <span className="text-gray-300">—</span>;
                    })()}
                  </td>
                  <td className="px-2 py-2 border-l border-gray-50">
                    <div className="flex items-center justify-center gap-0.5">
                      <button type="button" title="Editar" onClick={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)} className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
                        <span className="material-icons text-[16px]">edit</span>
                      </button>
                      <button type="button" title="Excluir" onClick={() => handleDeleteRequest(lote)} className="p-1 text-gray-400 hover:text-red-600 transition-colors">
                        <span className="material-icons text-[16px]">delete</span>
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
