/**
 * Editar Lote
 * Rota: /rebanho/editar-lote?id=X
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FD_PRIMARY,
  FieldBox,
  FormLabel,
  FormDatePicker,
  inputClassCompact,
} from "@/components/FormFields";
import { cn } from "@/lib/utils";
import LoteAnimaisTable, { type LoteAnimalRow, type LoteAnimaisSortKey } from "@/components/lotes/LoteAnimaisTable";
import IncluirAnimaisLoteDialog from "@/components/lotes/IncluirAnimaisLoteDialog";
import MovimentarAnimaisLoteDialog from "@/components/lotes/MovimentarAnimaisLoteDialog";
import { MoveLotePastoDialog } from "@/components/MoveLotePastoDialog";
import ListExportButtons from "@/components/ListExportButtons";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Limites alinhados ao schema (drizzle/schema.ts — lotes.nome / lotes.sigla). */
const NOME_MAX = 100;
const SIGLA_MAX = 20;

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
  sortKey: "brinco",
  sortAsc: true,
  page: 1,
};

function hojeISOLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formFromLote(lote: {
  nome?: string | null;
  sigla?: string | null;
  dataCriacao?: string | null;
  createdAt?: string | Date | null;
}): FormState {
  const dataCriacao =
    lote.dataCriacao
    || (lote.createdAt ? String(lote.createdAt).slice(0, 10) : hojeISOLocal());
  return {
    nome: lote.nome || "",
    sigla: (lote.sigla || "").toUpperCase(),
    dataCriacao,
  };
}

function formsEqual(a: FormState, b: FormState) {
  return (
    a.nome.trim() === b.nome.trim()
    && a.sigla.trim().toUpperCase() === b.sigla.trim().toUpperCase()
    && a.dataCriacao === b.dataCriacao
  );
}

export default function EditLotePage() {
  const [, setLocation] = useLocation();
  const loteId = Number(new URLSearchParams(window.location.search).get("id"));

  const [form, setForm] = useState<FormState>({ nome: "", sigla: "", dataCriacao: hojeISOLocal() });
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [moverSubdivisaoOpen, setMoverSubdivisaoOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [incluirOpen, setIncluirOpen] = useState(false);
  const [movimentarOpen, setMovimentarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<{ qtdAnimais: number } | null>(null);

  const tableStorageKey = loteId > 0 ? `fd:editar-lote-tabela:${loteId}` : "fd:editar-lote-tabela";
  const [tableState, setTableState] = usePersistedState(tableStorageKey, INITIAL_TABLE);
  const [perPage, setPerPage] = useState(50);

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
    onSuccess: (_data, variables) => {
      toast.success("Alterações salvas com sucesso!");
      const next: FormState = {
        nome: variables.nome ?? form.nome,
        sigla: (variables.sigla ?? form.sigla).trim().toUpperCase(),
        dataCriacao: variables.dataCriacao ?? form.dataCriacao,
      };
      setForm(next);
      setSavedForm(next);
      utils.lotes.getById.invalidate({ id: loteId });
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.animais.list.invalidate();
      utils.animais.getById.invalidate();
    },
    onError: e => toast.error(e.message || "Não foi possível salvar as alterações."),
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

  const formRef = useRef(form);
  const savedFormRef = useRef(savedForm);
  formRef.current = form;
  savedFormRef.current = savedForm;

  useEffect(() => {
    if (!lote) return;
    const next = formFromLote(lote);
    const saved = savedFormRef.current;
    const current = formRef.current;
    const dirty = saved != null && !formsEqual(current, saved);
    // Recarregar getById (ex.: após salvar) não deve apagar edições pendentes.
    if (!dirty) {
      setForm(next);
      setSavedForm(next);
    }
  }, [lote]);

  useEffect(() => {
    setSelected(new Set());
  }, [loteId]);

  const { data: pastosData = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: lote?.fazendaId ?? 0 },
    { enabled: !!lote?.fazendaId },
  );
  const pastoMap = useMemo(() => new Map(pastosData.map(p => [p.id, p.nome])), [pastosData]);

  const { data: fazendasData = [] } = trpc.fazendas.list.useQuery();
  const fazendaNome = useMemo(() => {
    if (!lote?.fazendaId) return undefined;
    return fazendasData.find(f => f.id === lote.fazendaId)?.nome;
  }, [lote, fazendasData]);

  const animalRows = useMemo((): LoteAnimalRow[] => {
    return (animais as Array<{
      id: number;
      nome: string | null;
      brinco: string | null;
      sexo: "macho" | "femea";
      raca: string | null;
      dataNascimento: string | null;
      categoria?: string | null;
      pastoId?: number | null;
    }>).map(a => ({
      id: a.id,
      nome: a.nome,
      brinco: a.brinco,
      sexo: a.sexo,
      raca: a.raca,
      dataNascimento: a.dataNascimento,
      categoria: a.categoria ?? null,
      pastoNome: a.pastoId ? (pastoMap.get(a.pastoId) ?? null) : null,
    }));
  }, [animais, pastoMap]);

  // Mantém seleção apenas para animais ainda presentes na tabela.
  useEffect(() => {
    const ids = new Set(animalRows.map(a => a.id));
    setSelected(prev => {
      const next = new Set<number>();
      prev.forEach(id => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [animalRows]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const qtdAnimais = animais.length;
  const hasAnimais = qtdAnimais > 0;

  const isDirty = savedForm != null && !formsEqual(form, savedForm);
  const nomeValido = form.nome.trim().length > 0;
  const dataValida = Boolean(form.dataCriacao);
  const canSave = isDirty && nomeValido && dataValida && !updateMutation.isPending;

  const exportHeaders = ["Brinco", "Categoria", "Sexo", "Raça", "Subdivisão do animal"];
  const exportRows = useMemo(
    () => animalRows.map(a => [
      a.brinco?.trim() || a.nome?.trim() || String(a.id),
      a.categoria || "—",
      a.sexo === "macho" ? "Macho" : "Fêmea",
      a.raca || "—",
      a.pastoNome || "—",
    ]),
    [animalRows],
  );
  const exportTitle = `Animais do lote — ${form.nome || "Lote"}`;
  const exportFilename = `animais-lote-${(form.nome || "lote").toLowerCase().replace(/\s+/g, "-")}`;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSalvar = (e?: FormEvent) => {
    e?.preventDefault();
    if (updateMutation.isPending) return;
    if (!canSave) return;

    const nome = form.nome.trim();
    if (!nome) {
      toast.error("Nome do Lote é obrigatório");
      return;
    }
    if (!form.dataCriacao) {
      toast.error("Data de formação do lote é obrigatória");
      return;
    }

    updateMutation.mutate({
      id: loteId,
      nome,
      sigla: form.sigla.trim().toUpperCase(),
      dataCriacao: form.dataCriacao,
    });
  };

  const handleExcluirRequest = () => {
    if (hasAnimais) {
      setDeleteBlocked({ qtdAnimais });
      return;
    }
    setDeleteOpen(true);
  };

  const handleTransferirAnimais = () => {
    if (selected.size === 0) {
      toast.info("Selecione animais abaixo.");
      return;
    }
    setMovimentarOpen(true);
  };

  const handleMovimentacaoSuccess = () => {
    setSelected(new Set());
    // Atualiza só a lista de animais — não invalida getById nem reseta o formulário.
    void refetchAnimais();
  };

  const clearSelection = () => setSelected(new Set());

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Checkbox do cabeçalho: se todos visíveis marcados → limpa; senão → marca todos. */
  const toggleSelectAll = (ids: number[]) => {
    setSelected(prev => {
      const allVisibleSelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (allVisibleSelected) return new Set();
      return new Set(ids);
    });
  };

  const handleSort = (key: LoteAnimaisSortKey) => {
    // Ordenação muda o conjunto visível da página — limpa seleção oculta.
    clearSelection();
    setTableState(s => ({
      ...s,
      sortKey: key,
      sortAsc: s.sortKey === key ? !s.sortAsc : true,
      page: 1,
    }));
  };

  const handleSearchChange = (value: string) => {
    clearSelection();
    setTableState(s => ({ ...s, search: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    clearSelection();
    setTableState(s => ({ ...s, page }));
  };

  const handlePerPageChange = (pp: number) => {
    clearSelection();
    setPerPage(pp);
    setTableState(s => ({ ...s, page: 1 }));
  };

  const isBusy = updateMutation.isPending || excluirMutation.isPending;
  const pastoNomeAtual = lote?.pastoAtualId
    ? (pastosData.find(p => p.id === lote.pastoAtualId)?.nome ?? "Subdivisão")
    : null;

  if (!loteId || loteId <= 0 || Number.isNaN(loteId)) {
    return (
      <AppLayout>
        <div className="py-16 text-center space-y-3">
          <p className="text-gray-400 text-[13px]">ID do lote inválido.</p>
          <button
            type="button"
            onClick={() => setLocation("/rebanho/lotes")}
            className="text-[12px] text-[#2D5A5A] hover:underline"
          >
            Voltar para Gerenciamento de Lotes
          </button>
        </div>
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
        <div className="py-16 text-center space-y-3">
          <p className="text-gray-500 text-[13px]">Lote não encontrado.</p>
          <p className="text-gray-400 text-[11px] max-w-sm mx-auto">
            Confira se o link está correto ou volte à lista e abra o lote novamente.
          </p>
          <button
            type="button"
            onClick={() => setLocation("/rebanho/lotes")}
            className="text-[12px] text-[#2D5A5A] hover:underline"
          >
            Voltar para Gerenciamento de Lotes
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <IncluirAnimaisLoteDialog
        loteId={loteId}
        fazendaId={lote.fazendaId ?? null}
        open={incluirOpen}
        onClose={() => setIncluirOpen(false)}
        onSuccess={() => {
          setSelected(new Set());
          refetchAnimais();
        }}
      />

      <MovimentarAnimaisLoteDialog
        loteOrigemId={loteId}
        fazendaId={lote.fazendaId}
        animalIds={selectedIds}
        open={movimentarOpen}
        onClose={() => setMovimentarOpen(false)}
        onSuccess={handleMovimentacaoSuccess}
      />

      <MoveLotePastoDialog
        lote={{
          id: lote.id,
          nome: lote.nome,
          pastoAtualId: lote.pastoAtualId ?? null,
          pastoNome: pastoNomeAtual,
        }}
        open={moverSubdivisaoOpen}
        onClose={() => setMoverSubdivisaoOpen(false)}
        defaultFazendaId={lote.fazendaId ?? undefined}
        defaultPastoId={lote.pastoAtualId ?? undefined}
        onSuccess={() => {
          utils.lotes.getById.invalidate({ id: loteId });
          utils.lotes.list.invalidate();
          utils.lotes.gerenciamento.invalidate();
          utils.lotes.mapaRebanhoV2.invalidate();
          utils.lotes.mapaRebanhoHistorico.invalidate();
          utils.animais.list.invalidate();
        }}
      />

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
              Tem certeza que deseja excluir o lote{" "}
              <span className="font-semibold text-gray-900">&quot;{lote.nome}&quot;</span>?
              <br />
              <span className="text-red-600 font-medium">Esta ação não poderá ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={excluirMutation.isPending}
              className="px-4 py-2 rounded text-[11px] font-semibold uppercase bg-[#F0F0F0] text-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                if (excluirMutation.isPending) return;
                excluirMutation.mutate({ id: loteId });
              }}
              disabled={excluirMutation.isPending}
              className="inline-flex items-center justify-center px-4 py-2 rounded text-[11px] font-semibold uppercase text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {excluirMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                  Excluindo…
                </>
              ) : (
                "Excluir lote"
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteBlocked} onOpenChange={v => !v && setDeleteBlocked(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Não é possível excluir</DialogTitle>
            <DialogDescription className="text-gray-600 leading-relaxed">
              Este lote possui{" "}
              <span className="font-semibold text-amber-700">
                {deleteBlocked?.qtdAnimais}{" "}
                {deleteBlocked?.qtdAnimais === 1 ? "animal" : "animais"}
              </span>
              . Transfira ou remova os animais antes de excluir o lote.
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

      <div className="w-full space-y-3">
        {/* Cabeçalho compacto */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setLocation("/rebanho/lotes")}
            className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-[#2D5A5A] transition group shrink-0"
          >
            <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            <span>Voltar</span>
          </button>
          <h1 className="text-[15px] font-semibold text-gray-900">Editar lote</h1>
          <button
            type="button"
            onClick={() => handleSalvar()}
            disabled={!canSave}
            className={cn(
              "inline-flex items-center justify-center ml-auto px-4 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wide min-h-[40px] shrink-0 transition",
              canSave
                ? "text-gray-900 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40"
                : "text-gray-500 opacity-55 cursor-not-allowed",
            )}
            style={{ backgroundColor: canSave ? FD_PRIMARY : "#E5E7EB" }}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden />
                Salvando...
              </>
            ) : (
              "Salvar alterações"
            )}
          </button>
        </div>

        {/* Bloco 1 — informações do lote */}
        <section className="bg-white border border-gray-200 rounded-md px-4 py-3 space-y-2.5">
          <form
            onSubmit={handleSalvar}
            className="flex flex-wrap gap-2.5 items-end"
          >
            <div className="flex-1 min-w-[160px]">
              <FormLabel required className="mb-1">Nome do Lote</FormLabel>
              <FieldBox required variant="light">
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setField("nome", e.target.value)}
                  placeholder="Ex. Lote Vacas"
                  required
                  maxLength={NOME_MAX}
                  className={cn(inputClassCompact, "bg-white")}
                />
              </FieldBox>
            </div>
            <div className="w-[7.5rem]">
              <FormLabel className="mb-1">Sigla do Lote (opcional)</FormLabel>
              <FieldBox variant="light">
                <input
                  type="text"
                  value={form.sigla}
                  onChange={e => setField("sigla", e.target.value.toUpperCase())}
                  onBlur={e => setField("sigla", e.target.value.trim().toUpperCase())}
                  placeholder="L-01"
                  maxLength={SIGLA_MAX}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className={cn(inputClassCompact, "bg-white")}
                />
              </FieldBox>
            </div>
            <div className="w-40">
              <FormLabel required className="mb-1">Data de formação do lote</FormLabel>
              <FormDatePicker
                value={form.dataCriacao}
                onChange={v => setField("dataCriacao", v)}
                required
              />
            </div>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 border-t border-gray-100">
            <p className="text-[12px] text-gray-600">
              <span className="text-gray-500">Subdivisão do lote:</span>{" "}
              <span className="font-medium text-gray-800">
                {pastoNomeAtual || "Sem subdivisão"}
              </span>
              {fazendaNome ? (
                <span className="text-gray-400"> · {fazendaNome}</span>
              ) : null}
            </p>
            <button
              type="button"
              onClick={() => setMoverSubdivisaoOpen(true)}
              disabled={isBusy}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2D5A5A] hover:underline disabled:opacity-50 shrink-0"
            >
              <span className="material-icons text-[15px]" aria-hidden>swap_horiz</span>
              {lote.pastoAtualId ? "Alterar subdivisão" : "Definir subdivisão"}
            </button>
          </div>
        </section>

        {/* Bloco 2 — animais do lote */}
        <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
          <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b border-gray-100">
            <div className="flex items-center gap-2 shrink-0">
              <h2 className="text-[13px] font-semibold text-gray-800">Animais do lote</h2>
              <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 tabular-nums">
                {qtdAnimais}
              </span>
            </div>

            <div className="relative w-full sm:w-auto sm:min-w-[180px] sm:max-w-[220px] sm:ml-auto">
              <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400" aria-hidden>
                search
              </span>
              <input
                type="text"
                value={tableState.search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Buscar animais"
                aria-label="Buscar animais"
                className="w-full h-9 pl-8 pr-2.5 text-[12px] border border-gray-200 rounded-sm bg-white placeholder:text-gray-400 focus:outline-none focus:border-[#4ECDC4]"
              />
            </div>

            <button
              type="button"
              onClick={() => setIncluirOpen(true)}
              disabled={isBusy}
              className="inline-flex items-center px-3 h-9 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold uppercase tracking-wide text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/30 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
            >
              Adicionar animais
            </button>

            <ListExportButtons
              title={exportTitle}
              filename={exportFilename}
              headers={exportHeaders}
              rows={exportRows}
              fazendaNome={fazendaNome}
              variant="secondary"
              buttonLabel="Exportar"
              className="shrink-0 [&_button]:min-h-9 [&_button]:h-9"
            />
          </div>

          {selected.size > 0 && (
            <div className="px-3 py-2 flex flex-wrap items-center gap-2 bg-[#F8FAFA] border-b border-gray-100 text-[12px]">
              <span className="font-medium text-gray-700">
                {selected.size === 1
                  ? "1 animal selecionado"
                  : `${selected.size} animais selecionados`}
              </span>
              <button
                type="button"
                onClick={handleTransferirAnimais}
                disabled={isBusy || movimentarOpen}
                className="inline-flex items-center gap-1.5 px-3 h-8 min-h-8 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 hover:opacity-90 transition"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {movimentarOpen ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                    Transferindo...
                  </>
                ) : selected.size === 1 ? (
                  "Transferir 1 animal"
                ) : (
                  `Transferir ${selected.size} animais`
                )}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={isBusy || movimentarOpen}
                aria-label="Limpar seleção de animais"
                className="inline-flex items-center min-h-8 px-2 rounded text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40"
              >
                Limpar seleção
              </button>
            </div>
          )}

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
            onPageChange={handlePageChange}
            onPerPageChange={handlePerPageChange}
          />
        </section>

        {/* Exclusão discreta — scroll-margin garante visibilidade ao rolar até o fim */}
        <div className="flex flex-wrap items-center gap-2 pt-1 scroll-mt-4">
          <button
            type="button"
            onClick={handleExcluirRequest}
            disabled={isBusy || hasAnimais}
            className="text-[12px] text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            title={
              hasAnimais
                ? `Remova ou transfira os ${qtdAnimais} ${qtdAnimais === 1 ? "animal" : "animais"} antes de excluir o lote.`
                : "Excluir este lote"
            }
          >
            Excluir lote
          </button>
          {hasAnimais && (
            <span className="text-[11px] text-gray-400">
              Remova ou transfira os {qtdAnimais} {qtdAnimais === 1 ? "animal" : "animais"} antes de excluir o lote.
            </span>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
