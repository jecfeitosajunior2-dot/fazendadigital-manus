import AppLayout from "@/components/AppLayout";
import { trpc } from '@/lib/trpc';

export default function DashboardPage() {
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { data: financeiro } = trpc.financeiro.summary.useQuery();
  const { data: saude } = trpc.saude.list.useQuery();
  const { data: movimentacoes } = trpc.financeiro.listMovimentacoes.useQuery();

  const kpis = [
    { value: isLoading ? "..." : String(stats?.totalAnimais ?? 0), label: "Animais ativos", sub: "Total no rebanho", color: "", icon: "" },
    { value: isLoading ? "..." : String(stats?.totalLotes ?? 0), label: "Lotes ativos", sub: "Cadastrados", color: "#4CAF50", icon: "" },
    { value: isLoading ? "..." : String(stats?.totalMaquinas ?? 0), label: "Máquinas", sub: "Cadastradas", color: "", icon: "" },
    { value: isLoading ? "..." : String(stats?.totalBenfeitorias ?? 0), label: "Benfeitorias", sub: "Cadastrados", color: "", icon: "" },
    { value: isLoading ? "..." : `R$ ${Number(financeiro?.saldoTotal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`, label: "Saldo total", sub: "Contas ativas", color: "", icon: "" },
  ];

  const recentAnimais: any[] = [];
  const ultimasSaude = (saude || []).slice(0, 5);
  const ultimasMovimentacoes = (movimentacoes || []).slice(0, 5);

  return (
    <AppLayout>
      <h1 className="text-[18px] sm:text-[20px] font-medium text-gray-800 mb-4 sm:mb-5">Visão geral do escritório</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-5 sm:mb-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden flex">
            {kpi.color && <div className="w-[4px] flex-shrink-0" style={{ backgroundColor: kpi.color }} />}
            <div className="p-3 sm:p-4 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[18px] sm:text-[22px] font-bold text-gray-800 leading-tight">{kpi.value}</span>
              </div>
              <div className="text-[11px] sm:text-[12px] text-gray-600 mt-1">{kpi.label}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      {financeiro && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Total Receitas</p>
            <p className="text-[18px] font-bold text-green-600">R$ {Number(financeiro.totalReceitas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Total Despesas</p>
            <p className="text-[18px] font-bold text-red-600">R$ {Number(financeiro.totalDespesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <p className="text-[11px] text-gray-500 mb-1">Saldo</p>
            <p className={`text-[18px] font-bold ${Number(financeiro.saldoTotal || 0) >= 0 ? 'text-[#2D5A5A]' : 'text-red-600'}`}>R$ {Number(financeiro.saldoTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      )}

      {/* 3-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Animais recentes */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Animais recentes</h2>
          </div>
          {recentAnimais.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-gray-200">pets</span>
              <p className="text-[12px] text-gray-400 mt-2">Sem animais cadastrados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentAnimais.map((a: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-gray-700">{a.nome || a.brinco || `Animal #${a.id}`}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{a.categoria || a.raca || a.sexo}</p>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] capitalize ${a.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas movimentações */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Últimas movimentações</h2>
          </div>
          {ultimasMovimentacoes.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-gray-200">account_balance_wallet</span>
              <p className="text-[12px] text-gray-400 mt-2">Sem movimentações</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ultimasMovimentacoes.map((m: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-medium text-gray-700">{m.descricao}</p>
                    <p className="text-[10px] text-gray-400">{m.data ? new Date(m.data).toLocaleDateString('pt-BR') : "-"}</p>
                  </div>
                  <span className={`text-[12px] font-bold ${m.tipo === 'receita' ? 'text-green-600' : 'text-red-600'}`}>
                    {m.tipo === 'receita' ? '+' : '-'} R$ {Number(m.valor || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Saúde recente */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Saúde recente</h2>
          </div>
          {ultimasSaude.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-gray-200">health_and_safety</span>
              <p className="text-[12px] text-gray-400 mt-2">Sem registros</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ultimasSaude.map((s: any, i: number) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-medium text-gray-700">Animal #{s.animalId}</span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] capitalize">{s.tipo}</span>
                  </div>
                  <p className="text-[10px] text-gray-400">{s.dataRegistro ? new Date(s.dataRegistro).toLocaleDateString('pt-BR') : "-"} {s.medicamento ? `• ${s.medicamento}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
