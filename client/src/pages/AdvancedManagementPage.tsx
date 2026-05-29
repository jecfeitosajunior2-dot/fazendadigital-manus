import { useState, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Calendar, User, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Management {
  id: string;
  date: string;
  type: string;
  animalId: string;
  animalName: string;
  description: string;
  status: 'Concluído' | 'Pendente' | 'Cancelado';
  responsiblePerson: string;
  notes: string;
  result?: string;
}

interface ManagementType {
  name: string;
  description: string;
  icon: string;
}

const managementTypes: ManagementType[] = [
  { name: 'Vacinação', description: 'Aplicação de vacinas', icon: '💉' },
  { name: 'Pesagem', description: 'Medição de peso', icon: '⚖️' },
  { name: 'Tratamento', description: 'Tratamento de doença', icon: '🏥' },
  { name: 'Inseminação', description: 'Inseminação artificial', icon: '🔬' },
  { name: 'Parto', description: 'Acompanhamento de parto', icon: '👶' },
  { name: 'Desmama', description: 'Desmama de bezerro', icon: '🍼' },
  { name: 'Transferência', description: 'Transferência de lote', icon: '↔️' },
  { name: 'Descarte', description: 'Descarte de animal', icon: '🚪' },
];

const initialManagements: Management[] = [
  { id: '1', date: '28/05/2026', type: 'Vacinação', animalId: '1', animalName: 'Boi 001', description: 'Vacinação contra aftosa', status: 'Concluído', responsiblePerson: 'Dr. Carlos', notes: 'Animal vacinado com sucesso', result: 'Sucesso' },
  { id: '2', date: '27/05/2026', type: 'Pesagem', animalId: '2', animalName: 'Vaca 002', description: 'Pesagem mensal', status: 'Concluído', responsiblePerson: 'João Silva', notes: 'Peso: 520kg', result: 'Ganho de 15kg' },
  { id: '3', date: '26/05/2026', type: 'Tratamento', animalId: '3', animalName: 'Bezerro 003', description: 'Tratamento de mastite', status: 'Concluído', responsiblePerson: 'Maria Santos', notes: 'Aplicado antibiótico', result: 'Recuperado' },
  { id: '4', date: '25/05/2026', type: 'Inseminação', animalId: '2', animalName: 'Vaca 002', description: 'Inseminação artificial', status: 'Concluído', responsiblePerson: 'Dr. Carlos', notes: 'Inseminada com sêmen de touro selecionado', result: 'Prenhe (confirmado)' },
  { id: '5', date: '24/05/2026', type: 'Desmama', animalId: '4', animalName: 'Bezerro 004', description: 'Desmama de bezerro', status: 'Pendente', responsiblePerson: 'João Silva', notes: 'Agendado para próxima semana', result: '' },
];

const animalsList = [
  { id: '1', name: 'Boi 001', breed: 'Nelore', sex: 'Macho', age: '3 anos' },
  { id: '2', name: 'Vaca 002', breed: 'Nelore', sex: 'Fêmea', age: '5 anos' },
  { id: '3', name: 'Bezerro 003', breed: 'Nelore', sex: 'Macho', age: '6 meses' },
  { id: '4', name: 'Bezerro 004', breed: 'Nelore', sex: 'Fêmea', age: '8 meses' },
  { id: '5', name: 'Novilho 005', breed: 'Nelore', sex: 'Macho', age: '1.5 anos' },
];

export const AdvancedManagementPage: React.FC = () => {
  const [managements, setManagements] = useState<Management[]>(initialManagements);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState('');
  const [isAddManagementOpen, setIsAddManagementOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [managementForm, setManagementForm] = useState({
    date: '',
    type: '',
    animalId: '',
    description: '',
    status: 'Pendente' as 'Concluído' | 'Pendente' | 'Cancelado',
    responsiblePerson: '',
    notes: '',
    result: '',
  });

  const filteredManagements = useMemo(() => {
    let result = managements;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(m => m.animalName.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
    }

    if (selectedType) {
      result = result.filter(m => m.type === selectedType);
    }

    if (selectedStatus) {
      result = result.filter(m => m.status === selectedStatus);
    }

    if (selectedAnimal) {
      result = result.filter(m => m.animalId === selectedAnimal);
    }

    return result.sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime());
  }, [searchTerm, selectedType, selectedStatus, selectedAnimal, managements]);

  const animalManagementHistory = (animalId: string) => {
    return managements.filter(m => m.animalId === animalId);
  };

  const handleAddManagement = () => {
    if (!managementForm.date || !managementForm.type || !managementForm.animalId || !managementForm.description) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const animal = animalsList.find(a => a.id === managementForm.animalId);
    if (!animal) {
      toast.error('Animal não encontrado');
      return;
    }

    if (editingId) {
      setManagements(managements.map(m => {
        if (m.id === editingId) {
          return {
            ...m,
            date: managementForm.date,
            type: managementForm.type,
            animalId: managementForm.animalId,
            animalName: animal.name,
            description: managementForm.description,
            status: managementForm.status,
            responsiblePerson: managementForm.responsiblePerson,
            notes: managementForm.notes,
            result: managementForm.result,
          };
        }
        return m;
      }));
      toast.success('Manejo atualizado com sucesso!');
      setEditingId(null);
    } else {
      const newManagement: Management = {
        id: String(managements.length + 1),
        date: managementForm.date,
        type: managementForm.type,
        animalId: managementForm.animalId,
        animalName: animal.name,
        description: managementForm.description,
        status: managementForm.status,
        responsiblePerson: managementForm.responsiblePerson,
        notes: managementForm.notes,
        result: managementForm.result,
      };

      setManagements([...managements, newManagement]);
      toast.success('Manejo criado com sucesso!');
    }

    setManagementForm({
      date: '',
      type: '',
      animalId: '',
      description: '',
      status: 'Pendente',
      responsiblePerson: '',
      notes: '',
      result: '',
    });
    setIsAddManagementOpen(false);
  };

  const handleEditManagement = (m: Management) => {
    setManagementForm({
      date: m.date,
      type: m.type,
      animalId: m.animalId,
      description: m.description,
      status: m.status,
      responsiblePerson: m.responsiblePerson,
      notes: m.notes,
      result: m.result || '',
    });
    setEditingId(m.id);
    setIsAddManagementOpen(true);
  };

  const handleDeleteManagement = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este manejo?')) {
      setManagements(managements.filter(m => m.id !== id));
      toast.success('Manejo deletado com sucesso!');
    }
  };

  const completedCount = managements.filter(m => m.status === 'Concluído').length;
  const pendingCount = managements.filter(m => m.status === 'Pendente').length;
  const canceledCount = managements.filter(m => m.status === 'Cancelado').length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento de Manejos</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm text-gray-600">Total de Manejos</p>
            <p className="text-3xl font-bold text-blue-600">{managements.length}</p>
            <p className="text-xs text-gray-500">Todos os registros</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  Concluídos
                </p>
                <p className="text-3xl font-bold text-green-600">{completedCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Pendentes
                </p>
                <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <p className="text-sm text-gray-600">Taxa de Conclusão</p>
            <p className="text-3xl font-bold text-red-600">{managements.length > 0 ? Math.round((completedCount / managements.length) * 100) : 0}%</p>
            <p className="text-xs text-gray-500">Manejos concluídos</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="managements" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="managements">Manejos</TabsTrigger>
            <TabsTrigger value="animals">Histórico por Animal</TabsTrigger>
          </TabsList>

          {/* Managements Tab */}
          <TabsContent value="managements">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Registro de Manejos</h2>
                <Dialog open={isAddManagementOpen} onOpenChange={(open) => {
                  setIsAddManagementOpen(open);
                  if (!open) {
                    setEditingId(null);
                    setManagementForm({
                      date: '',
                      type: '',
                      animalId: '',
                      description: '',
                      status: 'Pendente',
                      responsiblePerson: '',
                      notes: '',
                      result: '',
                    });
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Novo Manejo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingId ? 'Editar Manejo' : 'Registrar Novo Manejo'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={managementForm.date}
                          onChange={(e) => setManagementForm({ ...managementForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Tipo de Manejo *</Label>
                        <Select value={managementForm.type} onValueChange={(v) => setManagementForm({ ...managementForm, type: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {managementTypes.map(t => (
                              <SelectItem key={t.name} value={t.name}>{t.icon} {t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Animal *</Label>
                        <Select value={managementForm.animalId} onValueChange={(v) => setManagementForm({ ...managementForm, animalId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o animal" />
                          </SelectTrigger>
                          <SelectContent>
                            {animalsList.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name} ({a.breed})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Descrição *</Label>
                        <Input
                          placeholder="Descrição do manejo"
                          value={managementForm.description}
                          onChange={(e) => setManagementForm({ ...managementForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Status</Label>
                        <Select value={managementForm.status} onValueChange={(v) => setManagementForm({ ...managementForm, status: v as 'Concluído' | 'Pendente' | 'Cancelado' })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                            <SelectItem value="Concluído">Concluído</SelectItem>
                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Responsável</Label>
                        <Input
                          placeholder="Nome da pessoa responsável"
                          value={managementForm.responsiblePerson}
                          onChange={(e) => setManagementForm({ ...managementForm, responsiblePerson: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          placeholder="Observações"
                          value={managementForm.notes}
                          onChange={(e) => setManagementForm({ ...managementForm, notes: e.target.value })}
                        />
                      </div>
                      {managementForm.status === 'Concluído' && (
                        <div>
                          <Label>Resultado</Label>
                          <Input
                            placeholder="Resultado do manejo"
                            value={managementForm.result}
                            onChange={(e) => setManagementForm({ ...managementForm, result: e.target.value })}
                          />
                        </div>
                      )}
                      <Button onClick={handleAddManagement} className="w-full bg-green-600 hover:bg-green-700 text-white">
                        {editingId ? 'Atualizar Manejo' : 'Registrar Manejo'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Input
                  placeholder="Pesquisar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os tipos</SelectItem>
                    {managementTypes.map(t => (
                      <SelectItem key={t.name} value={t.name}>{t.icon} {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os status</SelectItem>
                    <SelectItem value="Concluído">Concluído</SelectItem>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedAnimal} onValueChange={setSelectedAnimal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por animal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os animais</SelectItem>
                    {animalsList.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Animal</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Descrição</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Responsável</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredManagements.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600">{m.date}</td>
                        <td className="px-4 py-2 font-semibold text-gray-800">{m.type}</td>
                        <td className="px-4 py-2 text-gray-600">{m.animalName}</td>
                        <td className="px-4 py-2 text-gray-600">{m.description}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            m.status === 'Concluído' ? 'bg-green-100 text-green-800' :
                            m.status === 'Pendente' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{m.responsiblePerson}</td>
                        <td className="px-4 py-2 text-center space-x-2">
                          <button onClick={() => handleEditManagement(m)} className="text-blue-600 hover:text-blue-800">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteManagement(m.id)} className="text-red-600 hover:text-red-800">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Animal History Tab */}
          <TabsContent value="animals">
            <div className="space-y-4">
              {animalsList.map((animal) => {
                const history = animalManagementHistory(animal.id);
                return (
                  <Card key={animal.id} className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">{animal.name} ({animal.breed})</h3>
                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div className="p-3 bg-blue-50 rounded">
                        <p className="text-xs text-gray-600">Sexo</p>
                        <p className="font-semibold text-gray-800">{animal.sex}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded">
                        <p className="text-xs text-gray-600">Idade</p>
                        <p className="font-semibold text-gray-800">{animal.age}</p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded">
                        <p className="text-xs text-gray-600">Total de Manejos</p>
                        <p className="font-semibold text-gray-800">{history.length}</p>
                      </div>
                      <div className="p-3 bg-orange-50 rounded">
                        <p className="text-xs text-gray-600">Últimas 30 dias</p>
                        <p className="font-semibold text-gray-800">{history.filter(m => {
                          const mDate = new Date(m.date.split('/').reverse().join('-'));
                          const now = new Date();
                          const diff = (now.getTime() - mDate.getTime()) / (1000 * 60 * 60 * 24);
                          return diff <= 30;
                        }).length}</p>
                      </div>
                    </div>

                    {history.length === 0 ? (
                      <p className="text-gray-600 text-center py-4">Nenhum manejo registrado para este animal</p>
                    ) : (
                      <div className="space-y-2">
                        {history.map((m) => (
                          <div key={m.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded border-l-4 border-blue-600">
                            <Calendar className="w-5 h-5 text-gray-600 mt-1 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-semibold text-gray-800">{m.type}: {m.description}</p>
                                  <p className="text-sm text-gray-600 mt-1">{m.notes}</p>
                                </div>
                                <span className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ml-2 ${
                                  m.status === 'Concluído' ? 'bg-green-100 text-green-800' :
                                  m.status === 'Pendente' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {m.status}
                                </span>
                              </div>
                              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                <span>📅 {m.date}</span>
                                <span>👤 {m.responsiblePerson}</span>
                                {m.result && <span>✓ {m.result}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
