import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ListExportButtons from "@/components/ListExportButtons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, AlertCircle, X } from "lucide-react";
import { FarmRowActionButtons } from "@/components/icons/FarmActionIcons";
import { FD_PRIMARY } from "@/components/FormFields";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import { toast } from "sonner";
import {
  FAIXAS_IDADE_LOTE,
  FAIXA_IDADE_LOTE_LABELS,
  faixaIdadeLoteRange,
  totalPorSexoFaixas,
  type ContagemPorFaixa,
  type FaixaIdadeLote,
} from "@shared/lote-faixas-idade";

interface LoteItem {
  id: number;
  nome: string;
  descricao?: string | null;
  localizacao?: string | null;
  capacidade?: number | null;
  ativo?: boolean | null;
  qtdAnimais?: number | null;
  diasNoPasto?: number | null;
  pastoNome?: string | null;
  pastoCapacidade?: number | null;
  fazendaNome?: string | null;
}

type LoteGerenciamento = {
  id: number;
  nome: string;
  fazendaId: number | null;
  fazendaNome: string | null;
  ativo: boolean | null;
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
  machosSemIdade: number;
  femeasSemIdade: number;
  capacidade: number | null;
  totalAnimais: number;
  pctOcupacao: number | null;
  superlotado: boolean;
};

interface DeleteConfirmState { lote: LoteItem }
interface DeleteBlockedState { nomeLote: string; qtdAnimais: number }

function lotesListUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/lotes?fazendaId=${fazendaId}` : "/rebanho/lotes";
}

function novoLoteUrl(fazendaId?: string) {
  return fazendaId ? `/rebanho/novo-lote?fazendaId=${fazendaId}` : "/rebanho/novo-lote";
}

function ContagemCell({
  value,
  onClick,
  label,
}: {
  value: number;
  onClick?: () => void;
  label: string;
}) {
  if (value <= 0) {
    return <span className="text-gray-300 tabular-nums">—</span>;
  }
  if (!onClick) {
    return <span className="font-semibold text-gray-800 tabular-nums">{value}</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="font-semibold text-gray-800 tabular-nums cursor-pointer hover:text-[#2D5A5A] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D5A5A]/30 rounded"
    >
      {value}
    </button>
  );
}

export default function LotsManagementPage() {
  const [, setLocation] = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const fazendaInicial = urlParams.get("fazendaId") || "";
  const apenasSuperlotadosInicial = urlParams.get("apenasSuperlotados") === "true";

  const [fazendaFilter, setFazendaFilter] = useState(fazendaInicial);
  const [fazendaReady, setFazendaReady] = useState(Boolean(fazendaInicial));
  const [apenasSuperlotados, setApenasSuperlotados] = useState(apenasSuperlotadosInicial);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<DeleteBlockedState | null>(null);

  const queryInput = useMemo(() => ({
    fazendaId: fazendaFilter ? Number(fazendaFilter) : undefined,
    search: search.trim() || undefined,
  }), [fazendaFilter, search]);

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const fazendasList = fazendas as { id: number; nome: string }[];

  // Resolve o seletor: 1 fazenda → auto; várias → "Todas as fazendas" (visão consolidada já suportada pela API).
  useEffect(() => {
    if (loadingFazendas) return;
    if (fazendaFilter) {
      setFazendaReady(true);
      return;
    }
    if (fazendasList.length === 1) {
      const id = String(fazendasList[0].id);
      setFazendaFilter(id);
      setFazendaReady(true);
      const url = new URLSearchParams();
      url.set("fazendaId", id);
      if (apenasSuperlotados) url.set("apenasSuperlotados", "true");
      setLocation(`/rebanho/lotes?${url.toString()}`, { replace: true });
      return;
    }
    setFazendaReady(true);
  }, [loadingFazendas, fazendasList, fazendaFilter, apenasSuperlotados, setLocation]);

  const {
    data: gerenciamento = [],
    isLoading,
    refetch,
  } = trpc.lotes.gerenciamento.useQuery(queryInput, { enabled: fazendaReady });
  const { data: lotesFull = [] } = trpc.lotes.list.useQuery(undefined, { enabled: fazendaReady });
  const loteById = useMemo(
    () => new Map((lotesFull as LoteItem[]).map(l => [l.id, l])),
    [lotesFull],
  );

  const sorted = useMemo(() => {
    let lista = [...(gerenciamento as LoteGerenciamento[])];
    if (apenasSuperlotados) {
      lista = lista.filter(l => l.superlotado);
    }
    lista.sort((a, b) => {
      const cmp = a.nome.localeCompare(b.nome, "pt-BR");
      return sortAsc ? cmp : -cmp;
    });
    return lista;
  }, [gerenciamento, sortAsc, apenasSuperlotados]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  const goAnimais = (opts: {
    loteId: number;
    fazendaId?: number | null;
    sexo?: "macho" | "femea";
    faixa?: FaixaIdadeLote;
    semDataNascimento?: boolean;
  }) => {
    const qs = new URLSearchParams();
    qs.set("loteId", String(opts.loteId));
    if (opts.fazendaId) qs.set("fazendaId", String(opts.fazendaId));
    else if (fazendaFilter) qs.set("fazendaId", fazendaFilter);
    if (opts.sexo) qs.set("sexo", opts.sexo);
    if (opts.semDataNascimento) {
      qs.set("semDataNascimento", "true");
    } else if (opts.faixa) {
      const range = faixaIdadeLoteRange(opts.faixa);
      qs.set("idadeMesesMin", String(range.min));
      if (range.max != null) qs.set("idadeMesesMax", String(range.max));
    }
    setLocation(`/rebanho/lista-animais?${qs.toString()}`);
  };

  const excluirMutation = trpc.lotes.excluir.useMutation({
    onSuccess: (data) => {
      toast.success(`Lote "${data.nomeLote}" excluído com sucesso.`);
      setDeleteConfirm(null);
      refetch();
    },
    onError: (err) => {
      const loteAtual = deleteConfirm?.lote;
      setDeleteConfirm(null);
      if (err.data?.code === "PRECONDITION_FAILED") {
        const match = err.message.match(/Existem (\d+) animal/);
        const qtd = match ? parseInt(match[1], 10) : (loteAtual?.qtdAnimais ?? 1);
        setDeleteBlocked({ nomeLote: loteAtual?.nome ?? "—", qtdAnimais: qtd });
      } else {
        toast.error(err.message || "Erro ao excluir o lote.");
      }
    },
  });

  const handleDeleteRequest = (row: LoteGerenciamento) => {
    const lote = loteById.get(row.id);
    if (!lote) return;
    if ((lote.qtdAnimais ?? 0) > 0 || row.totalAnimais > 0) {
      setDeleteBlocked({
        nomeLote: lote.nome,
        qtdAnimais: lote.qtdAnimais ?? row.totalAnimais ?? 1,
      });
      return;
    }
    setDeleteConfirm({ lote });
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === paginated.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paginated.map(l => l.id)));
    }
  };

  const exportHeaders = [
    "Nome do Lote",
    ...FAIXAS_IDADE_LOTE.map(f => `Machos ${FAIXA_IDADE_LOTE_LABELS[f]} meses`),
    "Machos sem data nasc.",
    ...FAIXAS_IDADE_LOTE.map(f => `Fêmeas ${FAIXA_IDADE_LOTE_LABELS[f]} meses`),
    "Fêmeas sem data nasc.",
    "Total",
    "Machos",
    "Fêmeas",
  ];

  const exportData = useMemo(
    () => sorted.map(l => {
      const totalMachos = totalPorSexoFaixas(l.machos, l.machosSemIdade ?? 0);
      const totalFemeas = totalPorSexoFaixas(l.femeas, l.femeasSemIdade ?? 0);
      return [
        l.nome,
        ...FAIXAS_IDADE_LOTE.map(f => l.machos[f] || 0),
        l.machosSemIdade || 0,
        ...FAIXAS_IDADE_LOTE.map(f => l.femeas[f] || 0),
        l.femeasSemIdade || 0,
        totalMachos + totalFemeas,
        totalMachos,
        totalFemeas,
      ];
    }),
    [sorted],
  );

  const qtdSuperlotados = (gerenciamento as LoteGerenciamento[]).filter(l => l.superlotado).length;

  const COL_COUNT = 15; // checkbox + nome + 5M + 5F + total + ações

  const faixaAriaLabel = (
    sexo: "macho" | "femea",
    faixa: FaixaIdadeLote,
    qtd: number,
    nomeLote: string,
  ) => {
    const range = faixaIdadeLoteRange(faixa);
    const sexoLabel = sexo === "femea"
      ? (qtd === 1 ? "fêmea" : "fêmeas")
      : (qtd === 1 ? "macho" : "machos");
    const idadeTxt = range.max != null
      ? `${range.min} a ${range.max} meses`
      : `${range.min} ou mais meses`;
    return `Ver ${qtd} ${sexoLabel} de ${idadeTxt} do lote ${nomeLote}`;
  };

  return (
    <div className="p-4 sm:p-6">
      <Dialog open={!!deleteConfirm} onOpenChange={v => !v && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <DialogTitle className="text-gray-900">Excluir lote</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed">
              Tem certeza que deseja excluir o lote{" "}
              <span className="font-semibold text-gray-900">&quot;{deleteConfirm?.lote.nome}&quot;</span>?
              <br />
              <span className="text-red-600 font-medium">Esta ação não poderá ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={excluirMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && excluirMutation.mutate({ id: deleteConfirm.lote.id })}
              disabled={excluirMutation.isPending}
            >
              {excluirMutation.isPending ? "Excluindo…" : "Excluir Lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteBlocked} onOpenChange={v => !v && setDeleteBlocked(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-gray-900">Não é possível excluir</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed">
              O lote <span className="font-semibold text-gray-900">&quot;{deleteBlocked?.nomeLote}&quot;</span> possui{" "}
              <span className="font-semibold text-amber-700">
                {deleteBlocked?.qtdAnimais} {deleteBlocked?.qtdAnimais === 1 ? "animal vinculado" : "animais vinculados"}
              </span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDeleteBlocked(null)} className="w-full">Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-[15px] font-semibold text-gray-800 shrink-0">Gerenciamento de Lotes</h1>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setLocation(novoLoteUrl(fazendaFilter || undefined))}
            className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold hover:brightness-95 active:scale-[0.97] transition shrink-0 min-h-[44px]"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px]">add</span>
            <span className="hidden sm:inline">Novo Lote</span>
            <span className="sm:hidden">Novo</span>
          </button>
          <ListExportButtons
            title="Gerenciamento de Lotes"
            filename="gerenciamento-lotes"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={1}
            fazendaNome={fazendaFilter
              ? fazendasList.find(f => f.id === Number(fazendaFilter))?.nome ?? "Todas as fazendas"
              : "Todas as fazendas"}
            variant="secondary"
          />
        </div>
      </div>

      {apenasSuperlotados && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-800 text-[12px]">
          <span className="material-icons text-[16px] text-red-500">warning</span>
          <span className="font-medium">
            Exibindo apenas lotes superlotados
            {qtdSuperlotados > 0 ? ` (${qtdSuperlotados} ${qtdSuperlotados === 1 ? "lote" : "lotes"})` : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              setApenasSuperlotados(false);
              setPage(1);
              setLocation(lotesListUrl(fazendaFilter), { replace: true });
            }}
            className="ml-auto flex items-center gap-1 text-red-600 hover:text-red-800 transition-colors"
            title="Remover filtro"
          >
            <X className="w-3.5 h-3.5" />
            <span>Remover filtro</span>
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-full sm:w-auto sm:min-w-[200px]">
          <select
            value={fazendaFilter}
            onChange={e => {
              const v = e.target.value;
              setFazendaFilter(v);
              setPage(1);
              const url = new URLSearchParams();
              if (v) url.set("fazendaId", v);
              if (apenasSuperlotados) url.set("apenasSuperlotados", "true");
              setLocation(`/rebanho/lotes${url.toString() ? `?${url.toString()}` : ""}`, { replace: true });
            }}
            className="w-full h-[40px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#2D5A5A]"
            aria-label="Fazenda"
          >
            <option value="">Todas as fazendas</option>
            {fazendasList.map(f => (
              <option key={f.id} value={String(f.id)}>{f.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px] sm:max-w-xs ml-auto">
          <div className="relative">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar lote"
              aria-label="Buscar lote"
              className="w-full h-[40px] pl-9 pr-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] placeholder:text-gray-400 focus:outline-none focus:border-[#2D5A5A]"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[min(70vh,720px)]">
          <table className="w-full text-[12px] min-w-[1100px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50">
                <th
                  rowSpan={2}
                  className="sticky top-0 left-0 z-30 w-10 px-2 py-2 border-b border-r border-gray-200 bg-gray-50"
                >
                  <Checkbox
                    checked={paginated.length > 0 && selected.size === paginated.length}
                    onCheckedChange={toggleSelectAll}
                    className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                  />
                </th>
                <th
                  rowSpan={2}
                  className="sticky top-0 left-10 z-30 px-3 py-2 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50 min-w-[180px]"
                >
                  <button
                    type="button"
                    onClick={() => setSortAsc(v => !v)}
                    className="inline-flex items-center gap-1 hover:text-gray-900"
                  >
                    Nome do Lote
                    <span className="material-icons text-[14px] text-gray-400">
                      {sortAsc ? "arrow_upward" : "arrow_downward"}
                    </span>
                  </button>
                </th>
                <th
                  colSpan={5}
                  className="sticky top-0 z-20 px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50"
                >
                  Machos
                </th>
                <th
                  colSpan={5}
                  className="sticky top-0 z-20 px-2 py-1.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50"
                >
                  Fêmeas
                </th>
                <th
                  rowSpan={2}
                  className="sticky top-0 z-20 w-20 px-2 py-2 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-b border-r border-gray-200 bg-gray-50"
                >
                  Total
                </th>
                <th
                  rowSpan={2}
                  className="sticky top-0 z-20 w-24 px-2 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase border-b border-gray-200 bg-gray-50"
                >
                  Ações
                </th>
              </tr>
              <tr className="bg-gray-50">
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th
                    key={`m-${f}`}
                    className="sticky top-[29px] z-20 px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 border-b border-r border-gray-100 bg-gray-50 w-12"
                    title={`${FAIXA_IDADE_LOTE_LABELS[f]} meses completos`}
                  >
                    {FAIXA_IDADE_LOTE_LABELS[f]}
                  </th>
                ))}
                {FAIXAS_IDADE_LOTE.map(f => (
                  <th
                    key={`f-${f}`}
                    className="sticky top-[29px] z-20 px-2 py-1.5 text-center text-[10px] font-medium text-gray-500 border-b border-r border-gray-100 bg-gray-50 w-12"
                    title={`${FAIXA_IDADE_LOTE_LABELS[f]} meses completos`}
                  >
                    {FAIXA_IDADE_LOTE_LABELS[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(isLoading || !fazendaReady || loadingFazendas) && (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-gray-400">Carregando...</td>
                </tr>
              )}
              {!isLoading && fazendaReady && !loadingFazendas && paginated.length === 0 && (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-gray-400">
                    {apenasSuperlotados ? "Nenhum lote superlotado encontrado" : "Nenhum lote encontrado"}
                  </td>
                </tr>
              )}
              {fazendaReady && !loadingFazendas && !isLoading && paginated.map(lote => {
                const totalMachos = totalPorSexoFaixas(lote.machos, lote.machosSemIdade ?? 0);
                const totalFemeas = totalPorSexoFaixas(lote.femeas, lote.femeasSemIdade ?? 0);
                const totalGeral = totalMachos + totalFemeas;
                const semNasc = (lote.machosSemIdade ?? 0) + (lote.femeasSemIdade ?? 0);

                return (
                  <tr
                    key={lote.id}
                    className="group border-t border-gray-100 hover:bg-gray-50/50"
                  >
                    <td className="sticky left-0 z-10 px-2 py-2 text-center border-r border-gray-50 bg-white group-hover:bg-gray-50">
                      <Checkbox
                        checked={selected.has(lote.id)}
                        onCheckedChange={() => toggleSelect(lote.id)}
                        className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                      />
                    </td>
                    <td className="sticky left-10 z-10 px-3 py-2 border-r border-gray-50 bg-white group-hover:bg-gray-50 min-w-[180px]">
                      <button
                        type="button"
                        onClick={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)}
                        className="text-left font-medium text-gray-800 hover:underline"
                      >
                        {lote.nome}
                      </button>
                      {semNasc > 0 && (
                        <button
                          type="button"
                          onClick={() => goAnimais({
                            loteId: lote.id,
                            fazendaId: lote.fazendaId,
                            semDataNascimento: true,
                          })}
                          className="mt-0.5 block text-[10px] text-amber-700 hover:underline"
                          title="Ver animais sem data de nascimento neste lote"
                          aria-label={`Ver ${semNasc} animal${semNasc === 1 ? "" : "is"} sem data de nascimento do lote ${lote.nome}`}
                        >
                          Sem data nasc.: {semNasc}
                          {(lote.machosSemIdade > 0 || lote.femeasSemIdade > 0) && (
                            <span className="text-amber-600/80">
                              {" "}(M: {lote.machosSemIdade || 0} · F: {lote.femeasSemIdade || 0})
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                    {FAIXAS_IDADE_LOTE.map(f => {
                      const qtd = lote.machos[f] ?? 0;
                      return (
                        <td key={`m-${lote.id}-${f}`} className="px-2 py-2 text-center border-r border-gray-50">
                          <ContagemCell
                            value={qtd}
                            label={faixaAriaLabel("macho", f, qtd, lote.nome)}
                            onClick={() => goAnimais({
                              loteId: lote.id,
                              fazendaId: lote.fazendaId,
                              sexo: "macho",
                              faixa: f,
                            })}
                          />
                        </td>
                      );
                    })}
                    {FAIXAS_IDADE_LOTE.map(f => {
                      const qtd = lote.femeas[f] ?? 0;
                      return (
                        <td key={`f-${lote.id}-${f}`} className="px-2 py-2 text-center border-r border-gray-50">
                          <ContagemCell
                            value={qtd}
                            label={faixaAriaLabel("femea", f, qtd, lote.nome)}
                            onClick={() => goAnimais({
                              loteId: lote.id,
                              fazendaId: lote.fazendaId,
                              sexo: "femea",
                              faixa: f,
                            })}
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-center border-l border-r border-gray-200 bg-gray-50/60">
                      <ContagemCell
                        value={totalGeral}
                        label={`Ver todos os ${totalGeral} animais do lote ${lote.nome}`}
                        onClick={() => goAnimais({
                          loteId: lote.id,
                          fazendaId: lote.fazendaId,
                        })}
                      />
                      {totalGeral > 0 && (
                        <div className="text-[10px] text-gray-600 mt-0.5 tabular-nums leading-tight">
                          M: {totalMachos} · F: {totalFemeas}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <FarmRowActionButtons
                        onEdit={() => setLocation(`/rebanho/editar-lote?id=${lote.id}`)}
                        onDelete={() => handleDeleteRequest(lote)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Faixas etárias em meses completos
        </div>

        <div className="border-t border-gray-100">
          <TablePaginationFooter
            pageSize={perPage}
            page={pageSafe}
            totalItems={total}
            onPageChange={setPage}
            onPageSizeChange={size => {
              setPerPage(size);
              setPage(1);
            }}
            itemLabel="lotes"
          />
        </div>
      </div>
    </div>
  );
}
