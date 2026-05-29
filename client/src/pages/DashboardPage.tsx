import AppLayout from "@/components/AppLayout";
import { herdByAge, monitoredStock } from "@/lib/data";

const kpis = [
  { value: "243", label: "Animais ativos", sub: "-", color: "", icon: "" },
  { value: "0", label: "Nascimentos", sub: "Desde 01/05/2026", color: "#4CAF50", icon: "arrow_upward" },
  { value: "0", label: "Mortes", sub: "Desde 01/05/2026", color: "#F44336", icon: "arrow_downward" },
  { value: "0", label: "Vendas", sub: "Desde 01/05/2026", color: "", icon: "" },
  { value: "0.02", label: "Taxa de lotação (UA)", sub: "-", color: "", icon: "" },
];

function BarChart() {
  const maxVal = Math.max(...herdByAge.map(r => Math.max(r.male, r.female)));
  return (
    <div className="px-4 py-3">
      <div className="flex items-end gap-2 justify-center h-[120px] sm:h-[140px]">
        {herdByAge.map((row, i) => (
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
    </AppLayout>
  );
}
