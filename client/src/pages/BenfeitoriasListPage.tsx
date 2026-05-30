import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

export default function BenfeitoriasListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data: list = [], isLoading } = trpc.benfeitorias.list.useQuery();
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

  const exportRows = useMemo(() =>
    filtered.map(b => ({
      benfeitoria: b.nome,
      fazenda: b.fazendaId ? fazendaMap.get(b.fazendaId) ?? "" : "",
      ano: b.anoConstrucao ?? "",
      vidaUtil: b.vidaUtil ?? "",
      valor: b.valorEstimado ? parseFloat(String(b.valorEstimado)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "",
    })),
  [filtered, fazendaMap]);

  const exportSpreadsheet = () => {
    if (exportRows.length === 0) { toast.error("Nenhum dado para exportar"); return; }
    const header = ["Benfeitoria", "Fazenda", "Ano de Construção", "Vida Útil", "Valor(R$)"];
    const lines = exportRows.map(r =>
      [r.benfeitoria, r.fazenda, r.ano, r.vidaUtil, r.valor]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(";")
    );
    const csv = "\uFEFF" + [header.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benfeitorias_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Planilha exportada!");
  };

  const exportPdf = () => {
    if (exportRows.length === 0) { toast.error("Nenhum dado para exportar"); return; }
    const rows = exportRows.map(r =>
      `<tr><td>${r.benfeitoria}</td><td>${r.fazenda}</td><td style="text-align:right">${r.ano}</td><td style="text-align:right">${r.vidaUtil}</td><td style="text-align:right">${r.valor}</td></tr>`
    ).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Benfeitorias</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:18px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px}
      th{background:#f5f5f5;text-align:left}</style></head><body>
      <h1>Lista de Benfeitorias</h1>
      <table><thead><tr><th>Benfeitoria</th><th>Fazenda</th><th>Ano</th><th>Vida Útil</th><th>Valor(R$)</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Permita pop-ups para exportar PDF"); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[13px] font-semibold text-gray-800 shrink-0">Lista de benfeitorias</h1>
          <div className="flex items-center gap-4 text-[10px] text-gray-600 shrink-0">
            <button
              type="button"
              onClick={exportSpreadsheet}
              className="flex items-center gap-1.5 hover:text-[#4ECDC4] transition-colors font-medium"
            >
              <span className="material-icons text-[16px]">table_chart</span>
              Exportar Planilha
            </button>
            <button
              type="button"
              onClick={exportPdf}
              className="flex items-center gap-1.5 hover:text-[#4ECDC4] transition-colors font-medium"
            >
              <span className="material-icons text-[16px]">picture_as_pdf</span>
              PDF
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
          <button
            type="button"
            onClick={() => setLocation("/fazendas/benfeitorias/cadastro")}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Cadastrar Benfeitoria
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
    </AppLayout>
  );
}
