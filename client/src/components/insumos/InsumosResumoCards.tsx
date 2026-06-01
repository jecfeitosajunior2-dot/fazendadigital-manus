import { useLocation } from "wouter";

/** Cards Monitorado / Abaixo do Limite — layout iRancho. */
export default function InsumosResumoCards() {
  const [, setLocation] = useLocation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 mb-4 border border-gray-200 rounded overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setLocation("/insumos/lista-produtos?filtro=monitorado")}
        className="flex items-center justify-between px-6 py-5 text-left border-b sm:border-b-0 sm:border-r border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <span className="text-[14px] font-medium text-gray-800">Monitorado</span>
        <span className="material-icons text-[22px] text-gray-500">chevron_right</span>
      </button>
      <button
        type="button"
        onClick={() => setLocation("/insumos/lista-produtos?filtro=abaixo")}
        className="flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-[14px] font-medium text-gray-800">Abaixo do Limite</span>
        <span className="material-icons text-[22px] text-gray-500">chevron_right</span>
      </button>
    </div>
  );
}
