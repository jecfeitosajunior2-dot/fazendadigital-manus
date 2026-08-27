import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FormDatePicker, FormLabel } from "@/components/FormFields";
import ListExportButtons from "@/components/ListExportButtons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, {
  type TablePageSize,
} from "@/components/TablePaginationFooter";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { formatDateBR } from "@/lib/date-utils";
import { useConfirm } from "@/components/ConfirmDialog";
import { DeleteActionIcon, EditActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import {
  descricaoServicoParaListagem,
  isDescricaoServicoValida,
} from "@shared/manutencaoDescricao";

const FD_PRIMARY = "#4ECDC4";

const TIPOS_CADASTRO = ["Preventiva", "Corretiva"] as const;

type SortKey = "data" | "valor" | "maquina" | "tipo";

type Filtros = {
  tipo: string;
  maquinaId: string;
  dataInicio: string;
  dataFim: string;
  prestador: string;
  comCusto: "" | "com" | "sem";
};

const FILTROS_VAZIOS: Filtros = {
  tipo: "",
  maquinaId: "",
  dataInicio: "",
  dataFim: "",
  prestador: "",
  comCusto: "",
};

function dataISO(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : "";
}

function formatMoney(value: unknown): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

function responsavelManutencaoListagem(
  prestadorNome?: string | null,
  oficina?: string | null,
): string {
  const nome = String(prestadorNome ?? "").trim();
  const ofc = String(oficina ?? "").trim();
  if (nome && ofc && nome.toLowerCase() !== ofc.toLowerCase()) {
    return `${nome} · ${ofc}`;
  }
  return nome || ofc || "Responsável não informado";
}

/** Sublinha da máquina: marca / modelo / identificação — sem categoria genérica. */
function sublinhaMaquinaListagem(maquina?: {
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  numeroSerie?: string | null;
  codigo?: string | null;
  identificacao?: string | null;
} | null): string {
  if (!maquina) return "";
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const raw of [
    maquina.marca,
    maquina.modelo,
    maquina.placa,
    maquina.codigo,
    maquina.numeroSerie,
    maquina.identificacao,
  ]) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(v);
  }
  return parts.join(" · ");
}

function maquinaAtiva(m: { status?: string | null; dataDesativacao?: unknown }): boolean {
  if (m.dataDesativacao) return false;
  return String(m.status || "").toLowerCase() !== "inativo";
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <span
      className={cn(
        "material-icons text-[14px] leading-none",
        active ? "text-gray-600" : "text-gray-300",
      )}
      aria-hidden
    >
      {asc ? "arrow_drop_up" : "arrow_drop_down"}
    </span>
  );
}

function EmptyTotal() {
  return (
    <div className="text-center">
      <img
        src="/assets/icon-maquina-trator-green.png"
        alt=""
        width={48}
        height={48}
        className="mx-auto mb-3"
        aria-hidden
        style={{
          objectFit: "contain",
          filter:
            "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
        }}
      />
      <h2 className="text-[16px] font-semibold text-gray-900">Nenhuma manutenção registrada.</h2>
      <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
        Registre a primeira manutenção para acompanhar serviços, custos e disponibilidade das
        máquinas.
      </p>
    </div>
  );
}

export default function ManutencaoListPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [filtroFazenda, setFiltroFazenda] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [search, setSearch] = useState("");
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: registros = [], isLoading, refetch } = trpc.manutencoes.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast.success("Atualizado!");
    },
    enabled: true,
  });

  const deleteMutation = trpc.manutencoes.delete.useMutation({
    onSuccess: () => {
      toast.success("Manutenção excluída com sucesso.");
      utils.manutencoes.list.invalidate();
      utils.estoque.listByCategories.invalidate();
      utils.estoque.list.invalidate();
    },
  });

  const handleDelete = async (id: number) => {
    if (deleteMutation.isPending) return;

    let temConsumoEstoque = false;
    try {
      const pecas = await utils.manutencoes.listPecas.fetch({ manutencaoId: id });
      temConsumoEstoque = pecas.some(
        p => p.estoqueId != null && Number(p.quantidade) > 0,
      );
    } catch {
      temConsumoEstoque = false;
    }

    const description = temConsumoEstoque
      ? "Tem certeza de que deseja excluir esta manutenção? Os produtos e peças vinculados serão devolvidos ao estoque conforme a regra atual. Esta ação não poderá ser desfeita."
      : "Tem certeza de que deseja excluir esta manutenção? Esta ação não poderá ser desfeita.";

    await confirm({
      title: "Excluir manutenção",
      description,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
      errorFallbackMessage:
        "Não foi possível excluir a manutenção. Nenhuma alteração foi realizada.",
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync({ id });
        } catch {
          throw new Error(
            "Não foi possível excluir a manutenção. Nenhuma alteração foi realizada.",
          );
        }
      },
    });
  };

  const fazendasAtivas = useMemo(
    () =>
      [...fazendas]
        .filter(f => f?.id != null && String(f.nome || "").trim())
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [fazendas],
  );

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendasAtivas.length) {
      persistRebanhoFazendaId("");
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendasAtivas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    if (!fromStorage) persistRebanhoFazendaId("");
    const resolved =
      fromStorage || (fazendasAtivas.length === 1 ? String(fazendasAtivas[0]!.id) : "");
    if (resolved) {
      setFiltroFazenda(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendasAtivas, fazendaInitDone, loadingFazendas]);

  const fazendaSelecionada = Boolean(filtroFazenda);
  const fazendaSelecionadaNome = useMemo(
    () => fazendasAtivas.find(f => String(f.id) === filtroFazenda)?.nome,
    [fazendasAtivas, filtroFazenda],
  );

  const limparFiltrosSecundarios = () => {
    setFiltros(FILTROS_VAZIOS);
    setAplicados(FILTROS_VAZIOS);
    setSearch("");
    setMaisFiltros(false);
    setPage(1);
  };

  const onChangeFazenda = (value: string) => {
    setFiltroFazenda(value);
    if (value) persistRebanhoFazendaId(value);
    else persistRebanhoFazendaId("");
    limparFiltrosSecundarios();
  };

  const aplicarFiltros = () => {
    if (!fazendaSelecionada) return;
    if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
      toast.error("Data inicial não pode ser maior que a data final.");
      return;
    }
    setAplicados({ ...filtros });
    setPage(1);
  };

  const limparFiltros = () => {
    limparFiltrosSecundarios();
  };

  const irParaCadastro = () => {
    if (!filtroFazenda) {
      toast.error("Selecione uma fazenda antes de registrar uma manutenção.");
      return;
    }
    setLocation(
      `/maquinas/manutencao/cadastro?fazendaId=${encodeURIComponent(filtroFazenda)}`,
    );
  };

  const maquinaMap = useMemo(() => {
    const m = new Map<number, (typeof maquinas)[0]>();
    maquinas.forEach(item => m.set(item.id, item));
    return m;
  }, [maquinas]);

  const maquinasDaFazenda = useMemo(() => {
    if (!filtroFazenda) return [];
    return [...maquinas]
      .filter(m => String(m.fazendaId) === filtroFazenda)
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  }, [maquinas, filtroFazenda]);

  /** Histórico: ativas + inativas que já possuem manutenção nesta fazenda. */
  const maquinasOpcoesFiltro = useMemo(() => {
    if (!filtroFazenda) return [];
    const idsComManut = new Set(
      registros
        .filter(r => {
          const m = maquinaMap.get(r.maquinaId);
          return m && String(m.fazendaId) === filtroFazenda;
        })
        .map(r => r.maquinaId),
    );
    return maquinasDaFazenda.filter(m => maquinaAtiva(m) || idsComManut.has(m.id));
  }, [maquinasDaFazenda, registros, maquinaMap, filtroFazenda]);

  const tiposOpcoes = useMemo(() => {
    const set = new Set<string>(TIPOS_CADASTRO);
    registros.forEach(r => {
      const m = maquinaMap.get(r.maquinaId);
      if (filtroFazenda && String(m?.fazendaId) !== filtroFazenda) return;
      if (r.tipo?.trim()) set.add(r.tipo.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros, maquinaMap, filtroFazenda]);

  const prestadoresOpcoes = useMemo(() => {
    const set = new Set<string>();
    registros.forEach(r => {
      const m = maquinaMap.get(r.maquinaId);
      if (filtroFazenda && String(m?.fazendaId) !== filtroFazenda) return;
      const nome = (r.prestadorNome ?? r.oficina ?? "").trim();
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros, maquinaMap, filtroFazenda]);

  const registrosDaFazenda = useMemo(() => {
    if (!filtroFazenda) return [];
    return registros.filter(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      return String(maquina?.fazendaId) === filtroFazenda;
    });
  }, [registros, maquinaMap, filtroFazenda]);

  const filtered = useMemo(() => {
    if (!filtroFazenda) return [];
    if (aplicados.dataInicio && aplicados.dataFim && aplicados.dataInicio > aplicados.dataFim) {
      return [];
    }

    const q = search.trim().toLowerCase();

    return registrosDaFazenda.filter(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const dataStr = dataISO(r.data);

      if (aplicados.maquinaId && String(r.maquinaId) !== aplicados.maquinaId) return false;
      if (aplicados.tipo && r.tipo !== aplicados.tipo) return false;
      if (aplicados.dataInicio && dataStr && dataStr < aplicados.dataInicio) return false;
      if (aplicados.dataFim && dataStr && dataStr > aplicados.dataFim) return false;
      if (aplicados.prestador) {
        const prest = (r.prestadorNome ?? r.oficina ?? "").trim();
        if (prest !== aplicados.prestador) return false;
      }
      if (aplicados.comCusto === "com") {
        const total = parseFloat(String(r.valorTotal ?? 0));
        if (!(total > 0)) return false;
      }
      if (aplicados.comCusto === "sem") {
        const total = parseFloat(String(r.valorTotal ?? 0));
        if (total > 0) return false;
      }

      if (q) {
        const blob = [
          maquina?.nome ?? "",
          maquina?.placa ?? "",
          (maquina as { numeroSerie?: string | null })?.numeroSerie ?? "",
          r.tipo ?? "",
          r.descricao ?? "",
          r.oficina ?? "",
          r.prestadorNome ?? "",
          r.observacoes ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }

      return true;
    });
  }, [filtroFazenda, registrosDaFazenda, aplicados, search, maquinaMap]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const ma = maquinaMap.get(a.maquinaId);
      const mb = maquinaMap.get(b.maquinaId);
      let cmp = 0;
      if (sortKey === "data") {
        cmp = dataISO(a.data).localeCompare(dataISO(b.data));
      } else if (sortKey === "valor") {
        cmp =
          (parseFloat(String(a.valorTotal ?? 0)) || 0) -
          (parseFloat(String(b.valorTotal ?? 0)) || 0);
      } else if (sortKey === "maquina") {
        cmp = (ma?.nome ?? "").localeCompare(mb?.nome ?? "", "pt-BR");
      } else if (sortKey === "tipo") {
        cmp = (a.tipo ?? "").localeCompare(b.tipo ?? "", "pt-BR");
      }
      if (cmp === 0) cmp = b.id - a.id;
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortAsc, maquinaMap]);

  const totalCusto = useMemo(
    () =>
      sorted.reduce((acc, r) => {
        const v = parseFloat(String(r.valorTotal ?? 0));
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    [sorted],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const emptySemFazenda = fazendaInitDone && !fazendaSelecionada;
  const emptyTotal =
    !isLoading && fazendaSelecionada && registrosDaFazenda.length === 0;
  const emptyFiltro =
    !isLoading &&
    fazendaSelecionada &&
    registrosDaFazenda.length > 0 &&
    filtered.length === 0;
  const exportDisabled = !fazendaSelecionada || sorted.length === 0;

  const tituloQuadro = fazendaSelecionadaNome
    ? `Manutenções — ${fazendaSelecionadaNome}`
    : "Manutenções";

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(key === "maquina" || key === "tipo");
    }
  };

  const exportHeaders = [
    "Data",
    "Máquina",
    "Identificação",
    "Tipo",
    "Serviço",
    "Responsável",
    "Valor total",
  ];

  const exportData = useMemo(() => {
    const detailRows = sorted.map(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const ident = sublinhaMaquinaListagem(
        maquina as {
          marca?: string | null;
          modelo?: string | null;
          placa?: string | null;
          numeroSerie?: string | null;
          codigo?: string | null;
          identificacao?: string | null;
        } | null,
      );
      return [
        formatDateBR(r.data),
        maquina?.nome ?? `#${r.maquinaId}`,
        ident,
        r.tipo ?? "",
        descricaoServicoParaListagem(r.descricao),
        responsavelManutencaoListagem(r.prestadorNome, r.oficina),
        r.valorTotal != null ? formatMoney(r.valorTotal) : "",
      ];
    });

    if (detailRows.length === 0) return detailRows;

    const valorTotal = sorted.reduce((acc, r) => {
      const v = parseFloat(String(r.valorTotal ?? 0));
      return acc + (Number.isFinite(v) ? v : 0);
    }, 0);

    return [
      ...detailRows,
      ["Totais", "", "", "", "", "", formatMoney(valorTotal)],
    ];
  }, [sorted, maquinaMap]);

  const exportTitleLine = useMemo(() => {
    const fazenda = (fazendaSelecionadaNome || "").trim() || "Fazenda";
    return `${fazenda} — Manutenções`;
  }, [fazendaSelecionadaNome]);

  const exportFilenameBase = useMemo(() => {
    const nome = (fazendaSelecionadaNome || "manutencoes")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "manutencoes";
    return `manutencoes-${nome}`;
  }, [fazendaSelecionadaNome]);

  const selectClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const inputClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div ref={containerRef} className="space-y-3">
        {fazendaInitDone && (
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Fazenda</label>
                <select
                  value={filtroFazenda}
                  onChange={e => onChangeFazenda(e.target.value)}
                  className={selectClass}
                  aria-label="Filtrar por fazenda"
                >
                  <option value="">Selecione uma fazenda</option>
                  {fazendasAtivas.map(f => (
                    <option key={f.id} value={String(f.id)}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Máquina</label>
                <select
                  value={filtros.maquinaId}
                  onChange={e => setFiltros(f => ({ ...f, maquinaId: e.target.value }))}
                  className={selectClass}
                  disabled={!fazendaSelecionada}
                  title={!fazendaSelecionada ? disabledHint : undefined}
                >
                  <option value="">
                    {fazendaSelecionada
                      ? "Todas as máquinas"
                      : "Selecione primeiro uma Fazenda"}
                  </option>
                  {maquinasOpcoesFiltro.map(m => (
                    <option key={m.id} value={String(m.id)}>
                      {m.nome}
                      {!maquinaAtiva(m) ? " (Inativa)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                className={cn(!fazendaSelecionada && "opacity-60 pointer-events-none")}
                title={!fazendaSelecionada ? disabledHint : undefined}
              >
                <FormLabel>Data inicial</FormLabel>
                <FormDatePicker
                  value={filtros.dataInicio}
                  onChange={v => setFiltros(f => ({ ...f, dataInicio: v }))}
                />
              </div>
              <div
                className={cn(!fazendaSelecionada && "opacity-60 pointer-events-none")}
                title={!fazendaSelecionada ? disabledHint : undefined}
              >
                <FormLabel>Data final</FormLabel>
                <FormDatePicker
                  value={filtros.dataFim}
                  onChange={v => setFiltros(f => ({ ...f, dataFim: v }))}
                />
              </div>
            </div>

            <div className="mt-3">
              <label className={labelClass}>Buscar</label>
              <div className="relative">
                <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-gray-400">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar máquina, serviço, responsável ou documento"
                  className={`${inputClass} pl-8`}
                  disabled={!fazendaSelecionada}
                  title={!fazendaSelecionada ? disabledHint : undefined}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMaisFiltros(o => !o)}
                disabled={!fazendaSelecionada}
                title={!fazendaSelecionada ? disabledHint : undefined}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-600 min-h-[34px] px-2"
              >
                <span className="material-icons text-[16px]">
                  {maisFiltros ? "expand_less" : "expand_more"}
                </span>
                Mais filtros
              </button>
              <button
                type="button"
                onClick={limparFiltros}
                disabled={!fazendaSelecionada}
                title={!fazendaSelecionada ? disabledHint : undefined}
                className="px-4 py-1.5 rounded text-[12px] font-semibold border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white min-h-[34px]"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={aplicarFiltros}
                disabled={!fazendaSelecionada}
                title={!fazendaSelecionada ? disabledHint : undefined}
                className="px-5 py-1.5 rounded text-[12px] font-semibold text-white hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[34px]"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                Filtrar
              </button>
            </div>

            {maisFiltros && fazendaSelecionada && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Tipo</label>
                  <select
                    value={filtros.tipo}
                    onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    {tiposOpcoes.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Responsável</label>
                  <select
                    value={filtros.prestador}
                    onChange={e => setFiltros(f => ({ ...f, prestador: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    {prestadoresOpcoes.map(nome => (
                      <option key={nome} value={nome}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Custo</label>
                  <select
                    value={filtros.comCusto}
                    onChange={e =>
                      setFiltros(f => ({
                        ...f,
                        comCusto: e.target.value as Filtros["comCusto"],
                      }))
                    }
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    <option value="com">Com custo</option>
                    <option value="sem">Sem custo</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {tituloQuadro}
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={irParaCadastro}
                disabled={!fazendaSelecionada}
                title={
                  fazendaSelecionada
                    ? "Nova Manutenção"
                    : "Selecione uma fazenda para registrar manutenções."
                }
                className="inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 min-h-[44px]"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                <span className="material-icons text-[16px]">add</span>
                Nova Manutenção
              </button>
              <ListExportButtons
                title={tituloQuadro}
                filename={exportFilenameBase}
                headers={exportHeaders}
                rows={fazendaSelecionada ? exportData : []}
                fazendaNome={fazendaSelecionadaNome}
                variant="secondary"
                disabled={exportDisabled}
                disabledTitle={
                  !fazendaSelecionada
                    ? "Selecione uma fazenda para exportar."
                    : "Nenhuma manutenção disponível para exportação."
                }
                spreadsheetSheetName="Manutenções"
                spreadsheetReportTitle={() => exportTitleLine}
                spreadsheetBlankAfterMeta={false}
                spreadsheetAutoFilter={false}
                spreadsheetPlainHeader
                spreadsheetTextCols={[0, 1, 2, 3, 4, 5]}
                spreadsheetColumnAligns={[
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                ]}
                pdfHeaders={exportHeaders}
                pdfRows={fazendaSelecionada ? exportData : []}
                pdfColumnAligns={[
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                ]}
                pdfShowRegistrosSubtitle={false}
                pdfIncludeSpreadsheetTitle={false}
                pdfLandscape
              />
            </div>
          </div>

          {emptySemFazenda ? (
            <div className="py-14 px-6 text-center">
              <img
                src="/assets/icon-maquina-trator-green.png"
                alt=""
                width={48}
                height={48}
                className="mx-auto mb-3"
                aria-hidden
                style={{
                  objectFit: "contain",
                  filter:
                    "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
                }}
              />
              <h2 className="text-[16px] font-semibold text-gray-900">
                Selecione uma fazenda para visualizar as manutenções.
              </h2>
              <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
                Selecione uma fazenda no filtro acima para consultar, registrar e exportar
                manutenções.
              </p>
            </div>
          ) : emptyTotal ? (
            <div className="py-14 px-6">
              <EmptyTotal />
            </div>
          ) : emptyFiltro ? (
            <div className="py-14 px-6 text-center">
              <span className="material-icons text-[40px] text-gray-300 block mb-3">search_off</span>
              <h2 className="text-[16px] font-semibold text-gray-900">
                Nenhuma manutenção encontrada com os filtros aplicados.
              </h2>
              <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
                Revise os filtros ou limpe a busca para visualizar outros registros.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          ) : (
            <TableHorizontalScroll
              fitWidth
              footer={
                !isLoading && sorted.length > 0 ? (
                  <div className="border-t border-gray-100">
                    <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                      <span>
                        Valor total:{" "}
                        <span className="font-semibold text-gray-800 tabular-nums">
                          {formatMoney(totalCusto)}
                        </span>
                      </span>
                    </div>
                    <TablePaginationFooter
                      pageSize={pageSize}
                      page={page}
                      totalItems={sorted.length}
                      onPageChange={setPage}
                      onPageSizeChange={size => {
                        setPageSize(size);
                        setPage(1);
                      }}
                      itemLabel="manutenções"
                    />
                  </div>
                ) : null
              }
            >
              <table className="w-full min-w-[860px] table-fixed text-[12px] border-collapse">
                <colgroup>
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "110px" }} />
                  <col />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "88px" }} />
                </colgroup>
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort("data")}
                        className="inline-flex items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mx-auto"
                      >
                        Data
                        <SortIcon active={sortKey === "data"} asc={sortAsc} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort("maquina")}
                        className="inline-flex items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mx-auto"
                      >
                        Máquina
                        <SortIcon active={sortKey === "maquina"} asc={sortAsc} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleSort("tipo")}
                        className="inline-flex items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mx-auto"
                      >
                        Tipo
                        <SortIcon active={sortKey === "tipo"} asc={sortAsc} />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Serviço / Responsável
                    </th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort("valor")}
                        className="inline-flex items-center justify-center gap-0.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap mx-auto"
                      >
                        Custo total
                        <SortIcon active={sortKey === "valor"} asc={sortAsc} />
                      </button>
                    </th>
                    <th className="px-3 py-3 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-gray-400">
                        Carregando...
                      </td>
                    </tr>
                  ) : (
                    pageItems.map(r => {
                      const maquina = maquinaMap.get(r.maquinaId);
                      const subMaquina = sublinhaMaquinaListagem(
                        maquina as {
                          marca?: string | null;
                          modelo?: string | null;
                          placa?: string | null;
                          numeroSerie?: string | null;
                          codigo?: string | null;
                          identificacao?: string | null;
                        } | null,
                      );
                      const servico = descricaoServicoParaListagem(r.descricao);
                      const servicoFallback = !isDescricaoServicoValida(r.descricao);
                      const responsavel = responsavelManutencaoListagem(
                        r.prestadorNome,
                        r.oficina,
                      );
                      return (
                        <tr
                          key={r.id}
                          className="border-b border-gray-100 hover:bg-[#4ECDC414] transition-colors group"
                        >
                          <td className="px-4 py-3 text-center text-gray-800 tabular-nums whitespace-nowrap align-middle">
                            {formatDateBR(r.data)}
                          </td>
                          <td className="px-4 py-3 align-middle text-left min-w-0">
                            <div className="font-semibold text-gray-900 leading-tight truncate" title={maquina?.nome}>
                              {maquina?.nome ?? `#${r.maquinaId}`}
                            </div>
                            {subMaquina ? (
                              <div
                                className="text-[11px] text-gray-500 leading-tight truncate mt-0.5"
                                title={subMaquina}
                              >
                                {subMaquina}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-center align-middle">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-100">
                              {r.tipo ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-middle text-center min-w-0">
                            <div
                              className={cn(
                                "leading-tight truncate",
                                servicoFallback ? "text-gray-400" : "text-gray-800",
                              )}
                              title={servico}
                            >
                              {servico}
                            </div>
                            <div
                              className="text-[11px] text-gray-500 leading-tight truncate mt-0.5"
                              title={responsavel}
                            >
                              {responsavel}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-gray-900 font-medium tabular-nums whitespace-nowrap align-middle">
                            {formatMoney(r.valorTotal)}
                          </td>
                          <td className="px-3 py-3 align-middle text-center" onClick={e => e.stopPropagation()}>
                            <div className="inline-flex items-center justify-center gap-0.5">
                              <TableIconButton
                                label="Editar"
                                onClick={() =>
                                  setLocation(`/maquinas/manutencao/cadastro?id=${r.id}`)
                                }
                                tone="neutral"
                                compact
                              >
                                <EditActionIcon size={16} />
                              </TableIconButton>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="grid place-items-center h-7 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                                    aria-label="Mais ações"
                                    title="Mais ações"
                                  >
                                    <span className="material-icons text-[16px]" aria-hidden>
                                      more_vert
                                    </span>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[160px] z-[100]">
                                  <DropdownMenuItem
                                    className="text-[12px] cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onSelect={() => handleDelete(r.id)}
                                  >
                                    <DeleteActionIcon size={16} />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </TableHorizontalScroll>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export { ManutencaoListPage };
