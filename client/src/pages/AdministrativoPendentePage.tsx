import AppLayout from "@/components/AppLayout";

type Pendencia = {
  titulo: string;
  texto: string;
};

/** Tela honesta: o serviço já existe, a tela de cadastro ainda não. Nenhum campo grava dado. */
export function AdministrativoPendentePage({ titulo, texto }: Pendencia) {
  return (
    <AppLayout>
      <h1 className="text-[15px] font-medium text-gray-800 mb-4">{titulo}</h1>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8">
        <p className="text-[13px] text-gray-600 max-w-xl leading-relaxed">{texto}</p>
      </div>
    </AppLayout>
  );
}

export function CentrosCustoPendentePage() {
  return (
    <AdministrativoPendentePage
      titulo="Centro de Custos"
      texto="O centro de custo já fica no serviço do financeiro, por titular e, quando houver, ligado a uma fazenda. A tela para cadastrar e revisar esses centros ainda não foi aberta. Nada é gravado nesta página."
    />
  );
}
