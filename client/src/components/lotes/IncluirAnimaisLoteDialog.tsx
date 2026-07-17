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
import { getCategoriasPorSexo, todasAsCategorias } from "@shared/animal-types";
import TablePaginationFooter from "@/components/TablePaginationFooter";
import { FD_PRIMARY } from "@/components/FormFields";
import { formatPesoAtualDisplay } from "@/lib/fichaAnimalDisplay";
import { cn } from "@/lib/utils";

type Props = {
  loteId: number;
  loteNome: string;
  fazendaId: number | null;
  fazendaNome?: string | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type LocalFilters = {
  pesquisa: string;
  sexo: string;
  categoria: string;
};

const EMPTY_FILTERS: LocalFilters = {
  pesquisa: "",
  sexo: "",
  categoria: "",
};

function displayBrinco(animal: { nome: string | null; brinco: string | null; id: number }) {
  return animal.brinco?.trim() || animal.nome?.trim() || String(animal.id);
}

function isAnimalElegivel(
  animal: { status?: string | null; loteId?: number | null; fazendaId?: number | null },
  fazendaOk: boolean,
  fazendaId: number | null,
) {
  return (
    animal.status === "ativo"
    && animal.loteId == null
    && (!fazendaOk || animal.fazendaId === fazendaId)
  );
}

function sortElegiveis<T extends { nome: string | null; brinco: string | null; id: number }>(
  animais: T[],
) {
  return [...animais].sort((a, b) =>
    displayBrinco(a).localeCompare(displayBrinco(b), "pt-BR", { numeric: true }),
  );
}

const CHECKBOX_CLASS = cn(
  "size-4 min-h-4 min-w-4 max-h-4 max-w-4 shrink-0",
  "data-[state=checked]:bg-[var(--fd-checkbox)] data-[state=checked]:border-[var(--fd-checkbox)] data-[state=checked]:text-white",
);

const filterCardClass =
  "flex flex-col justify-center gap-0.5 bg-white border border-gray-200 rounded px-2.5 py-2 min-h-[56px] min-w-0 h-full focus-within:border-[#4ECDC4] transition-colors";
const filterLabelClass =
  "text-[9px] font-semibold text-gray-500 uppercase tracking-wide leading-none";
const filterControlClass =
  "w-full h-[28px] px-1 text-[12px] border-0 bg-transparent text-gray-800 placeholder:text-gray-400 focus:outline-none";

export default function IncluirAnimaisLoteDialog({
  loteId,
  loteNome,
  fazendaId,
  fazendaNome,
  open,
  onClose,
  onSuccess,
}: Props) {
  const [filters, setFilters] = useState<LocalFilters>(EMPTY_FILTERS);
  const debouncedPesquisa = useDebounce(filters.pesquisa, 400);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const utils = trpc.useUtils();
  const fazendaOk = fazendaId != null && fazendaId > 0;
  const nomeFazenda = (fazendaNome ?? "").trim() || "Fazenda";

  const baseApiParams = useMemo(
    () => ({
      fazendaId: fazendaOk ? fazendaId : undefined,
      status: "ativo" as const,
      apenasSemLote: true,
    }),
    [fazendaOk, fazendaId],
  );

  const apiParams = useMemo(
    () => ({
      ...baseApiParams,
      search: debouncedPesquisa.trim() || undefined,
      sexo: filters.sexo || undefined,
      categoria: filters.categoria || undefined,
    }),
    [baseApiParams, debouncedPesquisa, filters.sexo, filters.categoria],
  );

  const { data: animaisBase = [], isLoading: isLoadingBase } = trpc.animais.list.useQuery(
    baseApiParams,
    { enabled: open && fazendaOk },
  );

  const { data: animaisData = [], isLoading: isLoadingFiltrados } = trpc.animais.list.useQuery(
    apiParams,
    { enabled: open && fazendaOk },
  );

  const incluirMutation = trpc.lotes.incluirAnimais.useMutation({
    onSuccess: data => {
      const n = data.count;
      toast.success(
        n === 1
          ? "1 animal foi incluído no Lote com sucesso."
          : `${n} animais foram incluídos no Lote com sucesso.`,
      );
      setSelected(new Set());
      utils.animais.list.invalidate();
      utils.lotes.gerenciamento.invalidate();
      utils.lotes.list.invalidate();
      onSuccess();
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  const elegiveisBase = useMemo(
    () => sortElegiveis(animaisBase.filter(a => isAnimalElegivel(a, fazendaOk, fazendaId))),
    [animaisBase, fazendaOk, fazendaId],
  );

  const disponiveis = useMemo(
    () => sortElegiveis(animaisData.filter(a => isAnimalElegivel(a, fazendaOk, fazendaId))),
    [animaisData, fazendaOk, fazendaId],
  );

  const disponiveisIds = useMemo(() => new Set(disponiveis.map(a => a.id)), [disponiveis]);

  const filtrosKey = JSON.stringify(apiParams);
  useEffect(() => {
    setPage(1);
  }, [filtrosKey]);

  // Mantém seleção só para animais ainda visíveis com os filtros atuais.
  useEffect(() => {
    setSelected(prev => {
      const next = new Set<number>();
      prev.forEach(id => {
        if (disponiveisIds.has(id)) next.add(id);
      });
      if (next.size === prev.size) {
        let same = true;
        prev.forEach(id => {
          if (!next.has(id)) same = false;
        });
        if (same) return prev;
      }
      return next;
    });
  }, [disponiveisIds]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setFilters(EMPTY_FILTERS);
      setPage(1);
    }
  }, [open]);

  const temElegiveisNaFazenda = elegiveisBase.length > 0;
  const estadoSemElegiveis = !isLoadingBase && !temElegiveisNaFazenda;
  const estadoComElegiveis = temElegiveisNaFazenda;
  const hasAnimaisFiltrados = disponiveis.length > 0;
  const estadoFiltroSemResultado =
    estadoComElegiveis && !isLoadingFiltrados && !hasAnimaisFiltrados;

  const totalPages = Math.max(1, Math.ceil(disponiveis.length / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = disponiveis.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const paginatedIds = paginated.map(a => a.id);
  const allPageSelected = paginated.length > 0 && paginated.every(a => selected.has(a.id));
  const somePageSelected = paginated.some(a => selected.has(a.id));
  const headerChecked: boolean | "indeterminate" =
    allPageSelected ? true : somePageSelected ? "indeterminate" : false;

  const categorias = filters.sexo
    ? getCategoriasPorSexo(filters.sexo === "macho" ? "Macho" : "Fêmea")
    : todasAsCategorias();

  const hasActiveFilters = Boolean(
    filters.pesquisa.trim() || filters.sexo || filters.categoria,
  );

  const pending = incluirMutation.isPending;

  const toggleSelect = (id: number) => {
    if (pending) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (pending || paginated.length === 0) return;
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
    if (!fazendaOk) {
      toast.error("Este Lote não possui Fazenda vinculada.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Selecione ao menos um animal.");
      return;
    }
    const validIds = selectedValidos;
    if (validIds.length === 0) {
      toast.error("Selecione ao menos um animal válido.");
      return;
    }
    incluirMutation.mutate({ loteId, animalIds: validIds });
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const thClass =
    "px-3 py-2.5 text-[11px] font-semibold text-gray-600 whitespace-nowrap text-center border-r border-gray-200 last:border-r-0";

  const mensagemSemElegiveis =
    `Não há animais ativos e sem Lote disponíveis na ${nomeFazenda}.`;

  const selectedValidos = useMemo(
    () => [...selected].filter(id => disponiveisIds.has(id)),
    [selected, disponiveisIds],
  );

  const canIncluir = fazendaOk && !pending && selectedValidos.length > 0;
  const showTableScroll = estadoComElegiveis;

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v && !pending) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "w-[calc(100%-32px)] max-w-[760px] sm:max-w-[760px] p-0 gap-0 !flex !flex-col overflow-hidden",
          "[&_[data-slot=dialog-close]]:right-6 [&_[data-slot=dialog-close]]:top-4",
          showTableScroll ? "max-h-[90vh]" : "max-h-none",
        )}
        onOpenAutoFocus={e => e.preventDefault()}
        style={{ ["--fd-checkbox" as string]: FD_PRIMARY }}
      >
        <DialogHeader className="shrink-0 px-6 py-4 pr-12 border-b border-gray-100 space-y-2 text-left">
          <DialogTitle className="text-[15px] font-semibold text-gray-900 text-left">
            Incluir animais no Lote
          </DialogTitle>
          <p className="text-[12px] text-gray-600 text-left">
            <span className="text-gray-500">Fazenda:</span>{" "}
            <span className="font-medium text-gray-800">{fazendaNome || "—"}</span>
            <span className="text-gray-300 mx-2">·</span>
            <span className="text-gray-500">Lote:</span>{" "}
            <span className="font-medium text-gray-800">{loteNome || "—"}</span>
          </p>
          <p className="text-[11px] text-gray-500 text-left">
            Somente animais ativos desta Fazenda e sem Lote.
          </p>
        </DialogHeader>

        {!fazendaOk ? (
          <div className="px-6 py-5 text-center text-[13px] text-amber-700">
            Este Lote não possui Fazenda vinculada. Não é possível adicionar animais.
          </div>
        ) : isLoadingBase ? (
          <div className="px-6 py-5 text-center text-[13px] text-gray-400">
            Carregando...
          </div>
        ) : estadoSemElegiveis ? (
          <div className="px-6 pt-3 pb-4">
            <div className="min-h-[72px] px-4 py-5 flex items-center justify-center text-center text-[13px] text-gray-500 bg-white border border-gray-200 rounded w-full">
              {mensagemSemElegiveis}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "px-6 pt-3 pb-4 space-y-3",
              showTableScroll && "flex-1 min-h-0 flex flex-col overflow-hidden",
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[repeat(3,minmax(0,1fr))] gap-3 shrink-0">
              <div className={filterCardClass}>
                <span className={filterLabelClass}>Brinco</span>
                <input
                  type="text"
                  value={filters.pesquisa}
                  onChange={e => setFilters(f => ({ ...f, pesquisa: e.target.value }))}
                  placeholder="Digite o nº do brinco"
                  disabled={pending}
                  className={filterControlClass}
                />
              </div>
              <div className={filterCardClass}>
                <span className={filterLabelClass}>Sexo</span>
                <select
                  value={filters.sexo}
                  onChange={e => setFilters(f => ({ ...f, sexo: e.target.value, categoria: "" }))}
                  disabled={pending}
                  className={cn(filterControlClass, "cursor-pointer")}
                >
                  <option value="">Todos</option>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
              </div>
              <div className={filterCardClass}>
                <span className={filterLabelClass}>Categoria</span>
                <select
                  value={filters.categoria}
                  onChange={e => setFilters(f => ({ ...f, categoria: e.target.value }))}
                  disabled={pending}
                  className={cn(filterControlClass, "cursor-pointer")}
                >
                  <option value="">Todas</option>
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={pending}
                  className="text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            <div
              className={cn(
                "bg-white border border-gray-200 rounded overflow-hidden w-full",
                showTableScroll && "flex-1 min-h-0 flex flex-col",
              )}
            >
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-[12px] min-w-[640px] border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-10 px-2 py-2 border-r border-gray-200 align-middle">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={headerChecked}
                            onCheckedChange={toggleSelectAll}
                            disabled={pending || isLoadingFiltrados || !hasAnimaisFiltrados}
                            className={CHECKBOX_CLASS}
                          />
                        </div>
                      </th>
                      <th className={thClass}>Brinco</th>
                      <th className={thClass}>Nº RFID</th>
                      <th className={thClass}>Categoria</th>
                      <th className={thClass}>Últ. peso</th>
                      <th className={thClass}>Sexo</th>
                      <th className={cn(thClass, "border-r-0")}>Raça</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingFiltrados ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-gray-400">
                          Carregando...
                        </td>
                      </tr>
                    ) : estadoFiltroSemResultado ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 px-4 text-[13px] text-gray-500">
                          Nenhum animal encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                          paginated.map(animal => {
                            const pesoLabel = formatPesoAtualDisplay(
                              animal.ultimoPeso as number | null | undefined,
                            );
                            const isSelected = selected.has(animal.id);
                            return (
                              <tr
                                key={animal.id}
                                aria-selected={isSelected ? "true" : "false"}
                                className={cn(
                                  "border-b border-gray-100 transition-colors cursor-pointer",
                                  isSelected
                                    ? "bg-[#4ECDC4]/[0.08] hover:bg-[#4ECDC4]/[0.13]"
                                    : "bg-white hover:bg-gray-50",
                                )}
                                onClick={() => toggleSelect(animal.id)}
                              >
                                <td className="px-2 py-2 border-r border-gray-100 align-middle">
                                  <div className="flex items-center justify-center">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleSelect(animal.id)}
                                      onClick={e => e.stopPropagation()}
                                      disabled={pending}
                                      className={CHECKBOX_CLASS}
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center border-r border-gray-100">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span
                                      className={cn(
                                        "w-2 h-2 rounded-full flex-shrink-0",
                                        animal.sexo === "macho" ? "bg-blue-400" : "bg-pink-400",
                                      )}
                                    />
                                    <span className="font-semibold text-gray-800">
                                      {displayBrinco(animal)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-800 font-mono text-[11px] border-r border-gray-100">
                                  {animal.brincoEletronico || (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center border-r border-gray-100">
                                  {animal.categoria ? (
                                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-[11px]">
                                      {animal.categoria}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center border-r border-gray-100 text-gray-700">
                                  {pesoLabel === "Sem pesagem" ? (
                                    <span className="text-gray-400">Sem pesagem</span>
                                  ) : (
                                    pesoLabel
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center border-r border-gray-100">
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded text-[11px] font-medium",
                                      animal.sexo === "macho"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-pink-100 text-pink-700",
                                    )}
                                  >
                                    {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center text-gray-700">
                                  {animal.raca || <span className="text-gray-300">—</span>}
                                </td>
                              </tr>
                            );
                          })
                    )}
                  </tbody>
                </table>
              </div>
              {!isLoadingFiltrados && hasAnimaisFiltrados && (
                <div className="shrink-0 border-t border-gray-100">
                  <TablePaginationFooter
                    pageSize={perPage}
                    page={pageSafe}
                    totalItems={disponiveis.length}
                    onPageChange={setPage}
                    onPageSizeChange={size => {
                      setPerPage(size);
                      setPage(1);
                    }}
                    itemLabel="animais"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-gray-100 flex flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canIncluir}
            className={cn(
              "px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide",
              canIncluir
                ? "text-gray-900 hover:opacity-90"
                : "bg-[#F0F0F0] text-gray-500 cursor-not-allowed hover:bg-[#F0F0F0]",
            )}
            style={canIncluir ? { backgroundColor: FD_PRIMARY } : undefined}
          >
            {pending ? "Incluindo..." : "Incluir selecionados"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
