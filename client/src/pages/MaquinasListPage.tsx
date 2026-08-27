import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useConfirm } from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";
import { ImportarMaquinariosModal } from "@/components/ImportarMaquinariosModal";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { TIPOS_MAQUINA, camposCadastroIncompletosMaquina } from "@/lib/maquina-types";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import {
  EditActionIcon,
  DeleteActionIcon,
  InactivateActionIcon,
  ActivateActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FD_PRIMARY = "#4ECDC4";

const MAQUINAS_LIST_UI_KEY = "fd-maquinas-list-ui";

type SortKey = "nome" | "ano" | "valor" | "status";

type FiltroStatus = "ativas" | "inativas" | "todas";

type MaquinasListUiState = {
  filtroTipo: string;
  filtroStatus: FiltroStatus;
  search: string;
  sortKey: SortKey;
  sortAsc: boolean;
  page: number;
};

function readMaquinasListUi(): Partial<MaquinasListUiState> {
  try {
    const raw = sessionStorage.getItem(MAQUINAS_LIST_UI_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<MaquinasListUiState> & { sortKey?: string };
    // Migra ordenação antiga por Fazenda (coluna removida).
    if (parsed.sortKey === "fazenda") parsed.sortKey = "nome";
    if (
      parsed.filtroStatus !== "ativas" &&
      parsed.filtroStatus !== "inativas" &&
      parsed.filtroStatus !== "todas"
    ) {
      parsed.filtroStatus = "ativas";
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeMaquinasListUi(state: MaquinasListUiState) {
  try {
    sessionStorage.setItem(MAQUINAS_LIST_UI_KEY, JSON.stringify(state));
  } catch {
    // ignora quota
  }
}

type ColAlign = "left" | "right" | "center";

type TableCol = {
  key: string;
  label: string;
  align: ColAlign;
  /** Alinhamento só do cabeçalho; se omitido, usa `align`. */
  headerAlign?: ColAlign;
  width: string;
  sortKey?: SortKey;
  hideBelow?: string;
};

/** Sem coluna Fazenda — contexto já vem do filtro. */
const TABLE_COLUMNS: TableCol[] = [
  { key: "nome", label: "Máquina", align: "left", headerAlign: "center", width: "34%", sortKey: "nome" },
  { key: "ano", label: "Ano", align: "center", width: "9%", sortKey: "ano" },
  {
    key: "ident",
    label: "Identificação",
    align: "center",
    headerAlign: "center",
    width: "18%",
    hideBelow: "hidden md:table-cell",
  },
  {
    key: "valor",
    label: "Valor",
    align: "right",
    headerAlign: "center",
    width: "16%",
    sortKey: "valor",
    hideBelow: "hidden md:table-cell",
  },
  { key: "status", label: "Status", align: "center", width: "12%", sortKey: "status" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const filterSelectClass =
  "w-full sm:w-[200px] text-[13px] border border-gray-200 rounded-md bg-white px-3 text-gray-700 shrink-0 h-10";

const secondaryBtnClass =
  "inline-flex items-center gap-1.5 px-3.5 rounded-lg text-[12px] font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-[0.97] transition shrink-0 min-h-[40px]";

const primaryBtnClass =
  "inline-flex items-center gap-1.5 px-3.5 rounded-lg text-[12px] font-semibold text-white shadow-sm hover:brightness-95 active:scale-[0.97] transition shrink-0 min-h-[40px]";

const cellPad = "px-3 py-2.5";
const headPad = "px-3 py-2.5";

type MaquinaRow = {
  id: number;
  nome?: string | null;
  tipo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  placa?: string | null;
  fazendaId?: number | null;
  valor?: string | number | null;
  status?: string | null;
  dataDesativacao?: unknown;
  estado?: string | null;
  vidaUtil?: string | null;
  tipoMedidor?: string | null;
  observacoes?: string | null;
};

function isMaquinaAtiva(m: { status?: string | null; dataDesativacao?: unknown }): boolean {
  if (m.dataDesativacao) return false;
  if (String(m.status || "").toLowerCase() === "inativo") return false;
  return true;
}

function nomeExibicaoMaquina(m: MaquinaRow): string {
  const nome = String(m.nome || "").trim();
  if (nome) return nome;
  const tipo = String(m.tipo || "").trim();
  const modelo = String(m.modelo || "").trim();
  const marca = String(m.marca || "").trim();
  if (tipo && modelo) return `${tipo} ${modelo}`;
  if (tipo && marca) return `${tipo} ${marca}`;
  if (tipo) return tipo;
  return "Máquina sem identificação";
}

/** Remove aspas externas indevidas do nome (não altera aspas internas). */
function nomeMaquinaParaConfirmacao(nome: string): string {
  return String(nome || "")
    .trim()
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .trim();
}

/** Linha secundária: Tipo · Marca · Modelo (só partes preenchidas). */
function detalheMaquina(m: MaquinaRow): string {
  return [m.tipo, m.marca, m.modelo]
    .map(v => String(v || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function formatValorBrl(valor: string | number | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = parseFloat(String(valor));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return (
    <span
      className="material-icons inline-flex shrink-0 items-center justify-center text-[14px] leading-none text-gray-400 align-middle"
      aria-hidden
    >
      {asc ? "arrow_drop_up" : "arrow_drop_down"}
    </span>
  );
}

function StatusBadge({ ativa }: { ativa: boolean }) {
  if (ativa) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
        Ativa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-medium text-gray-600">
      Inativa
    </span>
  );
}

function MaquinaRowActions({
  ativa,
  podeExcluir,
  onEdit,
  onInativar,
  onReativar,
  onExcluir,
}: {
  ativa: boolean;
  podeExcluir: boolean;
  onEdit: () => void;
  onInativar: () => void;
  onReativar: () => void;
  onExcluir: () => void;
}) {
  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      <TableIconButton label="Editar" onClick={onEdit} tone="neutral" compact>
        <EditActionIcon size={16} />
      </TableIconButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="grid place-items-center h-7 w-6 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1"
            aria-label="Mais ações"
            title="Mais ações"
          >
            <span className="material-icons text-[16px]" aria-hidden>
              more_vert
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px] z-[100]">
          {ativa ? (
            <DropdownMenuItem
              className="text-[12px] cursor-pointer gap-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
              onSelect={onInativar}
            >
              <InactivateActionIcon size={16} />
              Inativar máquina
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-[12px] cursor-pointer gap-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
              onSelect={onReativar}
            >
              <ActivateActionIcon size={16} />
              Reativar máquina
            </DropdownMenuItem>
          )}
          {podeExcluir && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-[12px] cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-200"
                onSelect={onExcluir}
              >
                <DeleteActionIcon size={16} />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function MaquinasListPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const uiInicial = readMaquinasListUi();
  const [search, setSearch] = useState(() => uiInicial.search ?? "");
  const [filtroFazenda, setFiltroFazenda] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState(() => uiInicial.filtroTipo ?? "");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>(
    () => uiInicial.filtroStatus ?? "ativas",
  );
  const [page, setPage] = useState(() =>
    typeof uiInicial.page === "number" && uiInicial.page > 0 ? uiInicial.page : 1,
  );
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const [importarOpen, setImportarOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(() =>
    uiInicial.sortKey && ["nome", "ano", "valor", "status"].includes(uiInicial.sortKey)
      ? uiInicial.sortKey
      : "nome",
  );
  const [sortAsc, setSortAsc] = useState(() =>
    typeof uiInicial.sortAsc === "boolean" ? uiInicial.sortAsc : true,
  );

  const { data: list = [], isLoading, refetch } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const {
    data: idsComVinculo = [],
    isSuccess: vinculosOk,
    isError: vinculosErro,
  } = trpc.maquinas.idsComVinculo.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: "always",
  });
  const utils = trpc.useUtils();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast.success("Atualizado!");
    },
    enabled: true,
  });

  const deleteMutation = trpc.maquinas.delete.useMutation({
    onSuccess: () => {
      toast.success("Máquina excluída.");
      utils.maquinas.list.invalidate();
      utils.maquinas.idsComVinculo.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const inativarMutation = trpc.maquinas.inativar.useMutation({
    onSuccess: () => {
      toast.success("Máquina inativada.");
      utils.maquinas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const reativarMutation = trpc.maquinas.reativar.useMutation({
    onSuccess: () => {
      toast.success("Máquina reativada.");
      utils.maquinas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const MSG_EXCLUSAO_BLOQUEADA =
    "Esta máquina possui registros vinculados e não pode ser excluída. Inative a máquina para impedir novos lançamentos sem perder o histórico.";

  const pedirInativar = async (m: MaquinaRow) => {
    const nome = nomeMaquinaParaConfirmacao(nomeExibicaoMaquina(m));
    const ok = await confirm({
      title: "Inativar máquina",
      description: (
        <>
          <p>
            Tem certeza de que deseja inativar a máquina{" "}
            <strong className="font-bold text-gray-800">{nome}</strong>?
          </p>
          <p className="mt-3">
            A máquina deixará de aparecer em novos lançamentos operacionais, mas seu histórico será preservado.
          </p>
        </>
      ),
      confirmText: "Inativar máquina",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (ok) inativarMutation.mutate({ id: m.id });
  };

  const pedirReativar = async (m: MaquinaRow) => {
    const nome = nomeExibicaoMaquina(m);
    const ok = await confirm({
      title: "Reativar máquina",
      description: (
        <>
          <p>
            Tem certeza de que deseja reativar a máquina{" "}
            <strong className="font-bold text-gray-800">{nome}</strong>?
          </p>
          <p className="mt-3">
            A máquina voltará a ficar disponível em novos lançamentos operacionais.
          </p>
        </>
      ),
      confirmText: "Reativar máquina",
      cancelText: "Cancelar",
      variant: "success",
    });
    if (ok) reativarMutation.mutate({ id: m.id });
  };

  const pedirExcluir = async (m: MaquinaRow) => {
    // Revalida vínculos antes de abrir o modal (concorrência).
    try {
      const check = await utils.maquinas.podeExcluir.fetch({ id: m.id });
      if (!check.podeExcluir) {
        toast.error(MSG_EXCLUSAO_BLOQUEADA);
        await utils.maquinas.idsComVinculo.invalidate();
        return;
      }
    } catch {
      toast.error(MSG_EXCLUSAO_BLOQUEADA);
      await utils.maquinas.idsComVinculo.invalidate();
      return;
    }

    const nome = nomeMaquinaParaConfirmacao(nomeExibicaoMaquina(m));
    const ok = await confirm({
      title: "Excluir máquina",
      description: (
        <>
          <p>
            Tem certeza de que deseja excluir a máquina{" "}
            <strong className="font-bold text-gray-800">{nome}</strong>?
          </p>
          <p className="mt-3">Esta ação não poderá ser desfeita.</p>
        </>
      ),
      confirmText: "Excluir máquina",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id: m.id });
  };

  /** Fazendas disponíveis no filtro (todas as cadastradas — não há status inativo no cadastro). */
  const fazendasAtivas = useMemo(
    () =>
      [...fazendas]
        .filter(f => f?.id != null && String(f.nome || "").trim())
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
    [fazendas],
  );

  // Mesmo padrão da Lista de Produtos: só pré-seleciona se houver 1 fazenda ou preferência salva.
  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendasAtivas.length) {
      persistRebanhoFazendaId("");
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendasAtivas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    if (!fromStorage) {
      // Preferência inválida/inexistente — limpa e fica no estado “Selecione uma fazenda”.
      persistRebanhoFazendaId("");
    }
    const resolved =
      fromStorage || (fazendasAtivas.length === 1 ? String(fazendasAtivas[0]!.id) : "");
    if (resolved) {
      setFiltroFazenda(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendasAtivas, fazendaInitDone, loadingFazendas]);

  // Preserva Tipo, Status, busca, ordenação e página ao ir/voltar do cadastro.
  useEffect(() => {
    if (!fazendaInitDone) return;
    writeMaquinasListUi({ filtroTipo, filtroStatus, search, sortKey, sortAsc, page });
  }, [fazendaInitDone, filtroTipo, filtroStatus, search, sortKey, sortAsc, page]);

  const onChangeFazenda = (value: string) => {
    // Troca de Fazenda: fecha importação pendente para não vincular no destino errado.
    if (importarOpen) setImportarOpen(false);
    setFiltroFazenda(value);
    persistRebanhoFazendaId(value);
    setFiltroTipo("");
    setFiltroStatus("ativas");
    setSearch("");
    setPage(1);
  };

  const fazendaSelecionada = Boolean(filtroFazenda);
  const fazendaSelecionadaNome = useMemo(
    () => fazendasAtivas.find(f => String(f.id) === filtroFazenda)?.nome,
    [fazendasAtivas, filtroFazenda],
  );

  const irParaCadastro = () => {
    if (!fazendaSelecionada) {
      toast.error("Selecione uma fazenda antes de cadastrar uma máquina.", {
        id: "maquinas-cadastrar-sem-fazenda",
      });
      return;
    }
    setLocation(`/maquinas/cadastro?fazendaId=${encodeURIComponent(filtroFazenda)}`);
  };

  const fazendaMap = useMemo(() => {
    const m = new Map<number, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);

  const maquinasComVinculo = useMemo(() => new Set(idsComVinculo), [idsComVinculo]);
  // Só libera Excluir quando a auditoria de vínculos respondeu com sucesso.
  const vinculosProntos = vinculosOk && !vinculosErro;

  const filtered = useMemo(() => {
    if (!filtroFazenda) return [] as MaquinaRow[];
    const q = search.trim().toLowerCase();
    return (list as MaquinaRow[]).filter(m => {
      const fazendaNome = m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "" : "";
      const matchFazenda = String(m.fazendaId) === filtroFazenda;
      const matchTipo = !filtroTipo || m.tipo === filtroTipo;
      const ativa = isMaquinaAtiva(m);
      const matchStatus =
        filtroStatus === "todas" ||
        (filtroStatus === "ativas" && ativa) ||
        (filtroStatus === "inativas" && !ativa);
      const matchSearch =
        !q ||
        [
          nomeExibicaoMaquina(m),
          m.tipo,
          m.marca,
          m.modelo,
          m.placa,
          fazendaNome,
        ].some(v =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        );
      return matchFazenda && matchTipo && matchStatus && matchSearch;
    });
  }, [list, search, filtroTipo, filtroStatus, filtroFazenda, fazendaMap]);

  const maquinasDaFazenda = useMemo(
    () => (list as MaquinaRow[]).filter(m => String(m.fazendaId) === filtroFazenda),
    [list, filtroFazenda],
  );

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortAsc ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "nome") {
        return (
          nomeExibicaoMaquina(a).localeCompare(nomeExibicaoMaquina(b), "pt-BR", {
            sensitivity: "base",
          }) * dir
        );
      }
      if (sortKey === "ano") {
        const ya = a.ano ?? -1;
        const yb = b.ano ?? -1;
        return (ya - yb) * dir;
      }
      if (sortKey === "valor") {
        const va = parseFloat(String(a.valor ?? "")) || 0;
        const vb = parseFloat(String(b.valor ?? "")) || 0;
        return (va - vb) * dir;
      }
      const sa = isMaquinaAtiva(a) ? 0 : 1;
      const sb = isMaquinaAtiva(b) ? 0 : 1;
      return (sa - sb) * dir;
    });
    return rows;
  }, [filtered, sortKey, sortAsc]);

  /** Soma dos valores da lista filtrada (só máquinas com valor cadastrado). */
  const valorTotalLista = useMemo(() => {
    let soma = 0;
    let comValor = 0;
    for (const m of sorted) {
      if (m.valor == null || m.valor === "") continue;
      const n = parseFloat(String(m.valor));
      if (!Number.isFinite(n)) continue;
      soma += n;
      comValor += 1;
    }
    return { soma, comValor };
  }, [sorted]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  /** Mesmo padrão das demais tabelas: A→Z / Z→A; não limpa filtros nem página. */
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(v => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "valor" ? false : true);
    }
  };

  const exportHeaders = [
    "Nome de identificação",
    "Tipo",
    "Marca",
    "Modelo",
    "Ano de fabricação",
    "Placa / Número de série",
    "Valor",
    "Status",
  ];

  const exportData = useMemo(() => {
    const detailRows = sorted.map(m => [
      nomeExibicaoMaquina(m),
      m.tipo ?? "",
      m.marca ?? "",
      m.modelo ?? "",
      m.ano != null && m.ano !== "" ? String(m.ano) : "",
      m.placa ?? "",
      m.valor != null && m.valor !== ""
        ? parseFloat(String(m.valor)).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "",
      isMaquinaAtiva(m) ? "Ativa" : "Inativa",
    ]);

    if (detailRows.length === 0) return detailRows;

    let soma = 0;
    for (const m of sorted) {
      if (m.valor == null || m.valor === "") continue;
      const n = parseFloat(String(m.valor));
      if (!Number.isFinite(n)) continue;
      soma += n;
    }

    return [
      ...detailRows,
      [
        "Valor total",
        "",
        "",
        "",
        "",
        "",
        soma.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        "",
      ],
    ];
  }, [sorted]);

  const exportTitleLine = useMemo(() => {
    const fazenda = (fazendaSelecionadaNome || "").trim() || "Fazenda";
    return `${fazenda} — Máquinas`;
  }, [fazendaSelecionadaNome]);

  const exportFilenameBase = useMemo(() => {
    const nome = (fazendaSelecionadaNome || "maquinas")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "maquinas";
    return `maquinas-${nome}`;
  }, [fazendaSelecionadaNome]);

  const emptyTotal =
    fazendaSelecionada && !isLoading && maquinasDaFazenda.length === 0;
  const emptyFiltro =
    fazendaSelecionada && !isLoading && maquinasDaFazenda.length > 0 && filtered.length === 0;
  const isEmptySemFazenda = !fazendaSelecionada && fazendaInitDone;
  const mostrarFiltros = isLoading || list.length > 0 || isEmptySemFazenda || !fazendaInitDone;
  const exportDisabled = !fazendaSelecionada || (!isLoading && filtered.length === 0);
  const colCount = TABLE_COLUMNS.length + 1;
  const emptyFiltroMensagem =
    filtroStatus === "ativas"
      ? "Nenhuma máquina Ativa encontrada."
      : filtroStatus === "inativas"
        ? "Nenhuma máquina Inativa encontrada."
        : "Nenhuma máquina encontrada com os filtros aplicados.";

  const incompletasNaLista = useMemo(
    () =>
      sorted.filter(m => camposCadastroIncompletosMaquina(m).length > 0),
    [sorted],
  );
  const alertaIncompletas =
    incompletasNaLista.length === 1
      ? "1 máquina com cadastro incompleto. Edite para completar as informações."
      : `${incompletasNaLista.length} máquinas com cadastro incompleto. Edite para completar as informações.`;

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="bg-white rounded border border-gray-200 shadow-sm overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[15px] font-semibold text-gray-800 shrink-0">Máquinas</h1>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={irParaCadastro}
              aria-disabled={!fazendaSelecionada}
              title={
                fazendaSelecionada
                  ? "Cadastrar Máquina"
                  : "Selecione uma fazenda antes de cadastrar uma máquina"
              }
              className={cn(
                primaryBtnClass,
                !fazendaSelecionada && "opacity-50 cursor-not-allowed hover:brightness-100 active:scale-100",
              )}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[18px]">add</span>
              Cadastrar Máquina
            </button>
            <button
              type="button"
              disabled={!fazendaSelecionada}
              onClick={() => {
                if (!fazendaSelecionada) return;
                setImportarOpen(true);
              }}
              title={
                fazendaSelecionada
                  ? "Importar"
                  : "Selecione uma fazenda antes de importar máquinas."
              }
              aria-disabled={!fazendaSelecionada}
              className={cn(
                secondaryBtnClass,
                !fazendaSelecionada &&
                  "opacity-50 cursor-not-allowed bg-gray-50 text-gray-400 hover:bg-gray-50 active:scale-100",
              )}
            >
              <span
                className={cn(
                  "material-icons text-[18px]",
                  fazendaSelecionada ? "text-gray-500" : "text-gray-400",
                )}
              >
                upload_file
              </span>
              Importar
            </button>
            <ListExportButtons
              title="Máquinas"
              filename={exportFilenameBase}
              headers={exportHeaders}
              rows={fazendaSelecionada ? exportData : []}
              fazendaNome={fazendaSelecionadaNome}
              variant="secondary"
              disabled={exportDisabled}
              disabledTitle={
                !fazendaSelecionada
                  ? "Selecione uma fazenda para exportar."
                  : "Nenhuma máquina disponível para exportação."
              }
              spreadsheetSheetName="Máquinas"
              spreadsheetReportTitle={() => exportTitleLine}
              spreadsheetBlankAfterMeta={false}
              spreadsheetAutoFilter={false}
              spreadsheetPlainHeader
              spreadsheetTextCols={[0, 5, 6, 7]}
              spreadsheetIntegerCols={[4]}
              spreadsheetColumnAligns={[
                "center",
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
                "center",
              ]}
              pdfShowRegistrosSubtitle={false}
              pdfIncludeSpreadsheetTitle={false}
              pdfLandscape
            />
          </div>
        </div>

        {mostrarFiltros && (
          <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-gray-100">
            <select
              value={filtroFazenda}
              onChange={e => onChangeFazenda(e.target.value)}
              className={filterSelectClass}
              aria-label="Filtrar por fazenda"
            >
              <option value="">Selecione uma fazenda</option>
              {fazendasAtivas.map(f => (
                <option key={f.id} value={String(f.id)}>
                  {f.nome}
                </option>
              ))}
            </select>
            <select
              value={filtroTipo}
              onChange={e => {
                setFiltroTipo(e.target.value);
                setPage(1);
              }}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? "Selecione uma fazenda para filtrar por tipo" : undefined}
              className={cn(
                filterSelectClass,
                "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
              )}
              aria-label="Filtrar por tipo"
            >
              <option value="">Todos os tipos</option>
              {TIPOS_MAQUINA.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={filtroStatus}
              onChange={e => {
                setFiltroStatus(e.target.value as FiltroStatus);
                setPage(1);
              }}
              disabled={!fazendaSelecionada}
              title={!fazendaSelecionada ? "Selecione uma fazenda para filtrar por status" : undefined}
              className={cn(
                filterSelectClass,
                "sm:w-[140px]",
                "disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed",
              )}
              aria-label="Filtrar por status"
            >
              <option value="ativas">Ativas</option>
              <option value="inativas">Inativas</option>
              <option value="todas">Todas</option>
            </select>
            <div className="relative flex-1 min-w-[180px] basis-[240px] max-w-xl">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400 pointer-events-none">
                search
              </span>
              <input
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                disabled={!fazendaSelecionada}
                title={!fazendaSelecionada ? "Selecione uma fazenda para buscar máquinas" : undefined}
                placeholder="Buscar máquina, marca, modelo ou identificação"
                className="w-full h-10 pl-10 pr-3 text-[13px] border border-gray-200 rounded-md bg-white disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        )}

        {isEmptySemFazenda ? (
          <div className="px-4 py-16 text-center">
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
            <p className="text-[14px] font-medium text-gray-800">
              Selecione uma fazenda para visualizar as máquinas.
            </p>
            <p className="text-[12px] text-gray-500 mt-2 max-w-md mx-auto leading-relaxed">
              Selecione uma fazenda no filtro acima para consultar, cadastrar e exportar suas
              máquinas.
            </p>
          </div>
        ) : emptyTotal ? (
          <div className="px-4 py-10">
            <EmptyTotal />
          </div>
        ) : (
          <>
            {incompletasNaLista.length > 0 && (
              <div className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-[12px]">
                <span className="material-icons text-[16px] text-red-500 shrink-0">warning</span>
                <span className="font-medium">{alertaIncompletas}</span>
              </div>
            )}
            <TableHorizontalScroll
              fitWidth
              footer={
                !isLoading && sorted.length > 0 ? (
                  <div className="border-t border-gray-100">
                    <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-600 bg-gray-50/60">
                      <span>
                        Valor total:{" "}
                        <span className="font-semibold text-gray-800 tabular-nums">
                          {formatValorBrl(valorTotalLista.soma)}
                        </span>
                      </span>
                      {valorTotalLista.comValor < sorted.length && (
                        <span className="text-[10px] text-gray-500">
                          {sorted.length - valorTotalLista.comValor}{" "}
                          {sorted.length - valorTotalLista.comValor === 1
                            ? "máquina sem valor"
                            : "máquinas sem valor"}
                        </span>
                      )}
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
                      itemLabel="máquinas"
                    />
                  </div>
                ) : null
              }
            >
              <table className="w-full min-w-0 table-fixed text-[12px] border-collapse">
                <colgroup>
                  {TABLE_COLUMNS.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  <col style={{ width: "72px" }} />
                </colgroup>
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    {TABLE_COLUMNS.map(col => {
                      const sortable = !!col.sortKey;
                      const active = col.sortKey === sortKey;
                      const headerAlign = col.headerAlign ?? col.align;
                      const ariaSort = !sortable
                        ? undefined
                        : active
                          ? sortAsc
                            ? "ascending"
                            : "descending"
                          : "none";
                      return (
                        <th
                          key={col.key}
                          aria-sort={ariaSort}
                          className={cn(
                            headPad,
                            "align-middle text-[11px] font-bold text-gray-600 tracking-wide",
                            alignClass[headerAlign],
                            col.hideBelow,
                          )}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(col.sortKey!)}
                              className={cn(
                                "cursor-pointer hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded",
                                headerAlign === "left" && "inline-flex items-center gap-0.5",
                                headerAlign === "right" &&
                                  "inline-flex w-full items-center justify-end gap-0.5",
                                headerAlign === "center" &&
                                  "relative mx-auto flex w-full items-center justify-center",
                              )}
                            >
                              {headerAlign === "center" ? (
                                <span className="relative inline-flex items-center justify-center">
                                  <span>{col.label}</span>
                                  <span className="pointer-events-none absolute left-full top-1/2 ml-0.5 -translate-y-1/2">
                                    <SortIcon active={active} asc={sortAsc} />
                                  </span>
                                </span>
                              ) : (
                                <>
                                  <span>{col.label}</span>
                                  <SortIcon active={active} asc={sortAsc} />
                                </>
                              )}
                            </button>
                          ) : (
                            <span
                              className={cn(
                                headerAlign === "right" && "block text-right",
                                headerAlign === "center" && "block text-center",
                              )}
                            >
                              {col.label}
                            </span>
                          )}
                        </th>
                      );
                    })}
                    <th
                      className={cn(
                        headPad,
                        "align-middle text-center text-[11px] font-bold text-gray-600 w-[72px]",
                      )}
                    >
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="px-4 py-10 text-center text-gray-400 align-middle"
                      >
                        Carregando...
                      </td>
                    </tr>
                  )}
                  {emptyFiltro && (
                    <tr>
                      <td colSpan={colCount} className="px-4 py-10 text-center align-middle">
                        <EmptyFiltro mensagem={emptyFiltroMensagem} />
                      </td>
                    </tr>
                  )}
                  {pageItems.map(m => {
                    const nome = nomeExibicaoMaquina(m);
                    const detalhe = detalheMaquina(m);
                    const ativa = isMaquinaAtiva(m);
                    const ident = String(m.placa || "").trim();
                    const camposFaltando = camposCadastroIncompletosMaquina(m);
                    const incompleta = camposFaltando.length > 0;
                    return (
                      <tr
                        key={m.id}
                        className={cn(
                          "border-b border-gray-100 hover:bg-gray-50/70 transition-colors",
                          incompleta && "bg-red-50/70 hover:bg-red-50",
                        )}
                      >
                        <td
                          className={cn(
                            cellPad,
                            "align-middle",
                            incompleta && "border-l-[3px] border-l-red-500",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <p className="font-semibold text-[13px] text-gray-900 leading-snug break-words line-clamp-2 min-w-0">
                                {nome}
                              </p>
                              {incompleta && (
                                <span
                                  className="shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-red-50 text-red-700 border border-red-300"
                                  title={`Cadastro incompleto: ${camposFaltando.join(", ")}`}
                                >
                                  <span className="material-icons text-[11px] leading-none">warning</span>
                                  Incompleto
                                </span>
                              )}
                            </div>
                            {detalhe ? (
                              <p
                                className="mt-0.5 text-[11px] text-gray-500 leading-snug break-words line-clamp-2"
                                title={detalhe}
                              >
                                {detalhe}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-700 tabular-nums",
                          )}
                        >
                          <span className="inline-block w-full text-center">{m.ano ?? "—"}</span>
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-700 break-words",
                            "hidden md:table-cell",
                          )}
                          title={ident || undefined}
                        >
                          <span className="inline-block w-full text-center">{ident || "—"}</span>
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-right text-gray-800 tabular-nums whitespace-nowrap",
                            "hidden md:table-cell",
                          )}
                        >
                          <span className="inline-block w-full text-right">
                            {formatValorBrl(m.valor)}
                          </span>
                        </td>
                        <td className={cn(cellPad, "align-middle text-center")}>
                          <span className="inline-flex w-full justify-center">
                            <StatusBadge ativa={ativa} />
                          </span>
                        </td>
                        <td className={cn(cellPad, "align-middle text-right w-[72px]")}>
                          <MaquinaRowActions
                            ativa={ativa}
                            podeExcluir={vinculosProntos && !maquinasComVinculo.has(m.id)}
                            onEdit={() => setLocation(`/maquinas/cadastro?id=${m.id}`)}
                            onInativar={() => {
                              void pedirInativar(m);
                            }}
                            onReativar={() => {
                              void pedirReativar(m);
                            }}
                            onExcluir={() => {
                              void pedirExcluir(m);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableHorizontalScroll>
          </>
        )}
      </div>

      <ImportarMaquinariosModal
        key={filtroFazenda || "sem-fazenda"}
        open={importarOpen && fazendaSelecionada}
        fazendaId={Number(filtroFazenda)}
        fazendaNome={fazendaSelecionadaNome || ""}
        onClose={() => setImportarOpen(false)}
        onImportado={() => refetch()}
      />
    </AppLayout>
  );
}

function EmptyTotal() {
  return (
    <div className="text-center py-2 px-2">
      <img
        src="/assets/icon-maquina-trator-green.png"
        alt=""
        width={40}
        height={40}
        className="mx-auto mb-3"
        aria-hidden
        style={{
          objectFit: "contain",
          filter:
            "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
        }}
      />
      <p className="text-[13px] font-medium text-gray-700">Nenhuma máquina cadastrada.</p>
      <p className="text-[12px] text-gray-500 mt-1.5 max-w-md mx-auto">
        Cadastre a primeira máquina para controlar abastecimentos, manutenções e custos operacionais.
      </p>
    </div>
  );
}

function EmptyFiltro({ mensagem }: { mensagem: string }) {
  return (
    <div className="text-center py-2">
      <p className="text-[13px] font-medium text-gray-700">{mensagem}</p>
    </div>
  );
}

export { MaquinasListPage };
