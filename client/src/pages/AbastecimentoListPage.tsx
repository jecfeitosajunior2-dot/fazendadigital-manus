import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FormDatePicker, FormLabel } from "@/components/FormFields";
import ListExportButtons from "@/components/ListExportButtons";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";
import { resolveValoresAbastecimento } from "@/lib/combustivel-estoque";
import { useConfirm } from "@/components/ConfirmDialog";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import {
  DeleteActionIcon,
  EditActionIcon,
  EstornoActionIcon,
  TableIconButton,
} from "@/components/icons/FarmActionIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

const FD_PRIMARY = "#4ECDC4";

const COMBUSTIVEL_LABEL: Record<string, string> = {
  diesel: "Diesel",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla: "Arla",
};

const ORIGEM_ESTOQUE = "Estoque da Fazenda";
const ORIGEM_EXTERNA = "Compra externa / Posto";

type ColAlign = "left" | "right" | "center";
type SortKey = "data" | "maquina" | "quantidade" | "valorLitro" | "valorTotal";

type DisplayCol = {
  key: string;
  label: string;
  align: ColAlign;
  headerAlign?: ColAlign;
  width: string;
  sortKey?: SortKey;
  hideBelow?: string;
};

const TABLE_COLUMNS: DisplayCol[] = [
  { key: "data", label: "Data", align: "center", width: "108px", sortKey: "data" },
  { key: "maquina", label: "Máquina", align: "left", headerAlign: "center", width: "240px", sortKey: "maquina" },
  {
    key: "combustivelOrigem",
    label: "Combustível / Origem",
    align: "center",
    headerAlign: "center",
    width: "190px",
  },
  { key: "qtd", label: "Quantidade", align: "center", width: "118px", sortKey: "quantidade" },
  { key: "valorL", label: "Valor por litro", align: "center", width: "128px", sortKey: "valorLitro" },
  { key: "valorTotal", label: "Valor total", align: "center", headerAlign: "center", width: "140px", sortKey: "valorTotal" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

type MedidorTipo = "horimetro" | "quilometragem";

type Filtros = {
  maquinaId: string;
  dataInicio: string;
  dataFim: string;
  tipoMaquina: string;
  combustivel: string;
  origem: string;
  responsavel: string;
  status: string;
};

const FILTROS_VAZIOS: Filtros = {
  maquinaId: "",
  dataInicio: "",
  dataFim: "",
  tipoMaquina: "",
  combustivel: "",
  origem: "",
  responsavel: "",
  status: "",
};

function formatDate(value: unknown): string {
  if (!value) return "—";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/** Extrai YYYY-MM-DD sem deslocar timezone. */
function toDateKey(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function formatNum(value: unknown, decimals = 2): string {
  if (value == null || value === "") return "—";
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatMoney(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function inferMedidorPorTipo(tipo: string | null | undefined): MedidorTipo | null {
  if (!tipo?.trim()) return null;
  const t = tipo.trim();
  const veiculos = new Set(["Veículos", "Caminhão", "Carreta", "Carro", "Moto"]);
  const horas = new Set([
    "Máquinas",
    "Equipamentos com Motor",
    "Trator",
    "Colheitadeira",
    "Plantadeira",
    "Pulverizador",
  ]);
  if (veiculos.has(t)) return "quilometragem";
  if (horas.has(t)) return "horimetro";
  return null;
}

function getMedidorTipo(maquina?: {
  tipo?: string | null;
  tipoMedidor?: string | null;
} | null | Record<string, unknown>): MedidorTipo | "sem_medidor" | null {
  if (!maquina) return null;
  const tm = String((maquina as { tipoMedidor?: string | null }).tipoMedidor ?? "").trim();
  if (tm === "horimetro") return "horimetro";
  if (tm === "quilometragem") return "quilometragem";
  if (tm === "sem_medidor") return "sem_medidor";
  return inferMedidorPorTipo((maquina as { tipo?: string | null }).tipo);
}

function formatMedidorDisplay(
  horimetro: string | null | undefined,
  maquina?: {
    tipo?: string | null;
    tipoMedidor?: string | null;
  } | null | Record<string, unknown>,
): { label: string; sortValue: number | null } {
  const tipo = getMedidorTipo(maquina);
  if (tipo === "sem_medidor") {
    return { label: "Sem medidor", sortValue: null };
  }
  if (horimetro == null || String(horimetro).trim() === "") {
    return { label: "—", sortValue: null };
  }
  const n = parseFloat(String(horimetro).replace(",", "."));
  if (Number.isNaN(n)) return { label: "—", sortValue: null };
  const num = n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (tipo === "quilometragem") return { label: `${num} km`, sortValue: n };
  if (tipo === "horimetro") return { label: `${num} h`, sortValue: n };
  // Dados antigos sem tipo de medidor cadastrado: mostra só o número
  return { label: num, sortValue: n };
}

function labelCombustivel(value: string | null | undefined): string {
  if (!value?.trim()) return "Combustível não informado";
  return COMBUSTIVEL_LABEL[value] ?? value;
}

function labelOrigem(r: { abastecidoNaFazenda?: boolean | null }): string | null {
  if (r.abastecidoNaFazenda) return ORIGEM_ESTOQUE;
  // Compra externa é o padrão quando não é estoque (inclui legado sem flag)
  if (r.abastecidoNaFazenda === false) return ORIGEM_EXTERNA;
  return null;
}

/** Sublinha da máquina: marca / modelo / identificação — padrão Manutenções. */
function sublinhaMaquinaListagem(maquina?: {
  marca?: string | null;
  modelo?: string | null;
  placa?: string | null;
  numeroSerie?: string | null;
  codigo?: string | null;
  identificacao?: string | null;
  patrimonio?: string | null;
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
    maquina.patrimonio,
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

function labelStatus(status: string | null | undefined): "registrado" | "estornado" {
  return String(status ?? "registrado") === "estornado" ? "estornado" : "registrado";
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

function AbastecimentoRowActions({
  podeEditar,
  podeExcluir,
  podeEstornar,
  onEdit,
  onExcluir,
  onEstornar,
}: {
  podeEditar: boolean;
  podeExcluir: boolean;
  podeEstornar: boolean;
  onEdit: () => void;
  onExcluir: () => void;
  onEstornar: () => void;
}) {
  const temMenu = podeExcluir || podeEstornar;
  return (
    <div className="inline-flex items-center justify-center gap-1.5">
      {podeEditar && (
        <TableIconButton label="Editar" onClick={onEdit} tone="neutral" compact>
          <EditActionIcon size={16} />
        </TableIconButton>
      )}
      {temMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid place-items-center h-7 w-7 rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-1"
              aria-label="Mais ações"
              title="Mais ações"
            >
              <span className="material-icons text-[16px]" aria-hidden>
                more_vert
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px] z-[100]">
            {podeEstornar && (
              <DropdownMenuItem
                className="text-[12px] cursor-pointer gap-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-300"
                onSelect={onEstornar}
              >
                <EstornoActionIcon size={16} />
                Estornar abastecimento
              </DropdownMenuItem>
            )}
            {podeExcluir && (
              <>
                {podeEstornar && <DropdownMenuSeparator />}
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
      )}
    </div>
  );
}

export default function AbastecimentoListPage() {
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

  const { data: registros = [], isLoading, refetch } = trpc.abastecimentos.list.useQuery({});
  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: movimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery();
  const utils = trpc.useUtils();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast.success("Atualizado!");
    },
    enabled: true,
  });

  const deleteMutation = trpc.abastecimentos.delete.useMutation({
    onSuccess: () => {
      toast.success("Abastecimento excluído.");
      utils.abastecimentos.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const estornarMutation = trpc.abastecimentos.estornar.useMutation({
    onSuccess: () => {
      toast.success("Abastecimento estornado.");
      utils.abastecimentos.list.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.listMovimentacoes.invalidate();
    },
    onError: e => toast.error(e.message),
  });

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
      toast.error("Selecione uma fazenda antes de registrar abastecimentos.");
      return;
    }
    setLocation(`/maquinas/abastecimento/cadastro?fazendaId=${encodeURIComponent(filtroFazenda)}`);
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

  const maquinasOpcoes = useMemo(() => {
    if (!filtros.tipoMaquina) return maquinasDaFazenda;
    return maquinasDaFazenda.filter(m => m.tipo === filtros.tipoMaquina);
  }, [maquinasDaFazenda, filtros.tipoMaquina]);

  const tiposMaquina = useMemo(() => {
    const set = new Set<string>();
    maquinasDaFazenda.forEach(m => {
      if (m.tipo?.trim()) set.add(m.tipo.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [maquinasDaFazenda]);

  const responsaveisOpcoes = useMemo(() => {
    const set = new Set<string>();
    registros.forEach(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      if (filtroFazenda && String(maquina?.fazendaId) !== filtroFazenda) return;
      const nome = (r.responsavel ?? "").trim();
      if (nome) set.add(nome);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros, maquinaMap, filtroFazenda]);

  /** Abastecimentos da fazenda selecionada (via máquina). */
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
      const dataStr = toDateKey(r.data);
      const status = labelStatus(r.status);
      const combustivelLbl = labelCombustivel(r.combustivel);
      const origemLbl = labelOrigem(r) ?? "";

      if (aplicados.maquinaId && String(r.maquinaId) !== aplicados.maquinaId) return false;
      if (aplicados.tipoMaquina && maquina?.tipo !== aplicados.tipoMaquina) return false;
      if (aplicados.combustivel && r.combustivel !== aplicados.combustivel) return false;
      if (aplicados.origem === "estoque" && !r.abastecidoNaFazenda) return false;
      if (aplicados.origem === "externa" && r.abastecidoNaFazenda) return false;
      if (aplicados.responsavel && (r.responsavel ?? "").trim() !== aplicados.responsavel) return false;
      if (aplicados.status && status !== aplicados.status) return false;
      if (aplicados.dataInicio && dataStr && dataStr < aplicados.dataInicio) return false;
      if (aplicados.dataFim && dataStr && dataStr > aplicados.dataFim) return false;

      if (q) {
        const blob = [
          maquina?.nome ?? "",
          (maquina as { marca?: string | null })?.marca ?? "",
          (maquina as { modelo?: string | null })?.modelo ?? "",
          maquina?.placa ?? "",
          (maquina as { numeroSerie?: string | null })?.numeroSerie ?? "",
          combustivelLbl,
          origemLbl,
          r.responsavel ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }

      return true;
    });
  }, [registrosDaFazenda, aplicados, search, maquinaMap, filtroFazenda]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const maA = maquinaMap.get(a.maquinaId);
      const maB = maquinaMap.get(b.maquinaId);
      const { valorLitro: vlA, valorTotal: vtA } = resolveValoresAbastecimento(a, estoque, movimentacoes);
      const { valorLitro: vlB, valorTotal: vtB } = resolveValoresAbastecimento(b, estoque, movimentacoes);

      let cmp = 0;
      if (sortKey === "data") {
        cmp = toDateKey(a.data).localeCompare(toDateKey(b.data));
        if (cmp === 0) {
          cmp = String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
        }
      } else if (sortKey === "maquina") {
        cmp = (maA?.nome ?? "").localeCompare(maB?.nome ?? "", "pt-BR");
      } else if (sortKey === "quantidade") {
        cmp = (parseFloat(String(a.litros ?? 0)) || 0) - (parseFloat(String(b.litros ?? 0)) || 0);
      } else if (sortKey === "valorLitro") {
        cmp = (vlA ?? -1) - (vlB ?? -1);
      } else if (sortKey === "valorTotal") {
        cmp = (vtA ?? -1) - (vtB ?? -1);
      }

      if (cmp === 0) cmp = b.id - a.id;
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortAsc, maquinaMap, estoque, movimentacoes]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      setSortAsc(key === "maquina");
    }
    setPage(1);
  };

  const pedirExcluir = async (id: number) => {
    const ok = await confirm({
      title: "Excluir abastecimento",
      description: (
        <>
          <p>Tem certeza de que deseja excluir este abastecimento?</p>
          <p className="mt-3">Esta ação não poderá ser desfeita.</p>
        </>
      ),
      confirmText: "Excluir abastecimento",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id });
  };

  const pedirEstornar = async (id: number) => {
    const ok = await confirm({
      title: "Estornar abastecimento",
      description: (
        <p>
          O abastecimento será cancelado e a quantidade será devolvida ao estoque da Fazenda. O
          histórico será preservado.
        </p>
      ),
      confirmText: "Estornar abastecimento",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (ok) estornarMutation.mutate({ id });
  };

  const exportHeaders = [
    "Data",
    "Máquina",
    "Identificação",
    "Combustível",
    "Origem",
    "Quantidade",
    "Valor por litro",
    "Valor total",
    "Status",
  ];

  const exportData = useMemo(() => {
    const detailRows = sorted.map(r => {
      const maquina = maquinaMap.get(r.maquinaId);
      const { valorLitro, valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
      const ident = sublinhaMaquinaListagem(
        maquina as {
          marca?: string | null;
          modelo?: string | null;
          placa?: string | null;
          numeroSerie?: string | null;
          codigo?: string | null;
          identificacao?: string | null;
          patrimonio?: string | null;
        } | null,
      );
      return [
        formatDate(r.data),
        maquina?.nome ?? "",
        ident,
        r.combustivel
          ? COMBUSTIVEL_LABEL[r.combustivel] ?? r.combustivel
          : "Combustível não informado",
        labelOrigem(r) ?? "",
        formatNum(r.litros) !== "—" ? `${formatNum(r.litros)} L` : "",
        valorLitro != null ? formatMoney(valorLitro) : "",
        valorTotal != null ? formatMoney(valorTotal) : "",
        labelStatus(r.status) === "estornado" ? "Estornado" : "Registrado",
      ];
    });

    if (detailRows.length === 0) return detailRows;

    let litrosRegistrados = 0;
    let valorRegistrados = 0;
    for (const r of sorted) {
      if (labelStatus(r.status) === "estornado") continue;
      const n = parseFloat(String(r.litros ?? "").replace(",", "."));
      if (Number.isFinite(n)) litrosRegistrados += n;
      const { valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
      if (valorTotal != null && Number.isFinite(valorTotal)) valorRegistrados += valorTotal;
    }

    return [
      ...detailRows,
      [
        "Totais (somente registrados)",
        "",
        "",
        "",
        "",
        `${formatNum(litrosRegistrados)} L`,
        "",
        formatMoney(valorRegistrados),
        "",
      ],
    ];
  }, [sorted, maquinaMap, estoque, movimentacoes]);

  const exportTitleLine = useMemo(() => {
    const fazenda = (fazendaSelecionadaNome || "").trim() || "Fazenda";
    return `${fazenda} — Abastecimentos`;
  }, [fazendaSelecionadaNome]);

  const exportFilenameBase = useMemo(() => {
    const nome = (fazendaSelecionadaNome || "abastecimentos")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "abastecimentos";
    return `abastecimentos-${nome}`;
  }, [fazendaSelecionadaNome]);

  /** Totais da lista filtrada, só abastecimentos registrados (exclui estornados). */
  const totaisRegistrados = useMemo(() => {
    let litros = 0;
    let valor = 0;
    let qtd = 0;
    for (const r of sorted) {
      if (labelStatus(r.status) === "estornado") continue;
      qtd += 1;
      const n = parseFloat(String(r.litros ?? "").replace(",", "."));
      if (Number.isFinite(n)) litros += n;
      const { valorTotal } = resolveValoresAbastecimento(r, estoque, movimentacoes);
      if (valorTotal != null && Number.isFinite(valorTotal)) valor += valorTotal;
    }
    return { litros, valor, qtd };
  }, [sorted, estoque, movimentacoes]);

  const emptySemFazenda = fazendaInitDone && !fazendaSelecionada;
  const emptyTotal =
    !isLoading && fazendaSelecionada && registrosDaFazenda.length === 0;
  const emptyFiltro =
    !isLoading &&
    fazendaSelecionada &&
    registrosDaFazenda.length > 0 &&
    filtered.length === 0;
  const exportDisabled = !fazendaSelecionada || exportData.length === 0;

  const tituloQuadro = fazendaSelecionadaNome
    ? `Abastecimentos — ${fazendaSelecionadaNome}`
    : "Abastecimentos";

  const selectClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const inputClass =
    "border border-gray-300 rounded px-2 py-1.5 text-[12px] text-gray-700 bg-white w-full min-h-[34px] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";
  const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
  const disabledHint = "Selecione uma fazenda para usar este filtro";
  const headPad = "px-3 py-2.5 whitespace-nowrap";
  const cellPad = "px-3 py-2.5";

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
                  <option value="">Todas as máquinas</option>
                  {maquinasOpcoes.map(m => (
                    <option key={m.id} value={String(m.id)}>
                      {m.nome}
                      {m.status === "inativo" ? " (Inativa)" : ""}
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
                  placeholder="Buscar máquina, combustível, responsável ou identificação"
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
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className={labelClass}>Tipo de maquinário</label>
                  <select
                    value={filtros.tipoMaquina}
                    onChange={e => {
                      const tipo = e.target.value;
                      setFiltros(f => {
                        const next = { ...f, tipoMaquina: tipo };
                        if (f.maquinaId) {
                          const m = maquinasDaFazenda.find(x => String(x.id) === f.maquinaId);
                          if (!m || (tipo && m.tipo !== tipo)) next.maquinaId = "";
                        }
                        return next;
                      });
                    }}
                    className={selectClass}
                  >
                    <option value="">Todos os tipos</option>
                    {tiposMaquina.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Combustível</label>
                  <select
                    value={filtros.combustivel}
                    onChange={e => setFiltros(f => ({ ...f, combustivel: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    <option value="diesel">Diesel</option>
                    <option value="gasolina">Gasolina</option>
                    <option value="etanol">Etanol</option>
                    <option value="arla">Arla</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Origem</label>
                  <select
                    value={filtros.origem}
                    onChange={e => setFiltros(f => ({ ...f, origem: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todas</option>
                    <option value="estoque">{ORIGEM_ESTOQUE}</option>
                    <option value="externa">{ORIGEM_EXTERNA}</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Responsável</label>
                  <select
                    value={filtros.responsavel}
                    onChange={e => setFiltros(f => ({ ...f, responsavel: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    {responsaveisOpcoes.map(nome => (
                      <option key={nome} value={nome}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={filtros.status}
                    onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    <option value="registrado">Registrado</option>
                    <option value="estornado">Estornado</option>
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
                    ? "Novo abastecimento"
                    : "Selecione uma fazenda para registrar abastecimentos."
                }
                className="inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0 min-h-[44px]"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                <span className="material-icons text-[16px]">add</span>
                Novo abastecimento
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
                    : "Nenhum abastecimento disponível para exportação."
                }
                spreadsheetSheetName="Abastecimentos"
                spreadsheetReportTitle={() => exportTitleLine}
                spreadsheetBlankAfterMeta={false}
                spreadsheetAutoFilter={false}
                spreadsheetPlainHeader
                spreadsheetTextCols={[0, 1, 2, 3, 4, 5, 8]}
                spreadsheetColumnAligns={[
                  "center",
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
                Selecione uma fazenda para visualizar os abastecimentos.
              </h2>
              <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
                Selecione uma fazenda no filtro acima para consultar, registrar e exportar
                abastecimentos.
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
                Nenhum abastecimento encontrado com os filtros aplicados.
              </h2>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
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
                        Totais (registrados):{" "}
                        <span className="font-semibold text-gray-800 tabular-nums">
                          {formatNum(totaisRegistrados.litros)} L
                        </span>
                        <span className="text-gray-400 mx-1.5">·</span>
                        <span className="font-semibold text-gray-800 tabular-nums">
                          {formatMoney(totaisRegistrados.valor)}
                        </span>
                      </span>
                      {totaisRegistrados.qtd < sorted.length && (
                        <span className="text-[10px] text-gray-500">
                          Exclui {sorted.length - totaisRegistrados.qtd}{" "}
                          {sorted.length - totaisRegistrados.qtd === 1
                            ? "estornado"
                            : "estornados"}
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
                      itemLabel="abastecimentos"
                    />
                  </div>
                ) : null
              }
            >
              <table className="w-full min-w-[960px] table-fixed text-[12px] border-collapse">
                <colgroup>
                  {TABLE_COLUMNS.map(col => (
                    <col key={col.key} style={{ width: col.width }} />
                  ))}
                  <col style={{ width: "86px" }} />
                </colgroup>
                <thead className="bg-gray-50 border-b border-gray-200">
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
                            "align-middle text-[11px] font-semibold text-gray-600 uppercase tracking-wide",
                            alignClass[headerAlign],
                            col.hideBelow,
                            col.key === "data" && "pl-4",
                            col.key === "valorTotal" && "pr-5",
                            col.key === "combustivelOrigem" && "whitespace-nowrap",
                          )}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(col.sortKey!)}
                              className={cn(
                                "uppercase tracking-wide cursor-pointer hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded",
                                headerAlign === "left" && "inline-flex items-center gap-1",
                                headerAlign === "right" &&
                                  "inline-flex w-full items-center justify-end gap-1",
                                headerAlign === "center" &&
                                  "inline-flex items-center justify-center gap-1 mx-auto",
                              )}
                            >
                              <span>{col.label}</span>
                              <SortIcon active={active} asc={sortAsc} />
                            </button>
                          ) : (
                            <span
                              className={cn(
                                "uppercase tracking-wide",
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
                        "align-middle text-[11px] font-semibold text-gray-600 uppercase tracking-wide text-center pl-3 pr-4",
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
                      colSpan={TABLE_COLUMNS.length + 1}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      Carregando...
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  pageItems.map(r => {
                    const maquina = maquinaMap.get(r.maquinaId);
                    const { valorLitro, valorTotal } = resolveValoresAbastecimento(
                      r,
                      estoque,
                      movimentacoes,
                    );
                    const combustivelTxt = labelCombustivel(r.combustivel);
                    const origemTxt = labelOrigem(r);
                    const subMaquina = sublinhaMaquinaListagem(
                      maquina as {
                        marca?: string | null;
                        modelo?: string | null;
                        placa?: string | null;
                        numeroSerie?: string | null;
                        codigo?: string | null;
                        identificacao?: string | null;
                        patrimonio?: string | null;
                      } | null,
                    );
                    const status = labelStatus(r.status);
                    const isEstoque = Boolean(r.abastecidoNaFazenda && r.fazendaId);
                    const isEstornado = status === "estornado";
                    const podeEditar = !isEstornado;
                    const podeEstornar = isEstoque && !isEstornado;
                    const podeExcluir = !isEstoque && !isEstornado;
                    const qtd = formatNum(r.litros);

                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b border-gray-100 bg-white hover:bg-[#4ECDC4]/[0.05] transition-colors",
                          isEstornado && "opacity-80",
                        )}
                      >
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-600 tabular-nums whitespace-nowrap pl-4",
                          )}
                        >
                          {formatDate(r.data)}
                        </td>
                        <td className={cn(cellPad, "align-middle text-left min-w-0")}>
                          <div
                            className="font-semibold text-gray-900 leading-tight truncate"
                            title={maquina?.nome ?? undefined}
                          >
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
                          {isEstornado && (
                            <span className="inline-flex mt-0.5 items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              Estornado
                            </span>
                          )}
                        </td>
                        <td className={cn(cellPad, "align-middle text-center min-w-0")}>
                          <div
                            className="text-gray-800 leading-tight truncate"
                            title={combustivelTxt}
                          >
                            {combustivelTxt}
                          </div>
                          {origemTxt ? (
                            <div
                              className="text-[11px] text-gray-500 leading-tight truncate mt-0.5"
                              title={origemTxt}
                            >
                              {origemTxt}
                            </div>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-700 tabular-nums whitespace-nowrap px-2.5",
                          )}
                        >
                          {qtd !== "—" ? `${qtd} L` : "—"}
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-700 tabular-nums whitespace-nowrap px-2.5",
                          )}
                        >
                          {formatMoney(valorLitro)}
                        </td>
                        <td
                          className={cn(
                            cellPad,
                            "align-middle text-center text-gray-800 font-semibold tabular-nums whitespace-nowrap pr-5",
                          )}
                        >
                          {formatMoney(valorTotal)}
                        </td>
                        <td className={cn(cellPad, "align-middle text-center pl-3 pr-4")}>
                          <AbastecimentoRowActions
                            podeEditar={podeEditar}
                            podeExcluir={podeExcluir}
                            podeEstornar={podeEstornar}
                            onEdit={() =>
                              setLocation(`/maquinas/abastecimento/cadastro?id=${r.id}`)
                            }
                            onExcluir={() => void pedirExcluir(r.id)}
                            onEstornar={() => void pedirEstornar(r.id)}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableHorizontalScroll>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function EmptyTotal() {
  return (
    <div className="text-center py-1">
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
      <p className="text-[16px] font-semibold text-gray-900">Nenhum abastecimento registrado.</p>
      <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
        Registre o primeiro abastecimento para acompanhar consumo, custos e uso das máquinas.
      </p>
    </div>
  );
}

export { AbastecimentoListPage };
