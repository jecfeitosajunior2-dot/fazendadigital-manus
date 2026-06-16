import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { usePersistedState } from "@/hooks/usePersistedState";
import { formatDateBR } from "@/lib/date-utils";
import { RACAS, getCategoriasPorSexo, todasAsCategorias } from "@shared/animal-types";
import { animaisFiltersToApiParams } from "@shared/animal-filter-types";
import type { AnimaisListFiltersState } from "@shared/animal-filter-types";

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
  rfid: "",
  apenasInativos: false,
  idadeMesesMin: "",
  idadeMesesMax: "",
  rgn: "",
  rgd: "",
  animalComSisbov: false,
  pelagem: "",
  marca: "",
  dataDesmamaMes: "",
  dataDesmamaDe: "",
  dataDesmamAte: "",
  castrado: "",
  produtorOrigem: "",
  pai: "",
  mae: "",
  statusFiltro: "",
  dataEntradaDe: "",
  dataEntradaAte: "",
  filtrosAdicionaisSelecionados: [],
  apenasEmCarencia: false,
};

const filterCardClass =
  "flex flex-col gap-1 bg-white border border-gray-200 rounded px-3 py-2 min-w-0 focus-within:border-[#2D5A5A] transition-colors";
const filterLabelClass =
  "text-[9px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1";
const filterSelectClass =
  "w-full h-[32px] px-2 text-[12px] border-0 bg-transparent text-gray-800 focus:outline-none appearance-none cursor-pointer";
const filterInputClass =
  "w-full h-[32px] px-2 text-[12px] border-0 bg-transparent text-gray-800 placeholder:text-gray-400 focus:outline-none";

type Props = {
  loteId: number;
  fazendaId: number | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function displayNome(animal: { nome: string | null; brinco: string | null }) {
  return animal.nome?.trim() || animal.brinco?.trim() || "—";
}

export default function IncluirAnimaisLoteDialog({ loteId, fazendaId, open, onClose, onSuccess }: Props) {
  const storageKey = `fd:incluir-animais-lote-filtros:${loteId}`;
  const initialFilters = useMemo(
    () => ({ ...INITIAL_FILTERS, fazendaId: fazendaId ? String(fazendaId) : "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loteId],
  );
  const [filters, setFilters] = usePersistedState(storageKey, initialFilters);
  const debouncedPesquisa = useDebounce(filters.pesquisa, 400);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const utils = trpc.useUtils();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: open });
  const { data: lotes = [] } = trpc.lotes.list.useQuery(undefined, { enabled: open });

  const apiParams = useMemo(
    () => ({ ...animaisFiltersToApiParams(filters, debouncedPesquisa), status: "ativo" }),
    [filters, debouncedPesquisa],
  );

  const { data: animaisData = [], isLoading } = trpc.animais.list.useQuery(apiParams, { enabled: open });

  const incluirMutation = trpc.lotes.incluirAnimais.useMutation({
    onSuccess: data => {
      toast.success(`${data.count} animal(is) incluído(s) no lote.`);
      setSelected(new Set());
      utils.animais.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.lotes.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const disponiveis = useMemo(
    () => animaisData
      .filter(a => a.loteId !== loteId)
      .sort((a, b) => {
        const ba = (a.brinco ?? a.nome ?? "").toString();
        const bb = (b.brinco ?? b.nome ?? "").toString();
        return ba.localeCompare(bb, 'pt-BR', { numeric: true });
      }),
    [animaisData, loteId],
  );

  const filtrosKey = JSON.stringify(apiParams);
  useEffect(() => {
    setPage(1);
  }, [filtrosKey]);

  useEffect(() => {
    if (open) {
      // Sempre que abrir, garante que a fazenda do lote está pré-selecionada
      setFilters(prev => ({
        ...prev,
        fazendaId: fazendaId ? String(fazendaId) : prev.fazendaId,
      }));
    } else {
      setSelected(new Set());
    }
  }, [open, fazendaId]);

  const totalPages = Math.max(1, Math.ceil(disponiveis.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = disponiveis.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const paginatedIds = paginated.map(a => a.id);
  const allPageSelected = paginated.length > 0 && paginated.every(a => selected.has(a.id));

  const categorias = filters.sexo
    ? getCategoriasPorSexo(filters.sexo === "macho" ? "Macho" : "Fêmea")
    : todasAsCategorias();

  const lotesFiltrados = filters.fazendaId
    ? lotes.filter(l => l.fazendaId === Number(filters.fazendaId))
    : lotes;

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
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

  const handleConfirm = () => {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um animal.");
      return;
    }
    incluirMutation.mutate({ loteId, animalIds: [...selected] });
  };

  const clearFilters = () => setFilters(INITIAL_FILTERS);

  const inicio = disponiveis.length === 0 ? 0 : (pageSafe - 1) * perPage + 1;
  const fim = Math.min(pageSafe * perPage, disponiveis.length);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <DialogHeader className="px-5 py-4 border-b border-gray-100">
          <DialogTitle className="text-[15px] font-semibold text-gray-900">
            Incluir Animais no Lote
          </DialogTitle>
        </DialogHeader>

        {/* Filtros no estilo da Lista de Animais */}
        <div className="px-5 pt-4 pb-2 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {/* Fazenda */}
            <div className={filterCardClass}>
              <span className={filterLabelClass}>
                <span className="material-icons text-[13px] text-gray-400">home</span>
                Fazenda
              </span>
              <select
                value={filters.fazendaId}
                onChange={e => setFilters(f => ({ ...f, fazendaId: e.target.value, loteId: "" }))}
                className={filterSelectClass}
              >
                <option value="">Selecione uma fazenda</option>
                {fazendas.map(f => (
                  <option key={f.id} value={String(f.id)}>{f.nome}</option>
                ))}
              </select>
            </div>

            {/* Número do Brinco */}
            <div className={filterCardClass}>
              <span className={filterLabelClass}>
                <span className="material-icons text-[13px] text-gray-400">tag</span>
                Número do Brinco
              </span>
              <input
                type="text"
                value={filters.pesquisa}
                onChange={e => setFilters(f => ({ ...f, pesquisa: e.target.value }))}
                placeholder="Digite o nº do brinco"
                className={filterInputClass}
              />
            </div>

            {/* Sexo */}
            <div className={filterCardClass}>
              <span className={filterLabelClass}>
                <span className="material-icons text-[13px] text-gray-400">people</span>
                Sexo
              </span>
              <select
                value={filters.sexo}
                onChange={e => setFilters(f => ({ ...f, sexo: e.target.value, categoria: "" }))}
                className={filterSelectClass}
              >
                <option value="">Todos</option>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </div>

            {/* Categoria */}
            <div className={filterCardClass}>
              <span className={filterLabelClass}>
                <span className="material-icons text-[13px] text-gray-400">category</span>
                Categoria
              </span>
              <select
                value={filters.categoria}
                onChange={e => setFilters(f => ({ ...f, categoria: e.target.value }))}
                className={filterSelectClass}
              >
                <option value="">Todas</option>
                {categorias.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Lote */}
            <div className={filterCardClass}>
              <span className={filterLabelClass}>
                <span className="material-icons text-[13px] text-gray-400">inventory_2</span>
                Lote
              </span>
              <select
                value={filters.loteId}
                onChange={e => setFilters(f => ({ ...f, loteId: e.target.value }))}
                className={filterSelectClass}
              >
                <option value="">Todos os lotes</option>
                {lotesFiltrados.map(l => (
                  <option key={l.id} value={String(l.id)}>{l.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="px-5 pb-4">
          <div className="bg-white border border-gray-200 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[560px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-2 py-2 border-r border-gray-200 align-middle">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={toggleSelectAll}
                          className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                        />
                      </div>
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Brinco</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Nº RFID</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Categoria</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Lote</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Sexo</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">Raça</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Subdivisão</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">Carregando...</td></tr>
                  ) : paginated.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nenhum animal disponível.</td></tr>
                  ) : (
                    paginated.map((animal, idx) => (
                      <tr
                        key={animal.id}
                        className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-gray-50 cursor-pointer`}
                        onClick={() => toggleSelect(animal.id)}
                      >
                        <td className="px-2 py-2 border-r border-gray-100 align-middle">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={selected.has(animal.id)}
                              onCheckedChange={() => toggleSelect(animal.id)}
                              onClick={e => e.stopPropagation()}
                              className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-800 font-medium border-r border-gray-100">{displayNome(animal)}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.brincoEletronico || "—"}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.categoria || "—"}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.loteNome || "—"}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.sexo === "macho" ? "macho" : "fêmea"}</td>
                        <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.raca || "—"}</td>
                        <td className="px-3 py-2 text-gray-600">{(animal as any).pastoNome || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-200 bg-white text-[11px] text-gray-500">
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px] focus:outline-none focus:border-[#2D5A5A]"
              >
                <option value={10}>10 itens por página</option>
                <option value={25}>25 itens por página</option>
                <option value={50}>50 itens por página</option>
                <option value={100}>100 itens por página</option>
              </select>
              <div className="flex items-center gap-3">
                <span>Mostrando {disponiveis.length === 0 ? 0 : inicio}–{fim} de {disponiveis.length} {disponiveis.length === 1 ? "item" : "itens"}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage(p => p - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    <span className="material-icons text-[16px] text-gray-500">chevron_left</span>
                  </button>
                  <span
                    className="w-7 h-7 flex items-center justify-center rounded text-[11px] font-semibold text-white"
                    style={{ backgroundColor: "#2D5A5A" }}
                  >
                    {pageSafe}
                  </span>
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    <span className="material-icons text-[16px] text-gray-500">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-4 border-t border-gray-100 gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={incluirMutation.isPending}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={incluirMutation.isPending || selected.size === 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50"
            style={{ backgroundColor: "#2D5A5A" }}
          >
            {incluirMutation.isPending
              ? "Incluindo..."
              : `Incluir Selecionados${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
