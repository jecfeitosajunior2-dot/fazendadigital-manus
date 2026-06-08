import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { FazendaSubdivisoesPanel } from "@/components/FazendaSubdivisoesPanel";
import FarmPastosSheet from "@/components/FarmPastosSheet";

const FD_PRIMARY = "#4ECDC4";

export default function SubdivisoesPage() {
  const [selectedFazenda, setSelectedFazenda] = useState<{ id: number; nome: string; responsavel?: string | null } | null>(null);
  const [pastosOpen, setPastosOpen] = useState(false);
  const [pastosSheetFazenda, setPastosSheetFazenda] = useState<any>(null);

  const { data: fazendaList = [], isLoading } = trpc.fazendas.list.useQuery();
  const { data: allPastos = [] } = trpc.pastos.list.useQuery();

  const pastosPorFazenda: Record<number, number> = {};
  allPastos.forEach((p) => {
    pastosPorFazenda[p.fazendaId] = (pastosPorFazenda[p.fazendaId] ?? 0) + 1;
  });

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-[15px] font-semibold text-gray-800">Subdivisões</h1>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Gerencie os pastos e subdivisões de cada fazenda
          </p>
        </div>
      </div>

      {/* Lista de fazendas */}
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-[13px] font-semibold text-gray-800">Fazendas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Fazenda
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Responsável
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Subdivisões
                </th>
                <th className="px-4 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-32">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!isLoading && fazendaList.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-[12px]">
                    Nenhuma fazenda cadastrada
                  </td>
                </tr>
              )}
              {fazendaList.map((f) => {
                const isSelected = selectedFazenda?.id === f.id;
                return (
                  <tr
                    key={f.id}
                    className={`border-t border-gray-50 cursor-pointer transition-colors ${
                      isSelected ? "bg-teal-50/60" : "hover:bg-gray-50/60"
                    }`}
                    onClick={() => setSelectedFazenda(isSelected ? null : f)}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span
                            className="w-1.5 h-4 rounded-full inline-block"
                            style={{ backgroundColor: FD_PRIMARY }}
                          />
                        )}
                        {f.nome}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{f.responsavel || "-"}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: FD_PRIMARY }}
                      >
                        {pastosPorFazenda[f.id] ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPastosSheetFazenda(f);
                          setPastosOpen(true);
                        }}
                        className="px-2 py-1 rounded border border-gray-200 text-[10px] text-gray-600 hover:bg-gray-100"
                        title="Ver pastos em painel lateral"
                      >
                        <span className="material-icons text-[13px] align-middle mr-0.5">grass</span>
                        Pastos
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Painel de subdivisões da fazenda selecionada */}
      <FazendaSubdivisoesPanel fazenda={selectedFazenda} />

      {/* Sheet lateral de pastos com detalhes */}
      <FarmPastosSheet
        fazenda={pastosSheetFazenda}
        open={pastosOpen}
        onClose={() => { setPastosOpen(false); setPastosSheetFazenda(null); }}
      />
    </div>
  );
}
