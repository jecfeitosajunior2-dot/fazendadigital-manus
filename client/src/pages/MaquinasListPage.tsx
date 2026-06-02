import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

export default function MaquinasListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: list = [], isLoading } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.maquinas.delete.useMutation({
    onSuccess: () => { toast.success("Maquinário excluído!"); utils.maquinas.list.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const fazendaMap = useMemo(() => {
    const m = new Map<number, string>();
    fazendas.forEach(f => m.set(f.id, f.nome));
    return m;
  }, [fazendas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(m =>
      [m.nome, m.tipo, m.marca, m.modelo, m.fazendaId ? fazendaMap.get(m.fazendaId) : ""].some(v =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [list, search, fazendaMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const exportRows = useMemo(() =>
    filtered.map(m => ({
      apelido: m.nome,
      tipo: m.tipo ?? "",
      marca: m.marca ?? "",
      modelo: m.modelo ?? "",
      ano: m.ano ?? "",
      valor: m.valor ? parseFloat(String(m.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
      placa: m.placa ?? "",
      fazenda: m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "" : "",
      observacoes: m.observacoes ?? "",
    })),
  [filtered, fazendaMap]);

  const exportHeaders = ["Máquina", "Tipo", "Marca", "Modelo", "Ano", "Valor(R$)", "Placa", "Fazenda", "Observações"];
  const exportData = exportRows.map(r => [
    r.apelido, r.tipo, r.marca, r.modelo, r.ano, r.valor, r.placa, r.fazenda, r.observacoes,
  ]);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold text-gray-800 shrink-0">Lista de maquinário</h1>
          <ListExportButtons
            title="Lista de Maquinário"
            filename="maquinario"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={5}
          />
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/cadastro")}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Cadastrar Maquinário
          </button>
          <div className="relative">
            <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-gray-400">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar"
              className="h-8 pl-8 pr-3 text-[11px] border border-gray-200 rounded w-48 bg-white"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  { label: "Máquina", key: "nome" },
                  { label: "Tipo", key: "tipo" },
                  { label: "Marca", key: "marca" },
                  { label: "Modelo", key: "modelo" },
                  { label: "Ano", key: "ano" },
                  { label: "Valor(R$)", key: "valor" },
                  { label: "Placa", key: "placa" },
                  { label: "Fazenda", key: "fazenda" },
                  { label: "Observações", key: "obs" },
                ].map(col => (
                  <th key={col.key} className="px-3 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">
                    <span className="inline-flex items-center gap-0.5">
                      {col.label}
                      <span className="material-icons text-[11px] text-gray-300">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
              {!isLoading && pageItems.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">Sem dados</td></tr>
              )}
              {pageItems.map((m, i) => (
                <tr key={m.id} className={cn("border-t border-gray-100 hover:bg-gray-50/60", i % 2 === 1 && "bg-gray-50/40")}>
                  <td className="px-3 py-2.5 font-medium text-gray-800 whitespace-nowrap">{m.nome}</td>
                  <td className="px-3 py-2.5 text-gray-600 capitalize">{m.tipo ?? "-"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.marca ?? "-"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.modelo ?? "-"}</td>
                  <td className="px-3 py-2.5 text-gray-600">{m.ano ?? "-"}</td>
                  <td className="px-3 py-2.5 text-gray-700 text-right whitespace-nowrap">
                    {m.valor ? parseFloat(String(m.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 uppercase">{m.placa ?? "-"}</td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "-" : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 max-w-[140px] truncate" title={m.observacoes ?? ""}>
                    {m.observacoes ? m.observacoes : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLocation(`/maquinas/cadastro?id=${m.id}`)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <span className="material-icons text-[15px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Excluir este maquinário?")) deleteMutation.mutate({ id: m.id });
                        }}
                        className="p-1 rounded hover:bg-red-50 text-red-400"
                      >
                        <span className="material-icons text-[15px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500">
          <span>{pageSize} itens por página</span>
          <div className="flex items-center gap-3">
            <span>
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100">
                <span className="material-icons text-[16px]">chevron_left</span>
              </button>
              <span className="px-2 py-0.5 rounded font-medium text-gray-800" style={{ backgroundColor: FD_PRIMARY, color: "#1a1a1a" }}>{page}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-0.5 rounded disabled:opacity-30 hover:bg-gray-100">
                <span className="material-icons text-[16px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export { MaquinasListPage };
