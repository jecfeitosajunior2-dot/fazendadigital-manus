import AppLayout from "@/components/AppLayout";
import { useState } from "react";

// ============================================================
// FARMS MODULE
// ============================================================

export function FarmsOverviewPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Farms Overview</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Farm
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="material-icons text-[20px] text-green-600">home_work</span>
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-800">1</div>
              <div className="text-[11px] text-gray-500">Registered farms</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="material-icons text-[20px] text-blue-600">landscape</span>
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-800">450 ha</div>
              <div className="text-[11px] text-gray-500">Total area</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <span className="material-icons text-[20px] text-amber-600">grid_view</span>
            </div>
            <div>
              <div className="text-[18px] font-bold text-gray-800">12</div>
              <div className="text-[11px] text-gray-500">Subdivisions</div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Farm</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">City/State</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Area (ha)</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Subdivisions</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animals</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50 hover:bg-gray-50/50">
              <td className="px-3 py-2 text-[#8BC34A] font-medium cursor-pointer hover:underline">Fazenda Modelo</td>
              <td className="px-3 py-2 text-gray-700">Goiânia/GO</td>
              <td className="px-3 py-2 text-right text-gray-700">450.00</td>
              <td className="px-3 py-2 text-right text-gray-700">12</td>
              <td className="px-3 py-2 text-right text-gray-700">243</td>
              <td className="px-3 py-2 text-center">
                <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                  <span className="material-icons text-[14px]">more_vert</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function FarmsListPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Farms</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Farm
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">City</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">State</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Area (ha)</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50 hover:bg-gray-50/50">
              <td className="px-3 py-2 text-[#8BC34A] font-medium cursor-pointer hover:underline">Fazenda Modelo</td>
              <td className="px-3 py-2 text-gray-700">Goiânia</td>
              <td className="px-3 py-2 text-gray-700">GO</td>
              <td className="px-3 py-2 text-right text-gray-700">450.00</td>
              <td className="px-3 py-2 text-center">
                <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                  <span className="material-icons text-[14px]">more_vert</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function SubdivisionsPage() {
  const subdivisions = [
    { name: "Pasto 1", area: "40.00", type: "Pasture", animals: 32 },
    { name: "Pasto 2", area: "35.00", type: "Pasture", animals: 28 },
    { name: "Pasto 3", area: "50.00", type: "Pasture", animals: 41 },
    { name: "Pasto 4", area: "45.00", type: "Pasture", animals: 35 },
    { name: "Retiro Norte", area: "60.00", type: "Retreat", animals: 22 },
    { name: "Retiro Sul", area: "55.00", type: "Retreat", animals: 18 },
    { name: "Confinamento", area: "10.00", type: "Feedlot", animals: 40 },
    { name: "Maternidade", area: "15.00", type: "Maternity", animals: 12 },
    { name: "Curral", area: "2.00", type: "Corral", animals: 0 },
    { name: "Reserva Legal", area: "80.00", type: "Reserve", animals: 0 },
    { name: "APP", area: "30.00", type: "Reserve", animals: 0 },
    { name: "Sede", area: "28.00", type: "Headquarters", animals: 15 },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Subdivisions</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Subdivision
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Area (ha)</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animals</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {subdivisions.map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.type}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.area}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.animals}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Showing 1-{subdivisions.length} of {subdivisions.length} items
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// HERD MODULE
// ============================================================

export function HerdOverviewPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Herd Overview</h1>
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total animals", value: "243", icon: "pets", color: "green" },
          { label: "Males", value: "108", icon: "male", color: "blue" },
          { label: "Females", value: "135", icon: "female", color: "pink" },
          { label: "Average weight", value: "385 kg", icon: "monitor_weight", color: "amber" },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-${kpi.color}-100 flex items-center justify-center`}>
                <span className={`material-icons text-[20px] text-${kpi.color}-600`}>{kpi.icon}</span>
              </div>
              <div>
                <div className="text-[18px] font-bold text-gray-800">{kpi.value}</div>
                <div className="text-[11px] text-gray-500">{kpi.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Distribution by activity</h2>
          <div className="space-y-2">
            {[
              { label: "Breeding", value: 145, pct: 60 },
              { label: "Fattening", value: 52, pct: 21 },
              { label: "Rearing", value: 46, pct: 19 },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-600 w-20">{item.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${item.pct}%`, backgroundColor: "#8BC34A" }} />
                </div>
                <span className="text-[11px] text-gray-700 font-medium w-8 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded shadow-sm border border-gray-100 p-4">
          <h2 className="text-[13px] font-medium text-gray-800 mb-3">Distribution by breed</h2>
          <div className="space-y-2">
            {[
              { label: "Nelore", value: 200, pct: 82 },
              { label: "Angus", value: 25, pct: 10 },
              { label: "Senepol", value: 18, pct: 8 },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] text-gray-600 w-20">{item.label}</span>
                <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full rounded" style={{ width: `${item.pct}%`, backgroundColor: "#FF9800" }} />
                </div>
                <span className="text-[11px] text-gray-700 font-medium w-8 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export function HerdMapPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Herd Map</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">swap_horiz</span>
          New Movement
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivision</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Males</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Females</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Total</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Pasto 1", m: 12, f: 20, cap: 40 },
              { name: "Pasto 2", m: 10, f: 18, cap: 35 },
              { name: "Pasto 3", m: 15, f: 26, cap: 50 },
              { name: "Retiro Norte", m: 8, f: 14, cap: 30 },
              { name: "Confinamento", m: 25, f: 15, cap: 50 },
              { name: "Maternidade", m: 0, f: 12, cap: 20 },
              { name: "Sede", m: 5, f: 10, cap: 25 },
            ].map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.m}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.f}</td>
                <td className="px-3 py-1.5 text-right font-medium text-gray-800">{s.m + s.f}</td>
                <td className="px-3 py-1.5 text-right text-gray-500">{s.cap}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function LotsPage() {
  const lots = [
    { name: "Lote Vacas", animals: 69, activity: "Breeding", subdivision: "Pasto 1" },
    { name: "Lote Bezerros (as)", animals: 50, activity: "Breeding", subdivision: "Maternidade" },
    { name: "Lote Engorda", animals: 52, activity: "Fattening", subdivision: "Confinamento" },
    { name: "Lote Recria", animals: 46, activity: "Rearing", subdivision: "Pasto 3" },
    { name: "Lote novilhas da estação", animals: 26, activity: "Breeding", subdivision: "Pasto 2" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Lot Management</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Lot
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lot</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Activity</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Subdivision</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animals</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-[#8BC34A] font-medium cursor-pointer hover:underline">{lot.name}</td>
                <td className="px-3 py-1.5 text-gray-700">{lot.activity}</td>
                <td className="px-3 py-1.5 text-gray-500">{lot.subdivision}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{lot.animals}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Showing 1-{lots.length} of {lots.length} items
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MANAGEMENT MODULE
// ============================================================

function ManagementTabs({ active }: { active: string }) {
  const tabs = ["My Managements", "Create Management", "List Managements", "Basic Managements"];
  const paths = ["/manejos/meus", "/manejos/criar", "/manejos/listar", "/manejos/basicos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function MyManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">My Managements</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Handling
        </button>
      </div>
      <ManagementTabs active="My Managements" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">assignment</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No managements assigned to you</p>
      </div>
    </AppLayout>
  );
}

export function CreateManagementPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Create Management</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Cancel
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            Save
          </button>
        </div>
      </div>
      <ManagementTabs active="Create Management" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Management type</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Sanitary</option>
              <option>Reproductive</option>
              <option>Weighing</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Date</label>
            <input type="date" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Lot</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>Select a lot</option>
              <option>Lote Vacas</option>
              <option>Lote Engorda</option>
              <option>Lote Recria</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Responsible</label>
            <input type="text" placeholder="Enter name" className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700" />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] text-gray-600 font-medium mb-1">Observations</label>
          <textarea rows={3} className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none" placeholder="Additional notes..." />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            <span className="material-icons text-[14px]">add</span>
            Add
          </button>
        </div>
      </div>
    </AppLayout>
  );
}

export function ListManagementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">List Managements</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Handling
        </button>
      </div>
      <ManagementTabs active="List Managements" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Lot</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Animals</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Responsible</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">No Data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function BasicManagementsPage() {
  const basics = [
    { name: "Vacinação Aftosa", type: "Sanitary", frequency: "Biannual" },
    { name: "Vermifugação", type: "Sanitary", frequency: "Quarterly" },
    { name: "Pesagem", type: "Weighing", frequency: "Monthly" },
    { name: "IATF", type: "Reproductive", frequency: "Annual" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Basic Managements</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
          Clone
        </button>
      </div>
      <ManagementTabs active="Basic Managements" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Frequency</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {basics.map((b, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{b.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.type}</td>
                <td className="px-3 py-1.5 text-gray-500">{b.frequency}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// SUPPLIES MODULE
// ============================================================

function SuppliesTabs({ active }: { active: string }) {
  const tabs = ["Product List", "Movement", "Monitored", "Below Limit"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <button
          key={i}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function SuppliesEntriesPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Supplies - Entries</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Movement
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Register Product
          </button>
        </div>
      </div>
      <SuppliesTabs active="Movement" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No entry records found</p>
      </div>
    </AppLayout>
  );
}

export function SuppliesExitsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Supplies - Exits</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Movement
        </button>
      </div>
      <SuppliesTabs active="Movement" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inventory_2</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No exit records found</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// MACHINERY MODULE
// ============================================================

export function MachineryFuelingPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Fueling</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Supply
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Filters
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Date</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Machine</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Fuel</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Liters</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Cost</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-gray-400">No Data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function MachineryMaintenancePage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Maintenance</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Maintenance
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">build</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No maintenance records</p>
      </div>
    </AppLayout>
  );
}

export function MachineryListPage() {
  const machines = [
    { name: "Trator John Deere 5075", type: "Tractor", year: "2020", plate: "-" },
    { name: "Caminhonete Hilux", type: "Vehicle", year: "2022", plate: "ABC-1234" },
    { name: "Pulverizador 600L", type: "Implement", year: "2019", plate: "-" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Machines</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          Register Machinery
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Year</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Plate</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{m.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.type}</td>
                <td className="px-3 py-1.5 text-gray-700">{m.year}</td>
                <td className="px-3 py-1.5 text-gray-500">{m.plate}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// REPRODUCTION MODULE
// ============================================================

function ReproductionTabs({ active }: { active: string }) {
  const tabs = ["Biological Stock", "Exposure", "Harvests"];
  const paths = ["/reproducao/protocolos", "/reproducao/semen", "/reproducao/embrioes"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReproductionProtocolsPage() {
  const stock = [
    { name: "Sêmen Nelore PO", type: "Semen", qty: 150, batch: "LOT-2025-001" },
    { name: "Sêmen Angus", type: "Semen", qty: 80, batch: "LOT-2025-002" },
    { name: "Embrião Nelore", type: "Embryo", qty: 25, batch: "EMB-2025-001" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Biological Stock</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Move Stock
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Biological Stock
          </button>
        </div>
      </div>
      <ReproductionTabs active="Biological Stock" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Batch</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{s.name}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.type}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{s.qty}</td>
                <td className="px-3 py-1.5 text-gray-500">{s.batch}</td>
                <td className="px-3 py-1.5 text-center flex items-center justify-center gap-1">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Statement">
                    <span className="material-icons text-[14px]">receipt_long</span>
                  </button>
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Deactivate">
                    <span className="material-icons text-[14px]">block</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function ReproductionSemenPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Exposures</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Register Birth Without Exposure
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Exposure
          </button>
        </div>
      </div>
      <ReproductionTabs active="Exposure" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">favorite</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No exposure records</p>
      </div>
    </AppLayout>
  );
}

export function ReproductionEmbryosPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Harvests</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Harvest
        </button>
      </div>
      <ReproductionTabs active="Harvests" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">eco</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No harvest records</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// NUTRITION MODULE
// ============================================================

function NutritionTabs({ active }: { active: string }) {
  const tabs = ["Nutrition Entry", "Formula", "Batch"];
  const paths = ["/nutricao/dietas", "/nutricao/cochos", "/nutricao/cochos"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function NutritionDietsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Nutrition</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Nutrition
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            New Mix
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            New Formula
          </button>
        </div>
      </div>
      <NutritionTabs active="Nutrition Entry" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">restaurant</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No nutrition entries</p>
      </div>
    </AppLayout>
  );
}

export function NutritionTroughsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Formula</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Add Input
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            New Packaging
          </button>
        </div>
      </div>
      <NutritionTabs active="Formula" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">science</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No formulas registered</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// PURCHASE AND SALE MODULE
// ============================================================

function PurchaseSaleTabs({ active }: { active: string }) {
  const tabs = ["Purchase Bordero", "Animal Entry", "Sales", "Sales Report"];
  const paths = ["/compra-venda/compras", "/compra-venda/compras", "/compra-venda/vendas", "/compra-venda/vendas"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function PurchasesPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Purchase Bordero</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Search Borderos
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            New Bordero
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Purchase Bordero" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">shopping_cart</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No purchase records</p>
      </div>
    </AppLayout>
  );
}

export function SalesPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Sales</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Search Sales
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
            <span className="material-icons text-[14px]">add</span>
            Register New Sale
          </button>
        </div>
      </div>
      <PurchaseSaleTabs active="Sales" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">point_of_sale</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No sale records</p>
      </div>
    </AppLayout>
  );
}

// ============================================================
// FINANCIAL MODULE
// ============================================================

function FinancialTabs({ active }: { active: string }) {
  const tabs = ["Accounts", "Import Statement", "Transactions", "Cost Allocation", "Allocation Listing", "Revenue vs Expenses"];
  const paths = ["/financeiro/contas", "/financeiro/movimentacao", "/financeiro/movimentacao", "/financeiro/categorias", "/financeiro/categorias", "/financeiro/pessoas"];
  return (
    <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function FinancialTransactionsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Transactions</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#4CAF50" }}>
            Launch Revenue
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#F44336" }}>
            Launch Expense
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium uppercase hover:bg-gray-50">
            Launch Transfer
          </button>
        </div>
      </div>
      <FinancialTabs active="Transactions" />
      {/* Month navigation */}
      <div className="flex items-center gap-3 mb-4">
        <button className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_left</span>
        </button>
        <span className="text-[13px] font-medium text-gray-700">May 2026</span>
        <button className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-icons text-[18px]">chevron_right</span>
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">account_balance</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No transactions for this period</p>
      </div>
    </AppLayout>
  );
}

export function FinancialCategoriesPage() {
  const categories = [
    { name: "Alimentação Animal", type: "Expense", icon: "restaurant" },
    { name: "Medicamentos", type: "Expense", icon: "medical_services" },
    { name: "Combustível", type: "Expense", icon: "local_gas_station" },
    { name: "Mão de Obra", type: "Expense", icon: "people" },
    { name: "Venda de Animais", type: "Revenue", icon: "payments" },
    { name: "Venda de Leite", type: "Revenue", icon: "water_drop" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Categories</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Category
        </button>
      </div>
      <FinancialTabs active="Cost Allocation" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Category</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium flex items-center gap-2">
                  <span className="material-icons text-[14px] text-gray-400">{c.icon}</span>
                  {c.name}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${c.type === "Revenue" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {c.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

export function FinancialPeoplePage() {
  const people = [
    { name: "João Silva", type: "Employee", role: "Vaqueiro" },
    { name: "Agropecuária Central", type: "Supplier", role: "Insumos" },
    { name: "Frigorífico São Paulo", type: "Client", role: "Comprador" },
    { name: "Maria Santos", type: "Employee", role: "Administrativa" },
  ];
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">People</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          New Person
        </button>
      </div>
      <FinancialTabs active="Revenue vs Expenses" />
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Role</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5 text-gray-700 font-medium">{p.name}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                    p.type === "Employee" ? "bg-blue-100 text-blue-700" :
                    p.type === "Supplier" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {p.type}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-gray-500">{p.role}</td>
                <td className="px-3 py-1.5 text-center">
                  <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                    <span className="material-icons text-[14px]">more_vert</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// REPORTS MODULE
// ============================================================

function ReportsTabs({ active }: { active: string }) {
  const tabs = ["Managerial", "Evolution", "Reproductive", "Operational"];
  const paths = ["/relatorios/gerenciais", "/relatorios/evolucao", "/relatorios/reprodutivos", "/relatorios/operacionais"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function ReportsManagerialPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Managerial Reports</h1>
      <ReportsTabs active="Managerial" />
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: "Overview", icon: "dashboard", desc: "General farm overview report" },
          { title: "Management Map", icon: "map", desc: "Management activities map" },
          { title: "Unit Animal Cost", icon: "attach_money", desc: "Cost per animal unit" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#8BC34A" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsEvolutionPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Evolution Reports</h1>
      <ReportsTabs active="Evolution" />
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: "Weight Evolution", icon: "trending_up", desc: "Track weight gain over time" },
          { title: "Score Evolution", icon: "star", desc: "Body condition score tracking" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#8BC34A" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsReproductivePage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Reproductive Reports</h1>
      <ReportsTabs active="Reproductive" />
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: "Reproductive Indexes", icon: "analytics", desc: "Conception and pregnancy rates" },
          { title: "Reproductions", icon: "favorite", desc: "Reproduction history" },
          { title: "Reproduction Statistics", icon: "bar_chart", desc: "Statistical analysis" },
          { title: "Exposure List", icon: "list", desc: "All exposures performed" },
          { title: "Biological Stock", icon: "inventory", desc: "Semen and embryo stock" },
          { title: "Andrological Exams", icon: "biotech", desc: "Bull fertility exams" },
        ].map((r, i) => (
          <div key={i} className="bg-white rounded shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-icons text-[24px]" style={{ color: "#8BC34A" }}>{r.icon}</span>
              <h3 className="text-[13px] font-medium text-gray-800">{r.title}</h3>
            </div>
            <p className="text-[11px] text-gray-500">{r.desc}</p>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}

export function ReportsOperationalPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">Operational Reports</h1>
      <ReportsTabs active="Operational" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <h2 className="text-[13px] font-medium text-gray-800 mb-4">Generate Report</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Report columns</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>All columns</option>
              <option>Basic info</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Report filters</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700">
              <option>All animals</option>
              <option>Active only</option>
              <option>By lot</option>
            </select>
          </div>
        </div>
        <button className="flex items-center gap-1 px-4 py-2 rounded text-white text-[12px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[16px]">description</span>
          Generate Report
        </button>
      </div>
    </AppLayout>
  );
}

// ============================================================
// SIMULATIONS MODULE
// ============================================================

function SimulationsTabs({ active }: { active: string }) {
  const tabs = ["My Simulations", "New Simulation"];
  const paths = ["/simulacoes/confinamento", "/simulacoes/semi-confinamento"];
  return (
    <div className="flex border-b border-gray-200 mb-4">
      {tabs.map((tab, i) => (
        <a
          key={i}
          href={paths[i]}
          className={`px-4 py-2 text-[12px] font-medium border-b-2 transition-colors ${
            active === tab ? "border-[#8BC34A] text-[#8BC34A]" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab}
        </a>
      ))}
    </div>
  );
}

export function SimulationsFeedlotPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">My Simulations</h1>
      <SimulationsTabs active="My Simulations" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">calculate</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No simulations created yet</p>
      </div>
    </AppLayout>
  );
}

export function SimulationsSemiFeedlotPage() {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-3">New Simulation</h1>
      <SimulationsTabs active="New Simulation" />
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer text-center">
            <span className="material-icons text-[32px] mb-2" style={{ color: "#8BC34A" }}>calculate</span>
            <h3 className="text-[13px] font-medium text-gray-800">Basic Simulation</h3>
            <p className="text-[10px] text-gray-500 mt-1">Quick feedlot cost estimate</p>
          </div>
          <div className="bg-gray-50 rounded border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer text-center">
            <span className="material-icons text-[32px] mb-2" style={{ color: "#FF9800" }}>analytics</span>
            <h3 className="text-[13px] font-medium text-gray-800">Advanced Simulation</h3>
            <p className="text-[10px] text-gray-500 mt-1">Detailed analysis with variables</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ============================================================
// ADMINISTRATIVE MODULE
// ============================================================

export function AdministrativeOverviewPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Administrative - Overview</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          Register Improvement
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">business</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">No improvements registered</p>
      </div>
    </AppLayout>
  );
}

export function ImprovementsPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Improvements</h1>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase" style={{ backgroundColor: "#8BC34A" }}>
          <span className="material-icons text-[14px]">add</span>
          Register Improvement
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Farm</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Value</th>
              <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                <span className="material-icons text-[14px]">settings</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-50">
              <td colSpan={5} className="px-3 py-8 text-center text-[12px] text-gray-400">No Data</td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppLayout>
  );
}

// ============================================================
// QUICK ACCESS
// ============================================================

export function QuickAccessPage() {
  const actions = [
    { label: "Register Farm", icon: "home_work", path: "/fazendas/lista-fazendas" },
    { label: "Register Herd", icon: "pets", path: "/rebanho/lista-animais" },
    { label: "Import", icon: "upload_file", path: "/rebanho/lista-animais" },
    { label: "Register Supply", icon: "inventory_2", path: "/insumos/estoque" },
    { label: "Register Machinery", icon: "agriculture", path: "/maquinas/lista-maquinas" },
  ];
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">Quick Access</h1>
      <div className="grid grid-cols-5 gap-4">
        {actions.map((a, i) => (
          <a key={i} href={a.path} className="bg-white rounded shadow-sm border border-gray-100 p-6 text-center hover:shadow-md transition-shadow">
            <span className="material-icons text-[32px] mb-2 block" style={{ color: "#8BC34A" }}>{a.icon}</span>
            <span className="text-[12px] font-medium text-gray-700 uppercase">{a.label}</span>
          </a>
        ))}
      </div>
    </AppLayout>
  );
}
