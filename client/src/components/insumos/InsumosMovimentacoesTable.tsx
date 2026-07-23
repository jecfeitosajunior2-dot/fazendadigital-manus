import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import ListExportButtons from "@/components/ListExportButtons";
import { trpc } from "@/lib/trpc";
import { brl } from "@/lib/dashboard-utils";
import {
  formatDataBr,
  formatQuantidadeMov,
  nomeUnidadeExibicao,
} from "@/lib/produto-types";

export type SortKey =
  | "dataMovimentacao"
  | "tipo"
  | "nome"
  | "categoria"
  | "fabricante"
  | "dataValidade"
  | "unidade"
  | "quantidade"
  | "valor";

type Props = {
  title: string;
  exportFilename: string;
  toolbar?: ReactNode;
  variant?: "full" | "overview";
  hasProdutos?: boolean;
};

const OVERVIEW_MAX_ROWS = 15;

export default function InsumosMovimentacoesTable({
  title,
  exportFilename,
  toolbar,
  variant = "full",
  hasProdutos = true,
}: Props) {
  const isOverview = variant === "overview";
  const [, setLocation] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("dataMovimentacao");
  const [sortAsc, setSortAsc] = useState(false);

  const utils = trpc.useUtils();
  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
  });

  const deleteMutation = trpc.estoque.deleteMovimentacao.useMutation({
    onSuccess: async () => {
      toast.success("Movimentação excluída.");
      await Promise.all([
        utils.estoque.listMovimentacoes.invalidate(),
        utils.estoque.list.invalidate(),
        utils.estoque.resumo.invalidate(),
      ]);
      await utils.estoque.listMovimentacoes.refetch();
    },
    onError: e => toast.error(e.message),
  });

  const sorted = useMemo(() => {
    const rows = [...movimentacoes];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "dataMovimentacao":
          va = String(a.dataMovimentacao);
          vb = String(b.dataMovimentacao);
          break;
        case "tipo":
          va = a.tipo ?? "";
          vb = b.tipo ?? "";
          break;
        case "nome":
          va = a.nome ?? "";
          vb = b.nome ?? "";
          break;
        case "categoria":
          va = a.categoria ?? "";
          vb = b.categoria ?? "";
          break;
        case "fabricante":
          va = a.fabricante ?? "";
          vb = b.fabricante ?? "";
          break;
        case "dataValidade":
          va = String(a.dataValidade ?? "");
          vb = String(b.dataValidade ?? "");
          break;
        case "unidade":
          va = nomeUnidadeExibicao(a.unidade);
          vb = nomeUnidadeExibicao(b.unidade);
          break;
        case "quantidade":
          va = Number(a.quantidade);
          vb = Number(b.quantidade);
          break;
        case "valor":
          va = Number(a.valor ?? 0);
          vb = Number(b.valor ?? 0);
          break;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return isOverview ? rows.slice(0, OVERVIEW_MAX_ROWS) : rows;
  }, [movimentacoes, sortKey, sortAsc, isOverview]);

  const overviewColumns: [SortKey, string][] = [
    ["dataMovimentacao", "Data"],
    ["tipo", "Tipo"],
    ["nome", "Produto"],
    ["quantidade", "Quantidade"],
    ["valor", "Valor"],
    ["dataValidade", "Validade"],
  ];

  const fullColumns: [SortKey, string][] = [
    ["dataMovimentacao", "Data de Movimentação"],
    ["nome", "Nome do Produto"],
    ["categoria", "Categoria"],
    ["fabricante", "Fabricante"],
    ["dataValidade", "Data de Validade"],
    ["unidade", "Unidade"],
    ["quantidade", "Quantidade"],
  ];

  const columns = isOverview ? overviewColumns : fullColumns;

  const exportHeaders = isOverview
    ? ["Data", "Tipo", "Produto", "Quantidade", "Valor", "Validade"]
    : [
        "Data de Movimentação",
        "Nome do Produto",
        "Categoria",
        "Fabricante",
        "Data de Validade",
        "Unidade",
        "Quantidade",
      ];

  const exportRows = sorted.map(m => {
    if (isOverview) {
      return [
        formatDataBr(m.dataMovimentacao),
        m.tipo ?? "",
        m.nome ?? "",
        formatQuantidadeMov(m.quantidade),
        m.valor != null && m.valor !== "" ? brl(Number(m.valor)) : "—",
        formatDataBr(m.dataValidade),
      ];
    }
    return [
      formatDataBr(m.dataMovimentacao),
      m.nome ?? "",
      m.categoria ?? "",
      m.fabricante ?? "",
      formatDataBr(m.dataValidade),
      nomeUnidadeExibicao(m.unidade),
      formatQuantidadeMov(m.quantidade),
    ];
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="material-icons text-[14px] text-gray-400 ml-1 align-middle leading-none">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass =
    "px-4 py-3 text-[11px] font-semibold text-gray-700 uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none";

  const emptyMessage = !hasProdutos
    ? "Cadastre produtos em Lista de Produtos antes de registrar movimentações."
    : "Sem movimentações registradas";

  const formatValor = (valor: string | number | null | undefined) => {
    const n = Number(valor);
    if (!valor || Number.isNaN(n) || n === 0) return "—";
    return brl(n);
  };

  const formatQuantidadeOverview = (m: (typeof movimentacoes)[0]) => {
    const qtd = formatQuantidadeMov(m.quantidade);
    const un = nomeUnidadeExibicao(m.unidade);
    return un ? `${qtd} ${un}` : qtd;
  };

  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className={`font-semibold text-gray-900 ${isOverview ? "text-[16px]" : "text-[20px]"}`}
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {title}
          </h2>
          {isOverview && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              Resumo das movimentações recentes — gestão completa em Movimentação
            </p>
          )}
        </div>
        {hasProdutos && (
          <ListExportButtons
            title={title}
            filename={exportFilename}
            headers={exportHeaders}
            rows={exportRows}
            alignRightFrom={isOverview ? 5 : 6}
          />
        )}
      </div>

      {toolbar && (
        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
          {toolbar}
        </div>
      )}

      {isOverview && !hasProdutos ? (
        <div className="px-5 py-14 text-center text-[13px] text-gray-400 leading-relaxed">
          {emptyMessage}
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-200">
              {columns.map(([key, label]) => (
                <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                  <span className="inline-flex items-center">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
              <th className="w-24 px-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-gray-400">
                  Carregando...
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-14 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {sorted.map(m => (
              <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                {isOverview ? (
                  <>
                    <td className="px-4 py-3 text-gray-800">{formatDataBr(m.dataMovimentacao)}</td>
                    <td className="px-4 py-3 text-gray-700">{m.tipo ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{m.nome}</td>
                    <td className="px-4 py-3 text-gray-900 tabular-nums">{formatQuantidadeOverview(m)}</td>
                    <td className="px-4 py-3 text-gray-800 tabular-nums">{formatValor(m.valor)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDataBr(m.dataValidade) || "—"}</td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-gray-800">{formatDataBr(m.dataMovimentacao)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 uppercase">{m.nome}</td>
                    <td className="px-4 py-3 text-gray-700">{m.categoria ?? ""}</td>
                    <td className="px-4 py-3 text-gray-700">{m.fabricante ?? ""}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDataBr(m.dataValidade)}</td>
                    <td className="px-4 py-3 text-gray-700">{nomeUnidadeExibicao(m.unidade)}</td>
                    <td className="px-4 py-3 text-gray-900 tabular-nums">{formatQuantidadeMov(m.quantidade)}</td>
                  </>
                )}
                <td className="px-2 py-3 text-center">
                  {hasProdutos && (
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setLocation(`/insumos/nova-movimentacao?id=${m.id}`)}
                        className="p-1 text-gray-800 hover:text-[#4ECDC4]"
                        title="Editar"
                      >
                        <span className="material-icons text-[20px]">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Excluir esta movimentação? O estoque será recalculado.")) {
                            deleteMutation.mutate({ id: m.id });
                          }
                        }}
                        className="p-1 text-gray-800 hover:text-red-600"
                        title="Excluir"
                      >
                        <span className="material-icons text-[20px]">delete</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
