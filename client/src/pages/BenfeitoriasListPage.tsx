import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { ImportarBenfeitoriasModal } from "@/components/ImportarBenfeitoriasModal";
import { exportListPdf } from "@/lib/exportList";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { useConfirm } from "@/components/ConfirmDialog";
import { FD_PRIMARY } from "@/components/FormFields";
import { DeleteActionIcon, EditActionIcon } from "@/components/icons/FarmActionIcons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import FazendaLandIcon from "@/components/icons/FazendaLandIcon";
import {
  montarLinhaPdfBenfeitoria,
  BENFEITORIA_PDF_HEADERS,
  BENFEITORIA_PDF_COLUMN_ALIGNS,
  formatValorListagem,
} from "@shared/benfeitoriaCampos";
import { EXPORT_VALOR_COL_INDEX } from "@shared/importacaoBenfeitorias";
import { parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { ordenarFazendasPorNome } from "@/lib/fazendasListagem";
import { cn } from "@/lib/utils";

type BenfeitoriaRow = {
  id: number;
  nome: string;
  fazendaId: number | null;
  anoConstrucao?: number | null;
  vidaUtil?: string | null;
  valorEstimado?: string | null;
  tipo?: string | null;
  estado?: string | null;
  observacoes?: string | null;
};

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: { key: string; label: string; align: ColAlign; width: string }[] = [
  { key: "nome", label: "Nome", align: "left", width: "28%" },
  { key: "tipo", label: "Tipo", align: "left", width: "18%" },
  { key: "anoConstrucao", label: "Ano", align: "center", width: "12%" },
  { key: "estado", label: "Conservação", align: "center", width: "18%" },
  { key: "valor", label: "Valor", align: "right", width: "14%" },
  { key: "acoes", label: "Ações", align: "center", width: "10%" },
];

const fonteLista = "'Inter', sans-serif";
const cabecalhoLista = { fontFamily: fonteLista, fontSize: "12px", fontWeight: 500 };
const infoLista = { fontFamily: fonteLista, fontSize: "14px", fontWeight: 400 };

function corConservacao(estado?: string | null) {
  if (estado === "Bom") return "#16A34A";
  if (estado === "Regular" || estado === "Precisa manutenção") return "#D97706";
  if (estado === "Ruim") return "#DC2626";
  return "#6B7280";
}

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const LIST_ROUTE = "/fazendas/benfeitorias";
const CADASTRO_ROUTE = "/fazendas/benfeitorias/cadastro";
const BENFEITORIAS_LIST_FAZENDA_KEY = "fd-benfeitorias-list-fazenda-id";

type SortOption = "nome-az" | "nome-za";

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function textoPesquisa(valor?: string | null) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function benfeitoriaCombinaBusca(benfeitoria: BenfeitoriaRow, busca: string) {
  const termo = textoPesquisa(busca);
  if (!termo) return true;
  return [benfeitoria.nome, benfeitoria.tipo].some(valor => textoPesquisa(valor).includes(termo));
}

function benfeitoriasListUrl(fazendaId?: string) {
  if (!fazendaId) return LIST_ROUTE;
  return `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}`;
}

function cadastroUrl(fazendaId?: string, voltarParaFicha = false) {
  const params = new URLSearchParams();
  if (fazendaId) params.set("fazendaId", fazendaId);
  if (voltarParaFicha) params.set("retorno", "ficha");
  const busca = params.toString();
  return busca ? `${CADASTRO_ROUTE}?${busca}` : CADASTRO_ROUTE;
}

function formatValor(valorEstimado: string | null | undefined): string {
  return formatValorListagem(valorEstimado, parseValorDecimalBanco);
}

function BenfeitoriaActionsCell({
  nome,
  onEdit,
  onDelete,
}: {
  nome: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <td data-col-key="acoes" className="px-3 py-2 align-middle text-center whitespace-nowrap">
      <div className="flex justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ECDC4]"
              aria-label={`Ações de ${nome}`}
            >
              <span className="material-icons text-[20px]">more_vert</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" collisionPadding={8} className="min-w-[150px] z-[100]">
            <DropdownMenuItem
              className="text-[12px] cursor-pointer gap-2 text-[#586168] focus:text-white data-[highlighted]:text-white"
              onClick={onEdit}
            >
              <EditActionIcon size={16} style={{ color: "currentColor" }} />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[12px] cursor-pointer gap-2 text-[#DC2626] focus:text-white data-[highlighted]:text-white"
              onClick={onDelete}
            >
              <DeleteActionIcon size={16} style={{ color: "currentColor" }} />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </td>
  );
}

function renderBenfeitoriaCell(b: BenfeitoriaRow, colKey: string) {
  switch (colKey) {
    case "nome":
      return (
        <td key={colKey} data-col-key={colKey} className="min-w-0 overflow-hidden px-3 py-2 align-middle text-gray-700" style={infoLista} title={b.nome}>
          <span className="block truncate">{b.nome}</span>
        </td>
      );
    case "tipo":
      return (
        <td key={colKey} data-col-key={colKey} className="min-w-0 overflow-hidden px-3 py-2 align-middle text-gray-700" style={infoLista} title={b.tipo || ""}>
          <span className="block truncate">{b.tipo || "—"}</span>
        </td>
      );
    case "anoConstrucao":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2 align-middle text-center tabular-nums text-gray-700" style={infoLista}>
          {b.anoConstrucao ?? "—"}
        </td>
      );
    case "estado":
      return (
        <td
          key={colKey}
          data-col-key={colKey}
          className="min-w-0 overflow-hidden px-3 py-2 align-middle text-center"
          style={{ ...infoLista, color: b.estado ? corConservacao(b.estado) : "#6B7280" }}
          title={b.estado || ""}
        >
          <span className="block truncate">{b.estado || "—"}</span>
        </td>
      );
    case "valor":
      return (
        <td key={colKey} data-col-key={colKey} className="px-3 py-2 align-middle text-right tabular-nums text-gray-700 whitespace-nowrap" style={infoLista}>
          {formatValor(b.valorEstimado)}
        </td>
      );
    default:
      return null;
  }
}

export default function BenfeitoriasListPage({ fazendaFixa }: { fazendaFixa?: number } = {}) {
  const embutida = fazendaFixa != null;
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const urlParams = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const fazendaInicial = embutida ? String(fazendaFixa) : (urlParams.get("fazendaId") || "");

  const [fazendaFilter, setFazendaFilter] = useState(fazendaInicial);
  const [fazendaInitDone, setFazendaInitDone] = useState(embutida);
  const [importarOpen, setImportarOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("nome-az");
  const [busca, setBusca] = useState("");

  const { data: list = [], isLoading, refetch } = trpc.benfeitorias.list.useQuery();
  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const utils = trpc.useUtils();
  const deleteMutation = trpc.benfeitorias.delete.useMutation({
    onSuccess: () => {
      toast.success("Benfeitoria excluída!");
      utils.benfeitorias.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const byFazenda = useMemo(() => {
    if (!fazendaFilter) return [];
    const id = Number(fazendaFilter);
    if (Number.isNaN(id)) return [];
    return list.filter(b => b.fazendaId === id);
  }, [list, fazendaFilter]);

  const displayed = useMemo(() => {
    const filtradas = byFazenda.filter(b => benfeitoriaCombinaBusca(b, busca));
    return ordenarFazendasPorNome(filtradas, sortBy === "nome-az");
  }, [byFazenda, busca, sortBy]);

  /** Soma dos valores da lista filtrada (só benfeitorias com valor cadastrado). */
  const valorTotalLista = useMemo(() => {
    let soma = 0;
    let comValor = 0;
    for (const b of displayed) {
      const n = parseValorDecimalBanco(b.valorEstimado);
      if (n == null || !Number.isFinite(n)) continue;
      soma += n;
      comValor += 1;
    }
    return { soma, comValor };
  }, [displayed]);

  const fazendaFilterNome = fazendaFilter
    ? fazendas.find(f => f.id === Number(fazendaFilter))?.nome ?? ""
    : "";

  const buildBenfeitoriasExportTitle = () =>
    fazendaFilterNome
      ? `Lista de Benfeitorias - ${fazendaFilterNome}`
      : "Lista de Benfeitorias";

  const handleFazendaChange = (v: string) => {
    setFazendaFilter(v);
    setSortBy("nome-az");
    setBusca("");
    setLocation(benfeitoriasListUrl(v), { replace: true });
    try {
      if (v) localStorage.setItem(BENFEITORIAS_LIST_FAZENDA_KEY, v);
      else localStorage.removeItem(BENFEITORIAS_LIST_FAZENDA_KEY);
    } catch {
      // ignora falha de gravação
    }
  };

  // Mesmo padrão das outras listas operacionais: 1 fazenda → pré-seleciona;
  // várias + sem preferência → empty state (não força a primeira).
  useEffect(() => {
    if (embutida || fazendaInitDone || fazendasData === undefined) return;

    if (!fazendasData.length) {
      setFazendaInitDone(true);
      return;
    }

    if (fazendaFilter) {
      setFazendaInitDone(true);
      return;
    }

    if (fazendasData.length === 1) {
      const id = String(fazendasData[0].id);
      setFazendaFilter(id);
      setLocation(benfeitoriasListUrl(id), { replace: true });
      try {
        localStorage.setItem(BENFEITORIAS_LIST_FAZENDA_KEY, id);
      } catch {
        // ignora falha de gravação
      }
      setFazendaInitDone(true);
      return;
    }

    try {
      const stored = localStorage.getItem(BENFEITORIAS_LIST_FAZENDA_KEY);
      if (stored && fazendasData.some(f => String(f.id) === stored)) {
        setFazendaFilter(stored);
        setLocation(benfeitoriasListUrl(stored), { replace: true });
        setFazendaInitDone(true);
        return;
      }
    } catch {
      // ignora falha de leitura
    }

    setFazendaInitDone(true);
  }, [fazendasData, fazendaFilter, fazendaInitDone, setLocation]);

  const isEmpty = !isLoading && list.length === 0;
  const needsFazendaSelection =
    fazendaInitDone && !isLoading && fazendas.length > 0 && !fazendaFilter;
  const isFazendaEmpty =
    fazendaInitDone && !isLoading && !!fazendaFilter && byFazenda.length === 0;
  const buscaSemResultado =
    fazendaInitDone && !isLoading && !!fazendaFilter && byFazenda.length > 0 && displayed.length === 0;
  const hasFazendaFilter = !!fazendaFilter;

  const exportPdfData = useMemo(() => {
    const detailRows = displayed.map(b => montarLinhaPdfBenfeitoria(b, parseValorDecimalBanco));
    if (detailRows.length === 0) return detailRows;
    const empty = Array.from({ length: BENFEITORIA_PDF_HEADERS.length - 1 }, () => "");
    const valorFmt = valorTotalLista.soma.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
    return [
      ...detailRows,
      [
        "Valor total",
        ...empty.slice(0, EXPORT_VALOR_COL_INDEX - 1),
        valorFmt,
        ...empty.slice(EXPORT_VALOR_COL_INDEX),
      ],
    ];
  }, [displayed, valorTotalLista]);

  const openEdit = (b: BenfeitoriaRow) => {
    const q = new URLSearchParams({ id: String(b.id) });
    if (fazendaFilter) q.set("fazendaId", fazendaFilter);
    if (embutida) q.set("retorno", "ficha");
    setLocation(`${CADASTRO_ROUTE}?${q.toString()}`);
  };

  const openDelete = async (b: BenfeitoriaRow) => {
    const ok = await confirm({
      title: "Excluir benfeitoria",
      description: (
        <p>
          A benfeitoria <strong className="font-semibold text-gray-900">&quot;{b.nome}&quot;</strong> será excluída.
        </p>
      ),
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id: b.id });
  };

  const goCadastro = () => {
    if (!fazendaFilter) {
      toast.error("Selecione uma fazenda antes de cadastrar uma benfeitoria.");
      return;
    }
    setLocation(cadastroUrl(fazendaFilter, embutida));
  };

  const semFazendaHint = "Selecione uma fazenda para continuar";

  const baixarPdf = () => {
    if (!hasFazendaFilter) return;
    void exportListPdf(buildBenfeitoriasExportTitle(), BENFEITORIA_PDF_HEADERS, exportPdfData, {
      fazendaNome: fazendaFilterNome,
      landscape: true,
      columnAligns: BENFEITORIA_PDF_COLUMN_ALIGNS,
      showRegistrosSubtitle: false,
    });
  };

  return (
    <Moldura embutida={embutida}>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={baixarPdf}
              disabled={!hasFazendaFilter}
              title={hasFazendaFilter ? "Baixar PDF" : semFazendaHint}
              aria-label="Baixar PDF"
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded hover:bg-gray-100 shrink-0",
                hasFazendaFilter ? "active:scale-[0.97]" : "opacity-50 cursor-not-allowed",
              )}
            >
              <span className="material-icons text-[22px] leading-none" style={{ color: "#E53935" }} aria-hidden>
                picture_as_pdf
              </span>
            </button>
            {!embutida && (
              <h1 className="text-[20px] font-semibold text-gray-900 shrink-0" style={{ fontFamily: "Fraunces, serif" }}>
                Lista de Benfeitorias
              </h1>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block">
              <span className="material-icons pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
              <input
                value={busca}
                onChange={evento => setBusca(evento.target.value)}
                placeholder="Buscar benfeitoria"
                aria-label="Buscar benfeitoria"
                disabled={!hasFazendaFilter}
                className="min-h-[44px] w-56 rounded border border-gray-200 bg-white pl-10 pr-3 text-gray-700 outline-none focus:border-[#4ECDC4] disabled:opacity-50"
                style={infoLista}
              />
            </label>
            <button
              type="button"
              onClick={goCadastro}
              disabled={!hasFazendaFilter}
              title={!hasFazendaFilter ? semFazendaHint : undefined}
              className={cn(
                "flex items-center justify-center gap-1 px-3 py-1.5 min-h-[44px] rounded text-white text-[11px] font-medium uppercase shrink-0",
                hasFazendaFilter
                  ? "hover:brightness-95 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
              style={{ backgroundColor: FD_PRIMARY, fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600 }}
            >
              <span className="material-icons text-[14px]">add</span>
              Nova Benfeitoria
            </button>
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              disabled={!hasFazendaFilter}
              title={!hasFazendaFilter ? semFazendaHint : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 rounded-lg border border-gray-200 bg-white text-gray-800 transition shrink-0 min-h-[44px]",
                hasFazendaFilter
                  ? "hover:bg-gray-50 active:scale-[0.97]"
                  : "opacity-50 cursor-not-allowed",
              )}
              style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600 }}
            >
              <span className="material-icons text-[16px] text-gray-500">upload_file</span>
              Importar
            </button>
          </div>
        </div>

        {!embutida && fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[12px] text-gray-600 whitespace-nowrap">Exibindo:</span>
              <FazendaOverviewSelect
                value={fazendaFilter}
                onChange={handleFazendaChange}
                fazendas={fazendas}
                showEmptyOption={fazendas.length > 1}
                className={cn(listControlClass, "min-w-[160px] h-9 py-0")}
              />
            </div>
          </div>
        )}

        <TableHorizontalScroll
          fitWidth
          footer={
            !isEmpty && hasFazendaFilter && displayed.length > 0 ? (
              <div className="border-t border-gray-100">
                <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-gray-700 bg-gray-50/60" style={infoLista}>
                  <span>
                    Valor total:{" "}
                    <span className="font-semibold text-gray-800 tabular-nums">
                      {valorTotalLista.soma.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </span>
                  {valorTotalLista.comValor < displayed.length && (
                    <span className="text-gray-500">
                      {displayed.length - valorTotalLista.comValor}{" "}
                      {displayed.length - valorTotalLista.comValor === 1
                        ? "benfeitoria sem valor"
                        : "benfeitorias sem valor"}
                    </span>
                  )}
                </div>
              </div>
            ) : null
          }
        >
          <table className="w-full min-w-[720px] table-fixed border-collapse" data-benfeitorias-table>
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={col.width === "auto" ? undefined : { width: col.width }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    data-col-key={col.key}
                    aria-sort={col.key === "nome" ? (sortBy === "nome-az" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "px-3 py-2 align-middle text-gray-500 uppercase whitespace-nowrap",
                      alignClass[col.align],
                    )}
                    style={cabecalhoLista}
                  >
                    {col.key === "nome" ? (
                      <button
                        type="button"
                        onClick={() => setSortBy(atual => (atual === "nome-az" ? "nome-za" : "nome-az"))}
                        className="inline-flex items-center gap-0.5 uppercase hover:text-gray-700"
                        aria-label={sortBy === "nome-az" ? "Ordenar nome de Z até A" : "Ordenar nome de A até Z"}
                      >
                        Nome
                        <span className="material-icons text-[18px] leading-none text-gray-400" aria-hidden>
                          {sortBy === "nome-za" ? "arrow_drop_down" : "arrow_drop_up"}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaInitDone) && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Carregando...
                  </td>
                </tr>
              )}

              {fazendaInitDone && !isLoading && needsFazendaSelection && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16 align-middle">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">
                        Selecione uma fazenda para visualizar as benfeitorias.
                      </p>
                      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                        Escolha uma fazenda no filtro acima para consultar, cadastrar, importar e
                        exportar as benfeitorias.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && buscaSemResultado && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-6 text-center text-gray-400" style={infoLista}>
                    Nenhuma benfeitoria encontrada.
                  </td>
                </tr>
              )}

              {!isLoading && isFazendaEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-3 py-6 text-center text-gray-400" style={infoLista}>
                    Nenhuma benfeitoria cadastrada.
                  </td>
                </tr>
              )}

              {!isLoading &&
                displayed.map(b => (
                  <tr key={b.id} className="group border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                    {TABLE_COLUMNS.map(col =>
                      col.key === "acoes" ? (
                        <BenfeitoriaActionsCell
                          key={col.key}
                          nome={b.nome}
                          onEdit={() => openEdit(b)}
                          onDelete={() => openDelete(b)}
                        />
                      ) : (
                        renderBenfeitoriaCell(b, col.key)
                      ),
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </TableHorizontalScroll>
      </div>

      <ImportarBenfeitoriasModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportado={() => refetch()}
      />
    </Moldura>
  );
}

function Moldura({ embutida, children }: { embutida: boolean; children: ReactNode }) {
  if (embutida) return <>{children}</>;
  return <AppLayout>{children}</AppLayout>;
}
