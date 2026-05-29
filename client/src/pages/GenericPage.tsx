import { useState, useMemo } from 'react';
import AppLayout from "@/components/AppLayout";
import { animalsList, stockItems, financialAccounts } from "@/lib/data";
import { useLocation } from 'wouter';
import { toast } from 'sonner';

// --- Animals Page (exact iRancho replica with functional search) ---
export function AnimaisPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [farmFilter, setFarmFilter] = useState("");
  const [subdivisionFilter, setSubdivisionFilter] = useState("");
  const [breedFilter, setBreedFilter] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  // Get unique values for dropdowns
  const farms = ["Fazenda iRancho", "Fazenda Alma Viva", "Fazenda Rancho 2"];
  const subdivisions = ["Lote Vacas", "Lote Bezerros (as)", "Lote Engorda", "Lote Recria", "Lote novilhas da estação"];
  const breeds = ["Nelore", "Nelore Mocho", "Senepol"];

  const filtered = useMemo(() => {
    let result = animalsList;

    // Apply subdivision filter
    if (subdivisionFilter && subdivisionFilter !== "Subdivisão") {
      result = result.filter(a => a.lot === subdivisionFilter);
    }

    // Apply breed filter
    if (breedFilter && breedFilter !== "Raça") {
      result = result.filter(a => a.breed === breedFilter);
    }

    // Apply search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.animalId.includes(q) ||
        a.electronicId.includes(q) ||
        a.breed.toLowerCase().includes(q) ||
        a.lot.toLowerCase().includes(q) ||
        a.sex.toLowerCase().includes(q)
      );
    }

    return result;
  }, [search, subdivisionFilter, breedFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <AppLayout>
      {/* Header with title and action buttons */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Lista de animais</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => {
              // Create CSV data
              const headers = ["Nº Animal", "ID Eletrônico", "ID Manejo", "Data Nasc.", "Castrado", "Sexo", "Raça", "Lote", "Atividade"];
              const rows = filtered.map(a => [
                a.animalId,
                a.electronicId,
                a.managementId || "-",
                a.birthDate,
                a.castrated,
                a.sex,
                a.breed,
                a.lot,
                a.activity
              ]);
              
              // Create CSV string
              const csv = [
                headers.join(","),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
              ].join("\n");
              
              // Download
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const link = document.createElement("a");
              const url = URL.createObjectURL(blob);
              link.setAttribute("href", url);
              link.setAttribute("download", `animais_${new Date().toISOString().split('T')[0]}.csv`);
              link.click();
              toast.success("Lista exportada com sucesso!");
            }}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 text-[11px] cursor-pointer" 
            title="Planilha"
          >
            <span className="material-icons text-[16px]">grid_on</span>
            <span className="hidden md:inline">Planilha</span>
          </button>
          <button className="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-gray-500 hover:bg-gray-100 text-[11px]" title="PDF">
            <span className="material-icons text-[16px]">picture_as_pdf</span>
            <span className="hidden md:inline">PDF</span>
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            <span className="hidden sm:inline">Importar Animais</span>
            <span className="sm:hidden">Importar</span>
          </button>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 text-[11px] text-gray-600 font-medium hover:bg-gray-50 uppercase">
            SISBOV
          </button>
          <button
            onClick={() => setLocation('/rebanho/novo-animal')}
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase hover:opacity-90 cursor-pointer"
            style={{ backgroundColor: "#94B40B" }}
          >
            <span className="material-icons text-[14px]">add</span>
            Novo Animal
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded shadow-sm border border-gray-100 mb-3 px-3 py-2 flex items-center gap-2 flex-wrap">
        <select 
          value={farmFilter}
          onChange={e => { setFarmFilter(e.target.value); setPage(1); }}
          className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[100px]"
        >
          <option value="">Fazenda</option>
          {farms.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select 
          value={subdivisionFilter}
          onChange={e => { setSubdivisionFilter(e.target.value); setPage(1); }}
          className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[100px] hidden sm:block"
        >
          <option value="">Subdivisão</option>
          {subdivisions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select 
          value={breedFilter}
          onChange={e => { setBreedFilter(e.target.value); setPage(1); }}
          className="text-[11px] border border-gray-200 rounded px-2 py-1.5 text-gray-600 min-w-[80px] hidden sm:block"
        >
          <option value="">Raça</option>
          {breeds.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <div className="flex-1 relative min-w-[120px]">
          <span className="material-icons text-[14px] text-gray-400 absolute left-2 top-1/2 -translate-y-1/2">search</span>
          <input
            type="text"
            placeholder="Pesquisar..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#94B40B]"
          />
        </div>
        {(farmFilter || subdivisionFilter || breedFilter || search) && (
          <button 
            onClick={() => { setFarmFilter(""); setSubdivisionFilter(""); setBreedFilter(""); setSearch(""); setPage(1); }}
            className="text-[11px] text-gray-500 hover:text-gray-700 underline"
          >
            Limpar Filtros
          </button>
        )}
        <button className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-gray-50 uppercase font-medium hidden sm:flex">
          Mais Filtros
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Nº Animal</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">ID Eletrônico</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">ID Manejo</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Data Nasc.</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Castrado</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Sexo</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Raça</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Lote</th>
                <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 uppercase tracking-wide">Atividade</th>
                <th className="px-2 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((animal, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setLocation(`/rebanho/detalhes-animal?id=${animal.animalId}`)}>
                  <td className="px-2 py-2 font-medium cursor-pointer hover:underline" style={{ color: "#94B40B" }}>{animal.animalId}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.electronicId}</td>
                  <td className="px-2 py-2 text-gray-500">{animal.managementId || "-"}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.birthDate}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.castrated}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.sex}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.breed}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.lot}</td>
                  <td className="px-2 py-2 text-gray-700">{animal.activity}</td>
                  <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation(`/rebanho/editar-animal?id=${animal.animalId}`);
                        }}
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-400" 
                        title="Editar"
                      >
                        <span className="material-icons text-[14px]">edit</span>
                      </button>
                      <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400" title="Excluir">
                        <span className="material-icons text-[14px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-[12px]">
                    <span className="material-icons text-3xl text-gray-200 block mb-2">search_off</span>
                    Nenhum animal encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Mostrando {paginated.length > 0 ? (page - 1) * perPage + 1 : 0}-{Math.min(page * perPage, filtered.length)} de {filtered.length} animais</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
            >
              <span className="material-icons text-[14px]">chevron_left</span>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium ${p === page ? "text-white" : "text-gray-500 hover:bg-gray-100"}`}
                style={p === page ? { backgroundColor: "#94B40B" } : {}}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-400 disabled:opacity-30"
            >
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
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return stockItems;
    const q = search.toLowerCase();
    return stockItems.filter(s => s.product.toLowerCase().includes(q));
  }, [search]);

  return (
    <AppLayout>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Estoque</h1>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: "#94B40B" }}
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
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-[11px] focus:outline-none focus:border-[#94B40B]"
          />
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[500px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Produto</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Unidade</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Quantidade</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Estoque Mín.</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-700">{item.product}</td>
                  <td className="px-3 py-2 text-gray-500">{item.unit}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.qty}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{item.minStock}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-green-100 text-green-700">
                      <span className="material-icons text-[10px] mr-0.5">check_circle</span>OK
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><span className="material-icons text-[14px]">edit</span></button>
                      <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><span className="material-icons text-[14px]">delete</span></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
          Exibindo 1-{filtered.length} de {filtered.length} itens
        </div>
      </div>
    </AppLayout>
  );
}

// --- Financial Accounts Page ---
export function ContasPage() {
  return (
    <AppLayout>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-[15px] font-medium text-gray-800">Contas</h1>
        <button
          className="flex items-center gap-1 px-3 py-1.5 rounded text-white text-[11px] font-medium uppercase w-fit"
          style={{ backgroundColor: "#94B40B" }}
        >
          <span className="material-icons text-[14px]">add</span>
          Nova Conta
        </button>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[400px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Nome</th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase w-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {financialAccounts.map((acc, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-3 py-2 text-gray-700 font-medium">{acc.name}</td>
                  <td className="px-3 py-2 text-gray-500">{acc.type}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{acc.balance}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><span className="material-icons text-[14px]">edit</span></button>
                      <button className="p-0.5 rounded hover:bg-gray-100 text-gray-400"><span className="material-icons text-[14px]">delete</span></button>
                    </div>
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
          style={{ backgroundColor: "#94B40B" }}
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
