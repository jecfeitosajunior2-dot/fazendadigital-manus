import { useMemo } from "react";
import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { FD_PRIMARY, FD_PRIMARY_SUBTLE_BG } from "@/components/FormFields";
import TablePaginationFooter, { type TablePageSize } from "@/components/TablePaginationFooter";
import { cn } from "@/lib/utils";

export type LoteAnimalRow = {
  id: number;
  nome: string | null;
  brinco: string | null;
  sexo: "macho" | "femea";
  raca: string | null;
  dataNascimento: string | null;
  categoria: string | null;
};

export type LoteAnimaisSortKey = "brinco";

type Props = {
  animais: LoteAnimalRow[];
  isLoading: boolean;
  search: string;
  sortKey: LoteAnimaisSortKey;
  sortAsc: boolean;
  onSort: (key: LoteAnimaisSortKey) => void;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: (ids: number[]) => void;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
};

/** Checkbox compacto (size-4) com a cor primária do Fazenda Digital (FD_PRIMARY). */
const LOTE_TABLE_CHECKBOX_CLASS = cn(
  "size-4 min-h-4 min-w-4 max-h-4 max-w-4 shrink-0",
  "data-[state=checked]:bg-[var(--fd-checkbox)] data-[state=checked]:border-[var(--fd-checkbox)] data-[state=checked]:text-white",
);

const LOTE_TABLE_CHECKBOX_HEADER_CLASS = cn(
  LOTE_TABLE_CHECKBOX_CLASS,
  "data-[state=indeterminate]:bg-[var(--fd-checkbox)] data-[state=indeterminate]:border-[var(--fd-checkbox)] data-[state=indeterminate]:text-white",
);

export function displayLoteAnimalBrinco(animal: LoteAnimalRow) {
  return animal.brinco?.trim() || animal.nome?.trim() || String(animal.id);
}

/** Filtra/ordena como a tabela de animais do Lote (mesma sequência da tela). */
export function orderLoteAnimaisForTable(
  animais: LoteAnimalRow[],
  opts: { search?: string; sortAsc: boolean },
): LoteAnimalRow[] {
  const q = opts.search?.trim().toLowerCase() ?? "";
  const filtered = q
    ? animais.filter(a =>
      (a.brinco || "").toLowerCase().includes(q) ||
      (a.nome || "").toLowerCase().includes(q) ||
      (a.categoria || "").toLowerCase().includes(q) ||
      (a.raca || "").toLowerCase().includes(q)
    )
    : animais;

  const naturalCompare = (sa: string, sb: string) =>
    sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });

  return [...filtered].sort((a, b) => {
    const cmp = naturalCompare(displayLoteAnimalBrinco(a), displayLoteAnimalBrinco(b));
    return opts.sortAsc ? cmp : -cmp;
  });
}

function displayBrinco(animal: LoteAnimalRow) {
  return displayLoteAnimalBrinco(animal);
}

function displaySexo(sexo: LoteAnimalRow["sexo"]) {
  return sexo === "macho" ? "Macho" : "Fêmea";
}

function SortIcon({ sortAsc }: { sortAsc: boolean }) {
  return (
    <span className="material-icons text-[14px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortAsc ? "arrow_drop_up" : "arrow_drop_down"}
    </span>
  );
}

/**
 * Célula com área de clique ~44px; o Checkbox visual permanece size-4 (igual Gerenciamento).
 * Clique na área vazia também alterna a seleção.
 */
function CheckboxHitCell({
  children,
  onActivate,
}: {
  children: ReactNode;
  onActivate?: () => void;
}) {
  return (
    <div
      className="mx-auto flex h-11 w-11 items-center justify-center cursor-pointer"
      onClick={e => {
        if (!onActivate) return;
        if (e.target !== e.currentTarget) return;
        onActivate();
      }}
    >
      {children}
    </div>
  );
}

export default function LoteAnimaisTable({
  animais,
  isLoading,
  search,
  sortKey,
  sortAsc,
  onSort,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  page,
  perPage,
  onPageChange,
  onPerPageChange,
}: Props) {
  const sorted = useMemo(
    () => orderLoteAnimaisForTable(animais, { search, sortAsc }),
    [animais, search, sortKey, sortAsc],
  );

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const paginatedIds = paginated.map(a => a.id);
  const selectedOnPage = paginatedIds.filter(id => selected.has(id)).length;
  // 0/N → vazio | k/N (0<k<N) → traço | N/N (inclui 1/1) → check
  const allPageSelected = paginated.length > 0 && selectedOnPage === paginated.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;
  const headerChecked: boolean | "indeterminate" = allPageSelected
    ? true
    : somePageSelected
      ? "indeterminate"
      : false;

  const handleHeaderToggle = () => {
    if (paginatedIds.length === 0) return;
    onToggleSelectAll(paginatedIds);
  };

  const thClass =
    "px-3 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-center whitespace-nowrap border-r border-gray-200 last:border-r-0";
  const thSortClass = cn(thClass, "cursor-pointer select-none");

  return (
    <div
      className="overflow-hidden"
      style={{ ["--fd-checkbox" as string]: FD_PRIMARY }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[520px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-2 py-2 border-r border-gray-200 align-middle">
                <CheckboxHitCell onActivate={handleHeaderToggle}>
                  <Checkbox
                    checked={headerChecked}
                    disabled={paginated.length === 0 || isLoading}
                    onCheckedChange={handleHeaderToggle}
                    aria-label={allPageSelected ? "Desmarcar todos da página" : "Selecionar todos da página"}
                    className={LOTE_TABLE_CHECKBOX_HEADER_CLASS}
                  />
                </CheckboxHitCell>
              </th>
              <th className={thSortClass} onClick={() => onSort("brinco")}>
                Brinco <SortIcon sortAsc={sortAsc} />
              </th>
              <th className={thClass}>Categoria</th>
              <th className={thClass}>Sexo</th>
              <th className={`${thClass} border-r-0`}>Raça</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">Carregando...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-400">
                  {search.trim() ? "Nenhum animal encontrado para a busca." : "Nenhum animal neste Lote."}
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
                      "border-b border-gray-100 hover:bg-gray-50/80",
                      !isSelected && "bg-white",
                    )}
                    style={isSelected ? { backgroundColor: FD_PRIMARY_SUBTLE_BG } : undefined}
                  >
                    <td className="px-2 py-2 text-center border-r border-gray-100 align-middle">
                      <CheckboxHitCell onActivate={() => onToggleSelect(animal.id)}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelect(animal.id)}
                          aria-label={`Selecionar animal ${displayBrinco(animal)}`}
                          className={LOTE_TABLE_CHECKBOX_CLASS}
                        />
                      </CheckboxHitCell>
                    </td>
                    <td className="px-3 py-1.5 text-gray-800 font-medium border-r border-gray-100 text-center">{displayBrinco(animal)}</td>
                    <td className="px-3 py-1.5 text-gray-600 border-r border-gray-100 text-center">{animal.categoria || "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600 border-r border-gray-100 text-center">{displaySexo(animal.sexo)}</td>
                    <td className="px-3 py-1.5 text-gray-600 text-center">{animal.raca || "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-100">
        <TablePaginationFooter
          pageSize={perPage}
          page={pageSafe}
          totalItems={total}
          onPageChange={onPageChange}
          onPageSizeChange={onPerPageChange
            ? size => {
                onPerPageChange(size as TablePageSize);
                onPageChange(1);
              }
            : undefined}
          itemLabel={total === 1 ? "animal" : "animais"}
        />
      </div>
    </div>
  );
}
