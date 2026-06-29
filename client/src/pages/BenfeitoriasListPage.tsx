import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { ImportarBenfeitoriasModal } from "@/components/ImportarBenfeitoriasModal";
import { EXPORT_HEADERS } from "@shared/importacaoBenfeitorias";
import { parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

export default function BenfeitoriasListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [importarOpen, setImportarOpen] = useState(false);
  const pageSize = 10;

  const { data: list = [], isLoading, refetch } = trpc.benfeitorias.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.benfeitorias.delete.useMutation({
    onSuccess: () => { toast.success("Benfeitoria excluída!"); utils.benfeitorias.list.invalidate(); },
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
    return list.filter(b =>
      [b.nome, b.tipo, b.fazendaId ? fazendaMap.get(b.fazendaId) : ""].some(v =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [list, search, fazendaMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const exportData = useMemo(() =>
    filtered.map(b => [
      b.fazendaId ? fazendaMap.get(b.fazendaId) ?? "" : "",
      b.nome,
      b.anoConstrucao ?? "",
      parseValorDecimalBanco(b.valorEstimado) ?? "",
      b.vidaUtil ?? "",
      b.observacoes ?? "",
    ]),
  [filtered, fazendaMap]);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold text-gray-800 shrink-0">Lista de Benfeitorias</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ListExportButtons
              title="Lista de Benfeitorias"
              filename="benfeitorias"
              headers={EXPORT_HEADERS}
              rows={exportData}
              alignRightFrom={2}
            />
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition shrink-0"
              style={{ backgroundColor: "#0ea5e9", minHeight: 44 }}
            >
              <span className="material-icons text-[16px]">upload_file</span>
              Importar
            </button>
            <button
              type="button"
              onClick={() => setLocation("/fazendas/benfeitorias/cadastro")}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-white text-[12px] font-semibold active:scale-[0.97] transition shrink-0"
              style={{ backgroundColor: "#2D5A5A", minHeight: 44 }}
            >
              <span className="material-icons text-[16px]">add</span>
              Cadastrar Benfeitoria
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
          <div />
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

        {/* Cards mobile */}
        <div className="lg:hidden px-4 py-3 space-y-2.5">
          {isLoading ? (
            <div className="py-10 text-center text-gray-400 text-[13px]">Carregando...</div>
          ) : pageItems.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-[13px]">Sem dados</div>
          ) : pageItems.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-gray-800 truncate">{b.nome}</p>
                  <p className="text-[12px] text-gray-400 mt-0.5">{b.fazendaId ? fazendaMap.get(b.fazendaId) ?? '-' : '-'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setLocation(`/fazendas/benfeitorias/cadastro?id=${b.id}`)} className="grid place-items-center rounded-lg bg-gray-50 text-gray-500 active:scale-95 transition" style={{ minWidth: 40, minHeight: 40 }} aria-label="Editar"><span className="material-icons text-[19px]">edit</span></button>
                  <button type="button" onClick={() => { if (confirm('Excluir esta benfeitoria?')) deleteMutation.mutate({ id: b.id }); }} className="grid place-items-center rounded-lg bg-red-50 text-red-500 active:scale-95 transition" style={{ minWidth: 40, minHeight: 40 }} aria-label="Excluir"><span className="material-icons text-[19px]">delete</span></button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 mt-3 text-[12px]">
                <div><span className="text-gray-400 block text-[10px]">Ano</span><span className="font-medium text-gray-800">{b.anoConstrucao ?? '-'}</span></div>
                <div><span className="text-gray-400 block text-[10px]">Vida Útil</span><span className="font-medium text-gray-800">{b.vidaUtil ?? '-'}</span></div>
                <div className="text-right"><span className="text-gray-400 block text-[10px]">Valor</span><span className="font-semibold text-gray-800 tabular-nums">{b.valorEstimado ? `R$ ${parseFloat(String(b.valorEstimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabela desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Benfeitoria", "Fazenda", "Ano de Construção", "Vida Útil", "Valor(R$)"].map(col => (
                  <th key={col} className={cn(
                    "px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide",
                    col === "Benfeitoria" || col === "Fazenda" ? "text-left" : "text-right"
                  )}>
                    <span className="inline-flex items-center gap-0.5">
                      {col}
                      <span className="material-icons text-[12px] opacity-40">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Carregando...</td></tr>}
              {!isLoading && pageItems.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Sem dados</td></tr>
              )}
              {pageItems.map(b => (
                <tr key={b.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{b.nome}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {b.fazendaId ? fazendaMap.get(b.fazendaId) ?? "-" : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{b.anoConstrucao ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{b.vidaUtil ?? "-"}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">
                    {b.valorEstimado ? parseFloat(String(b.valorEstimado)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLocation(`/fazendas/benfeitorias/cadastro?id=${b.id}`)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                      >
                        <span className="material-icons text-[15px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Excluir esta benfeitoria?")) deleteMutation.mutate({ id: b.id });
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

      <ImportarBenfeitoriasModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportado={() => refetch()}
      />
    </AppLayout>
  );
}
