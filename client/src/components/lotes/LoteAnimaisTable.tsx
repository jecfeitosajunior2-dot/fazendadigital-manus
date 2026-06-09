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
};

export type LoteAnimaisSortKey = "id" | "nome" | "sexo" | "raca" | "nascimento";

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
};

function displayNome(animal: LoteAnimalRow) {
  return animal.nome?.trim() || animal.brinco?.trim() || "—";
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
}: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return animais;
    return animais.filter(a => {
      const idMatch = String(a.id).includes(q);
      const nome = displayNome(a).toLowerCase();
      return idMatch || nome.includes(q);
    });
  }, [animais, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "id":
          va = a.id;
          vb = b.id;
          break;
        case "nome":
          va = displayNome(a).toLowerCase();
          vb = displayNome(b).toLowerCase();
          break;
        case "sexo":
          va = displaySexo(a.sexo);
          vb = displaySexo(b.sexo);
          break;
        case "raca":
          va = (a.raca || "").toLowerCase();
          vb = (b.raca || "").toLowerCase();
          break;
        case "nascimento":
          va = a.dataNascimento || "";
          vb = b.dataNascimento || "";
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
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
    <div className="bg-white border border-gray-200 rounded-sm shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-10 px-2 py-2 border-r border-gray-200">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={() => onToggleSelectAll(paginatedIds)}
                  className="data-[state=checked]:bg-[#8ab83d] data-[state=checked]:border-[#8ab83d]"
                />
              </th>
              <th className={thClass} onClick={() => onSort("id")}>
                ID <SortIcon col="id" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("nome")}>
                Nome <SortIcon col="nome" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("sexo")}>
                Sexo <SortIcon col="sexo" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={thClass} onClick={() => onSort("raca")}>
                Raça <SortIcon col="raca" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className={`${thClass} border-r-0`} onClick={() => onSort("nascimento")}>
                Nascimento <SortIcon col="nascimento" sortKey={sortKey} sortAsc={sortAsc} />
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
                  <td className="px-2 py-2 border-r border-gray-100">
                    <Checkbox
                      checked={selected.has(animal.id)}
                      onCheckedChange={() => onToggleSelect(animal.id)}
                      className="data-[state=checked]:bg-[#8ab83d] data-[state=checked]:border-[#8ab83d]"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-700 border-r border-gray-100">{animal.id}</td>
                  <td className="px-3 py-2 text-gray-800 font-medium border-r border-gray-100">{displayNome(animal)}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{displaySexo(animal.sexo)}</td>
                  <td className="px-3 py-2 text-gray-600 border-r border-gray-100">{animal.raca || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDateBR(animal.dataNascimento)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          <span>
            Exibindo {inicio}–{fim} de {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => onPageChange(pageSafe - 1)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Anterior
            </button>
            <span className="px-2">
              {pageSafe} / {totalPages}
            </span>
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => onPageChange(pageSafe + 1)}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
