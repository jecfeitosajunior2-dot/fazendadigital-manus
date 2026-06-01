import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { exportListPdf, exportListSpreadsheet } from "@/lib/exportList";
import { nomeUnidadeExibicao, formatQuantidadeMov } from "@/lib/produto-types";

type SortKey = "nome" | "unidade" | "qtdAtual" | "qtdMinima";

function SortIcon({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <span className="material-icons text-[13px] text-gray-400 ml-0.5 align-middle leading-none">
      {active ? (asc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );
}

// ─── Painel Monitorado ────────────────────────────────────────────────────────

function MonitoradoPanel() {
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortAsc, setSortAsc] = useState(true);

  const monitorados = useMemo(
    () => produtos.filter(p => p.monitorarEstoque),
    [produtos]
  );

  const sorted = useMemo(() => {
    const rows = [...monitorados];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "nome") { va = String(a.nome ?? "").toLowerCase(); vb = String(b.nome ?? "").toLowerCase(); }
      else if (sortKey === "unidade") { va = nomeUnidadeExibicao(a.unidade as string).toLowerCase(); vb = nomeUnidadeExibicao(b.unidade as string).toLowerCase(); }
      else if (sortKey === "qtdAtual") { va = Number(a.quantidade ?? 0); vb = Number(b.quantidade ?? 0); }
      else if (sortKey === "qtdMinima") { va = Number(a.quantidadeMinima ?? 0); vb = Number(b.quantidadeMinima ?? 0); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [monitorados, sortKey, sortAsc]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const exportHeaders = ["Produtos", "Unidade", "Qtd. Atual", "Qtd. Mínima"];
  const exportRows = sorted.map(p => [
    p.nome,
    nomeUnidadeExibicao(p.unidade as string),
    formatQuantidadeMov(p.quantidade as string),
    formatQuantidadeMov(p.quantidadeMinima as string),
  ]);

  const thClass = "px-3 py-2.5 text-[10px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none";

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-[13px] font-semibold text-gray-800">Monitorado</span>
        <span
          className="material-icons text-[20px] text-gray-500 transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          chevron_right
        </span>
      </button>

      {/* Conteúdo expansível */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? "2000px" : "0px" }}
      >
        <div className="border-t border-gray-100">
          {/* Botões de exportação */}
          <div className="px-4 py-2 flex items-center justify-end gap-4 text-[10px] text-gray-600 border-b border-gray-100">
            <button
              type="button"
              onClick={() => exportListSpreadsheet(exportHeaders, exportRows, "monitorado")}
              className="flex items-center gap-1 hover:text-[#4ECDC4] font-medium"
            >
              <span className="material-icons text-[15px]">table_chart</span>
              Exportar Planilha
            </button>
            <button
              type="button"
              onClick={() => exportListPdf("Monitorado", exportHeaders, exportRows, { alignRightFrom: 2 })}
              className="flex items-center gap-1 hover:text-[#4ECDC4] font-medium"
            >
              <span className="material-icons text-[15px]">picture_as_pdf</span>
              PDF
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={`${thClass} text-left`} onClick={() => toggle("nome")}>
                    <span className="inline-flex items-center">Produtos <SortIcon active={sortKey === "nome"} asc={sortAsc} /></span>
                  </th>
                  <th className={`${thClass} text-left`} onClick={() => toggle("unidade")}>
                    <span className="inline-flex items-center">Unidade <SortIcon active={sortKey === "unidade"} asc={sortAsc} /></span>
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggle("qtdAtual")}>
                    <span className="inline-flex items-center justify-end w-full">Qtd. Atual <SortIcon active={sortKey === "qtdAtual"} asc={sortAsc} /></span>
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggle("qtdMinima")}>
                    <span className="inline-flex items-center justify-end w-full">Qtd. Mínima <SortIcon active={sortKey === "qtdMinima"} asc={sortAsc} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-gray-400">Sem dados</td>
                  </tr>
                ) : sorted.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-medium text-gray-900 uppercase">{p.nome}</td>
                    <td className="px-3 py-2.5 text-gray-700">{nomeUnidadeExibicao(p.unidade as string)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{formatQuantidadeMov(p.quantidade as string)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{formatQuantidadeMov(p.quantidadeMinima as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Painel Abaixo do Limite ──────────────────────────────────────────────────

function AbaixoDoLimitePanel() {
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortAsc, setSortAsc] = useState(true);

  const abaixo = useMemo(
    () => produtos.filter(p => {
      if (!p.monitorarEstoque) return false;
      const q = Number(p.quantidade ?? 0);
      const min = Number(p.quantidadeMinima ?? 0);
      return min > 0 && q <= min;
    }),
    [produtos]
  );

  const sorted = useMemo(() => {
    const rows = [...abaixo];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "nome") { va = String(a.nome ?? "").toLowerCase(); vb = String(b.nome ?? "").toLowerCase(); }
      else if (sortKey === "qtdAtual") { va = Number(a.quantidade ?? 0); vb = Number(b.quantidade ?? 0); }
      else if (sortKey === "qtdMinima") { va = Number(a.quantidadeMinima ?? 0); vb = Number(b.quantidadeMinima ?? 0); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [abaixo, sortKey, sortAsc]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const exportHeaders = ["Produtos", "Qtd. Atual", "Qtd. Mínima"];
  const exportRows = sorted.map(p => [
    p.nome,
    formatQuantidadeMov(p.quantidade as string),
    formatQuantidadeMov(p.quantidadeMinima as string),
  ]);

  const thClass = "px-3 py-2.5 text-[10px] font-semibold text-gray-700 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none";

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
      >
        <span className="text-[13px] font-semibold text-gray-800">Abaixo do Limite</span>
        <span
          className="material-icons text-[20px] text-gray-500 transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          chevron_right
        </span>
      </button>

      {/* Conteúdo expansível */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? "2000px" : "0px" }}
      >
        <div className="border-t border-gray-100">
          {/* Botões de exportação */}
          <div className="px-4 py-2 flex items-center justify-end gap-4 text-[10px] text-gray-600 border-b border-gray-100">
            <button
              type="button"
              onClick={() => exportListSpreadsheet(exportHeaders, exportRows, "abaixo-do-limite")}
              className="flex items-center gap-1 hover:text-[#4ECDC4] font-medium"
            >
              <span className="material-icons text-[15px]">table_chart</span>
              Exportar Planilha
            </button>
            <button
              type="button"
              onClick={() => exportListPdf("Abaixo do Limite", exportHeaders, exportRows, { alignRightFrom: 1 })}
              className="flex items-center gap-1 hover:text-[#4ECDC4] font-medium"
            >
              <span className="material-icons text-[15px]">picture_as_pdf</span>
              PDF
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={`${thClass} text-left`} onClick={() => toggle("nome")}>
                    <span className="inline-flex items-center">Produtos <SortIcon active={sortKey === "nome"} asc={sortAsc} /></span>
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggle("qtdAtual")}>
                    <span className="inline-flex items-center justify-end w-full">Qtd. Atual <SortIcon active={sortKey === "qtdAtual"} asc={sortAsc} /></span>
                  </th>
                  <th className={`${thClass} text-right`} onClick={() => toggle("qtdMinima")}>
                    <span className="inline-flex items-center justify-end w-full">Qtd. Mínima <SortIcon active={sortKey === "qtdMinima"} asc={sortAsc} /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-gray-400">Sem dados</td>
                  </tr>
                ) : sorted.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 font-medium text-gray-900 uppercase">{p.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{formatQuantidadeMov(p.quantidade as string)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{formatQuantidadeMov(p.quantidadeMinima as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Grid dos dois painéis ────────────────────────────────────────────────────

export default function InsumosMonitoradoPanels() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      <MonitoradoPanel />
      <AbaixoDoLimitePanel />
    </div>
  );
}
