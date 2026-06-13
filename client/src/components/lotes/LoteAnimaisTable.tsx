import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateBR } from "@/lib/date-utils";

export type LoteAnimalRow = {
  id: number;
  nome: string | null;
  brinco: string | null;
  sexo: "macho" | "femea";
  raca: string | null;
  dataNascimento: string | null;
  categoria: string | null;
  pastoNome: string | null;
};

export type LoteAnimaisSortKey = "brinco" | "categoria" | "sexo" | "raca" | "pasto";

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

function displayBrinco(animal: LoteAnimalRow) {
  return animal.brinco?.trim() || animal.nome?.trim() || String(animal.id);
}

function displaySexo(sexo: LoteAnimalRow["sexo"]) {
  return sexo === "macho" ? "macho" : "fêmea";
}

function SortIcon({ col, sortKey, sortAsc }: { col: LoteAnimaisSortKey; sortKey: LoteAnimaisSortKey; sortAsc: boolean }) {
  return (
    <span className="material-icons text-[14px] text-gray-400 ml-0.5 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
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
  const filtered = useMemo(() => {
    if (!search.trim()) return animais;
    const q = search.toLowerCase();
    return animais.filter(a =>
      (a.brinco || "").toLowerCase().includes(q) ||
      (a.nome || "").toLowerCase().includes(q) ||
      (a.categoria || "").toLowerCase().includes(q) ||
      (a.raca || "").toLowerCase().includes(q) ||
      (a.pastoNome || "").toLowerCase().includes(q)
    );
  }, [animais, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const naturalCompare = (sa: string, sb: string) =>
      sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "brinco":
          cmp = naturalCompare(displayBrinco(a), displayBrinco(b));
          break;
        case "categoria":
          cmp = naturalCompare(a.categoria || "", b.categoria || "");
          break;
        case "sexo":
          cmp = a.sexo.localeCompare(b.sexo);
          break;
        case "raca":
          cmp = naturalCompare(a.raca || "", b.raca || "");
          break;
        case "pasto":
          cmp = naturalCompare(a.pastoNome || "", b.pastoNome || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortKey, sortAsc]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const paginated = sorted.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const paginatedIds = paginated.map(a => a.id);
  const allPageSelected = paginated.length > 0 && paginated.every(a => selected.has(a.id));

  const thClass =
    "px-3 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none border-r border-gray-200 last:border-r-0";

  const inicio = total === 0 ? 0 : (pageSafe - 1) * perPage + 1;
  const fim = Math.min(pageSafe * perPage, total);

  return (
    <div className="border border-gray-200 rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-2 py-2 border-r border-gray-200 align-middle">
                <div className="flex items-center justify-center">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={() => onToggleSelectAll(paginatedIds)}
                    className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                  />
                </div>
              </th>
              <th className={thClass} onClick={() => onSort("brinco")}>
                Brinco <SortIcon col="brinco" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("categoria")}>
                Categoria <SortIcon col="categoria" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("sexo")}>
                Sexo <SortIcon col="sexo" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("raca")}>
                Raça <SortIcon col="raca" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={`${thClass} border-r-0`} onClick={() => onSort("pasto")}>
                Subdivisão <SortIcon col="pasto" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">Carregando...</td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  {search.trim() ? "Nenhum animal encontrado para a busca." : "Nenhum animal neste lote."}
                </td>
              </tr>
            ) : (
              paginated.map((animal, idx) => (
                <tr
                  key={animal.id}
                  className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-gray-50`}
                >
                  <td className="px-2 py-2 border-r border-gray-100 align-middle">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={selected.has(animal.id)}
                        onCheckedChange={() => onToggleSelect(animal.id)}
                        className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-800 font-medium border-r border-gray-100">{displayBrinco(animal)}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.categoria || "—"}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{displaySexo(animal.sexo)}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.raca || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{animal.pastoNome || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-200 bg-white text-[11px] text-gray-500">
        {onPerPageChange ? (
          <select
            value={perPage}
            onChange={e => { onPerPageChange(Number(e.target.value)); onPageChange(1); }}
            className="h-8 px-2 border border-gray-200 rounded-sm bg-white text-[11px] focus:outline-none focus:border-[#2D5A5A]"
          >
            <option value={10}>10 itens por página</option>
            <option value={25}>25 itens por página</option>
            <option value={50}>50 itens por página</option>
            <option value={100}>100 itens por página</option>
          </select>
        ) : (
          <span>{perPage} itens por página</span>
        )}
        <div className="flex items-center gap-3">
          <span>Mostrando {total === 0 ? 0 : inicio}–{fim} de {total} {total === 1 ? "item" : "itens"}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => onPageChange(pageSafe - 1)}
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
              onClick={() => onPageChange(pageSafe + 1)}
              className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <span className="material-icons text-[16px] text-gray-500">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
