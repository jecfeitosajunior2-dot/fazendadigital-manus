import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { EditActionIcon, TableIconButton, ViewActionIcon } from "@/components/icons/FarmActionIcons";
import FazendaLandIcon from "@/components/icons/FazendaLandIcon";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";
import { formatarLocalizacaoCocho, labelTipoCocho, NUTRICAO_COCHO_TIPOS, type NutricaoCochoTipo } from "@shared/nutricaoCochos";

const LIST_ROUTE = "/nutricao/cochos";
const FAZENDA_KEY = "fd-nutricao-cochos-fazenda-id";

const COLS = [
  { key: "nome", label: "Cocho", width: "18%" },
  { key: "loc", label: "Localização", width: "18%" },
  { key: "tipo", label: "Tipo", width: "12%" },
  { key: "comp", label: "Comprimento", width: "10%" },
  { key: "cap", label: "Capacidade", width: "10%" },
  { key: "ult", label: "Último fornecimento", width: "16%" },
  { key: "status", label: "Status", width: "8%" },
  { key: "acoes", label: "Ações", width: "8%" },
];

const listControlClass =
  "h-9 px-3 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 shrink-0 focus:outline-none focus:border-[#4ECDC4]";

function listUrl(fazendaId?: string) {
  return fazendaId ? `${LIST_ROUTE}?fazendaId=${encodeURIComponent(fazendaId)}` : LIST_ROUTE;
}

export default function NutricaoCochosListPage() {
  const [, setLocation] = useLocation();
  const fazendaFromUrl = new URLSearchParams(window.location.search).get("fazendaId") ?? "";
  const [fazendaFilter, setFazendaFilter] = useState(fazendaFromUrl);
  const [tipoFilter, setTipoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);

  const { data: fazendasData } = trpc.fazendas.list.useQuery();
  const fazendas = fazendasData ?? [];
  const fazendaIdNum = Number(fazendaFilter);
  const fazendaOk = Number.isFinite(fazendaIdNum) && fazendaIdNum > 0;
  const { data: rows = [], isLoading } = trpc.nutricaoCochos.list.useQuery({
    fazendaId: fazendaIdNum,
    tipo: NUTRICAO_COCHO_TIPOS.some(t => t.value === tipoFilter) ? tipoFilter as NutricaoCochoTipo : undefined,
    status: statusFilter === "ativo" || statusFilter === "inativo" ? statusFilter : undefined,
    search: search.trim() || undefined,
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
  const hasFiltro = Boolean(tipoFilter || statusFilter || search.trim());
  const empty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && !hasFiltro;
  const filtroEmpty = fazendaInitDone && !isLoading && fazendaOk && displayed.length === 0 && hasFiltro;
  const goNovo = () => fazendaOk && setLocation(`/nutricao/cochos/novo?fazendaId=${fazendaFilter}`);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>Cochos</h1>
          <button type="button" onClick={goNovo} disabled={!fazendaOk} className={cn("inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold min-h-[44px]", !fazendaOk && "opacity-50")} style={{ backgroundColor: FD_PRIMARY }}>
            <span className="material-icons text-[16px]">add</span>
            Novo Cocho
          </button>
        </div>
        {fazendas.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-50 flex flex-wrap items-center gap-2">
            <FazendaOverviewSelect value={fazendaFilter} onChange={v => { setFazendaFilter(v); setLocation(listUrl(v), { replace: true }); try { v ? localStorage.setItem(FAZENDA_KEY, v) : localStorage.removeItem(FAZENDA_KEY); } catch { /* */ } }} fazendas={fazendas} showEmptyOption={fazendas.length > 1} className={cn(listControlClass, "min-w-[160px] h-9 py-0")} />
            <div className="w-[160px]">
              <FormSelect variant="light" placeholder="Tipo" value={tipoFilter || "__all__"} onChange={v => setTipoFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}>
                <SelectItem value="__all__" className="text-[12px]">Todos</SelectItem>
                {NUTRICAO_COCHO_TIPOS.map(t => <SelectItem key={t.value} value={t.value} className="text-[12px]">{t.label}</SelectItem>)}
              </FormSelect>
            </div>
            <div className="w-[140px]">
              <FormSelect variant="light" placeholder="Status" value={statusFilter || "__all__"} onChange={v => setStatusFilter(v === "__all__" ? "" : v)} triggerClassName={listControlClass}>
                <SelectItem value="__all__" className="text-[12px]">Todos</SelectItem>
                <SelectItem value="ativo" className="text-[12px]">Ativo</SelectItem>
                <SelectItem value="inativo" className="text-[12px]">Inativo</SelectItem>
              </FormSelect>
            </div>
            <div className="w-[200px]"><FormInput variant="light" value={search} onChange={setSearch} placeholder="Buscar nome ou código" readOnly={!fazendaOk} /></div>
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
              {fazendaInitDone && !isLoading && !fazendaOk && <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Selecione a fazenda para ver os cochos.</td></tr>}
              {filtroEmpty && <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-gray-400">Nenhum cocho encontrado com estes filtros.</td></tr>}
              {empty && (
                <tr><td colSpan={COLS.length} className="px-4 py-16">
                  <div className="max-w-md mx-auto text-center">
                    <FazendaLandIcon className="mx-auto mb-3 h-12 w-12 text-[#B0BEC5]" />
                    <p className="text-[14px] font-medium text-gray-800">Nenhum cocho cadastrado.</p>
                    <p className="text-[12px] text-gray-500 mt-2">Cadastre os cochos utilizados na suplementação e alimentação do rebanho.</p>
                  </div>
                </td></tr>
              )}
              {!isLoading && displayed.map(row => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-center truncate">{row.identificacao}</td>
                  <td className="px-3 py-2.5 text-center truncate">{formatarLocalizacaoCocho(row.pastoNome, row.localizacaoDescricao)}</td>
                  <td className="px-3 py-2.5 text-center">{labelTipoCocho(row.tipo)}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.comprimentoMetros != null ? `${Number(row.comprimentoMetros).toLocaleString("pt-BR")} m` : "—"}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{row.capacidadeKg != null ? `${Number(row.capacidadeKg).toLocaleString("pt-BR")} kg` : "—"}</td>
                  <td className="px-3 py-2.5 text-center">{row.ultimoFornecimento ? formatarDataHoraFornecimento(row.ultimoFornecimento.data, row.ultimoFornecimento.hora) : "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", row.status === "ativo" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500")}>
                      {row.status === "ativo" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="inline-flex items-center justify-center gap-1">
                      <TableIconButton label="Visualizar" tone="view" onClick={() => setLocation(`/nutricao/cochos/${row.id}`)}>
                        <ViewActionIcon size={17} />
                      </TableIconButton>
                      <TableIconButton label="Editar" tone="neutral" onClick={() => setLocation(`/nutricao/cochos/${row.id}/editar`)}>
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
