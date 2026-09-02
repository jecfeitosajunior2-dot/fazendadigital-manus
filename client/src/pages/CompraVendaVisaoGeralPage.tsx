import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { formatDateBR, periodoMesAtual } from "@/lib/date-utils";
import {
  formatarMetricaPeso,
  formatarMetricaQuantidade,
  formatarMetricaValor,
  resumirOperacoes,
  type CommercialMetric,
} from "@/lib/compraVendaResumo";
import { trpc } from "@/lib/trpc";

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-[22px] font-bold text-gray-800 leading-tight mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">{hint}</p> : null}
    </div>
  );
}

function hintPeso(metric: CommercialMetric): string | undefined {
  return metric.kind === "unknown" ? "Ainda não registrado na operação" : undefined;
}

function formatLinhaValor(metric: CommercialMetric): string {
  return formatarMetricaValor(metric);
}

function formatLinhaQtd(metric: CommercialMetric): string {
  return formatarMetricaQuantidade(metric);
}

export default function CompraVendaVisaoGeralPage() {
  const padrao = periodoMesAtual();
  const [de, setDe] = useState(padrao.de);
  const [ate, setAte] = useState(padrao.ate);
  const periodo = { de, ate };

  const { data: compras = [], isLoading: loadingCompras } = trpc.compras.list.useQuery();
  const { data: vendas = [], isLoading: loadingVendas } = trpc.vendas.list.useQuery();
  const loading = loadingCompras || loadingVendas;

  const resumoCompras = useMemo(
    () => resumirOperacoes(compras, periodo, "fornecedor"),
    [compras, periodo.de, periodo.ate],
  );
  const resumoVendas = useMemo(
    () => resumirOperacoes(vendas, periodo, "comprador"),
    [vendas, periodo.de, periodo.ate],
  );

  return (
    <AppLayout>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[15px] font-medium text-gray-800">Compra e Venda</h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            Resumo das operações comerciais da fazenda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-gray-500 uppercase">Período</span>
          <input
            type="date"
            value={de}
            onChange={e => setDe(e.target.value)}
            className="text-[12px] border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700"
            aria-label="Data inicial"
          />
          <input
            type="date"
            value={ate}
            onChange={e => setAte(e.target.value)}
            className="text-[12px] border border-gray-200 rounded-md px-3 py-2 bg-white text-gray-700"
            aria-label="Data final"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 h-[88px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Compras no período" value={formatarMetricaValor(resumoCompras.valor)} />
          <MetricCard label="Vendas no período" value={formatarMetricaValor(resumoVendas.valor)} />
          <MetricCard label="Animais comprados" value={formatarMetricaQuantidade(resumoCompras.animais)} />
          <MetricCard label="Animais vendidos" value={formatarMetricaQuantidade(resumoVendas.animais)} />
          <MetricCard
            label="Peso comprado"
            value={formatarMetricaPeso(resumoCompras.peso)}
            hint={hintPeso(resumoCompras.peso)}
          />
          <MetricCard
            label="Peso vendido"
            value={formatarMetricaPeso(resumoVendas.peso)}
            hint={hintPeso(resumoVendas.peso)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Últimas Compras</h2>
          </div>
          {loading ? (
            <p className="p-6 text-center text-[12px] text-gray-400">Carregando...</p>
          ) : resumoCompras.recentes.length === 0 ? (
            <p className="p-6 text-center text-[12px] text-gray-400">Nenhuma compra no período</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resumoCompras.recentes.map(row => (
                  <tr key={row.id} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{formatDateBR(row.data)}</td>
                    <td className="px-3 py-1.5 text-gray-700 font-medium">{row.parceiro}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{formatLinhaQtd(row.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{formatLinhaValor(row.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Últimas Vendas</h2>
          </div>
          {loading ? (
            <p className="p-6 text-center text-[12px] text-gray-400">Carregando...</p>
          ) : resumoVendas.recentes.length === 0 ? (
            <p className="p-6 text-center text-[12px] text-gray-400">Nenhuma venda no período</p>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Comprador</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resumoVendas.recentes.map(row => (
                  <tr key={row.id} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{formatDateBR(row.data)}</td>
                    <td className="px-3 py-1.5 text-gray-700 font-medium">{row.parceiro}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{formatLinhaQtd(row.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{formatLinhaValor(row.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
