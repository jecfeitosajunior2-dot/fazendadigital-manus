import { useLocation } from "wouter";

/**
 * Tela antiga, fora do menu e fora das rotas.
 * Criar e apagar ficam bloqueados no servidor. Esta página não oferece esses botões.
 * As anotações antigas continuam na tabela `batidas`. A batida atual é /nutricao/batidas.
 */
export default function SuppliesManagementPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Cadastro antigo de batidas</h1>
      <p className="text-gray-600 text-sm mt-3">
        Este cadastro foi encerrado. As anotações antigas continuam guardadas e não são apagadas nem convertidas daqui.
        A batida atual, com fazenda e estoque, fica na tela nova.
      </p>
      <button
        type="button"
        className="mt-4 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white"
        onClick={() => setLocation("/nutricao/batidas")}
      >
        Abrir batidas
      </button>
    </div>
  );
}
