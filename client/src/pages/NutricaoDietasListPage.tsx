import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import {
  TableIconButton,
  ViewActionIcon,
  EditActionIcon,
} from "@/components/icons/FarmActionIcons";
import FazendaLandIcon from "@/components/icons/FazendaLandIcon";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  formatarCustoEstimadoPorKgDieta,
  labelTipoDieta,
  rotuloFormaUsoDieta,
  rotuloFormaUsoDietaLista,
} from "@shared/nutricaoDietas";

const LIST_ROUTE = "/nutricao/dietas";
const FAZENDA_KEY = "fd-nutricao-dietas-fazenda-id";

const TABLE_COLUMNS = [
  { key: "nome", label: "Dieta", align: "left" as const, width: "20%" },
  { key: "tipo", label: "Tipo", align: "left" as const, width: "12%" },
  { key: "formaUso", label: "Forma de uso", align: "left" as const, width: "12%" },
  { key: "categoria", label: "Categoria", align: "center" as const, width: "12%" },
  { key: "base", label: "Base da formulação", align: "center" as const, width: "14%" },
  { key: "custo", label: "Custo estimado/kg", align: "center" as const, width: "14%" },
  { key: "status", label: "Status", align: "center" as const, width: "8%" },
  { key: "acoes", label: "Ações", align: "center" as const, width: "8%" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function listUrl(fazendaId?: string) {
  if (!fazendaId) return LIST_ROUTE;
  return `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}`;
}

export default function NutricaoDietasListPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaFromUrl);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const fazendaIdNum = Number(fazendaFilter);
  const fazendaOk = Number.isFinite(fazendaIdNum) && fazendaIdNum > 0;

  const { data: dietas = [], isLoading } = trpc.nutricaoDietas.list.useQuery(
    {
      fazendaId: fazendaIdNum,
      status: statusFilter === "ativa" || statusFilter === "inativa" ? statusFilter : undefined,
      search: search.trim() || undefined,
    },
    { enabled: fazendaOk },
  );

  useEffect(() => {
    if (fazendaInitDone || fazendasData === undefined) return;
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
      setLocation(listUrl(id), { replace: true });
      try {
        localStorage.setItem(FAZENDA_KEY, id);
      } catch {
        /* ignore */
      }
      setFazendaInitDone(true);
      return;
    }
    try {
      const stored = localStorage.getItem(FAZENDA_KEY);
      if (stored && fazendasData.some(f => String(f.id) === stored)) {
        setFazendaFilter(stored);
        setLocation(listUrl(stored), { replace: true });
      }
    } catch {
      /* ignore */
    }
    setFazendaInitDone(true);
  }, [fazendasData, fazendaFilter, fazendaInitDone, setLocation]);

  const displayed = useMemo(() => dietas, [dietas]);
  const needsFazendaSelection = fazendaInitDone && fazendas.length > 0 && !fazendaFilter;
  const hasFiltro = Boolean(statusFilter || search.trim());
  const isFazendaEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && !hasFiltro;
  const isFiltroEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && hasFiltro;

  const handleFazendaChange = (v: string) => {
    setFazendaFilter(v);
    setLocation(listUrl(v), { replace: true });
    try {
      if (v) localStorage.setItem(FAZENDA_KEY, v);
      else localStorage.removeItem(FAZENDA_KEY);
    } catch {
      /* ignore */
    }
  };

  const goNova = () => {
    if (!fazendaOk) return;
    setLocation(`/nutricao/dietas/nova?fazendaId=${fazendaFilter}`);
  };

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900 shrink-0" style={{ fontFamily: "Fraunces, serif" }}>
            Dietas
          </h1>
          <button
            type="button"
            onClick={goNova}
            disabled={!fazendaOk}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px]",
              fazendaOk ? "hover:brightness-95 active:scale-[0.97]" : "opacity-50 cursor-not-allowed",
            )}
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">add</span>
            Nova Dieta
          </button>
        </div>

        {fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[12px] text-gray-600 whitespace-nowrap">Fazenda</span>
              <FazendaOverviewSelect
                value={fazendaFilter}
                onChange={handleFazendaChange}
                fazendas={fazendas}
                showEmptyOption={fazendas.length > 1}
                className={cn(listControlClass, "min-w-[160px] h-9 py-0")}
              />
            </div>
            <div className="w-[150px] shrink-0">
              <FormSelect
                variant="light"
                value={statusFilter || "__all__"}
                onChange={v => setStatusFilter(v === "__all__" ? "" : v)}
                placeholder="Status"
                disabled={!fazendaOk}
                triggerClassName={listControlClass}
              >
                <SelectItem value="__all__" className="text-[12px]">Todos</SelectItem>
                <SelectItem value="ativa" className="text-[12px]">Ativa</SelectItem>
                <SelectItem value="inativa" className="text-[12px]">Inativa</SelectItem>
              </FormSelect>
            </div>
            <div className="w-[220px] shrink-0">
              <FormInput
                variant="light"
                value={search}
                onChange={setSearch}
                placeholder="Buscar por nome"
                readOnly={!fazendaOk}
              />
            </div>
          </div>
        )}

        <TableHorizontalScroll fitWidth>
          <table className="w-full min-w-[760px] table-fixed text-[11px] border-collapse">
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-3 py-2.5 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
                      col.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaInitDone) && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {fazendaInitDone && !isLoading && needsFazendaSelection && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">
                        Selecione uma fazenda para visualizar as dietas.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {isFiltroEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">Nenhuma dieta encontrada.</p>
                      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                        Ajuste a busca ou o status para ver outras formulações desta fazenda.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && isFazendaEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">Nenhuma dieta cadastrada.</p>
                      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                        Cadastre uma formulação nutricional para utilizar futuramente no planejamento e fornecimento.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading &&
                displayed.map(dieta => (
                  <tr key={dieta.id} className="group border-b border-gray-100 hover:bg-gray-50/60">
                    <td className="px-3 py-2.5 text-gray-800 font-medium truncate">{dieta.nome}</td>
                    <td className="px-3 py-2.5 text-gray-600 truncate">{labelTipoDieta(dieta.tipo)}</td>
                    <td
                      className="px-3 py-2.5 text-gray-600 truncate"
                      title={rotuloFormaUsoDieta(dieta.formaUso)}
                    >
                      {rotuloFormaUsoDietaLista(dieta.formaUso)}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-600">{dieta.categoriaAnimal || "—"}</td>
                    <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">
                      {Number(dieta.baseQuantidade).toLocaleString("pt-BR")} {dieta.baseUnidade}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums">
                      {formatarCustoEstimadoPorKgDieta(dieta.custo)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                          dieta.status === "ativa" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
                        )}
                      >
                        {dieta.status === "ativa" ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center justify-center gap-1">
                        <TableIconButton
                          label="Visualizar"
                          tone="view"
                          onClick={() => setLocation(`/nutricao/dietas/${dieta.id}`)}
                        >
                          <ViewActionIcon size={17} />
                        </TableIconButton>
                        <TableIconButton
                          label="Editar"
                          tone="neutral"
                          onClick={() => setLocation(`/nutricao/dietas/${dieta.id}/editar`)}
                        >
                          <EditActionIcon size={17} />
                        </TableIconButton>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableHorizontalScroll>
      </div>
    </AppLayout>
  );
}
