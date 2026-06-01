import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";

const FD_PRIMARY = "#4ECDC4";

export default function InsumosNovaMovimentacaoPage() {
  const [, setLocation] = useLocation();
  const [estoqueId, setEstoqueId] = useState("");
  const [dataMov, setDataMov] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantidade, setQuantidade] = useState("");
  const [dataValidade, setDataValidade] = useState("");

  const utils = trpc.useUtils();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();

  const createMutation = trpc.estoque.createMovimentacao.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada!");
      utils.estoque.listMovimentacoes.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.resumo.invalidate();
      setLocation("/insumos/visao-geral");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <AppLayout>
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setLocation("/insumos/visao-geral")}
          className="flex items-center gap-1 text-[12px] text-gray-600 hover:text-gray-900"
        >
          <span className="material-icons text-[18px]">arrow_back</span>
          Voltar
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded shadow-sm max-w-2xl">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Nova Movimentação
          </h1>
        </div>

        <form
          className="p-5 space-y-4"
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
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Produto *
            </label>
            <select
              value={estoqueId}
              onChange={e => setEstoqueId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2.5 text-[13px] bg-white"
              required
            >
              <option value="">Selecione o produto...</option>
              {produtos.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Data de movimentação *
              </label>
              <input
                type="date"
                value={dataMov}
                onChange={e => setDataMov(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2.5 text-[13px]"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
                Data de validade
              </label>
              <input
                type="date"
                value={dataValidade}
                onChange={e => setDataValidade(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2.5 text-[13px]"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide block mb-1.5">
              Quantidade *
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="-400,00"
              value={quantidade}
              onChange={e => setQuantidade(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2.5 text-[13px]"
              required
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Use valor negativo para saída (ex.: -400,00) e positivo para entrada.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-5 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {createMutation.isPending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setLocation("/insumos/visao-geral")}
              className="px-5 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
