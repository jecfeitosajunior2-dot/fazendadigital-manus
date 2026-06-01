import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  formatDataBr,
  formatQuantidadeMov,
  nomeUnidadeExibicao,
} from "@/lib/produto-types";
import { cn } from "@/lib/utils";

const FD_PRIMARY = "#4ECDC4";

type SortKey =
  | "dataMovimentacao"
  | "nome"
  | "categoria"
  | "fabricante"
  | "dataValidade"
  | "unidade"
  | "quantidade";

type Props = { variant?: "overview" | "movimentacao" };

export default function InsumosVisaoGeralPage({ variant = "overview" }: Props) {
  const [, setLocation] = useLocation();
  const isOverview = variant === "overview";
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("dataMovimentacao");
  const [sortAsc, setSortAsc] = useState(false);

  const [estoqueId, setEstoqueId] = useState("");
  const [dataMov, setDataMov] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantidade, setQuantidade] = useState("");
  const [dataValidade, setDataValidade] = useState("");

  const utils = trpc.useUtils();
  const { data: movimentacoes = [], isLoading } = trpc.estoque.listMovimentacoes.useQuery();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const { data: resumo } = trpc.estoque.resumo.useQuery();

  const deleteMutation = trpc.estoque.deleteMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação excluída.");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const createMutation = trpc.estoque.createMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada!");
      setModalOpen(false);
      setQuantidade("");
      setDataValidade("");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
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
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [movimentacoes, sortKey, sortAsc]);

  const exportHeaders = [
    "Data de Movimentação",
    "Nome do Produto",
    "Categoria",
    "Fabricante",
    "Data de Validade",
    "Unidade",
    "Quantidade",
  ];
  const exportRows = sorted.map(m => [
    formatDataBr(m.dataMovimentacao),
    m.nome ?? "",
    m.categoria ?? "",
    m.fabricante ?? "",
    formatDataBr(m.dataValidade),
    nomeUnidadeExibicao(m.unidade),
    formatQuantidadeMov(m.quantidade),
  ]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <span className="material-icons text-[12px] text-gray-400 ml-0.5 align-middle">
      {sortKey === col ? (sortAsc ? "arrow_drop_up" : "arrow_drop_down") : "unfold_more"}
    </span>
  );

  const thClass =
    "px-4 py-2.5 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-left whitespace-nowrap cursor-pointer select-none";

  return (
    <AppLayout>
      <div className="rounded border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isOverview && (
          <div
            className="px-4 py-2.5 text-[11px] text-white text-center font-medium"
            style={{ backgroundColor: "#E85D04" }}
          >
            Registre entradas e saídas para acompanhar o estoque da fazenda em tempo real.
          </div>
        )}

        {isOverview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setLocation("/insumos/lista-produtos?filtro=monitorado")}
            className="flex items-center justify-between px-5 py-4 text-left border-b sm:border-b-0 sm:border-r border-gray-200 hover:bg-gray-50/80 transition-colors"
          >
            <span className="text-[13px] font-medium text-gray-800">Monitorado</span>
            <span className="flex items-center gap-1 text-[12px] text-gray-500">
              {resumo?.totalMonitorados ?? 0}
              <span className="material-icons text-[18px]">chevron_right</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLocation("/insumos/lista-produtos?filtro=abaixo")}
            className="flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
          >
            <span className="text-[13px] font-medium text-gray-800">Abaixo do Limite</span>
            <span className="flex items-center gap-1 text-[12px] text-gray-500">
              {resumo?.totalAbaixoLimite ?? 0}
              <span className="material-icons text-[18px]">chevron_right</span>
            </span>
          </button>
        </div>
        )}

        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-[18px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isOverview ? "Últimas Movimentações" : "Movimentação"}
          </h1>
          <ListExportButtons
            title="Últimas Movimentações"
            filename="movimentacoes-insumos"
            headers={exportHeaders}
            rows={exportRows}
            alignRightFrom={6}
          />
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-50">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Nova Movimentação
          </button>
          <button
            type="button"
            onClick={() => setLocation("/insumos/cadastro")}
            className="px-4 py-2 rounded text-[10px] font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Cadastrar Produto
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {(
                  [
                    ["dataMovimentacao", "Data de Movimentação"],
                    ["nome", "Nome do Produto"],
                    ["categoria", "Categoria"],
                    ["fabricante", "Fabricante"],
                    ["dataValidade", "Data de Validade"],
                    ["unidade", "Unidade"],
                    ["quantidade", "Quantidade"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className={thClass} onClick={() => toggleSort(key)}>
                    {label}
                    <SortIcon col={key} />
                  </th>
                ))}
                <th className="w-12 px-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    Nenhuma movimentação registrada.
                  </td>
                </tr>
              )}
              {sorted.map((m, i) => (
                <tr
                  key={m.id}
                  className={cn(
                    "border-t border-gray-100",
                    i % 2 === 1 ? "bg-gray-50/50" : "bg-white"
                  )}
                >
                  <td className="px-4 py-2.5 text-gray-800">{formatDataBr(m.dataMovimentacao)}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900 uppercase">{m.nome}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.categoria || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{m.fabricante || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{formatDataBr(m.dataValidade) || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{nomeUnidadeExibicao(m.unidade) || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatQuantidadeMov(m.quantidade)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Excluir esta movimentação? O estoque será recalculado.")) {
                          deleteMutation.mutate({ id: m.id });
                        }
                      }}
                      className="p-1 text-gray-700 hover:text-red-600"
                      title="Excluir"
                    >
                      <span className="material-icons text-[18px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Nova movimentação</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={e => {
              e.preventDefault();
              if (!estoqueId) {
                toast.error("Selecione um produto.");
                return;
              }
              createMutation.mutate({
                estoqueId: Number(estoqueId),
                dataMovimentacao: dataMov,
                quantidade,
                dataValidade: dataValidade || undefined,
              });
            }}
          >
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">Produto *</label>
              <select
                value={estoqueId}
                onChange={e => setEstoqueId(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-[12px]"
                required
              >
                <option value="">Selecione...</option>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Data *</label>
                <input
                  type="date"
                  value={dataMov}
                  onChange={e => setDataMov(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[12px]"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-600 block mb-1">Validade</label>
                <input
                  type="date"
                  value={dataValidade}
                  onChange={e => setDataValidade(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-2 text-[12px]"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-600 block mb-1">
                Quantidade * <span className="text-gray-400 font-normal">(negativo = saída)</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="-400,00"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-[12px]"
                required
              />
            </div>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="w-full py-2 rounded text-[11px] font-semibold uppercase text-white disabled:opacity-60"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {createMutation.isPending ? "Salvando..." : "Registrar"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
