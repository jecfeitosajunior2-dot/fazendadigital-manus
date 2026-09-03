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
import { FD_PRIMARY, FD_PRIMARY_SUBTLE_BG, FormInput, FormLabel, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
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

function displaySexo(sexo: "macho" | "femea") {
  return sexo === "macho" ? "Macho" : "Fêmea";
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

const FILTER_SELECT_EMPTY = "__empty__";

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
    "px-3 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-center whitespace-nowrap border-r border-gray-200 last:border-r-0";

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
        <DialogHeader className="shrink-0 px-6 py-4 pr-12 border-b border-gray-100 text-left">
          <DialogTitle className="text-[15px] font-semibold text-gray-900 text-left">
            Incluir animais no Lote
          </DialogTitle>
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
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Fazenda</FormLabel>
                <FormInput
                  variant="light"
                  readOnly
                  value={fazendaNome?.trim() || "—"}
                  onChange={() => {}}
                />
              </div>
              <div>
                <FormLabel>Lote</FormLabel>
                <FormInput
                  variant="light"
                  readOnly
                  value={loteNome?.trim() || "—"}
                  onChange={() => {}}
                />
              </div>
            </div>
            <div className="min-h-[72px] px-4 py-5 flex items-center justify-center text-center text-[13px] text-gray-500 bg-white border border-gray-200 rounded w-full">
              {mensagemSemElegiveis}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "px-6 py-5 space-y-4",
              showTableScroll && "flex-1 min-h-0 flex flex-col overflow-hidden",
            )}
          >
            <p className="text-[11px] text-gray-600 leading-relaxed shrink-0">
              Somente animais ativos desta Fazenda e sem Lote.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
              <div>
                <FormLabel>Fazenda</FormLabel>
                <FormInput
                  variant="light"
                  readOnly
                  value={fazendaNome?.trim() || "—"}
                  onChange={() => {}}
                />
              </div>
              <div>
                <FormLabel>Lote</FormLabel>
                <FormInput
                  variant="light"
                  readOnly
                  value={loteNome?.trim() || "—"}
                  onChange={() => {}}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
              <div>
                <FormLabel>Brinco</FormLabel>
                <FormInput
                  variant="light"
                  value={filters.pesquisa}
                  onChange={v => setFilters(f => ({ ...f, pesquisa: v }))}
                  placeholder="Digite o nº do brinco"
                  disabled={pending}
                  className="border-l-[3px] border-l-[#4ECDC4]"
                />
              </div>
              <div>
                <FormLabel>Sexo</FormLabel>
                <FormSelect
                  variant="light"
                  value={filters.sexo || FILTER_SELECT_EMPTY}
                  onChange={v => setFilters(f => ({
                    ...f,
                    sexo: v === FILTER_SELECT_EMPTY ? "" : v,
                    categoria: "",
                  }))}
                  placeholder="Todos"
                  disabled={pending}
                  modal={false}
                  triggerClassName="border-l-[3px] border-l-[#4ECDC4]"
                >
                  <SelectItem value={FILTER_SELECT_EMPTY} className="text-[12px] text-gray-500">
                    Todos
                  </SelectItem>
                  <SelectItem value="macho" className="text-[12px]">Macho</SelectItem>
                  <SelectItem value="femea" className="text-[12px]">Fêmea</SelectItem>
                </FormSelect>
              </div>
              <div>
                <FormLabel>Categoria</FormLabel>
                <FormSelect
                  variant="light"
                  value={filters.categoria || FILTER_SELECT_EMPTY}
                  onChange={v => setFilters(f => ({
                    ...f,
                    categoria: v === FILTER_SELECT_EMPTY ? "" : v,
                  }))}
                  placeholder="Todas"
                  disabled={pending}
                  modal={false}
                  triggerClassName="border-l-[3px] border-l-[#4ECDC4]"
                >
                  <SelectItem value={FILTER_SELECT_EMPTY} className="text-[12px] text-gray-500">
                    Todas
                  </SelectItem>
                  {categorias.map(c => (
                    <SelectItem key={c} value={c} className="text-[12px]">
                      {c}
                    </SelectItem>
                  ))}
                </FormSelect>
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
                <table className="w-full text-[12px] min-w-[520px] border-collapse">
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
                      <th className={thClass}>Categoria</th>
                      <th className={thClass}>Sexo</th>
                      <th className={cn(thClass, "border-r-0")}>Raça</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingFiltrados ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-400">
                          Carregando...
                        </td>
                      </tr>
                    ) : estadoFiltroSemResultado ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 px-4 text-[13px] text-gray-500">
                          Nenhum animal encontrado com os filtros aplicados.
                        </td>
                      </tr>
                    ) : (
                      paginated.map(animal => {
                        const isSelected = selected.has(animal.id);
                        return (
                          <tr
                            key={animal.id}
                            aria-selected={isSelected ? "true" : "false"}
                            className={cn(
                              "border-b border-gray-100 transition-colors cursor-pointer hover:bg-gray-50/80",
                              !isSelected && "bg-white",
                            )}
                            style={isSelected ? { backgroundColor: FD_PRIMARY_SUBTLE_BG } : undefined}
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
                            <td className="px-3 py-1.5 text-gray-800 font-medium border-r border-gray-100 text-center">
                              {displayBrinco(animal)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 border-r border-gray-100 text-center">
                              {animal.categoria || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 border-r border-gray-100 text-center">
                              {displaySexo(animal.sexo)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600 text-center">
                              {animal.raca || "—"}
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

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-gray-100 gap-2 sm:gap-2 flex flex-row flex-wrap items-center justify-end">
          {selectedValidos.length > 0 ? (
            <span className="text-[11px] text-gray-600 mr-auto">
              {selectedValidos.length}{" "}
              {selectedValidos.length === 1 ? "animal selecionado" : "animais selecionados"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-700 bg-[#F0F0F0] hover:bg-[#E8E8E8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canIncluir}
            className="px-5 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {pending ? "Incluindo..." : "Incluir selecionados"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
