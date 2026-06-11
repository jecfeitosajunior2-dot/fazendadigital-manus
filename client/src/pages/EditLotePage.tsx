/**
 * Editar Lote — cópia fiel do iRancho
 * Rota: /rebanho/editar-lote?id=X
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FormLabel, FormInput, FormDatePicker } from "@/components/FormFields";
import LoteAnimaisTable, { type LoteAnimaisSortKey } from "@/components/lotes/LoteAnimaisTable";
import IncluirAnimaisLoteDialog from "@/components/lotes/IncluirAnimaisLoteDialog";
import MovimentarAnimaisLoteDialog from "@/components/lotes/MovimentarAnimaisLoteDialog";
import ListExportButtons from "@/components/ListExportButtons";
import { usePersistedState } from "@/hooks/usePersistedState";
import { formatDateBR } from "@/lib/date-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

const IRANCHO_BTN_GREEN = "#2D5A5A";
const IRANCHO_BTN_GREY = "#C0C0C0";
const IRANCHO_BTN_DANGER = "#dc2626";

type FormState = {
  nome: string;
  sigla: string;
  dataCriacao: string;
};

type TableState = {
  search: string;
  sortKey: LoteAnimaisSortKey;
  sortAsc: boolean;
  page: number;
};

const INITIAL_TABLE: TableState = {
  search: "",
  sortKey: "id",
  sortAsc: true,
  page: 1,
};

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function EditLotePage() {
  const [, setLocation] = useLocation();
  const loteId = Number(new URLSearchParams(window.location.search).get("id"));

  const [form, setForm] = useState<FormState>({ nome: "", sigla: "", dataCriacao: hojeISO() });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [incluirOpen, setIncluirOpen] = useState(false);
  const [movimentarOpen, setMovimentarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<{ qtdAnimais: number } | null>(null);

  const tableStorageKey = loteId > 0 ? `fd:editar-lote-tabela:${loteId}` : "fd:editar-lote-tabela";
  const [tableState, setTableState] = usePersistedState(tableStorageKey, INITIAL_TABLE);
  const perPage = 50;

  const utils = trpc.useUtils();
  const { data: lote, isLoading: loteLoading, error: loteError } = trpc.lotes.getById.useQuery(
    { id: loteId },
    { enabled: loteId > 0 },
  );

  const { data: animais = [], isLoading: animaisLoading, refetch: refetchAnimais } = trpc.animais.list.useQuery(
    { loteId, status: "ativo" },
    { enabled: loteId > 0 },
  );

  const updateMutation = trpc.lotes.update.useMutation({
    onSuccess: () => {
      toast.success("Informações do lote salvas com sucesso!");
      utils.lotes.getById.invalidate({ id: loteId });
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const excluirMutation = trpc.lotes.excluir.useMutation({
    onSuccess: data => {
      toast.success(`Lote "${data.nomeLote}" excluído com sucesso.`);
      setDeleteOpen(false);
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation("/rebanho/lotes");
    },
    onError: e => {
      if (e.data?.code === "PRECONDITION_FAILED") {
        setDeleteOpen(false);
        const match = e.message.match(/(\d+) animal/);
        setDeleteBlocked({ qtdAnimais: match ? Number(match[1]) : animais.length });
        return;
      }
      toast.error(e.message);
    },
  });

  useEffect(() => {
    if (!lote) return;
    const dataCriacao = lote.dataCriacao
      || (lote.createdAt ? String(lote.createdAt).slice(0, 10) : hojeISO());
    setForm({
      nome: lote.nome || "",
      sigla: lote.sigla || "",
      dataCriacao,
    });
  }, [lote]);

  const animalRows = useMemo(
    () => animais.map(a => ({
      id: a.id,
      nome: a.nome,
      brinco: a.brinco,
      sexo: a.sexo,
      raca: a.raca,
      dataNascimento: a.dataNascimento,
    })),
    [animais],
  );

  const selectedIds = useMemo(() => [...selected], [selected]);

  const exportHeaders = ["ID", "Nome", "Sexo", "Raça", "Nascimento"];
  const exportRows = useMemo(
    () => animalRows.map(a => [
      String(a.id),
      a.nome?.trim() || a.brinco?.trim() || "—",
      a.sexo === "macho" ? "macho" : "fêmea",
      a.raca || "—",
      formatDateBR(a.dataNascimento),
    ]),
    [animalRows],
  );
  const exportTitle = `Editar Lote — ${form.nome || "Lote"}`;
  const exportFilename = `editar-lote-${(form.nome || "lote").toLowerCase().replace(/\s+/g, "-")}`;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSalvar = () => {
    if (!form.nome.trim()) {
      toast.error("Nome do Lote é obrigatório");
      return;
    }
    if (!form.dataCriacao) {
      toast.error("Data de criação é obrigatória");
      return;
    }
    updateMutation.mutate({
      id: loteId,
      nome: form.nome.trim(),
      sigla: form.sigla.trim(),
      dataCriacao: form.dataCriacao,
    });
  };

  const handleExcluirRequest = () => {
    if (animais.length > 0) {
      setDeleteBlocked({ qtdAnimais: animais.length });
      return;
    }
    setDeleteOpen(true);
  };

  const handleMovimentarAnimais = () => {
    if (selected.size === 0) {
      toast.info("Selecione animais abaixo.");
      return;
    }
    setMovimentarOpen(true);
  };

  const handleMovimentacaoSuccess = () => {
    setSelected(new Set());
    refetchAnimais();
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: number[]) => {
    const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...ids]));
    }
  };

  const handleSort = (key: LoteAnimaisSortKey) => {
    setTableState(s => ({
      ...s,
      sortKey: key,
      sortAsc: s.sortKey === key ? !s.sortAsc : true,
      page: 1,
    }));
  };

  const isBusy = updateMutation.isPending || excluirMutation.isPending;

  if (!loteId || loteId <= 0) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-gray-400 text-[13px]">ID do lote inválido.</div>
      </AppLayout>
    );
  }

  if (loteLoading) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-gray-400 text-[13px]">Carregando...</div>
      </AppLayout>
    );
  }

  if (loteError || !lote) {
    return (
      <AppLayout>
        <div className="py-16 text-center text-gray-400 text-[13px]">Lote não encontrado.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <IncluirAnimaisLoteDialog
        loteId={loteId}
        open={incluirOpen}
        onClose={() => setIncluirOpen(false)}
        onSuccess={() => refetchAnimais()}
      />

      <MovimentarAnimaisLoteDialog
        loteOrigemId={loteId}
        fazendaId={lote.fazendaId}
        animalIds={selectedIds}
        open={movimentarOpen}
        onClose={() => setMovimentarOpen(false)}
        onSuccess={handleMovimentacaoSuccess}
      />

      {/* Confirmação exclusão */}
      <Dialog open={deleteOpen} onOpenChange={v => !v && setDeleteOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-gray-900">Excluir lote</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed">
              Tem certeza que deseja excluir este lote?
              <br />
              <span className="text-red-600 font-medium">Esta ação não poderá ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={excluirMutation.isPending}
              className="px-4 py-2 rounded text-[11px] font-semibold uppercase bg-[#F0F0F0] text-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => excluirMutation.mutate({ id: loteId })}
              disabled={excluirMutation.isPending}
              className="px-4 py-2 rounded text-[11px] font-semibold uppercase text-white"
              style={{ backgroundColor: IRANCHO_BTN_DANGER }}
            >
              {excluirMutation.isPending ? "Excluindo…" : "Excluir Lote"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bloqueio exclusão com animais */}
      <Dialog open={!!deleteBlocked} onOpenChange={v => !v && setDeleteBlocked(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Não é possível excluir</DialogTitle>
            <DialogDescription className="text-gray-600 leading-relaxed">
              Este lote possui{" "}
              <span className="font-semibold text-amber-700">
                {deleteBlocked?.qtdAnimais} {deleteBlocked?.qtdAnimais === 1 ? "animal vinculado" : "animais vinculados"}
              </span>.
              Movimente os animais para outro lote antes de excluí-lo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeleteBlocked(null)}
              className="w-full px-4 py-2 rounded text-[11px] font-semibold uppercase bg-[#8ab83d] text-white"
            >
              Entendi
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="w-full">
        <button
          onClick={() => setLocation("/rebanho/lotes")}
          className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-[#2D5A5A] transition mb-3 group"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span>Voltar</span>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-[15px] font-semibold text-gray-900">Editar Lote</h1>
          <ListExportButtons
            title={exportTitle}
            filename={exportFilename}
            headers={exportHeaders}
            rows={exportRows}
          />
        </div>

        {/* Cabeçalho horizontal — iRancho */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <FormLabel required>Nome do Lote</FormLabel>
            <FormInput
              value={form.nome}
              onChange={v => setField("nome", v)}
              placeholder="Ex. Lote Vacas"
              required
              compact
            />
          </div>
          <div>
            <FormLabel>Sigla do Lote</FormLabel>
            <FormInput
              value={form.sigla}
              onChange={v => setField("sigla", v)}
              placeholder="Sigla"
              compact
            />
          </div>
          <div>
            <FormLabel required>Data de criação do Lote</FormLabel>
            <FormDatePicker
              value={form.dataCriacao}
              onChange={v => setField("dataCriacao", v)}
              required
            />
          </div>
        </div>

        {/* Ações principais — iRancho */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={handleSalvar}
            disabled={isBusy}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_GREEN, minHeight: 40 }}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar Informações do Lote"}
          </button>
          <button
            type="button"
            onClick={() => setIncluirOpen(true)}
            disabled={isBusy}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
          >
            Incluir Animais no Lote
          </button>
          <button
            type="button"
            onClick={handleMovimentarAnimais}
            disabled={isBusy}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
          >
            Movimentar Animais
          </button>
          <button
            type="button"
            onClick={handleExcluirRequest}
            disabled={isBusy}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50 transition"
            style={{ backgroundColor: IRANCHO_BTN_DANGER, minHeight: 40 }}
          >
            Excluir Lote
          </button>

          <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:max-w-xs ml-auto">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              type="text"
              value={tableState.search}
              onChange={e => setTableState(s => ({ ...s, search: e.target.value, page: 1 }))}
              placeholder="Buscar"
              className="w-full h-[40px] pl-9 pr-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] placeholder:text-gray-400 focus:outline-none focus:border-[#8ab83d]"
            />
          </div>
        </div>

        <LoteAnimaisTable
          animais={animalRows}
          isLoading={animaisLoading}
          search={tableState.search}
          sortKey={tableState.sortKey}
          sortAsc={tableState.sortAsc}
          onSort={handleSort}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          page={tableState.page}
          perPage={perPage}
          onPageChange={page => setTableState(s => ({ ...s, page }))}
        />
      </div>
    </AppLayout>
  );
}
