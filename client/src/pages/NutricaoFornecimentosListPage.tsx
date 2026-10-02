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
  formatarDataHoraFornecimento,
  labelOrigemOperacionalForn,
  rotuloVinculoPlanejamentoForn,
  tooltipVinculoPlanejamentoForn,
} from "@shared/nutricaoFornecimentos";

const LIST_ROUTE = "/nutricao/fornecimentos";
const FAZENDA_KEY = "fd-nutricao-forn-fazenda-id";

const COLS = [
  { key: "data", label: "Data/Hora", width: "12%" },
  { key: "lote", label: "Lote", width: "12%" },
  { key: "origem", label: "Produto / Dieta", width: "16%" },
  { key: "qtd", label: "Quantidade", width: "12%" },
  { key: "animais", label: "Animais", width: "10%" },
  { key: "custo", label: "Custo", width: "11%" },
  { key: "plan", label: "Planejamento", width: "13%" },
  { key: "op", label: "Origem", width: "8%" },
  { key: "status", label: "Status", width: "8%" },
  { key: "acoes", label: "Ações", width: "5%" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function listUrl(fazendaId?: string) {
  return fazendaId ? `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}` : LIST_ROUTE;
}

export default function NutricaoFornecimentosListPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaFromUrl);
  const [loteFilter, setLoteFilter] = useState("");
  const [origemFilter, setOrigemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const fazendaIdNum = Number(fazendaFilter);
  const fazendaOk = Number.isFinite(fazendaIdNum) && fazendaIdNum > 0;
  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery({ fazendaId: fazendaIdNum }, { enabled: fazendaOk });
  const { data: rows = [], isLoading } = trpc.nutricaoFornecimentos.list.useQuery({
    fazendaId: fazendaIdNum,
    loteId: loteFilter ? Number(loteFilter) : undefined,
    tipoOrigem: origemFilter === "produto" || origemFilter === "dieta" ? origemFilter : undefined,
    status: statusFilter === "confirmado" || statusFilter === "estornado" ? statusFilter : undefined,
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
  const empty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0;

  const goNovo = () => fazendaOk && setLocation(`/nutricao/fornecimentos/novo?fazendaId=${fazendaFilter}`);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>Fornecimentos</h1>
          <button type="button" onClick={goNovo} disabled={!fazendaOk} className={cn("inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold min-h-[44px]", !fazendaOk && "opacity-50")} style={{ backgroundColor: FD_PRIMARY }}>
            <span className="material-icons text-[16px]">add</span>
            Novo Fornecimento
          </button>
        </div>
        {fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <FazendaOverviewSelect value={fazendaFilter} onChange={v => { setFazendaFilter(v); setLocation(listUrl(v), { replace: true }); try { v ? localStorage.setItem(FAZENDA_KEY, v) : localStorage.removeItem(FAZENDA_KEY); } catch { /* */ } }} fazendas={fazendas} showEmptyOption={fazendas.length > 1} className={cn(listControlClass, "min-w-[160px] h-9 py-0")} />
            <div className="w-[160px]"><FormSelect variant="light" placeholder="Lote" value={loteFilter || "__all__"} onChange={v => setLoteFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}><SelectItem value="__all__" className="text-[12px]">Todos os lotes</SelectItem>{lotes.map(l => <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>)}</FormSelect></div>
            <div className="w-[140px]"><FormSelect variant="light" placeholder="Origem" value={origemFilter || "__all__"} onChange={v => setOrigemFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}><SelectItem value="__all__" className="text-[12px]">Todas</SelectItem><SelectItem value="produto" className="text-[12px]">Produto</SelectItem><SelectItem value="dieta" className="text-[12px]">Dieta</SelectItem></FormSelect></div>
            <div className="w-[140px]"><FormSelect variant="light" placeholder="Status" value={statusFilter || "__all__"} onChange={v => setStatusFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}><SelectItem value="__all__" className="text-[12px]">Todos</SelectItem><SelectItem value="confirmado" className="text-[12px]">Confirmado</SelectItem><SelectItem value="estornado" className="text-[12px]">Estornado</SelectItem></FormSelect></div>
            <div className="w-[140px]"><FormDatePicker variant="light" value={dataInicio} onChange={setDataInicio} /></div>
            <div className="w-[140px]"><FormDatePicker variant="light" value={dataFim} onChange={setDataFim} /></div>
          </div>
        )}
        <TableHorizontalScroll fitWidth>
          <table className="w-full min-w-[1040px] table-fixed text-[11px] border-collapse">
            <colgroup>{COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}</colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>{COLS.map(c => <th key={c.key} className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaInitDone) && <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>}
              {fazendaInitDone && !isLoading && !fazendaOk && (
                <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Selecione a fazenda para ver os fornecimentos.</td></tr>
              )}
              {empty && (
                <tr><td colSpan={COLS.length} className="px-4 py-16">
                  <div className="max-w-md mx-auto text-center">
                    <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                    <p className="text-[14px] font-medium text-gray-800">Nenhum fornecimento registrado.</p>
                    <p className="text-[12px] text-gray-500 mt-2">Registre a quantidade efetivamente oferecida a um lote. Isso não é consumo.</p>
                  </div>
                </td></tr>
              )}
              {!isLoading && displayed.map(row => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-center tabular-nums">{formatarDataHoraFornecimento(row.data, row.hora)}</td>
                  <td className="px-3 py-2.5 text-center">{row.loteNome}</td>
                  <td className="px-3 py-2.5 text-center truncate">{row.origemNomeSnapshot}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{Number(row.quantidadeFornecidaKg).toLocaleString("pt-BR")} kg</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.populacaoSnapshot}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.custoCompleto && row.custoTotalSnapshot != null ? Number(row.custoTotalSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span
                      title={tooltipVinculoPlanejamentoForn({
                        planejamentoId: row.planejamentoId,
                        loteNome: row.loteNome,
                        planejamentoMetaSnapshot: row.planejamentoMetaSnapshot,
                      })}
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                        Number(row.planejamentoId) > 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {rotuloVinculoPlanejamentoForn(row.planejamentoId)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">{labelOrigemOperacionalForn(row.origemOperacional)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", row.status === "confirmado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>
                      {row.status === "confirmado" ? "Confirmado" : "Estornado"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <TableIconButton label="Visualizar" tone="view" onClick={() => setLocation(`/nutricao/fornecimentos/${row.id}`)}>
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
