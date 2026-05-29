import AppLayout from "@/components/AppLayout";
import { herdByAge, monitoredStock } from "@/lib/data";
import { useCattle } from "@/contexts/CattleContext";

function BarChart() {
  const { cattle } = useCattle();
  
  // Calculate age groups from imported cattle
  const ageGroups = [
    { age: '0-8', male: 0, female: 0 },
    { age: '9-12', male: 0, female: 0 },
    { age: '13-24', male: 0, female: 0 },
    { age: '25-36', male: 0, female: 0 },
    { age: '36+', male: 0, female: 0 },
  ];

  // If we have imported cattle, calculate from them
  if (cattle.length > 0) {
    cattle.forEach(c => {
      const birthDate = new Date(c.birthDate.split('/').reverse().join('-'));
      const today = new Date();
      const ageInMonths = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                          (today.getMonth() - birthDate.getMonth());
      
      const isMale = c.sex === 'Macho';
      
      if (ageInMonths <= 8) {
        isMale ? ageGroups[0].male++ : ageGroups[0].female++;
      } else if (ageInMonths <= 12) {
        isMale ? ageGroups[1].male++ : ageGroups[1].female++;
      } else if (ageInMonths <= 24) {
        isMale ? ageGroups[2].male++ : ageGroups[2].female++;
      } else if (ageInMonths <= 36) {
        isMale ? ageGroups[3].male++ : ageGroups[3].female++;
      } else {
        isMale ? ageGroups[4].male++ : ageGroups[4].female++;
      }
    });
  } else {
    // Use default data if no cattle imported
    ageGroups[0] = { age: '0-8', male: 25, female: 25 };
    ageGroups[1] = { age: '9-12', male: 14, female: 15 };
    ageGroups[4] = { age: '36+', male: 69, female: 95 };
  }

  const maxVal = Math.max(...ageGroups.map(r => Math.max(r.male, r.female)));
  
  return (
    <div className="px-4 py-3">
      <div className="flex items-end gap-2 justify-center h-[120px] sm:h-[140px]">
        {ageGroups.map((row, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className="flex items-end gap-[2px] h-[100px] sm:h-[120px]">
              <div
                className="w-3 sm:w-4 rounded-t"
                style={{
                  height: `${maxVal > 0 ? (row.male / maxVal) * 100 : 0}%`,
                  backgroundColor: "#42A5F5",
                  minHeight: row.male > 0 ? "4px" : "0",
                }}
              />
              <div
                className="w-3 sm:w-4 rounded-t"
                style={{
                  height: `${maxVal > 0 ? (row.female / maxVal) * 100 : 0}%`,
                  backgroundColor: "#EC407A",
                  minHeight: row.female > 0 ? "4px" : "0",
                }}
              />
            </div>
            <span className="text-[9px] sm:text-[10px] text-gray-500 text-center">{row.age}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "#42A5F5" }} />
          <span>Macho</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: "#EC407A" }} />
          <span>Fêmea</span>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { cattle, getCattleStats } = useCattle();
  const stats = getCattleStats();

  // Use imported cattle stats if available, otherwise use defaults
  const kpis = [
    { value: cattle.length > 0 ? String(stats.total) : "243", label: "Animais ativos", sub: "-", color: "", icon: "" },
    { value: "0", label: "Nascimentos", sub: "Desde 01/05/2026", color: "#4CAF50", icon: "arrow_upward" },
    { value: "0", label: "Mortes", sub: "Desde 01/05/2026", color: "#F44336", icon: "arrow_downward" },
    { value: cattle.length > 0 ? String(stats.sold) : "0", label: "Vendas", sub: "Desde 01/05/2026", color: "", icon: "" },
    { value: "0.02", label: "Taxa de lotação (UA)", sub: "-", color: "", icon: "" },
  ];

  return (
    <AppLayout>
      {/* Page title */}
      <h1 className="text-[18px] sm:text-[20px] font-medium text-gray-800 mb-4 sm:mb-5">Visão geral do escritório</h1>

      {/* KPI Cards - responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-5 sm:mb-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden flex">
            {kpi.color && (
              <div className="w-[4px] flex-shrink-0" style={{ backgroundColor: kpi.color }} />
            )}
            <div className="p-3 sm:p-4 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[22px] sm:text-[26px] font-bold text-gray-800 leading-tight">{kpi.value}</span>
                {kpi.icon && (
                  <span className={`material-icons text-[14px] sm:text-[16px] ${kpi.color === "#4CAF50" ? "text-green-600" : "text-red-600"}`}>
                    {kpi.icon}
                  </span>
                )}
              </div>
              <div className="text-[11px] sm:text-[12px] text-gray-600 mt-1">{kpi.label}</div>
              <div className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5">{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 3-column section - responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rebanho por idade */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Rebanho por idade</h2>
          </div>
          {/* Bar chart */}
          <BarChart />
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Idade</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Macho</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Fêmea</th>
                </tr>
              </thead>
              <tbody>
                {herdByAge.map((row, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{row.age}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{row.male}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{row.female}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Próximas atividades */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Próximas atividades</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lotes</th>
                </tr>
              </thead>
            </table>
          </div>
          <div className="p-8 text-center">
            <span className="material-icons text-3xl text-gray-200">event_busy</span>
            <p className="text-[12px] text-gray-400 mt-2">Sem Dados</p>
          </div>
        </div>

        {/* Estoque monitorado */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Estoque monitorado</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Produto</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Unidade</th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {monitoredStock.map((item, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="px-3 py-1.5 text-gray-700">{item.product}</td>
                    <td className="px-3 py-1.5 text-gray-500">{item.unit}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{item.qty}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className="material-icons text-[14px] text-green-500">check_circle</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-center gap-1">
            <span className="material-icons text-[12px] text-green-500">check_circle</span>
            Produto acima do estoque mínimo
          </div>
        </div>
      </div>

      {/* Resumo de Sanitário, Vendas e Financeiro se houver dados importados */}
      {cattle.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Resumo Sanitário</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Vacinados:</span>
                <span className="font-bold text-green-600">{stats.vaccinated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Não Vacinados:</span>
                <span className="font-bold text-orange-600">{stats.notVaccinated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Pendentes:</span>
                <span className="font-bold text-yellow-600">{stats.pending}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Resumo de Vendas</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Vendidos:</span>
                <span className="font-bold text-purple-600">{stats.sold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Ativos:</span>
                <span className="font-bold text-blue-600">{stats.active}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Descartados:</span>
                <span className="font-bold text-red-600">{stats.discarded}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Resumo Financeiro</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Receita Total:</span>
                <span className="font-bold text-green-600">R$ {stats.totalRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Preço Médio:</span>
                <span className="font-bold text-green-600">R$ {stats.averagePrice.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
