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
import { formatDateBR } from "@/lib/date-utils";
import {
  formatarCustoProjetado,
  labelSituacaoPlan,
  NUTRICAO_PLAN_SITUACOES,
} from "@shared/nutricaoPlanejamento";

const LIST_ROUTE = "/nutricao/planejamento";
const FAZENDA_KEY = "fd-nutricao-plan-fazenda-id";

const TABLE_COLUMNS = [
  { key: "lote", label: "Lote", align: "left" as const, width: "12%" },
  { key: "origem", label: "Produto / Dieta", align: "left" as const, width: "16%" },
  { key: "meta", label: "Meta", align: "center" as const, width: "13%" },
  { key: "vigencia", label: "Vigência", align: "center" as const, width: "16%" },
  { key: "necessidade", label: "Necessidade/dia", align: "center" as const, width: "13%" },
  { key: "custo", label: "Custo estimado/dia", align: "center" as const, width: "14%" },
  { key: "situacao", label: "Situação", align: "center" as const, width: "10%" },
  { key: "acoes", label: "Ações", align: "center" as const, width: "6%" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function listUrl(fazendaId?: string) {
  if (!fazendaId) return LIST_ROUTE;
  return `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}`;
}

export default function NutricaoPlanejamentoListPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaFromUrl);
  const [loteFilter, setLoteFilter] = useState("");
  const [situacaoFilter, setSituacaoFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const fazendaIdNum = Number(fazendaFilter);
  const fazendaOk = Number.isFinite(fazendaIdNum) && fazendaIdNum > 0;

  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery(
    { fazendaId: fazendaIdNum },
    { enabled: fazendaOk },
  );

  const { data: planos = [], isLoading } = trpc.nutricaoPlanejamento.list.useQuery(
    {
      fazendaId: fazendaIdNum,
      loteId: loteFilter ? Number(loteFilter) : undefined,
      situacao: NUTRICAO_PLAN_SITUACOES.includes(situacaoFilter as typeof NUTRICAO_PLAN_SITUACOES[number])
        ? situacaoFilter as typeof NUTRICAO_PLAN_SITUACOES[number]
        : undefined,
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
      try { localStorage.setItem(FAZENDA_KEY, id); } catch { /* ignore */ }
      setFazendaInitDone(true);
      return;
    }
    try {
      const stored = localStorage.getItem(FAZENDA_KEY);
      if (stored && fazendasData.some(f => String(f.id) === stored)) {
        setFazendaFilter(stored);
        setLocation(listUrl(stored), { replace: true });
      }
    } catch { /* ignore */ }
    setFazendaInitDone(true);
  }, [fazendasData, fazendaFilter, fazendaInitDone, setLocation]);

  const displayed = useMemo(() => planos, [planos]);
  const hasFiltro = Boolean(loteFilter || situacaoFilter || search.trim());
  const needsFazendaSelection = fazendaInitDone && fazendas.length > 0 && !fazendaFilter;
  const isFazendaEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && !hasFiltro;
  const isFiltroEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && hasFiltro;

  const handleFazendaChange = (v: string) => {
    setFazendaFilter(v);
    setLoteFilter("");
    setLocation(listUrl(v), { replace: true });
    try {
      if (v) localStorage.setItem(FAZENDA_KEY, v);
      else localStorage.removeItem(FAZENDA_KEY);
    } catch { /* ignore */ }
  };

  const goNovo = () => {
    if (!fazendaOk) return;
    setLocation(`/nutricao/planejamento/novo?fazendaId=${fazendaFilter}`);
  };

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900 shrink-0" style={{ fontFamily: "Fraunces, serif" }}>
            Planejamento Nutricional
          </h1>
          <button
            type="button"
            onClick={goNovo}
            disabled={!fazendaOk}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold transition shrink-0 min-h-[44px]",
              fazendaOk ? "hover:brightness-95 active:scale-[0.97]" : "opacity-50 cursor-not-allowed",
            )}
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">add</span>
            Novo Planejamento
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
            <div className="w-[180px] shrink-0">
              <FormSelect
                variant="light"
                placeholder="Lote"
                value={loteFilter || "__all__"}
                onChange={v => setLoteFilter(v === "__all__" ? "" : v)}
                triggerClassName={listControlClass}
              >
                <SelectItem value="__all__" className="text-[12px]">Todos os lotes</SelectItem>
                {lotes.map(l => (
                  <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div className="w-[160px] shrink-0">
              <FormSelect
                variant="light"
                placeholder="Situação"
                value={situacaoFilter || "__all__"}
                onChange={v => setSituacaoFilter(v === "__all__" ? "" : v)}
                triggerClassName={listControlClass}
              >
                <SelectItem value="__all__" className="text-[12px]">Todas</SelectItem>
                {NUTRICAO_PLAN_SITUACOES.map(s => (
                  <SelectItem key={s} value={s} className="text-[12px]">{labelSituacaoPlan(s)}</SelectItem>
                ))}
              </FormSelect>
            </div>
            <div className="w-[220px] shrink-0">
              <FormInput variant="light" value={search} onChange={setSearch} placeholder="Buscar lote ou origem" readOnly={!fazendaOk} />
            </div>
          </div>
        )}

        <TableHorizontalScroll fitWidth>
          <table className="w-full min-w-[900px] table-fixed text-[11px] border-collapse">
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
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-10 text-center text-gray-400">Carregando...</td>
                </tr>
              )}
              {fazendaInitDone && !isLoading && needsFazendaSelection && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">Selecione uma fazenda para visualizar os planejamentos.</p>
                    </div>
                  </td>
                </tr>
              )}
              {isFiltroEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">Nenhum planejamento encontrado.</p>
                    </div>
                  </td>
                </tr>
              )}
              {isFazendaEmpty && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="px-4 py-16">
                    <div className="max-w-md mx-auto text-center">
                      <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                      <p className="text-[14px] font-medium text-gray-800">Nenhum planejamento nutricional cadastrado.</p>
                      <p className="text-[12px] text-gray-500 mt-2 leading-relaxed">
                        Crie um planejamento para definir a estratégia nutricional de um lote ao longo de um período.
                      </p>
                      <button
                        type="button"
                        onClick={goNovo}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg text-white text-[12px] font-semibold"
                        style={{ backgroundColor: FD_PRIMARY }}
                      >
                        <span className="material-icons text-[16px]">add</span>
                        Novo Planejamento
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && displayed.map(plan => (
                <tr key={plan.id} className="group border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-800 font-medium truncate">{plan.loteNome}</td>
                  <td className="px-3 py-2.5 text-gray-600 truncate">{plan.origemNome}</td>
                  <td className="px-3 py-2.5 text-center text-gray-700">{plan.metaLabel}</td>
                  <td className="px-3 py-2.5 text-center text-gray-600 tabular-nums">
                    {formatDateBR(plan.dataInicio)} — {plan.dataFim ? formatDateBR(plan.dataFim) : "em aberto"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums">
                    {plan.projecao.necessidadeKgDia != null
                      ? `${plan.projecao.necessidadeKgDia.toLocaleString("pt-BR")} kg`
                      : (plan.projecao.mensagemNecessidade ?? "—")}
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-700 tabular-nums">
                    {formatarCustoProjetado(plan.projecao.custo.custoDia, plan.projecao.custo.completo, plan.projecao.custo.mensagem ?? "Custo não disponível")}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn(
                      "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                      plan.situacao === "vigente" && "bg-emerald-50 text-emerald-700",
                      plan.situacao === "programado" && "bg-sky-50 text-sky-700",
                      plan.situacao === "encerrado" && "bg-gray-100 text-gray-500",
                      plan.situacao === "cancelado" && "bg-amber-50 text-amber-800",
                    )}>
                      {labelSituacaoPlan(plan.situacao)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="inline-flex items-center justify-center gap-1">
                      <TableIconButton label="Visualizar" tone="view" onClick={() => setLocation(`/nutricao/planejamento/${plan.id}`)}>
                        <ViewActionIcon size={17} />
                      </TableIconButton>
                      {plan.status === "ativo" && (
                        <TableIconButton label="Editar" tone="neutral" onClick={() => setLocation(`/nutricao/planejamento/${plan.id}/editar`)}>
                          <EditActionIcon size={17} />
                        </TableIconButton>
                      )}
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
