import React from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCattle } from '@/contexts/CattleContext';
import { animalsList } from '@/lib/data';
import { ArrowLeft, Calendar, Syringe, Heart, DollarSign, AlertCircle } from 'lucide-react';

export const CattleDetailPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const { cattle } = useCattle();
  
  // Get cattle ID from URL or use first cattle as default
  const urlParams = new URLSearchParams(window.location.search);
  const cattleId = urlParams.get('id') || '1';
  const selectedCattle = cattle.find(c => c.number === cattleId) || 
                        (animalsList.find(a => a.animalId === cattleId) as any);

  if (!selectedCattle) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto">
          <Button
            onClick={() => setLocation('/rebanho/lista-animais')}
            className="mb-6 bg-gray-400 hover:bg-gray-500 text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Lista de Animais
          </Button>
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Animal não encontrado. Por favor, selecione um animal válido.</p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Map animalsList data to CattleRecord format
  const animalData = selectedCattle as any;
  const mappedCattle = {
    id: parseInt(animalData.animalId || '0'),
    number: animalData.animalId || '',
    electronicId: animalData.electronicId || '',
    birthDate: animalData.birthDate || '',
    sex: (animalData.sex || 'Macho') as 'Macho' | 'Fêmea',
    breed: animalData.breed || '',
    lot: animalData.lot || '',
    activity: animalData.activity || '',
    sanitaryStatus: 'Vacinado' as const,
    lastVaccine: '15/04/2026',
    salePrice: undefined,
    saleDate: undefined,
    financialStatus: 'Ativo' as const,
  };

  // Generate mock vaccination history
  const vaccineHistory = [
    {
      date: mappedCattle.lastVaccine || '15/04/2026',
      vaccine: 'Vacina Aftosa',
      veterinarian: 'Dr. João Silva',
      notes: 'Vacinação de rotina',
    },
    {
      date: '20/03/2026',
      vaccine: 'Vermifugo',
      veterinarian: 'Dr. Maria Santos',
      notes: 'Controle parasitário',
    },
    {
      date: '10/02/2026',
      vaccine: 'Vacina Brucelose',
      veterinarian: 'Dr. João Silva',
      notes: 'Vacinação obrigatória',
    },
  ];

  // Generate mock reproduction history
  const reproductionHistory = [
    {
      date: '25/05/2026',
      type: 'Inseminação Artificial',
      status: 'Confirmado',
      details: 'Sêmen de touro Nelore Premium',
    },
    {
      date: '15/04/2026',
      type: 'Sincronização',
      status: 'Concluído',
      details: 'Protocolo OPU/IATF',
    },
  ];

  // Generate mock sale history
  const saleHistory = mappedCattle.saleDate ? [
    {
      date: mappedCattle.saleDate,
      buyer: 'Fazenda Modelo Ltda',
      price: mappedCattle.salePrice || 0,
      quantity: 1,
      status: 'Concluído',
    },
  ] : [];

  // Generate mock financial records
  const financialRecords = [
    {
      date: mappedCattle.saleDate || '29/05/2026',
      type: 'Venda',
      description: `Venda de ${mappedCattle.sex === 'Macho' ? 'touro' : 'vaca'} - ${mappedCattle.breed}`,
      amount: mappedCattle.salePrice || 0,
      status: 'Recebido',
    },
    {
      date: '15/04/2026',
      type: 'Despesa',
      description: 'Vacinação e tratamento veterinário',
      amount: -150.00,
      status: 'Pago',
    },
    {
      date: '01/04/2026',
      type: 'Despesa',
      description: 'Alimentação e suplementação',
      amount: -85.50,
      status: 'Pago',
    },
  ];

  const calculateAge = () => {
    const birthDate = new Date(mappedCattle.birthDate.split('/').reverse().join('-'));
    const today = new Date();
    const ageInMonths = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                        (today.getMonth() - birthDate.getMonth());
    const years = Math.floor(ageInMonths / 12);
    const months = ageInMonths % 12;
    return `${years} anos e ${months} meses`;
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        <Button
          onClick={() => setLocation('/rebanho/lista-animais')}
          className="mb-6 bg-gray-400 hover:bg-gray-500 text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lista de Animais
        </Button>

        {/* Header Card */}
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Animal #{mappedCattle.number}</h1>
              <p className="text-gray-600 mb-4">ID Eletrônico: {mappedCattle.electronicId}</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sexo:</span>
                  <span className="font-semibold text-gray-800">{mappedCattle.sex}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Raça:</span>
                  <span className="font-semibold text-gray-800">{mappedCattle.breed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data de Nascimento:</span>
                  <span className="font-semibold text-gray-800">{mappedCattle.birthDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Idade:</span>
                  <span className="font-semibold text-gray-800">{calculateAge()}</span>
                </div>
              </div>
            </div>
            <div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Lote:</span>
                  <span className="font-semibold text-gray-800">{mappedCattle.lot}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Atividade:</span>
                  <span className="font-semibold text-gray-800">{mappedCattle.activity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status Sanitário:</span>
                  <span className={`font-semibold px-2 py-1 rounded text-xs ${
                    mappedCattle.sanitaryStatus === 'Vacinado' ? 'bg-green-100 text-green-800' :
                    mappedCattle.sanitaryStatus === 'Não Vacinado' ? 'bg-orange-100 text-orange-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {mappedCattle.sanitaryStatus}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status Financeiro:</span>
                  <span className={`font-semibold px-2 py-1 rounded text-xs ${
                    mappedCattle.financialStatus === 'Ativo' ? 'bg-blue-100 text-blue-800' :
                    mappedCattle.financialStatus === 'Vendido' ? 'bg-purple-100 text-purple-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {mappedCattle.financialStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Vaccination History */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Syringe className="w-5 h-5 mr-2 text-green-600" />
            Histórico de Vacinações
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Vacina</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Veterinário</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Observações</th>
                </tr>
              </thead>
              <tbody>
                {vaccineHistory.map((record, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">{record.date}</td>
                    <td className="px-4 py-2 text-gray-800">{record.vaccine}</td>
                    <td className="px-4 py-2 text-gray-600">{record.veterinarian}</td>
                    <td className="px-4 py-2 text-gray-600">{record.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Reproduction History */}
        {mappedCattle.sex === 'Fêmea' && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <Heart className="w-5 h-5 mr-2 text-red-600" />
              Histórico de Reprodução
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {reproductionHistory.map((record, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{record.date}</td>
                      <td className="px-4 py-2 text-gray-800">{record.type}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 font-medium">
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{record.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Sales History */}
        {saleHistory.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <DollarSign className="w-5 h-5 mr-2 text-purple-600" />
              Histórico de Vendas
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Comprador</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">Preço</th>
                    <th className="px-4 py-2 text-center font-medium text-gray-700">Quantidade</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saleHistory.map((record, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-800">{record.date}</td>
                      <td className="px-4 py-2 text-gray-800">{record.buyer}</td>
                      <td className="px-4 py-2 text-right text-gray-800 font-semibold">
                        R$ {record.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-800">{record.quantity}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-1 rounded text-xs bg-purple-100 text-purple-800 font-medium">
                          {record.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Financial Records */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-green-600" />
            Histórico Financeiro
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Descrição</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Valor</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {financialRecords.map((record, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">{record.date}</td>
                    <td className="px-4 py-2 text-gray-800">{record.type}</td>
                    <td className="px-4 py-2 text-gray-600">{record.description}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${
                      record.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {record.amount > 0 ? '+' : ''} R$ {Math.abs(record.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800 font-medium">
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-4 bg-gray-50 rounded border border-gray-200">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-800">Total de Movimentações:</span>
              <span className="text-lg font-bold text-green-600">
                R$ {financialRecords.reduce((sum, r) => sum + r.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

export default CattleDetailPage;
