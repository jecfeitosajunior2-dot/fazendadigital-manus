/**
 * Editar Lote
 * Rota: /rebanho/editar-lote?id=X
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
} from "@/components/FormFields";
import LoteAnimaisTable, {
  displayLoteAnimalBrinco,
  orderLoteAnimaisForTable,
  type LoteAnimalRow,
  type LoteAnimaisSortKey,
} from "@/components/lotes/LoteAnimaisTable";
import IncluirAnimaisLoteDialog from "@/components/lotes/IncluirAnimaisLoteDialog";
import MovimentarAnimaisLoteDialog from "@/components/lotes/MovimentarAnimaisLoteDialog";
import { LoteExclusaoBloqueadaDialog } from "@/components/lotes/LoteExclusaoBloqueadaDialog";
import { MoveLotePastoDialog } from "@/components/MoveLotePastoDialog";
import ListExportButtons from "@/components/ListExportButtons";
import { usePersistedState } from "@/hooks/usePersistedState";
import {
  descricaoConfirmacaoExclusaoLote,
  mensagemExclusaoLoteSucesso,
  parseExclusaoLoteBloqueada,
} from "@shared/loteExclusaoBloqueada";
import { cn } from "@/lib/utils";
import {
  avaliacaoParaDeleteBlocked,
  avaliacaoParaDeleteConfirm,
  type DeleteBlockedState,
} from "@/lib/loteExclusaoFlow";

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
  const utils = trpc.useUtils();
  const animaisSectionRef = useRef<HTMLElement>(null);

  const [form, setForm] = useState<FormState>({ nome: "", sigla: "", dataCriacao: hojeISOLocal() });
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [moverSubdivisaoOpen, setMoverSubdivisaoOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [incluirOpen, setIncluirOpen] = useState(false);
  const [movimentarOpen, setMovimentarOpen] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState | null>(null);
  const confirm = useConfirm();

  const tableStorageKey = loteId > 0 ? `fd:editar-lote-tabela:${loteId}` : "fd:editar-lote-tabela";
  const [tableState, setTableState] = usePersistedState(tableStorageKey, INITIAL_TABLE);
  const [perPage, setPerPage] = useState(50);

  const { data: lote, isLoading: loteLoading, error: loteError } = trpc.lotes.getById.useQuery(
    { id: loteId },
    { enabled: loteId > 0 },
  );

  const { data: animais = [], isLoading: animaisLoading, refetch: refetchAnimais } = trpc.animais.list.useQuery(
    { loteId, status: "ativo" },
    { enabled: loteId > 0 },
  );

  const fazendaIdLote = lote?.fazendaId ?? null;
  const { data: animaisSemLote = [] } = trpc.animais.list.useQuery(
    { fazendaId: fazendaIdLote ?? undefined, status: "ativo", apenasSemLote: true },
    { enabled: loteId > 0 && fazendaIdLote != null },
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
      toast.success(mensagemExclusaoLoteSucesso(data.nomeLote));
      utils.lotes.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      setLocation("/rebanho/lotes");
    },
    onError: e => {
      if (e.data?.code === "PRECONDITION_FAILED") {
        const parsed = parseExclusaoLoteBloqueada(e.message);
        setDeleteBlocked({
          loteId,
          nomeLote: parsed?.nomeLote ?? lote?.nome ?? "—",
          qtdAnimais: parsed?.qtdAnimais ?? animais.length,
          fazendaId: lote?.fazendaId ?? null,
        });
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

  useEffect(() => {
    if (window.location.hash !== "#animais-do-lote") return;
    if (loteLoading || !lote) return;
    animaisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loteId, animais.length, loteLoading, lote]);

  const { data: pastosData = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: lote?.fazendaId ?? 0 },
    { enabled: !!lote?.fazendaId },
  );

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
    }>).map(a => ({
      id: a.id,
      nome: a.nome,
      brinco: a.brinco,
      sexo: a.sexo,
      raca: a.raca,
      dataNascimento: a.dataNascimento,
      categoria: a.categoria ?? null,
    }));
  }, [animais]);

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

  const allLoteAnimalIds = useMemo(() => animalRows.map(a => a.id), [animalRows]);
  const filteredAnimalIds = useMemo(
    () =>
      orderLoteAnimaisForTable(animalRows, {
        search: tableState.search,
        sortAsc: tableState.sortAsc,
      }).map(a => a.id),
    [animalRows, tableState.search, tableState.sortAsc],
  );
  const selectablePoolIds = tableState.search.trim() ? filteredAnimalIds : allLoteAnimalIds;
  const allPoolSelected =
    selectablePoolIds.length > 0 && selectablePoolIds.every(id => selected.has(id));

  const selectedIds = useMemo(() => [...selected], [selected]);
  const singleSelectedAnimalId = selected.size === 1 ? selectedIds[0]! : null;
  const manejoTrocaLoteUrl = useMemo(() => {
    if (singleSelectedAnimalId == null || !lote?.fazendaId) return null;
    const params = new URLSearchParams({
      tipo: "troca-lote",
      fazendaId: String(lote.fazendaId),
      animalId: String(singleSelectedAnimalId),
    });
    return `/manejo/registros/cadastro?${params.toString()}`;
  }, [singleSelectedAnimalId, lote?.fazendaId]);
  /** Mesma sequência da tabela na tela Editar Lote (ordenação por brinco). */
  const selectedAnimaisBrincos = useMemo(() => {
    return orderLoteAnimaisForTable(animalRows, { sortAsc: tableState.sortAsc })
      .filter(a => selected.has(a.id))
      .map(a => displayLoteAnimalBrinco(a));
  }, [animalRows, selected, tableState.sortAsc]);
  const qtdAnimais = animais.length;
  const qtdSemLote = animaisSemLote.length;
  const hasAnimais = qtdAnimais > 0;
  const canIncluirSemLote = fazendaIdLote != null && qtdSemLote > 0;
  const incluirSemLoteHint = qtdSemLote === 1
    ? "Incluir 1 animal sem lote neste lote."
    : `Incluir ${qtdSemLote} animais sem lote neste lote.`;
  const pastoNomeAtual = lote?.pastoAtualId
    ? (pastosData.find(p => p.id === lote.pastoAtualId)?.nome ?? "Subdivisão")
    : null;

  const isDirty = savedForm != null && !formsEqual(form, savedForm);
  const nomeValido = form.nome.trim().length > 0;
  const dataValida = Boolean(form.dataCriacao);
  const canSave = isDirty && nomeValido && dataValida && !updateMutation.isPending;

  const exportHeaders = ["Brinco", "Categoria", "Sexo", "Raça"];
  const exportRows = useMemo(() => {
    const naturalCompare = (sa: string, sb: string) =>
      sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
    const displayBrinco = (a: LoteAnimalRow) =>
      a.brinco?.trim() || a.nome?.trim() || String(a.id);

    // Mesma ordem da tabela na tela (crescente/decrescente por brinco).
    const ordered = [...animalRows].sort((a, b) => {
      const cmp = naturalCompare(displayBrinco(a), displayBrinco(b));
      return tableState.sortAsc ? cmp : -cmp;
    });

    return ordered.map(a => [
      displayBrinco(a),
      a.categoria || "—",
      a.sexo === "macho" ? "Macho" : "Fêmea",
      a.raca || "—",
    ]);
  }, [animalRows, tableState.sortAsc]);
  const exportIdentityLine = useMemo(() => {
    const fazenda = fazendaNome || "Fazenda não informada";
    const nome = form.nome.trim() || "Lote";
    const sigla = form.sigla.trim();
    return sigla
      ? `${fazenda} — Lote: ${nome} (${sigla})`
      : `${fazenda} — Lote: ${nome}`;
  }, [fazendaNome, form.nome, form.sigla]);
  const exportFilenameBase = useMemo(() => {
    const slug = (form.nome || "lote")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "lote";
    return `animais-lote-${slug}`;
  }, [form.nome]);

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
      toast.error("Data de formação do Lote é obrigatória");
      return;
    }

    updateMutation.mutate({
      id: loteId,
      nome,
      sigla: form.sigla.trim().toUpperCase(),
      dataCriacao: form.dataCriacao,
    });
  };

  const handleExcluirRequest = async () => {
    if (isBusy || !lote) return;
    try {
      const avaliacao = await utils.lotes.verificarExclusao.fetch({ id: loteId });
      if (avaliacao.situacao === "bloqueado_animais") {
        setDeleteBlocked(avaliacaoParaDeleteBlocked(avaliacao));
        return;
      }
      const confirmState = avaliacaoParaDeleteConfirm(avaliacao);
      const ok = await confirm({
        title: "Excluir Lote",
        description: descricaoConfirmacaoExclusaoLote(confirmState.nomeLote, confirmState.fazendaNome),
        confirmText: "Excluir Lote",
        cancelText: "Cancelar",
        variant: "danger",
      });
      if (ok) excluirMutation.mutate({ id: loteId });
    } catch {
      toast.error("Não foi possível verificar a situação do Lote.");
    }
  };

  const handleGerenciarAnimaisBloqueio = () => {
    setDeleteBlocked(null);
    animaisSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTransferirAnimais = () => {
    if (selected.size < 2) {
      if (selected.size === 0) toast.info("Selecione animais abaixo.");
      return;
    }
    setMovimentarOpen(true);
  };

  const handleIrParaTrocaLoteManejo = () => {
    if (!manejoTrocaLoteUrl) {
      toast.error("Não foi possível abrir a Troca de Lote para este animal.");
      return;
    }
    setLocation(manejoTrocaLoteUrl);
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

  /** Checkbox do cabeçalho: seleciona/desmarca só os animais da página atual. */
  const toggleSelectAll = (ids: number[]) => {
    setSelected(prev => {
      const allVisibleSelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      return new Set(ids);
    });
  };

  const selectAllInPool = () => {
    setSelected(new Set(selectablePoolIds));
  };

  const showSelecionarTodosLink =
    selected.size > 1
    && !allPoolSelected
    && selectablePoolIds.length > selected.size;

  const selecionarTodosTexto = tableState.search.trim()
    ? `Selecionar todos os ${selectablePoolIds.length} resultados da busca`
    : `Selecionar todos os ${selectablePoolIds.length} animais do Lote`;

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

  if (!loteId || loteId <= 0 || Number.isNaN(loteId)) {
    return (
      <AppLayout>
        <div className="py-16 text-center space-y-3">
          <p className="text-gray-400 text-[13px]">ID do Lote inválido.</p>
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
            Confira se o link está correto ou volte à lista e abra o Lote novamente.
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
        loteNome={lote.nome}
        fazendaId={lote.fazendaId ?? null}
        fazendaNome={fazendaNome}
        open={incluirOpen}
        onClose={() => setIncluirOpen(false)}
        onSuccess={() => {
          setSelected(new Set());
          refetchAnimais();
        }}
      />

      <MovimentarAnimaisLoteDialog
        loteOrigemId={loteId}
        loteOrigemNome={lote.nome}
        subdivisaoOrigemNome={pastoNomeAtual ?? "Sem subdivisão"}
        fazendaId={lote.fazendaId}
        fazendaNome={fazendaNome}
        animalIds={selectedIds}
        animaisBrincos={selectedAnimaisBrincos}
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

      <LoteExclusaoBloqueadaDialog
        state={deleteBlocked}
        onClose={() => setDeleteBlocked(null)}
        onGerenciarAnimais={() => handleGerenciarAnimaisBloqueio()}
      />

      <button
        type="button"
        onClick={() => setLocation("/rebanho/lotes")}
        className="mb-3 flex items-center gap-0.5 text-[11px] text-gray-500"
        aria-label="Voltar"
      >
        <span className="material-icons text-[14px]">arrow_back</span>
        Voltar
      </button>

      <form onSubmit={handleSalvar} noValidate className="space-y-5">
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Editar Lote
            </h1>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <FormLabel>Fazenda</FormLabel>
              <FormInput
                variant="light"
                readOnly
                value={
                  fazendaNome
                  ?? (lote.fazendaId ? `Fazenda #${lote.fazendaId}` : "—")
                }
                onChange={() => {}}
              />
            </div>

            <div className="flex flex-row items-end gap-4">
              <div className="min-w-0 flex-1">
                <FormLabel required>Nome do Lote</FormLabel>
                <FormInput
                  variant="light"
                  required
                  value={form.nome}
                  onChange={v => setField("nome", v.slice(0, NOME_MAX))}
                  placeholder="Ex. Lote Vacas"
                />
              </div>
              <div className="w-[11.5rem] shrink-0">
                <FormLabel required>Data de formação</FormLabel>
                <FormDatePicker
                  value={form.dataCriacao}
                  onChange={v => setField("dataCriacao", v)}
                  required
                  minHeight={34}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Sigla (opcional)</FormLabel>
                <FormInput
                  variant="light"
                  value={form.sigla}
                  onChange={v => setField("sigla", v.toUpperCase().slice(0, SIGLA_MAX))}
                  onBlur={v => setField("sigla", v.trim().toUpperCase().slice(0, SIGLA_MAX))}
                  placeholder="L-01"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2 border-t border-gray-100">
              <p className="text-[12px] text-gray-600 flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-gray-500 shrink-0">Subdivisão do Lote:</span>
                {pastoNomeAtual ? (
                  <span className="font-medium text-gray-800">{pastoNomeAtual}</span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-100">
                    Sem subdivisão
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => setMoverSubdivisaoOpen(true)}
                disabled={isBusy}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#4ECDC4] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed shrink-0"
              >
                <span className="material-icons text-[16px] leading-none" aria-hidden>
                  location_on
                </span>
                {lote.pastoAtualId ? "Alterar subdivisão do Lote" : "Definir subdivisão do Lote"}
              </button>
            </div>
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end">
            <button
              type="submit"
              disabled={!canSave}
              className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90 disabled:hover:opacity-50 disabled:cursor-not-allowed"
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
        </div>

        <section
          id="animais-do-lote"
          ref={animaisSectionRef}
          className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden scroll-mt-4"
        >
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,220px)] max-w-md">
                <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-gray-400" aria-hidden>
                  search
                </span>
                <input
                  type="text"
                  value={tableState.search}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Buscar animais"
                  aria-label="Buscar animais"
                  className="box-border w-full min-h-[44px] pl-9 pr-3 text-[12px] leading-[16px] border border-gray-200 rounded-lg text-gray-700 bg-white placeholder:text-gray-400 focus:outline-none focus:border-[#4ECDC4]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 ml-auto shrink-0">
                {canIncluirSemLote ? (
                  <button
                    type="button"
                    onClick={() => setIncluirOpen(true)}
                    disabled={isBusy}
                    title={incluirSemLoteHint}
                    aria-label={incluirSemLoteHint}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3.5 rounded-lg text-[12px] font-semibold transition shrink-0 min-h-[44px]",
                      "text-[#2D6B66] bg-[#4ECDC4]/10 border border-[#4ECDC4]/25",
                      "hover:bg-[#4ECDC4]/15 active:scale-[0.97]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/30",
                      "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                    )}
                  >
                    <span className="material-icons text-[16px] text-[#4ECDC4]" aria-hidden>
                      group_add
                    </span>
                    <span className="hidden sm:inline">Incluir sem Lote</span>
                    <span className="sm:hidden">Sem Lote</span>
                    <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-[#4ECDC4]/20 text-[#2D6B66] text-[10px] font-bold tabular-nums">
                      {qtdSemLote}
                    </span>
                  </button>
                ) : null}
                <ListExportButtons
                  title="Animais do Lote"
                  filename={exportFilenameBase}
                  headers={exportHeaders}
                  rows={exportRows}
                  fazendaNome={exportIdentityLine}
                  variant="secondary"
                  buttonLabel="Exportar"
                  className="shrink-0"
                  spreadsheetSheetName="Animais do Lote"
                  spreadsheetReportTitle={() => exportIdentityLine}
                  spreadsheetAllowEmpty
                  spreadsheetBlankAfterMeta={false}
                  spreadsheetAutoFilter={false}
                  spreadsheetPlainHeader
                  spreadsheetTextCols={[0]}
                  spreadsheetColumnAligns={["center", "center", "center", "center"]}
                  pdfIncludeSpreadsheetTitle={false}
                  pdfShowRegistrosSubtitle={false}
                />
              </div>
            </div>
          </div>

          <div className="px-5 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Animais do Lote</h2>
            <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 tabular-nums">
              {qtdAnimais}
            </span>
          </div>

          {selected.size > 0 && (
            <div className="border-b border-gray-100 bg-[#F8FAFA]">
              <div className="px-5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
                <span className="font-medium text-gray-700 shrink-0">
                  {selected.size === 1
                    ? "1 animal selecionado"
                    : `${selected.size} animais selecionados`}
                </span>
                {selected.size === 1 ? (
                  <button
                    type="button"
                    onClick={handleIrParaTrocaLoteManejo}
                    disabled={isBusy || !manejoTrocaLoteUrl}
                    className="inline-flex items-center gap-1.5 px-4 h-8 min-h-8 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 hover:opacity-90 transition shrink-0"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    Troca de Lote (Manejo)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleTransferirAnimais}
                    disabled={isBusy || movimentarOpen}
                    className="inline-flex items-center gap-1.5 px-4 h-8 min-h-8 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 hover:opacity-90 transition shrink-0"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    {movimentarOpen ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        Movendo...
                      </>
                    ) : (
                      `Mover ${selected.size} animais`
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={isBusy || movimentarOpen}
                  aria-label="Limpar seleção de animais"
                  className="inline-flex items-center min-h-8 px-2 rounded text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40 shrink-0"
                >
                  Limpar seleção
                </button>
              </div>
              {showSelecionarTodosLink ? (
                <div className="px-5 py-2 border-t border-[#4ECDC4]/15 bg-[#4ECDC4]/[0.06] text-[11px] text-gray-600">
                  {selected.size === 1 ? "Este" : "Estes"}{" "}
                  {selected.size === 1 ? "é apenas 1 animal" : `são apenas ${selected.size} animais`}
                  {tableState.search.trim() ? " nesta busca" : " nesta página"}.
                  {" "}
                  <button
                    type="button"
                    onClick={selectAllInPool}
                    disabled={isBusy || movimentarOpen}
                    className="font-semibold text-[#2D6B66] hover:underline disabled:opacity-50 disabled:no-underline"
                  >
                    {selecionarTodosTexto}
                  </button>
                </div>
              ) : null}
              <p className="px-5 pb-2.5 text-[11px] text-gray-500 leading-snug">
                {selected.size === 1 ? (
                  <>
                    Troca de um animal é registrada em{" "}
                    <span className="font-medium text-gray-600">Manejo → Troca de Lote</span>.
                  </>
                ) : (
                  <>
                    Movimentação em massa é operacional. Para um animal, use{" "}
                    <span className="font-medium text-gray-600">Manejo → Troca de Lote</span>.
                  </>
                )}
              </p>
            </div>
          )}

          <LoteAnimaisTable
            animais={animalRows}
            isLoading={animaisLoading}
            search={tableState.search}
            sortKey="brinco"
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

        <div className="flex flex-wrap items-center gap-2 scroll-mt-4">
          <button
            type="button"
            onClick={handleExcluirRequest}
            disabled={isBusy}
            className="text-[12px] text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            title={
              hasAnimais
                ? `Mova os ${qtdAnimais} ${qtdAnimais === 1 ? "animal" : "animais"} para outro Lote antes de excluir o Lote.`
                : "Excluir este Lote"
            }
          >
            Excluir Lote
          </button>
          {hasAnimais && (
            <span className="text-[11px] text-gray-400">
              Mova os {qtdAnimais} {qtdAnimais === 1 ? "animal" : "animais"} para outro Lote antes de excluir o Lote.
            </span>
          )}
        </div>
      </form>
    </AppLayout>
  );
}
