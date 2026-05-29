import AppLayout from "@/components/AppLayout";
import { animalsList, stockItems, financialAccounts } from "@/lib/data";

// --- Animals Page (exact iRancho replica) ---
export function AnimaisPage() {
  return (
    <AppLayout>
      {/* Header with title and action buttons */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Animal list</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            Import Animals
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            SISBOV
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            New Animal
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50" title="Export to spreadsheet">
            <span className="material-icons text-[16px]">grid_on</span>
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50" title="Export to PDF">
            <span className="material-icons text-[16px]">picture_as_pdf</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded shadow-sm border border-gray-100 mb-3 px-3 py-2 flex items-center gap-2 flex-wrap">
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[120px]">
          <option>Farm</option>
          <option>Fazenda Modelo</option>
        </select>
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[120px]">
          <option>Subdivision</option>
        </select>
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[100px]">
          <option>Breed</option>
          <option>Nelore</option>
        </select>
        <div className="flex-1 relative min-w-[150px]">
          <span className="material-icons text-[14px] text-gray-400 absolute left-2 top-1/2 -translate-y-1/2">search</span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#8BC34A]"
          />
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-gray-50 uppercase font-medium">
          More Filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input type="checkbox" className="rounded border-gray-300" />
                </th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Animal ID</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Electronic ID</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Mgmt ID</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Birth Date</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Castrated</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Sex</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Breed</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Lot</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Activity</th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                  <span className="material-icons text-[14px]">settings</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {animalsList.map((animal, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-2 py-1.5">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </td>
                  <td className="px-2 py-1.5 text-[#8BC34A] font-medium cursor-pointer hover:underline">{animal.animalId}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.electronicId}</td>
                  <td className="px-2 py-1.5 text-gray-500">{animal.managementId || "-"}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.birthDate}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.castrated}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.sex}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.breed}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.lot}</td>
                  <td className="px-2 py-1.5 text-gray-700">{animal.activity}</td>
                  <td className="px-2 py-1.5 text-center">
                    <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
                      <span className="material-icons text-[14px]">more_vert</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-2">
            <select className="text-[11px] border border-gray-200 rounded px-1.5 py-1 text-gray-600">
              <option>50 items per page</option>
              <option>20 items per page</option>
              <option>100 items per page</option>
            </select>
            <span>Showing 1-50 of 50 items</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400">
              <span className="material-icons text-[14px]">chevron_left</span>
            </button>
            <span className="px-2 py-0.5 rounded text-white text-[10px] font-medium" style={{ backgroundColor: "#8BC34A" }}>1</span>
            <button className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400">
              <span className="material-icons text-[14px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// --- Stock Page ---
export function EstoquePage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Stock</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            New Entry
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
            <span className="material-icons text-[16px]">grid_on</span>
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">
            <span className="material-icons text-[16px]">picture_as_pdf</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 mb-3 px-3 py-2 flex items-center gap-2">
        <div className="flex-1 relative">
          <span className="material-icons text-[14px] text-gray-400 absolute left-2 top-1/2 -translate-y-1/2">search</span>
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#8BC34A]"
          />
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Product</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Unit</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Min. Stock</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                  <span className="material-icons text-[14px]">settings</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700">{item.product}</td>
                  <td className="px-3 py-1.5 text-gray-500">{item.unit}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{item.qty}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{item.minStock}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-100 text-green-700">OK</span>
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
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Showing 1-{stockItems.length} of {stockItems.length} items</span>
          <div className="flex items-center gap-0.5">
            <span className="px-2 py-0.5 rounded text-white text-[10px] font-medium" style={{ backgroundColor: "#8BC34A" }}>1</span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// --- Financial Accounts Page ---
export function ContasPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Accounts</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            New Account
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Type</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Balance</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">
                  <span className="material-icons text-[14px]">settings</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {financialAccounts.map((acc, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-gray-700 font-medium">{acc.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{acc.type}</td>
                  <td className="px-3 py-1.5 text-right text-gray-700">{acc.balance}</td>
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
      </div>
    </AppLayout>
  );
}

// --- Generic Placeholder Page ---
export function PlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">{title}</h1>
        <button
          className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
          style={{ backgroundColor: "#8BC34A" }}
        >
          <span className="material-icons text-[14px]">add</span>
          New
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inbox</span>
        <p className="text-[12px] text-gray-400">No Data</p>
        <p className="text-[11px] text-gray-300 mt-1">{subtitle}</p>
      </div>
    </AppLayout>
  );
}
