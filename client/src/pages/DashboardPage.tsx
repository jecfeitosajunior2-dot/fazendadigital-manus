import AppLayout from "@/components/AppLayout";
import { herdByAge, monitoredStock } from "@/lib/data";

const kpis = [
  { value: "243", label: "Active animals", sub: "-", barColor: "", icon: "" },
  { value: "0", label: "Births", sub: "Since 01/05/2026", barColor: "#4CAF50", icon: "arrow_upward" },
  { value: "0", label: "Deaths", sub: "Since 01/05/2026", barColor: "#F44336", icon: "arrow_downward" },
  { value: "0", label: "Sales", sub: "Since 01/05/2026", barColor: "", icon: "" },
  { value: "0.02", label: "Stocking rate (AU)", sub: "-", barColor: "", icon: "" },
];

export default function DashboardPage() {
  return (
    <AppLayout>
      {/* Page title */}
      <h1 className="text-[20px] font-medium text-gray-800 mb-5">Office overview</h1>

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
        {/* Herd by age */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Herd by age</h2>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Age</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Male</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Female</th>
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

        {/* Upcoming activities */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Upcoming activities</h2>
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lots</th>
                </tr>
              </thead>
            </table>
            <div className="p-8 text-center">
              <span className="material-icons text-3xl text-gray-200">event_busy</span>
              <p className="text-[12px] text-gray-400 mt-2">No Data</p>
            </div>
          </div>
        </div>

        {/* Monitored stock */}
        <div className="bg-white rounded shadow-sm border border-gray-100">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-[13px] font-medium text-gray-800">Monitored stock</h2>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Product</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Qty</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Stock</th>
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
            Product above minimum stock
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
