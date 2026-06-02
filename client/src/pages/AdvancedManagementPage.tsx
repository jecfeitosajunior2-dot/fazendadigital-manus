import AppLayout from "@/components/AppLayout";

export function AdvancedManagementPage() {
  return (
    <AppLayout>
      <div className="mb-3">
        <h1 className="text-[15px] font-medium text-gray-800">Manutenção</h1>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 text-center">
        <span className="material-icons text-4xl text-gray-200 mb-2 block">build</span>
        <p className="text-[12px] text-gray-400">Módulo de manutenção em desenvolvimento</p>
      </div>
    </AppLayout>
  );
}

export default AdvancedManagementPage;
