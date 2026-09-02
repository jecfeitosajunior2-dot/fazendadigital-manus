import { useLocation, useParams } from "wouter";
import AppLayout from "@/components/AppLayout";
import { formatDateBR } from "@/lib/date-utils";
import { COMPRA_VENDA_VENDAS_PATH } from "@/lib/compraVendaCompradores";
import {
  calcularPesoCarne,
  FORMA_PRECIFICACAO_VENDA_LABEL,
  isFormaPrecificacaoVenda,
  parseRendimentoCarcaca,
} from "@shared/vendaComercial";
import { trpc } from "@/lib/trpc";

function money(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function VendaDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data, isLoading } = trpc.vendas.get.useQuery({ id }, { enabled: Number.isFinite(id) && id > 0 });
  const rendimentoParse = parseRendimentoCarcaca(data?.rendimentoCarcaca);
  const rendimento = rendimentoParse.ok ? rendimentoParse.valor : null;
  const temRendimento = rendimento != null;

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)}
        className="mb-3 flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-[#4ECDC4]"
      >
        <span className="material-icons text-[14px]">arrow_back</span>
        Voltar para Vendas
      </button>

      {isLoading || !data ? (
        <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-[12px] text-gray-400">{isLoading ? "Carregando..." : "Venda não encontrada"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h1 className="text-[15px] font-medium text-gray-800 mb-3">Venda #{data.id}</h1>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-[12px]">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Data</p>
                <p className="font-medium text-gray-800">{formatDateBR(data.data)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Fazenda</p>
                <p className="font-medium text-gray-800">{data.fazendaNome || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Comprador</p>
                <p className="font-medium text-gray-800">{data.comprador || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Forma</p>
                <p className="font-medium text-gray-800">
                  {isFormaPrecificacaoVenda(data.formaPrecificacao)
                    ? FORMA_PRECIFICACAO_VENDA_LABEL[data.formaPrecificacao]
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Animais</p>
                <p className="font-medium text-gray-800">{data.totais.quantidade}</p>
              </div>
              {temRendimento ? (
                <div>
                  <p className="text-[10px] uppercase text-gray-400">Rendimento</p>
                  <p className="font-medium text-gray-800">{rendimento.toLocaleString("pt-BR")}%</p>
                </div>
              ) : null}
              <div>
                <p className="text-[10px] uppercase text-gray-400">{temRendimento ? "Peso carne" : "Peso total"}</p>
                <p className="font-medium text-gray-800">
                  {data.totais.pesoTotal != null ? `${data.totais.pesoTotal.toLocaleString("pt-BR")} kg` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Valor total</p>
                <p className="font-medium text-gray-800">{money(data.totais.valorTotal)}</p>
              </div>
            </div>
            {data.observacoes ? (
              <p className="mt-3 text-[12px] text-gray-600">{data.observacoes}</p>
            ) : null}
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100">
              <h2 className="text-[13px] font-medium text-gray-800">Animais da Venda</h2>
            </div>
            {!data.temItens ? (
              <p className="p-6 text-center text-[12px] text-gray-400">
                Venda legada sem itens individuais. Quantidade registrada: {data.quantidadeAnimais ?? 0}.
              </p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Brinco</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lote</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso vivo</th>
                    {temRendimento ? (
                      <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Peso carne</th>
                    ) : null}
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Preço</th>
                    <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map(item => (
                    <tr key={item.id} className="border-t border-gray-50">
                      <td className="px-3 py-1.5 font-medium text-gray-800">{item.brincoSnapshot || `#${item.animalId}`}</td>
                      <td className="px-3 py-1.5 text-gray-600">{item.loteNomeSnapshot || "—"}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">
                        {item.pesoVenda != null ? `${Number(item.pesoVenda).toLocaleString("pt-BR")} kg` : "—"}
                      </td>
                      {temRendimento ? (
                        <td className="px-3 py-1.5 text-right text-gray-700">
                          {item.pesoVenda != null
                            ? `${calcularPesoCarne(Number(item.pesoVenda), rendimento).toLocaleString("pt-BR")} kg`
                            : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-1.5 text-right text-gray-700">{money(item.precoUnitario)}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-gray-800">{money(item.valorItem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
