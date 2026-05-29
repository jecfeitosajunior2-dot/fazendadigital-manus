import { useState } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCattle } from '@/contexts/CattleContext';
import { animalsList } from '@/lib/data';
import { ArrowLeft, Calendar, Syringe, Heart, DollarSign, AlertCircle, Weight, Zap, Users, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const CattleDetailPageExpanded: React.FC = () => {
  const [, setLocation] = useLocation();
  const { cattle } = useCattle();
  const [activeTab, setActiveTab] = useState('geral');
  
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

  // Vaccination history
  const vaccineHistory = [
    { date: '15/04/2026', vaccine: 'Vacina Aftosa', veterinarian: 'Dr. João Silva', notes: 'Vacinação de rotina', status: 'Confirmado' },
    { date: '20/03/2026', vaccine: 'Vermifugo', veterinarian: 'Dr. Maria Santos', notes: 'Controle parasitário', status: 'Confirmado' },
    { date: '10/02/2026', vaccine: 'Vacina Brucelose', veterinarian: 'Dr. João Silva', notes: 'Vacinação obrigatória', status: 'Confirmado' },
  ];

  // Reproduction history (for females)
  const reproductionHistory = [
    { date: '25/05/2026', type: 'Inseminação Artificial', status: 'Confirmado', details: 'Sêmen de touro Nelore Premium', result: 'Prenhe' },
    { date: '15/04/2026', type: 'Sincronização', status: 'Concluído', details: 'Protocolo OPU/IATF', result: 'Sucesso' },
    { date: '01/03/2026', type: 'Parto', status: 'Concluído', details: 'Bezerro macho, 38kg', result: 'Normal' },
  ];

  // Weighing history
  const weighingHistory = [
    { date: '29/05/2026', weight: 450, observer: 'Pedro Silva', notes: 'Pesagem de rotina' },
    { date: '22/05/2026', weight: 448, observer: 'Maria Santos', notes: 'Pesagem pós-manejo' },
    { date: '15/05/2026', weight: 445, observer: 'Pedro Silva', notes: 'Pesagem de controle' },
    { date: '08/05/2026', weight: 442, observer: 'João Costa', notes: 'Pesagem inicial' },
  ];

  // Management history
  const managementHistory = [
    { date: '25/05/2026', type: 'Vacinação', description: 'Vacina Aftosa', responsible: 'Dr. João Silva', animals: 15 },
    { date: '20/05/2026', type: 'Pesagem', description: 'Pesagem mensal', responsible: 'Pedro Silva', animals: 52 },
    { date: '15/05/2026', type: 'Vermifugação', description: 'Controle parasitário', responsible: 'Dr. Maria Santos', animals: 52 },
    { date: '10/05/2026', type: 'Inseminação', description: 'Inseminação artificial', responsible: 'Dr. João Silva', animals: 8 },
  ];

  // Sales history
  const salesHistory = mappedCattle.saleDate ? [
    { date: mappedCattle.saleDate, buyer: 'Fazenda Modelo Ltda', price: mappedCattle.salePrice || 0, status: 'Concluído' },
  ] : [];

  // Financial records
  const financialRecords = [
    { date: '29/05/2026', type: 'Venda', description: `Venda de ${mappedCattle.sex === 'Macho' ? 'touro' : 'vaca'} - ${mappedCattle.breed}`, amount: mappedCattle.salePrice || 0, status: 'Recebido' },
    { date: '15/04/2026', type: 'Despesa', description: 'Vacinação e tratamento veterinário', amount: -150.00, status: 'Pago' },
    { date: '01/04/2026', type: 'Despesa', description: 'Alimentação e suplementação', amount: -85.50, status: 'Pago' },
    { date: '20/03/2026', type: 'Despesa', description: 'Vermifugação', amount: -45.00, status: 'Pago' },
  ];

  // Genealogy
  const genealogy = {
    father: { number: '12', breed: 'Nelore', name: 'Touro Premium' },
    mother: { number: '45', breed: 'Nelore', name: 'Vaca Elite' },
    children: [
      { number: '89', sex: 'Macho', breed: 'Nelore', birthDate: '15/03/2026' },
      { number: '90', sex: 'Fêmea', breed: 'Nelore', birthDate: '20/04/2026' },
    ]
  };

  const calculateAge = () => {
    const birthDate = new Date(mappedCattle.birthDate.split('/').reverse().join('-'));
    const today = new Date();
    const ageInMonths = (today.getFullYear() - birthDate.getFullYear()) * 12 + 
                        (today.getMonth() - birthDate.getMonth());
    const years = Math.floor(ageInMonths / 12);
    const months = ageInMonths % 12;
    return `${years} anos e ${months} meses`;
  };

  const calculateWeightGain = () => {
    if (weighingHistory.length < 2) return 0;
    return weighingHistory[0].weight - weighingHistory[weighingHistory.length - 1].weight;
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <Button
          onClick={() => setLocation('/rebanho/lista-animais')}
          className="mb-6 bg-gray-400 hover:bg-gray-500 text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lista de Animais
        </Button>

        {/* Header Card */}
        <Card className="p-6 mb-6 bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Animal #{mappedCattle.number}</h1>
              <p className="text-gray-600 mb-4">ID Eletrônico: {mappedCattle.electronicId}</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-600">Sexo:</span> <span className="font-semibold">{mappedCattle.sex}</span></p>
                <p><span className="text-gray-600">Raça:</span> <span className="font-semibold">{mappedCattle.breed}</span></p>
                <p><span className="text-gray-600">Data Nasc.:</span> <span className="font-semibold">{mappedCattle.birthDate}</span></p>
                <p><span className="text-gray-600">Idade:</span> <span className="font-semibold">{calculateAge()}</span></p>
              </div>
            </div>
            <div>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-600">Lote:</span> <span className="font-semibold">{mappedCattle.lot}</span></p>
                <p><span className="text-gray-600">Atividade:</span> <span className="font-semibold">{mappedCattle.activity}</span></p>
                <p><span className="text-gray-600">Status Sanitário:</span> <span className="font-semibold px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">{mappedCattle.sanitaryStatus}</span></p>
                <p><span className="text-gray-600">Status Financeiro:</span> <span className="font-semibold px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">{mappedCattle.financialStatus}</span></p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Peso Atual</p>
                <p className="text-2xl font-bold text-gray-800">{weighingHistory[0]?.weight || 0}kg</p>
              </div>
              <div className="bg-white rounded p-3">
                <p className="text-xs text-gray-600">Ganho</p>
                <p className="text-2xl font-bold text-green-600">+{calculateWeightGain()}kg</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="vacinacoes">Vacinações</TabsTrigger>
            <TabsTrigger value="reproducao">Reprodução</TabsTrigger>
            <TabsTrigger value="pesagens">Pesagens</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="genealogia">Genealogia</TabsTrigger>
          </TabsList>

          {/* Geral Tab */}
          <TabsContent value="geral">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Management History */}
              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-blue-600" />
                  Histórico de Manejos
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {managementHistory.map((record, idx) => (
                    <div key={idx} className="border-l-4 border-blue-400 pl-4 py-2">
                      <p className="text-sm font-semibold text-gray-800">{record.type} - {record.date}</p>
                      <p className="text-xs text-gray-600">{record.description}</p>
                      <p className="text-xs text-gray-500">Responsável: {record.responsible}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Key Metrics */}
              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Métricas Principais</h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Última Vacinação</span>
                    <span className="font-semibold text-gray-800">{vaccineHistory[0]?.date}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Dias desde última vacinação</span>
                    <span className="font-semibold text-gray-800">14 dias</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Manejos realizados</span>
                    <span className="font-semibold text-gray-800">{managementHistory.length}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="text-gray-600">Custo acumulado</span>
                    <span className="font-semibold text-gray-800">R$ 280,50</span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Vacinações Tab */}
          <TabsContent value="vacinacoes">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
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
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vaccineHistory.map((record, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-800">{record.date}</td>
                        <td className="px-4 py-2 text-gray-800 font-semibold">{record.vaccine}</td>
                        <td className="px-4 py-2 text-gray-600">{record.veterinarian}</td>
                        <td className="px-4 py-2"><span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">{record.status}</span></td>
                        <td className="px-4 py-2 text-gray-600">{record.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Reprodução Tab */}
          {mappedCattle.sex === 'Fêmea' && (
            <TabsContent value="reproducao">
              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Heart className="w-5 h-5 mr-2 text-red-600" />
                  Histórico de Reprodução
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Detalhes</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Resultado</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reproductionHistory.map((record, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{record.date}</td>
                          <td className="px-4 py-2 text-gray-800 font-semibold">{record.type}</td>
                          <td className="px-4 py-2 text-gray-600">{record.details}</td>
                          <td className="px-4 py-2"><span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">{record.result}</span></td>
                          <td className="px-4 py-2"><span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">{record.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </TabsContent>
          )}

          {/* Pesagens Tab */}
          <TabsContent value="pesagens">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Weight className="w-5 h-5 mr-2 text-purple-600" />
                  Histórico de Pesagens
                </h2>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {weighingHistory.map((record, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded hover:bg-gray-100">
                      <div>
                        <p className="font-semibold text-gray-800">{record.weight}kg</p>
                        <p className="text-xs text-gray-600">{record.date} - {record.observer}</p>
                      </div>
                      {idx > 0 && (
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${weighingHistory[idx - 1].weight > record.weight ? 'text-green-600' : 'text-red-600'}`}>
                            {weighingHistory[idx - 1].weight > record.weight ? '+' : ''}{weighingHistory[idx - 1].weight - record.weight}kg
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                  Análise de Peso
                </h2>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600">Peso Inicial</p>
                    <p className="text-2xl font-bold text-gray-800">{weighingHistory[weighingHistory.length - 1]?.weight || 0}kg</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600">Peso Atual</p>
                    <p className="text-2xl font-bold text-gray-800">{weighingHistory[0]?.weight || 0}kg</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded border border-green-200">
                    <p className="text-xs text-gray-600">Ganho Total</p>
                    <p className="text-2xl font-bold text-green-600">+{calculateWeightGain()}kg</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-gray-600">Ganho Médio/Dia</p>
                    <p className="text-2xl font-bold text-blue-600">{(calculateWeightGain() / weighingHistory.length).toFixed(2)}kg</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Financeiro Tab */}
          <TabsContent value="financeiro">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <DollarSign className="w-5 h-5 mr-2 text-green-600" />
                Movimentações Financeiras
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
                        <td className="px-4 py-2"><span className={`px-2 py-1 rounded text-xs font-semibold ${record.type === 'Venda' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{record.type}</span></td>
                        <td className="px-4 py-2 text-gray-600">{record.description}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">R$ {Math.abs(record.amount).toFixed(2)}</td>
                        <td className="px-4 py-2"><span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">{record.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 p-4 bg-blue-50 rounded border border-blue-200">
                <p className="text-sm text-gray-600">Saldo Total do Animal</p>
                <p className="text-3xl font-bold text-blue-600">R$ {financialRecords.reduce((sum, r) => sum + r.amount, 0).toFixed(2)}</p>
              </div>
            </Card>
          </TabsContent>

          {/* Genealogia Tab */}
          <TabsContent value="genealogia">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Pai */}
              <Card className="p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Pai</h3>
                <div className="space-y-2 p-4 bg-blue-50 rounded border border-blue-200">
                  <p><span className="text-gray-600">Nº Animal:</span> <span className="font-semibold">{genealogy.father.number}</span></p>
                  <p><span className="text-gray-600">Raça:</span> <span className="font-semibold">{genealogy.father.breed}</span></p>
                  <p><span className="text-gray-600">Nome:</span> <span className="font-semibold">{genealogy.father.name}</span></p>
                  <Button className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm">Ver Detalhes</Button>
                </div>
              </Card>

              {/* Mãe */}
              <Card className="p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Mãe</h3>
                <div className="space-y-2 p-4 bg-pink-50 rounded border border-pink-200">
                  <p><span className="text-gray-600">Nº Animal:</span> <span className="font-semibold">{genealogy.mother.number}</span></p>
                  <p><span className="text-gray-600">Raça:</span> <span className="font-semibold">{genealogy.mother.breed}</span></p>
                  <p><span className="text-gray-600">Nome:</span> <span className="font-semibold">{genealogy.mother.name}</span></p>
                  <Button className="w-full mt-4 bg-pink-600 hover:bg-pink-700 text-white text-sm">Ver Detalhes</Button>
                </div>
              </Card>

              {/* Filhos */}
              <Card className="p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Filhos ({genealogy.children.length})</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {genealogy.children.map((child, idx) => (
                    <div key={idx} className="p-3 bg-green-50 rounded border border-green-200">
                      <p className="text-sm"><span className="text-gray-600">Nº:</span> <span className="font-semibold">{child.number}</span></p>
                      <p className="text-sm"><span className="text-gray-600">Sexo:</span> <span className="font-semibold">{child.sex}</span></p>
                      <p className="text-sm"><span className="text-gray-600">Raça:</span> <span className="font-semibold">{child.breed}</span></p>
                      <p className="text-sm"><span className="text-gray-600">Nasc.:</span> <span className="font-semibold">{child.birthDate}</span></p>
                      <Button className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white text-xs">Ver</Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
