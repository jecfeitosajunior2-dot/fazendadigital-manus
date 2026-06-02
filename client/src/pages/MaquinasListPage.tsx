import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

type ColAlign = "left" | "right" | "center";

const TABLE_COLUMNS: {
  key: string;
  label: string;
  align: ColAlign;
  width: string;
}[] = [
  { key: "nome", label: "Máquina", align: "left", width: "20%" },
  { key: "tipo", label: "Tipo", align: "left", width: "9%" },
  { key: "marca", label: "Marca", align: "left", width: "11%" },
  { key: "modelo", label: "Modelo", align: "left", width: "10%" },
  { key: "ano", label: "Ano", align: "center", width: "6%" },
  { key: "valor", label: "Valor (R$)", align: "right", width: "12%" },
  { key: "placa", label: "Placa", align: "center", width: "9%" },
  { key: "fazenda", label: "Fazenda", align: "left", width: "12%" },
  { key: "obs", label: "Observações", align: "left", width: "11%" },
];

const alignClass: Record<ColAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

const justifyClass: Record<ColAlign, string> = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
};

function getTipoIcon(tipo?: string | null): string {
  const t = (tipo ?? "").toLowerCase();
  if (/(trator|colhe|plant|pulveriz|m[aá]quin|implement|grade|arado)/.test(t)) return "agriculture";
  if (/(caminh[aã]o|truck)/.test(t)) return "local_shipping";
  if (/(caminhonete|pickup|carro|ve[ií]culo|utilit|moto)/.test(t)) return "directions_car";
  if (/(gerador|bomba|motor)/.test(t)) return "settings_input_component";
  return "precision_manufacturing";
}

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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="grid place-items-center w-8 h-8 rounded-lg text-[#0f766e] shrink-0"
              style={{ backgroundColor: "rgba(78,205,196,0.14)" }}
            >
              <span className="material-icons text-[18px] leading-none">agriculture</span>
            </span>
            <div className="min-w-0">
              <h1 className="text-[14px] font-semibold text-gray-800 leading-tight">Lista de maquinário</h1>
              <p className="text-[11px] text-gray-400 leading-tight">{filtered.length} {filtered.length === 1 ? "item" : "itens"} cadastrados</p>
            </div>
          </div>
          <ListExportButtons
            title="Lista de Maquinário"
            filename="maquinario"
            headers={exportHeaders}
            rows={exportData}
            alignRightFrom={5}
          />
        </div>

        <div className="px-5 py-3 flex items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/40 min-h-[56px]">
          <button
            type="button"
            onClick={() => setLocation("/maquinas/cadastro")}
            className="inline-flex items-center gap-1.5 h-9 pl-3 pr-4 rounded-lg text-[11px] font-semibold uppercase tracking-wide text-white shrink-0 shadow-sm hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <span className="material-icons text-[16px] leading-none">add</span>
            Cadastrar Maquinário
          </button>
          <div className="relative shrink-0">
            <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-gray-400 pointer-events-none">search</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Buscar maquinário..."
              className="h-9 pl-9 pr-3 text-[12px] border border-gray-200 rounded-lg w-56 bg-white focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]/30 focus:border-[#4ECDC4] transition"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed border-collapse">
            <colgroup>
              {TABLE_COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: "84px" }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50/80 border-y border-gray-200">
                {TABLE_COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 align-middle text-[10.5px] font-semibold text-gray-500 uppercase tracking-[0.04em] whitespace-nowrap select-none",
                      alignClass[col.align]
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-1", justifyClass[col.align])}>
                      {col.label}
                      <span className="material-icons text-[14px] text-gray-300 leading-none">unfold_more</span>
                    </span>
                  </th>
                ))}
                <th className="px-3 py-3 align-middle text-right text-[10.5px] font-semibold text-gray-400 uppercase tracking-[0.04em] w-[84px]">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 text-center text-[12px] text-gray-400 align-middle">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="px-4 py-16 align-middle">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <span className="material-icons text-[34px] text-gray-300">agriculture</span>
                      <span className="text-[12px]">Nenhum maquinário cadastrado</span>
                    </div>
                  </td>
                </tr>
              )}
              {pageItems.map(m => {
                const fazendaNome = m.fazendaId ? fazendaMap.get(m.fazendaId) ?? "" : "";
                return (
                  <tr key={m.id} className="group h-[56px] transition-colors hover:bg-[#4ECDC4]/[0.06]">
                    <td className="px-4 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="shrink-0 grid place-items-center w-9 h-9 rounded-lg text-[#0f766e]"
                          style={{ backgroundColor: "rgba(78,205,196,0.14)" }}
                        >
                          <span className="material-icons text-[18px] leading-none">{getTipoIcon(m.tipo)}</span>
                        </span>
                        <span className="font-semibold text-[12.5px] text-gray-800 truncate" title={m.nome}>
                          {m.nome}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 align-middle text-[12px] text-gray-600 capitalize truncate" title={m.tipo ?? ""}>
                      {m.tipo || "—"}
                    </td>
                    <td className="px-4 align-middle text-[12px] text-gray-600 truncate" title={m.marca ?? ""}>
                      {m.marca || "—"}
                    </td>
                    <td className="px-4 align-middle text-[12px] text-gray-600 truncate" title={m.modelo ?? ""}>
                      {m.modelo || "—"}
                    </td>
                    <td className="px-4 align-middle text-center text-[12px] text-gray-600 tabular-nums">
                      {m.ano || "—"}
                    </td>
                    <td className="px-4 align-middle text-right whitespace-nowrap">
                      {m.valor ? (
                        <span className="inline-flex items-baseline gap-1 tabular-nums">
                          <span className="text-[10px] text-gray-400">R$</span>
                          <span className="text-[12.5px] font-semibold text-gray-800">
                            {parseFloat(String(m.valor)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 align-middle text-center">
                      {m.placa ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10.5px] font-medium tracking-wide text-gray-600 uppercase tabular-nums">
                          {m.placa}
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 align-middle text-[12px] text-gray-600 truncate" title={fazendaNome}>
                      {fazendaNome || "—"}
                    </td>
                    <td className="px-4 align-middle text-[12px] text-gray-500 truncate" title={m.observacoes ?? ""}>
                      {m.observacoes || "—"}
                    </td>
                    <td className="px-3 align-middle">
                      <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => setLocation(`/maquinas/cadastro?id=${m.id}`)}
                          className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-white hover:text-[#0f766e] hover:shadow-sm border border-transparent hover:border-gray-200 transition"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <span className="material-icons text-[16px] leading-none">edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Excluir este maquinário?")) deleteMutation.mutate({ id: m.id });
                          }}
                          className="grid place-items-center w-7 h-7 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-500 border border-transparent hover:border-red-100 transition"
                          aria-label="Excluir"
                          title="Excluir"
                        >
                          <span className="material-icons text-[16px] leading-none">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500">
          <span>{pageSize} itens por página</span>
          <div className="flex items-center gap-4">
            <span className="tabular-nums">
              Mostrando {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} de {filtered.length} itens
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="grid place-items-center w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-gray-50 transition"
              >
                <span className="material-icons text-[16px] leading-none">chevron_left</span>
              </button>
              <span
                className="grid place-items-center min-w-7 h-7 px-2 rounded-md font-semibold tabular-nums"
                style={{ backgroundColor: FD_PRIMARY, color: "#0f3d3a" }}
              >
                {page}
              </span>
              <span className="text-gray-400">de {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="grid place-items-center w-7 h-7 rounded-md border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-gray-50 transition"
              >
                <span className="material-icons text-[16px] leading-none">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export { MaquinasListPage };
