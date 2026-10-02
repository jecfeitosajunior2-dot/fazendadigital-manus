import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormDatePicker, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { TableIconButton, ViewActionIcon } from "@/components/icons/FarmActionIcons";
import FazendaLandIcon from "@/components/icons/FazendaLandIcon";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  formatarDataHoraBatida,
  labelSituacaoBatida,
  labelStatusBatida,
  type NutricaoBatidaSituacao,
} from "@shared/nutricaoBatidas";

const LIST_ROUTE = "/nutricao/batidas";
const FAZENDA_KEY = "fd-nutricao-batidas-fazenda-id";

const COLS = [
  { key: "data", label: "Data/Hora", width: "13%" },
  { key: "dieta", label: "Dieta", width: "16%" },
  { key: "prep", label: "Preparada", width: "11%" },
  { key: "dist", label: "Distribuída", width: "11%" },
  { key: "saldo", label: "Saldo", width: "11%" },
  { key: "custo", label: "Custo/kg", width: "12%" },
  { key: "sit", label: "Situação", width: "12%" },
  { key: "status", label: "Status", width: "8%" },
  { key: "acoes", label: "Ações", width: "6%" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function listUrl(fazendaId?: string) {
  return fazendaId ? `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}` : LIST_ROUTE;
}

export default function NutricaoBatidasListPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaFromUrl);
  const [dietaFilter, setDietaFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [situacaoFilter, setSituacaoFilter] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const fazendaIdNum = Number(fazendaFilter);
  const fazendaOk = Number.isFinite(fazendaIdNum) && fazendaIdNum > 0;
  const { data: dietas = [] } = trpc.nutricaoPlanejamento.listDietas.useQuery(
    { fazendaId: fazendaIdNum },
    { enabled: fazendaOk },
  );
  const { data: rows = [], isLoading } = trpc.nutricaoBatidas.list.useQuery({
    fazendaId: fazendaIdNum,
    dietaId: dietaFilter ? Number(dietaFilter) : undefined,
    status: statusFilter === "confirmado" || statusFilter === "estornado" ? statusFilter : undefined,
    situacao: ["disponivel", "parcial", "total"].includes(situacaoFilter)
      ? situacaoFilter as NutricaoBatidaSituacao
      : undefined,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  }, { enabled: fazendaOk });

  useEffect(() => {
    if (fazendaInitDone || fazendasData === undefined) return;
    if (fazendaFilter || !fazendasData.length) {
      setFazendaInitDone(true);
      return;
    }
    const id = fazendasData.length === 1 ? String(fazendasData[0].id) : (localStorage.getItem(FAZENDA_KEY) ?? "");
    if (id && fazendasData.some(f => String(f.id) === id)) {
      setFazendaFilter(id);
      setLocation(listUrl(id), { replace: true });
    }
    setFazendaInitDone(true);
  }, [fazendasData, fazendaFilter, fazendaInitDone, setLocation]);

  const displayed = useMemo(() => rows, [rows]);
  const hasFiltro = Boolean(dietaFilter || statusFilter || situacaoFilter || dataInicio || dataFim);
  const empty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && !hasFiltro;
  const filtroEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && hasFiltro;

  const goNova = () => fazendaOk && setLocation(`/nutricao/batidas/nova?fazendaId=${fazendaFilter}`);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>Batidas</h1>
          <button type="button" onClick={goNova} disabled={!fazendaOk} className={cn("inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold min-h-[44px]", !fazendaOk && "opacity-50")} style={{ backgroundColor: FD_PRIMARY }}>
            <span className="material-icons text-[16px]">add</span>
            Nova Batida
          </button>
        </div>
        {fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <FazendaOverviewSelect value={fazendaFilter} onChange={v => { setFazendaFilter(v); setLocation(listUrl(v), { replace: true }); try { v ? localStorage.setItem(FAZENDA_KEY, v) : localStorage.removeItem(FAZENDA_KEY); } catch { /* */ } }} fazendas={fazendas} showEmptyOption={fazendas.length > 1} className={cn(listControlClass, "min-w-[160px] h-9 py-0")} />
            <div className="w-[180px]">
              <FormSelect variant="light" placeholder="Dieta" value={dietaFilter || "__all__"} onChange={v => setDietaFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}>
                <SelectItem value="__all__" className="text-[12px]">Todas as dietas</SelectItem>
                {dietas.map(d => <SelectItem key={d.id} value={String(d.id)} className="text-[12px]">{d.nome}</SelectItem>)}
              </FormSelect>
            </div>
            <div className="w-[160px]">
              <FormSelect variant="light" placeholder="Situação" value={situacaoFilter || "__all__"} onChange={v => setSituacaoFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}>
                <SelectItem value="__all__" className="text-[12px]">Todas</SelectItem>
                <SelectItem value="disponivel" className="text-[12px]">Disponível</SelectItem>
                <SelectItem value="parcial" className="text-[12px]">Parcialmente distribuída</SelectItem>
                <SelectItem value="total" className="text-[12px]">Totalmente distribuída</SelectItem>
              </FormSelect>
            </div>
            <div className="w-[140px]">
              <FormSelect variant="light" placeholder="Status" value={statusFilter || "__all__"} onChange={v => setStatusFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}>
                <SelectItem value="__all__" className="text-[12px]">Todos</SelectItem>
                <SelectItem value="confirmado" className="text-[12px]">Confirmada</SelectItem>
                <SelectItem value="estornado" className="text-[12px]">Estornada</SelectItem>
              </FormSelect>
            </div>
            <div className="w-[140px]"><FormDatePicker variant="light" value={dataInicio} onChange={setDataInicio} /></div>
            <div className="w-[140px]"><FormDatePicker variant="light" value={dataFim} onChange={setDataFim} /></div>
          </div>
        )}
        <TableHorizontalScroll fitWidth>
          <table className="w-full min-w-[920px] table-fixed text-[11px] border-collapse">
            <colgroup>{COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{COLS.map(c => <th key={c.key} className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaInitDone) && <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>}
              {fazendaInitDone && !isLoading && !fazendaOk && (
                <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Selecione a fazenda para ver as batidas.</td></tr>
              )}
              {empty && (
                <tr><td colSpan={COLS.length} className="px-4 py-16">
                  <div className="max-w-md mx-auto text-center">
                    <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                    <p className="text-[14px] font-medium text-gray-800">Nenhuma batida registrada.</p>
                    <p className="text-[12px] text-gray-500 mt-2">Registre o preparo de dietas para controlar ingredientes, custos e posterior distribuição aos lotes.</p>
                  </div>
                </td></tr>
              )}
              {filtroEmpty && (
                <tr><td colSpan={COLS.length} className="px-4 py-16 text-center text-gray-500 text-[13px]">Nenhuma batida encontrada com estes filtros.</td></tr>
              )}
              {!isLoading && displayed.map(row => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-center tabular-nums">{formatarDataHoraBatida(row.data, row.hora)}</td>
                  <td className="px-3 py-2.5 text-center truncate">{row.dietaNomeSnapshot}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.quantidadePreparadaKgNum.toLocaleString("pt-BR")} kg</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.quantidadeDistribuidaKg.toLocaleString("pt-BR")} kg</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.saldoDisponivelKg.toLocaleString("pt-BR")} kg</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {row.custoCompleto && row.custoKgSnapshot != null
                      ? Number(row.custoKgSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "Custo incompleto"}
                  </td>
                  <td className="px-3 py-2.5 text-center">{labelSituacaoBatida(row.situacao)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", row.status === "confirmado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                      {labelStatusBatida(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <TableIconButton label="Visualizar" tone="view" onClick={() => setLocation(`/nutricao/batidas/${row.id}`)}>
                      <ViewActionIcon size={17} />
                    </TableIconButton>
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
