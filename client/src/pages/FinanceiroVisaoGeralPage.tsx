import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import {
  FINANCEIRO_MENU_OFICIAL,
  MSG_VISAO_GERAL_FINANCEIRO_NEUTRA,
} from "@/lib/financeiroNavegacao";

export function FinanceiroVisaoGeralPage() {
  const [, setLocation] = useLocation();
  const atalhos = FINANCEIRO_MENU_OFICIAL.filter((item) => item.label !== "Visão Geral");

  return (
    <AppLayout>
      <div className="max-w-3xl">
        <h1 className="text-[15px] font-medium text-gray-800 mb-2">Financeiro</h1>
        <p className="text-[13px] text-gray-600 mb-6">{MSG_VISAO_GERAL_FINANCEIRO_NEUTRA}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {atalhos.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setLocation(item.path)}
              className="text-left bg-white rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
            >
              <p className="text-[13px] font-medium text-gray-800">{item.label}</p>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
