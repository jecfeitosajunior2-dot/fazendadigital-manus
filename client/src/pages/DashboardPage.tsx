import AppLayout from "@/components/AppLayout";
import { herdByAge, monitoredStock } from "@/lib/data";

const kpis = [
  { value: "243", label: "Animais ativos", sub: "-", barColor: "", icon: "" },
  { value: "0", label: "Nascimentos", sub: "Desde 01/05/2026", barColor: "#4CAF50", icon: "arrow_upward" },
  { value: "0", label: "Mortes", sub: "Desde 01/05/2026", barColor: "#F44336", icon: "arrow_downward" },
  { value: "0", label: "Vendas", sub: "Desde 01/05/2026", barColor: "", icon: "" },
  { value: "0.02", label: "Taxa de lotação (UA)", sub: "-", barColor: "", icon: "" },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      {/* Page title */}
      <h1 className="text-[20px] font-medium text-gray-800 mb-5">Visão geral do escritório</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden flex">
            {kpi.barColor && (
              <div className="w-[4px] flex-shrink-0" style={{ backgroundColor: kpi.barColor }} />
            )}
            <div className="p-4 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[26px] font-bold text-gray-800 leading-tight">{kpi.value}</span>
                {kpi.icon && (
                  <span className={`material-icons text-[16px] ${kpi.barColor === "#4CAF50" ? "text-green-600" : "text-red-600"}`}>
                    {kpi.icon}
                  </span>
                )}
              </div>
              <div className="text-[12px] text-gray-600 mt-1">{kpi.label}</div>
              <div className="text-[10px] text-gray-400 mt-0.5">{kpi.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 3-column section */}
      <div className="grid grid-cols-3 gap-4">
        {/* Rebanho por idade */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Rebanho por idade</h2>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Idade</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Macho</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Fêmea</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {herdByAge.map((row, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 text-gray-700">{row.age}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{row.male}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{row.female}</td>
                  <td className="px-3 py-1.5 text-right font-medium text-gray-800">{row.male + row.female}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-medium border-t border-gray-200">
                <td className="px-3 py-1.5 text-gray-700">Total</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{herdByAge.reduce((s, r) => s + r.male, 0)}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{herdByAge.reduce((s, r) => s + r.female, 0)}</td>
                <td className="px-3 py-1.5 text-right text-gray-800">{herdByAge.reduce((s, r) => s + r.male + r.female, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Próximas atividades */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Próximas atividades</h2>
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lotes</th>
                </tr>
              </thead>
            </table>
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-gray-200">event_busy</span>
              <p className="text-[12px] text-gray-400 mt-2">Sem Dados</p>
            </div>
          </div>
        </div>

        {/* Estoque monitorado */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Estoque monitorado</h2>
          </div>
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
          <div className="px-3 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-center gap-1">
            <span className="material-icons text-[12px] text-green-500">check_circle</span>
            Produto acima do estoque mínimo
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
