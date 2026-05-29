import AppLayout from "@/components/AppLayout";
import { animalsList, stockItems, financialAccounts } from "@/lib/data";

// --- Animals Page (exact iRancho replica) ---
export function AnimaisPage() {
  return (
    <AppLayout>
      {/* Header with title and action buttons */}
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de animais</h1>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            Importar Animais
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            SISBOV
          </button>
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            Novo Animal
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50" title="Exportar para planilha">
            <span className="material-icons text-[16px]">grid_on</span>
          </button>
          <button className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50" title="Exportar para PDF">
            <span className="material-icons text-[16px]">picture_as_pdf</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded shadow-sm border border-gray-100 mb-3 px-3 py-2 flex items-center gap-2 flex-wrap">
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[120px]">
          <option>Fazenda</option>
          <option>Fazenda Modelo</option>
        </select>
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[120px]">
          <option>Subdivisão</option>
        </select>
        <select className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[100px]">
          <option>Raça</option>
          <option>Nelore</option>
        </select>
        <div className="flex-1 relative min-w-[150px]">
          <span className="material-icons text-[14px] text-gray-400 absolute left-2 top-1/2 -translate-y-1/2">search</span>
          <input
            type="text"
            placeholder="Pesquisar..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#8BC34A]"
          />
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-gray-50 uppercase font-medium">
          Mais Filtros
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
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Nº Animal</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">ID Eletrônico</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">ID Manejo</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Data Nasc.</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Castrado</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Sexo</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Raça</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Lote</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Atividade</th>
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
              <option>50 itens por página</option>
              <option>20 itens por página</option>
              <option>100 itens por página</option>
            </select>
            <span>Exibindo 1-50 de 50 itens</span>
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
        <h1 className="text-[15px] font-medium text-gray-800">Estoque</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            Nova Entrada
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
            placeholder="Pesquisar..."
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#8BC34A]"
          />
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Produto</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Unidade</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantidade</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Estoque Mín.</th>
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
          <span>Exibindo 1-{stockItems.length} de {stockItems.length} itens</span>
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
        <h1 className="text-[15px] font-medium text-gray-800">Contas</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#8BC34A" }}
          >
            <span className="material-icons text-[14px]">add</span>
            Nova Conta
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Saldo</th>
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
          Novo
        </button>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">inbox</span>
        <p className="text-[12px] text-gray-400">Sem Dados</p>
        <p className="text-[11px] text-gray-300 mt-1">{subtitle}</p>
      </div>
    </AppLayout>
  );
}
