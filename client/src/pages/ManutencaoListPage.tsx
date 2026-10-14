import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FormDatePicker, FormLabel, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
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
import { DeleteActionIcon, EditActionIcon, EstornoActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import {
  camposOpcionaisDetalheManutencao,
  rotuloStatusManutencaoLista,
  rotuloTipoExecucaoLista,
  toggleExpandedId,
} from "@/lib/listaExpansao";
import { pecaItemDeRegistro, rotuloOrigemPeca } from "@shared/manutencaoPecasFormulario";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import { acoesMenuManutencao } from "@shared/manutencaoAcoes";
import {
  descricaoServicoParaListagem,
  isDescricaoServicoValida,
} from "@shared/manutencaoDescricao";
import {
  ordenarManutencoesListagem,
  paginarManutencoesListagem,
  type SortKeyManutencaoListagem,
} from "@/lib/manutencaoListagem";

const FD_PRIMARY = "#4ECDC4";

const MANUT_FILTRO_SELECT_EMPTY = "__empty__";

const manutFiltroTriggerCls =
  "w-full h-auto min-h-0 py-1.5 border-gray-300 text-[12px] text-gray-700 shadow-none focus-visible:ring-0";

const manutFiltroInputCls =
  "border border-gray-300 rounded px-3 py-1.5 text-[12px] text-gray-700 bg-white w-full min-w-0 focus:outline-none focus:border-[#4ECDC4] transition-colors disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

function ManutencaoFilterSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled,
  widthClass = "w-full",
  allowEmpty = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  widthClass?: string;
  allowEmpty?: boolean;
}) {
  const current = String(value ?? "").trim();
  return (
    <div className={cn("min-w-0", widthClass)}>
      <FormSelect
        variant="light"
        disabled={disabled}
        value={allowEmpty && !current ? MANUT_FILTRO_SELECT_EMPTY : current}
        onChange={v => onChange(allowEmpty && v === MANUT_FILTRO_SELECT_EMPTY ? "" : v)}
        placeholder={placeholder}
        triggerClassName={manutFiltroTriggerCls}
      >
        {allowEmpty ? (
          <SelectItem value={MANUT_FILTRO_SELECT_EMPTY} className="text-[12px] text-gray-400">
            {placeholder}
          </SelectItem>
        ) : null}
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-[12px]">
            {o.label}
          </SelectItem>
        ))}
      </FormSelect>
    </div>
  );
}

const TIPOS_CADASTRO = ["Preventiva", "Corretiva"] as const;

type SortKey = SortKeyManutencaoListagem;

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

function manutencaoEstornada(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "estornado";
}

function ManutencaoRowActions({
  podeEditar,
  onEdit,
}: {
  podeEditar: boolean;
  onEdit: () => void;
}) {
  if (!podeEditar) return null;
  return (
    <TableIconButton label="Editar" onClick={onEdit} tone="neutral" compact>
      <EditActionIcon size={16} />
    </TableIconButton>
  );
}

function DetalheCampo({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="text-gray-600">
      {label}: <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function ManutencaoPecasExpandido({ manutencaoId }: { manutencaoId: number }) {
  const { data: pecas = [], isLoading } = trpc.manutencoes.listPecas.useQuery({ manutencaoId });
  if (isLoading) {
    return <p className="text-[12px] text-gray-500">Carregando peças…</p>;
  }
  if (pecas.length === 0) {
    return <p className="text-[12px] text-gray-500">Nenhuma peça registrada.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full text-[12px] border-collapse">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Peça
            </th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Origem
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Qtd
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Valor unitário
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {pecas.map((p, i) => {
            const item = pecaItemDeRegistro(p);
            const origem = rotuloOrigemPeca(item) ?? "—";
            return (
              <tr key={p.id ?? `${manutencaoId}-${i}`} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 font-medium text-gray-900">{item.nome || "—"}</td>
                <td className="px-3 py-2 text-center text-gray-700">{origem}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                  {item.quantidade.toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                  {formatMoney(item.valorUnitario)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-medium">
                  {formatMoney(item.quantidade * item.valorUnitario)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const toggleExpand = (id: number) => setExpandedIds(prev => toggleExpandedId(prev, id));

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
    onError: e => toast.error(e.message),
  });

  const estornarMutation = trpc.manutencoes.estornar.useMutation({
    onSuccess: () => {
      toast.success("Manutenção estornada.");
      utils.manutencoes.list.invalidate();
      utils.estoque.listByCategories.invalidate();
      utils.estoque.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleDelete = async (id: number) => {
    if (deleteMutation.isPending || estornarMutation.isPending) return;

    await confirm({
      title: "Excluir manutenção",
      description: (
        <>
          <p>Tem certeza de que deseja excluir esta manutenção?</p>
          <p className="mt-3">Esta ação não poderá ser desfeita.</p>
        </>
      ),
      confirmText: "Excluir manutenção",
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

  const handleEstornar = async (id: number) => {
    if (deleteMutation.isPending || estornarMutation.isPending) return;

    await confirm({
      title: "Estornar manutenção",
      description: (
        <p>
          Esta manutenção será cancelada e seu histórico será preservado. Caso existam peças
          consumidas do estoque da fazenda, elas serão devolvidas conforme os registros originais.
        </p>
      ),
      confirmText: "Estornar manutenção",
      cancelText: "Cancelar",
      variant: "warning",
      errorFallbackMessage:
        "Não foi possível estornar a manutenção. Nenhuma alteração foi realizada.",
      onConfirm: async () => {
        try {
          await estornarMutation.mutateAsync({ id });
        } catch {
          throw new Error(
            "Não foi possível estornar a manutenção. Nenhuma alteração foi realizada.",
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

  const sorted = useMemo(
    () =>
      ordenarManutencoesListagem(filtered, {
        sortKey,
        sortAsc,
        nomeMaquina: row => maquinaMap.get(row.maquinaId)?.nome ?? "",
      }),
    [filtered, sortKey, sortAsc, maquinaMap],
  );

  const totalCusto = useMemo(
    () =>
      sorted.reduce((acc, r) => {
        if (manutencaoEstornada(r.status)) return acc;
        const v = parseFloat(String(r.valorTotal ?? 0));
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    [sorted],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = paginarManutencoesListagem(sorted, page, pageSize);

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
      if (manutencaoEstornada(r.status)) return acc;
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

  const manutFiltroLabelCls = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900 shrink-0"
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

        {/* Filtros */}
        {fazendaInitDone && (
          <div className="px-5 py-3 border-b border-gray-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className={manutFiltroLabelCls}>Fazenda</label>
                <ManutencaoFilterSelect
                  value={filtroFazenda}
                  onChange={onChangeFazenda}
                  placeholder="Selecione uma fazenda"
                  options={fazendasAtivas.map(f => ({ value: String(f.id), label: f.nome }))}
                />
              </div>
              <div className="min-w-0">
                <label className={manutFiltroLabelCls}>Máquina</label>
                <ManutencaoFilterSelect
                  value={filtros.maquinaId}
                  onChange={v => setFiltros(f => ({ ...f, maquinaId: v }))}
                  placeholder={
                    fazendaSelecionada ? "Todas as máquinas" : "Selecione primeiro uma Fazenda"
                  }
                  disabled={!fazendaSelecionada}
                  options={maquinasOpcoesFiltro.map(m => ({
                    value: String(m.id),
                    label: `${m.nome}${!maquinaAtiva(m) ? " (Inativa)" : ""}`,
                  }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                className={cn("min-w-0", !fazendaSelecionada && "opacity-60 pointer-events-none")}
                title={!fazendaSelecionada ? disabledHint : undefined}
              >
                <FormLabel>Data inicial</FormLabel>
                <FormDatePicker
                  value={filtros.dataInicio}
                  onChange={v => setFiltros(f => ({ ...f, dataInicio: v }))}
                />
              </div>
              <div
                className={cn("min-w-0", !fazendaSelecionada && "opacity-60 pointer-events-none")}
                title={!fazendaSelecionada ? disabledHint : undefined}
              >
                <FormLabel>Data final</FormLabel>
                <FormDatePicker
                  value={filtros.dataFim}
                  onChange={v => setFiltros(f => ({ ...f, dataFim: v }))}
                />
              </div>
            </div>

            <div>
              <label className={manutFiltroLabelCls}>Buscar</label>
              <div className="relative">
                <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar máquina, serviço ou responsável"
                  className={`${manutFiltroInputCls} pl-8 pr-3`}
                  disabled={!fazendaSelecionada}
                  title={!fazendaSelecionada ? disabledHint : undefined}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
              <div className="pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="min-w-0">
                  <label className={manutFiltroLabelCls}>Tipo</label>
                  <ManutencaoFilterSelect
                    value={filtros.tipo}
                    onChange={v => setFiltros(f => ({ ...f, tipo: v }))}
                    placeholder="Todos"
                    options={tiposOpcoes.map(t => ({ value: t, label: t }))}
                  />
                </div>
                <div className="min-w-0">
                  <label className={manutFiltroLabelCls}>Responsável</label>
                  <ManutencaoFilterSelect
                    value={filtros.prestador}
                    onChange={v => setFiltros(f => ({ ...f, prestador: v }))}
                    placeholder="Todos"
                    options={prestadoresOpcoes.map(nome => ({ value: nome, label: nome }))}
                  />
                </div>
                <div className="min-w-0">
                  <label className={manutFiltroLabelCls}>Custo</label>
                  <ManutencaoFilterSelect
                    value={filtros.comCusto}
                    onChange={v =>
                      setFiltros(f => ({ ...f, comCusto: v as Filtros["comCusto"] }))
                    }
                    placeholder="Todos"
                    options={[
                      { value: "com", label: "Com custo" },
                      { value: "sem", label: "Sem custo" },
                    ]}
                  />
                </div>
              </div>
            )}
          </div>
        )}

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
              <table className="w-full min-w-[900px] table-fixed text-[12px] border-collapse">
                <colgroup>
                  <col style={{ width: "40px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "110px" }} />
                  <col />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "72px" }} />
                </colgroup>
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-1 py-3 text-center w-10" aria-label="Detalhes" />
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
                      <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
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
                      const isEstornado = manutencaoEstornada(r.status);
                      const { podeEstornar, podeExcluir } = acoesMenuManutencao(r.status);
                      const podeEditar = !isEstornado;
                      const aberto = expandedIds.has(r.id);
                      const opcionais = camposOpcionaisDetalheManutencao({
                        tipoExecucao: (r as { tipoExecucao?: string | null }).tipoExecucao,
                        prestadorContato: r.prestadorContato,
                        horimetro: r.horimetro,
                        proximaManutencao: r.proximaManutencao,
                      });
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className={cn(
                              "border-b border-gray-100 hover:bg-[#4ECDC414] transition-colors group cursor-pointer",
                              aberto && "bg-[#4ECDC414]",
                              isEstornado && "opacity-80",
                            )}
                            onClick={() => toggleExpand(r.id)}
                          >
                            <td className="px-1 py-3 align-middle text-center">
                              <button
                                type="button"
                                className="inline-flex items-center justify-center w-7 h-7 rounded text-gray-500 hover:bg-gray-100"
                                aria-label={aberto ? "Recolher detalhes" : "Ver detalhes"}
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleExpand(r.id);
                                }}
                              >
                                <span className="material-icons text-[18px]">
                                  {aberto ? "expand_less" : "expand_more"}
                                </span>
                              </button>
                            </td>
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
                              {isEstornado ? (
                                <span className="inline-flex mt-0.5 items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                  Estornado
                                </span>
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
                              <ManutencaoRowActions
                                podeEditar={podeEditar}
                                onEdit={() =>
                                  setLocation(`/maquinas/manutencao/cadastro?id=${r.id}`)
                                }
                              />
                            </td>
                          </tr>
                          {aberto ? (
                            <tr className="bg-slate-50/80 border-b border-gray-100">
                              <td colSpan={7} className="px-3 py-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                                  <DetalheCampo label="Máquina" value={maquina?.nome ?? `#${r.maquinaId}`} />
                                  <DetalheCampo label="Data da manutenção" value={formatDateBR(r.data)} />
                                  <DetalheCampo label="Tipo de manutenção" value={r.tipo ?? "—"} />
                                  <DetalheCampo label="Serviço realizado" value={servico} />
                                  <DetalheCampo
                                    label="Tipo de execução"
                                    value={rotuloTipoExecucaoLista(
                                      (r as { tipoExecucao?: string | null }).tipoExecucao,
                                    )}
                                  />
                                  <DetalheCampo label="Responsável ou prestador" value={responsavel} />
                                  {opcionais.telefone ? (
                                    <DetalheCampo label="Telefone" value={r.prestadorContato} />
                                  ) : null}
                                  {opcionais.horimetro ? (
                                    <DetalheCampo label="Horímetro" value={r.horimetro} />
                                  ) : null}
                                  {opcionais.proximaManutencao ? (
                                    <DetalheCampo
                                      label="Próxima manutenção"
                                      value={formatDateBR(r.proximaManutencao)}
                                    />
                                  ) : null}
                                  <DetalheCampo
                                    label="Status da manutenção"
                                    value={rotuloStatusManutencaoLista(r.status)}
                                  />
                                </div>
                                <div className="mt-3">
                                  <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                                    Peças utilizadas
                                  </div>
                                  <ManutencaoPecasExpandido manutencaoId={r.id} />
                                </div>
                                <div className="mt-3 flex justify-end">
                                  <div className="text-right text-[12px] space-y-1 min-w-[220px]">
                                    {opcionais.maoObra ? (
                                      <div className="text-gray-600">
                                        Mão de obra:{" "}
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                          {formatMoney(r.valorMaoObra)}
                                        </span>
                                      </div>
                                    ) : null}
                                    <div className="text-gray-800 pt-1 border-t border-gray-200">
                                      Custo total:{" "}
                                      <span className="font-semibold tabular-nums">
                                        {formatMoney(r.valorTotal)}
                                      </span>
                                    </div>
                                    {opcionais.valorCobradoOficina ? (
                                      <div className="text-gray-600">
                                        Valor cobrado pela oficina:{" "}
                                        <span className="font-semibold text-gray-900 tabular-nums">
                                          {formatMoney(
                                            (r as { valorCobradoOficina?: string | number | null })
                                              .valorCobradoOficina,
                                          )}
                                        </span>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                {(podeEstornar || podeExcluir) ? (
                                  <div
                                    className="mt-3 flex flex-wrap justify-end gap-2"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {podeEstornar ? (
                                      <button
                                        type="button"
                                        onClick={() => void handleEstornar(r.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold border border-amber-200 bg-white text-amber-800 hover:bg-amber-50"
                                      >
                                        <EstornoActionIcon size={16} />
                                        Estornar manutenção
                                      </button>
                                    ) : null}
                                    {podeExcluir ? (
                                      <button
                                        type="button"
                                        onClick={() => void handleDelete(r.id)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold border border-red-200 bg-white text-red-700 hover:bg-red-50"
                                      >
                                        <DeleteActionIcon size={16} />
                                        Excluir
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </TableHorizontalScroll>
          )}
      </div>
    </AppLayout>
  );
}

export { ManutencaoListPage };
