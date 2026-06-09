import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { formatDateBR } from "@/lib/date-utils";
import { RACAS, getCategoriasPorSexo, todasAsCategorias } from "@shared/animal-types";
import { animaisFiltersToApiParams } from "@shared/animal-filter-types";
import type { AnimaisListFiltersState } from "@shared/animal-filter-types";
import type { AnimalAlocacaoRow } from "@/components/rebanho/alocacao-types";

const IRANCHO_BTN_GREEN = "#8ab83d";
const IRANCHO_BTN_GREY = "#C0C0C0";
const PER_PAGE = 50;

const INITIAL_FILTERS: AnimaisListFiltersState = {
  fazendaId: "",
  raca: "",
  pesquisa: "",
  sexo: "",
  categoria: "",
  loteId: "",
  pesoInicial: "",
  pesoFinal: "",
  dataNascimentoInicial: "",
  dataNascimentoFinal: "",
  somenteSisbov: false,
  marcadores: [],
  maisFiltrosAbertos: false,
  pastoId: "",
};

type Props = {
  open: boolean;
  onClose: () => void;
  jaSelecionados: Set<number>;
  onConfirm: (animais: AnimalAlocacaoRow[]) => void;
};

const labelClass = "block text-[11px] font-medium text-gray-600 mb-1";
const inputClass =
  "w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#8ab83d]";
const selectClass =
  "w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#8ab83d] appearance-none";

function displayId(animal: {
  id: number;
  brincoEletronico: string | null;
  brinco: string | null;
  nome: string | null;
}) {
  return animal.brinco?.trim() || String(animal.id);
}

function displayNome(animal: { nome: string | null; brinco: string | null }) {
  return animal.nome?.trim() || animal.brinco?.trim() || "—";
}

function fazendaSubdivisao(lote?: {
  fazendaNome?: string | null;
  pastoNome?: string | null;
}) {
  if (!lote?.fazendaNome && !lote?.pastoNome) return "—";
  if (lote.fazendaNome && lote.pastoNome) return `${lote.fazendaNome} - ${lote.pastoNome}`;
  return lote.fazendaNome || lote.pastoNome || "—";
}

function toAlocacaoRow(
  animal: {
    id: number;
    brincoEletronico: string | null;
    brinco: string | null;
    nome: string | null;
    sexo: "macho" | "femea";
    loteId: number | null;
    loteNome: string | null;
  },
  lote?: { nome?: string | null; fazendaNome?: string | null; pastoNome?: string | null },
): AnimalAlocacaoRow {
  return {
    id: animal.id,
    displayId: displayId(animal),
    sexo: animal.sexo,
    loteNome: lote?.nome ?? animal.loteNome ?? "—",
    fazendaSubdivisao: fazendaSubdivisao(lote),
    ultimaMovimentacao: null,
  };
}

export default function SelecionarAnimaisAlocacaoDialog({
  open,
  onClose,
  jaSelecionados,
  onConfirm,
}: Props) {
  const [draftFilters, setDraftFilters] = useState<AnimaisListFiltersState>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AnimaisListFiltersState>(INITIAL_FILTERS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [buscou, setBuscou] = useState(false);

  const { data: lotes = [] } = trpc.lotes.list.useQuery(undefined, { enabled: open });

  const apiParams = useMemo(
    () => ({ ...animaisFiltersToApiParams(appliedFilters, appliedFilters.pesquisa), status: "ativo" }),
    [appliedFilters],
  );

  const { data: animaisData = [], isLoading } = trpc.animais.list.useQuery(apiParams, {
    enabled: open && buscou,
  });

  const lotesMap = useMemo(() => new Map(lotes.map(l => [l.id, l])), [lotes]);

  const disponiveis = useMemo(
    () => animaisData.filter(a => !jaSelecionados.has(a.id)),
    [animaisData, jaSelecionados],
  );

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setPage(1);
      setBuscou(false);
      setDraftFilters(INITIAL_FILTERS);
      setAppliedFilters(INITIAL_FILTERS);
      return;
    }
    setBuscou(true);
    setAppliedFilters(INITIAL_FILTERS);
    setDraftFilters(INITIAL_FILTERS);
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [appliedFilters, jaSelecionados]);

  const totalPages = Math.max(1, Math.ceil(disponiveis.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const paginated = disponiveis.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);
  const paginatedIds = paginated.map(a => a.id);
  const allPageSelected = paginated.length > 0 && paginated.every(a => selected.has(a.id));
  const allResultSelected = disponiveis.length > 0 && disponiveis.every(a => selected.has(a.id));

  const categorias = draftFilters.sexo
    ? getCategoriasPorSexo(draftFilters.sexo === "macho" ? "Macho" : "Fêmea")
    : todasAsCategorias();

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    if (allPageSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        paginatedIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...paginatedIds]));
    }
  };

  const selecionarTodos = () => {
    if (allResultSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(disponiveis.map(a => a.id)));
  };

  const handleBuscar = () => {
    setAppliedFilters({ ...draftFilters });
    setBuscou(true);
    setPage(1);
  };

  const limparFiltros = () => {
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
    setBuscou(true);
  };

  const handleConfirm = () => {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um animal.");
      return;
    }
    const rows: AnimalAlocacaoRow[] = animaisData
      .filter(a => selected.has(a.id))
      .map(a => toAlocacaoRow(a, a.loteId ? lotesMap.get(a.loteId) : undefined));
    onConfirm(rows);
    onClose();
  };

  const inicio = disponiveis.length === 0 ? 0 : (pageSafe - 1) * PER_PAGE + 1;
  const fim = Math.min(pageSafe * PER_PAGE, disponiveis.length);

  const thClass =
    "px-2 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-left whitespace-nowrap border-r border-gray-200";

  const pageNumbers = useMemo(() => {
    const max = 5;
    let start = Math.max(1, pageSafe - 2);
    const end = Math.min(totalPages, start + max - 1);
    start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [pageSafe, totalPages]);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[96vw] lg:max-w-6xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Buscar animais</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95"
            style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 36 }}
          >
            Fechar
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Filtros principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>ID do Animal</label>
              <input
                type="text"
                value={draftFilters.pesquisa}
                onChange={e => setDraftFilters(f => ({ ...f, pesquisa: e.target.value }))}
                placeholder="Digite um ID"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Lote</label>
              <select
                value={draftFilters.loteId}
                onChange={e => setDraftFilters(f => ({ ...f, loteId: e.target.value }))}
                className={selectClass}
              >
                <option value="">Selecione o lote</option>
                {lotes.map(l => (
                  <option key={l.id} value={String(l.id)}>{l.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFiltrosAbertos(v => !v)}
            className="flex items-center justify-center w-full py-1 text-gray-400 hover:text-gray-600"
          >
            <span className="material-icons text-[20px]">
              {filtrosAbertos ? "expand_less" : "expand_more"}
            </span>
          </button>

          {filtrosAbertos && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
              <div>
                <label className={labelClass}>Sexo</label>
                <select
                  value={draftFilters.sexo}
                  onChange={e => setDraftFilters(f => ({ ...f, sexo: e.target.value, categoria: "" }))}
                  className={selectClass}
                >
                  <option value="">Todos</option>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select
                  value={draftFilters.categoria}
                  onChange={e => setDraftFilters(f => ({ ...f, categoria: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">Todas as categorias</option>
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Raça</label>
                <select
                  value={draftFilters.raca}
                  onChange={e => setDraftFilters(f => ({ ...f, raca: e.target.value }))}
                  className={selectClass}
                >
                  <option value="">Todas as raças</option>
                  {RACAS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Ações de busca */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleBuscar}
              className="px-4 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95"
              style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
            >
              Buscar Animais
            </button>
            <div className="flex items-center justify-center px-3 py-2 border border-gray-200 rounded-sm bg-[#EEEEEE] text-[11px] text-gray-600">
              Filtros Adicionais
              {draftFilters.loteId && (
                <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[10px]">
                  Lote
                  <button
                    type="button"
                    onClick={() => setDraftFilters(f => ({ ...f, loteId: "" }))}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={limparFiltros}
              className="px-4 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95"
              style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
            >
              Limpar Filtros
            </button>
          </div>

          {/* Selecionar todos + paginação superior */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={selecionarTodos}
              disabled={!buscou || disponiveis.length === 0}
              className="px-6 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95 disabled:opacity-50"
              style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
            >
              Selecionar Todos
            </button>
            <div className="flex-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-gray-500">
              <span>
                {disponiveis.length === 0
                  ? "Mostrando de 0 a 0 de um total de 0 animais."
                  : `Mostrando de ${inicio} a ${fim} de um total de ${disponiveis.length} animais.`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={pageSafe <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40"
                >
                  <span className="material-icons text-[16px]">chevron_left</span>
                </button>
                {pageNumbers.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-semibold ${
                      n === pageSafe ? "text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                    style={n === pageSafe ? { backgroundColor: IRANCHO_BTN_GREEN } : undefined}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={pageSafe >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40"
                >
                  <span className="material-icons text-[16px]">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#555] text-white text-[11px] font-medium">
              Qtd. Animais: {buscou ? disponiveis.length : 0}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#555] text-white text-[11px] font-medium">
              Qtd. Animais Selecionados: {selected.size}
            </span>
          </div>

          {/* Tabela */}
          <div className="border border-gray-200 rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] min-w-[1200px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-2 py-2 border-r border-gray-200">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={toggleSelectPage}
                        className="data-[state=checked]:bg-[#8ab83d] data-[state=checked]:border-[#8ab83d]"
                      />
                    </th>
                    <th className={thClass}>ID</th>
                    <th className={thClass}>Nome</th>
                    <th className={thClass}>Sexo</th>
                    <th className={thClass}>Data Nascimento</th>
                    <th className={thClass}>ID Brinco Eletrônico</th>
                    <th className={thClass}>ID SISBOV</th>
                    <th className={thClass}>Peso</th>
                    <th className={thClass}>Data da Pesagem</th>
                    <th className={thClass}>Lote</th>
                    <th className={thClass}>Raça</th>
                    <th className={thClass}>Fazenda</th>
                    <th className={thClass}>Setor</th>
                    <th className={`${thClass} border-r-0`}>Retiro</th>
                  </tr>
                </thead>
                <tbody>
                  {!buscou || isLoading ? (
                    <tr>
                      <td colSpan={14} className="text-center py-10 text-gray-400">
                        {isLoading ? "Carregando..." : "Sem dados"}
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="text-center py-10 text-gray-400">Sem dados</td>
                    </tr>
                  ) : (
                    paginated.map((animal, idx) => {
                      const lote = animal.loteId ? lotesMap.get(animal.loteId) : undefined;
                      return (
                        <tr
                          key={animal.id}
                          className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                        >
                          <td className="px-2 py-2 border-r border-gray-100">
                            <Checkbox
                              checked={selected.has(animal.id)}
                              onCheckedChange={() => toggleSelect(animal.id)}
                              className="data-[state=checked]:bg-[#8ab83d] data-[state=checked]:border-[#8ab83d]"
                            />
                          </td>
                          <td className="px-2 py-2 text-gray-700 border-r border-gray-100">{displayId(animal)}</td>
                          <td className="px-2 py-2 text-gray-800 border-r border-gray-100">{displayNome(animal)}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {formatDateBR(animal.dataNascimento)}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.brincoEletronico || "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">{animal.sisbov || "—"}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.ultimoPeso != null ? Number(animal.ultimoPeso).toFixed(1) : "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">—</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {lote?.nome || animal.loteNome || "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">{animal.raca || "—"}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">{lote?.fazendaNome || "—"}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">—</td>
                          <td className="px-2 py-2 text-gray-600">—</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Rodapé confirmar */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50"
            style={{ backgroundColor: IRANCHO_BTN_GREEN }}
          >
            {`Adicionar Selecionados${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
