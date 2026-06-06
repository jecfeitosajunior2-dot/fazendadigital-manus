import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import MobileCard from "@/components/MobileCard";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { cn } from "@/lib/utils";
import { ImportarMaquinariosModal } from '@/components/ImportarMaquinariosModal';
import { TIPOS_MAQUINA } from '@/lib/maquina-types';

const FD_PRIMARY = "#4ECDC4";

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: {
  key: string;
  label: string;
  align: ColAlign;
  width: string;
}[] = [
  { key: "nome", label: "Máquina", align: "left", width: "14%" },
  { key: "tipo", label: "Tipo", align: "left", width: "9%" },
  { key: "marca", label: "Marca", align: "left", width: "10%" },
  { key: "modelo", label: "Modelo", align: "left", width: "10%" },
  { key: "ano", label: "Ano", align: "left", width: "6%" },
  { key: "valor", label: "Valor(R$)", align: "right", width: "10%" },
  { key: "placa", label: "Placa", align: "left", width: "8%" },
  { key: "fazenda", label: "Fazenda", align: "left", width: "14%" },
  { key: "obs", label: "Observações", align: "left", width: "13%" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export default function MaquinasListPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [page, setPage] = useState(1);
  const [importarOpen, setImportarOpen] = useState(false);
  const pageSize = 10;

  const { data: list = [], isLoading, refetch } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await refetch();
      toast.success("Atualizado!");
    },
    enabled: true,
  });
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
    return list.filter(m => {
      const matchSearch = !q || [m.nome, m.tipo, m.marca, m.modelo, m.fazendaId ? fazendaMap.get(m.fazendaId) : ""].some(v =>
        String(v || "").toLowerCase().includes(q)
      );
      const matchTipo = !filtroTipo || m.tipo === filtroTipo;
      return matchSearch && matchTipo;
    });
  }, [list, search, filtroTipo, fazendaMap]);

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
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="bg-white rounded border border-gray-200 shadow-sm overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
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

        <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setImportarOpen(true)}
            className="inline-flex items-center gap-2 px-4 rounded text-[12px] font-semibold uppercase text-white shrink-0 hover:brightness-95 active:scale-[0.97] transition"
            style={{ backgroundColor: '#1565C0', minHeight: 48 }}
          >
            <span className="material-icons text-[18px]">upload_file</span>
            Importar
          </button>
          <button
            type="button"
            onClick={() => setLocation("/maquinas/cadastro")}
            className="inline-flex items-center gap-2 px-4 rounded text-[12px] font-semibold uppercase text-white shrink-0 hover:brightness-95 active:scale-[0.97] transition"
            style={{ backgroundColor: FD_PRIMARY, minHeight: 48 }}
          >
            <span className="material-icons text-[18px]">add</span>
            Cadastrar Maquinário
          </button>
          <select
            value={filtroTipo}
            onChange={e => { setFiltroTipo(e.target.value); setPage(1); }}
            className="text-[13px] border border-gray-200 rounded bg-white px-3 text-gray-700 shrink-0"
            style={{ minHeight: 48 }}
          >
            <option value="">Todos os Tipos</option>
            {TIPOS_MAQUINA.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400 pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar"
              className="w-full pl-10 pr-3 text-[13px] border border-gray-200 rounded bg-white"
              style={{ minHeight: 48 }}
            />
          </div>
        </div>

        {/* Cards no mobile */}
        <div className="lg:hidden px-3 py-3 space-y-3">
          {isLoading && (
            <div className="py-10 text-center text-gray-400 text-[13px]">Carregando...</div>
          )}
          {!isLoading && pageItems.length === 0 && (
            <div className="py-10 text-center text-gray-400 text-[13px]">Sem dados</div>
          )}
          {!isLoading && pageItems.map(m => (
            <MobileCard
              key={m.id}
              title={m.nome}
              subtitle={[m.tipo, m.marca, m.modelo].filter(Boolean).join(" · ") || undefined}
              badge={m.valor ? (
                <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
                  R$ {parseFloat(String(m.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              ) : undefined}
              fields={[
                { label: "Ano", value: m.ano ?? "" },
                { label: "Placa", value: m.placa ? String(m.placa).toUpperCase() : "" },
                { label: "Fazenda", value: m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "" : "" },
              ]}
              actions={[
                { icon: "edit", label: "Editar", onClick: () => setLocation(`/maquinas/cadastro?id=${m.id}`) },
                { icon: "delete", label: "Excluir", variant: "danger", onClick: () => { if (confirm("Excluir este maquinário?")) deleteMutation.mutate({ id: m.id }); } },
              ]}
            />
          ))}
        </div>

        {/* Tabela no desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full min-w-[960px] table-fixed text-[11px] border-collapse">
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: "72px" }} />
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-2.5 align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap",
                      alignClass[col.align]
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-0.5", col.align === "right" && "justify-end w-full")}>
                      {col.label}
                      <span className="material-icons text-[12px] text-gray-300 shrink-0">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2.5 align-middle text-center w-[72px]" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-10 text-center text-gray-400 align-middle">
                    Sem dados
                  </td>
                </tr>
              )}
              {pageItems.map(m => (
                <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 align-middle font-medium text-gray-800 truncate" title={m.nome}>
                    {m.nome}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 capitalize truncate" title={m.tipo ?? ""}>
                    {m.tipo ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 truncate" title={m.marca ?? ""}>
                    {m.marca ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 truncate" title={m.modelo ?? ""}>
                    {m.modelo ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 tabular-nums">
                    {m.ano ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-700 text-right tabular-nums whitespace-nowrap">
                    {m.valor ? parseFloat(String(m.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 uppercase tabular-nums whitespace-nowrap">
                    {m.placa ?? "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-600 truncate" title={m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "" : ""}>
                    {m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "-" : "-"}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-gray-500 truncate" title={m.observacoes ?? ""}>
                    {m.observacoes ? m.observacoes : "-"}
                  </td>
                  <td className="px-2 py-2.5 align-middle text-center w-[80px]">
                    <div className="inline-flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setLocation(`/maquinas/cadastro?id=${m.id}`)}
                        className="action-btn-inline grid place-items-center rounded hover:bg-gray-100 text-gray-400 active:scale-95 transition"
                        style={{ minWidth: 40, minHeight: 40 }}
                        aria-label="Editar"
                      >
                        <span className="material-icons text-[18px] leading-none">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Excluir este maquinário?")) deleteMutation.mutate({ id: m.id });
                        }}
                        className="action-btn-inline grid place-items-center rounded hover:bg-red-50 text-red-400 active:scale-95 transition"
                        style={{ minWidth: 40, minHeight: 40 }}
                        aria-label="Excluir"
                      >
                        <span className="material-icons text-[18px] leading-none">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500">
          <span className="hidden sm:inline">{pageSize} itens por página</span>
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span className="tabular-nums">
              {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="grid place-items-center rounded border border-gray-200 bg-white text-gray-500 disabled:opacity-30 enabled:hover:bg-gray-50 active:scale-95 transition"
                style={{ minWidth: 40, minHeight: 40 }}
              >
                <span className="material-icons text-[18px]">chevron_left</span>
              </button>
              <span
                className="grid place-items-center rounded font-semibold text-[13px] text-gray-800 tabular-nums"
                style={{ backgroundColor: FD_PRIMARY, minWidth: 40, minHeight: 40 }}
              >
                {page}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="grid place-items-center rounded border border-gray-200 bg-white text-gray-500 disabled:opacity-30 enabled:hover:bg-gray-50 active:scale-95 transition"
                style={{ minWidth: 40, minHeight: 40 }}
              >
                <span className="material-icons text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ImportarMaquinariosModal
        open={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportado={() => refetch()}
      />
    </AppLayout>
  );
}

export { MaquinasListPage };
