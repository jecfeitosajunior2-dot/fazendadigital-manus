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
import { Plus, Trash2, Edit2, Droplet, Beaker, Zap, TrendingUp } from 'lucide-react';

interface SemenBatch {
  id: string;
  bullName: string;
  breed: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  pricePerUnit: number;
  status: 'Disponível' | 'Reservado' | 'Vencido';
  createdDate: string;
}

interface EmbryoBatch {
  id: string;
  sireBreed: string;
  damBreed: string;
  quantity: number;
  expiryDate: string;
  pricePerUnit: number;
  status: 'Disponível' | 'Transferido' | 'Vencido';
  createdDate: string;
}

interface ReproductionProtocol {
  id: string;
  name: string;
  description: string;
  duration: number;
  successRate: number;
  animalsUsed: number;
  pregnancyRate: number;
}

interface InseminationRecord {
  id: string;
  animalId: string;
  animalName: string;
  date: string;
  protocol: string;
  semenBull: string;
  veterinarian: string;
  result: 'Prenhe' | 'Não Prenhe' | 'Pendente';
  notes: string;
}

const initialSemen: SemenBatch[] = [
  { id: '1', bullName: 'Touro Premium Nelore', breed: 'Nelore', quantity: 50, unit: 'doses', expiryDate: '31/12/2026', pricePerUnit: 150, status: 'Disponível', createdDate: '01/05/2026' },
  { id: '2', bullName: 'Touro Elite Brahman', breed: 'Brahman', quantity: 30, unit: 'doses', expiryDate: '15/11/2026', pricePerUnit: 200, status: 'Disponível', createdDate: '10/04/2026' },
  { id: '3', bullName: 'Touro Campeão Guzerá', breed: 'Guzerá', quantity: 20, unit: 'doses', expiryDate: '28/02/2026', pricePerUnit: 180, status: 'Vencido', createdDate: '01/03/2026' },
];

const initialEmbryos: EmbryoBatch[] = [
  { id: '1', sireBreed: 'Nelore', damBreed: 'Nelore', quantity: 15, expiryDate: '30/06/2026', pricePerUnit: 500, status: 'Disponível', createdDate: '01/05/2026' },
  { id: '2', sireBreed: 'Brahman', damBreed: 'Nelore', quantity: 10, expiryDate: '31/07/2026', pricePerUnit: 600, status: 'Disponível', createdDate: '15/04/2026' },
];

const initialProtocols: ReproductionProtocol[] = [
  { id: '1', name: 'IATF (Inseminação em Tempo Fixo)', description: 'Protocolo de sincronização para inseminação artificial em tempo fixo', duration: 10, successRate: 65, animalsUsed: 120, pregnancyRate: 78 },
  { id: '2', name: 'OPU/IATF', description: 'Aspiração folicular com inseminação em tempo fixo', duration: 14, successRate: 72, animalsUsed: 45, pregnancyRate: 85 },
  { id: '3', name: 'Monta Natural', description: 'Reprodução natural com touros selecionados', duration: 60, successRate: 85, animalsUsed: 200, pregnancyRate: 92 },
];

const initialInseminations: InseminationRecord[] = [
  { id: '1', animalId: '1', animalName: 'Vaca 001', date: '25/05/2026', protocol: 'IATF', semenBull: 'Touro Premium Nelore', veterinarian: 'Dr. João Silva', result: 'Prenhe', notes: 'Inseminação bem-sucedida' },
  { id: '2', animalId: '2', animalName: 'Vaca 002', date: '24/05/2026', protocol: 'IATF', semenBull: 'Touro Elite Brahman', veterinarian: 'Dr. Maria Santos', result: 'Prenhe', notes: 'Boa resposta ao protocolo' },
  { id: '3', animalId: '3', animalName: 'Vaca 003', date: '23/05/2026', protocol: 'OPU/IATF', semenBull: 'Touro Premium Nelore', veterinarian: 'Dr. João Silva', result: 'Pendente', notes: 'Aguardando diagnóstico' },
];

export const ReproductionManagementPage: React.FC = () => {
  const [semen, setSemen] = useState<SemenBatch[]>(initialSemen);
  const [embryos, setEmbryos] = useState<EmbryoBatch[]>(initialEmbryos);
  const [protocols] = useState<ReproductionProtocol[]>(initialProtocols);
  const [inseminations, setInseminations] = useState<InseminationRecord[]>(initialInseminations);
  
  const [semenSearch, setSemenSearch] = useState('');
  const [embryoSearch, setEmbryoSearch] = useState('');
  const [inseminationSearch, setInseminationSearch] = useState('');
  
  const [isAddSemenOpen, setIsAddSemenOpen] = useState(false);
  const [isAddEmbryoOpen, setIsAddEmbryoOpen] = useState(false);
  const [isAddInseminationOpen, setIsAddInseminationOpen] = useState(false);
  
  const [semenForm, setSemenForm] = useState({ bullName: '', breed: '', quantity: '', expiryDate: '', pricePerUnit: '' });
  const [embryoForm, setEmbryoForm] = useState({ sireBreed: '', damBreed: '', quantity: '', expiryDate: '', pricePerUnit: '' });
  const [inseminationForm, setInseminationForm] = useState({ animalId: '', date: '', protocol: '', semenBull: '', veterinarian: '', result: 'Pendente', notes: '' });

  const filteredSemen = useMemo(() => {
    if (!semenSearch.trim()) return semen;
    const q = semenSearch.toLowerCase();
    return semen.filter(s => s.bullName.toLowerCase().includes(q) || s.breed.toLowerCase().includes(q));
  }, [semenSearch, semen]);

  const filteredEmbryos = useMemo(() => {
    if (!embryoSearch.trim()) return embryos;
    const q = embryoSearch.toLowerCase();
    return embryos.filter(e => e.sireBreed.toLowerCase().includes(q) || e.damBreed.toLowerCase().includes(q));
  }, [embryoSearch, embryos]);

  const filteredInseminations = useMemo(() => {
    if (!inseminationSearch.trim()) return inseminations;
    const q = inseminationSearch.toLowerCase();
    return inseminations.filter(i => i.animalName.toLowerCase().includes(q) || i.animalId.includes(q));
  }, [inseminationSearch, inseminations]);

  const handleAddSemen = () => {
    if (!semenForm.bullName || !semenForm.breed || !semenForm.quantity) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    const newSemen: SemenBatch = {
      id: String(semen.length + 1),
      bullName: semenForm.bullName,
      breed: semenForm.breed,
      quantity: parseInt(semenForm.quantity),
      unit: 'doses',
      expiryDate: semenForm.expiryDate,
      pricePerUnit: parseFloat(semenForm.pricePerUnit) || 0,
      status: 'Disponível',
      createdDate: new Date().toLocaleDateString('pt-BR'),
    };
    setSemen([...semen, newSemen]);
    setSemenForm({ bullName: '', breed: '', quantity: '', expiryDate: '', pricePerUnit: '' });
    setIsAddSemenOpen(false);
    toast.success('Sêmen adicionado com sucesso!');
  };

  const handleAddEmbryo = () => {
    if (!embryoForm.sireBreed || !embryoForm.damBreed || !embryoForm.quantity) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    const newEmbryo: EmbryoBatch = {
      id: String(embryos.length + 1),
      sireBreed: embryoForm.sireBreed,
      damBreed: embryoForm.damBreed,
      quantity: parseInt(embryoForm.quantity),
      expiryDate: embryoForm.expiryDate,
      pricePerUnit: parseFloat(embryoForm.pricePerUnit) || 0,
      status: 'Disponível',
      createdDate: new Date().toLocaleDateString('pt-BR'),
    };
    setEmbryos([...embryos, newEmbryo]);
    setEmbryoForm({ sireBreed: '', damBreed: '', quantity: '', expiryDate: '', pricePerUnit: '' });
    setIsAddEmbryoOpen(false);
    toast.success('Embrião adicionado com sucesso!');
  };

  const handleAddInsemination = () => {
    if (!inseminationForm.animalId || !inseminationForm.date || !inseminationForm.protocol) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    const newInsemination: InseminationRecord = {
      id: String(inseminations.length + 1),
      animalId: inseminationForm.animalId,
      animalName: `Vaca ${inseminationForm.animalId}`,
      date: inseminationForm.date,
      protocol: inseminationForm.protocol,
      semenBull: inseminationForm.semenBull,
      veterinarian: inseminationForm.veterinarian,
      result: inseminationForm.result as 'Prenhe' | 'Não Prenhe' | 'Pendente',
      notes: inseminationForm.notes,
    };
    setInseminations([...inseminations, newInsemination]);
    setInseminationForm({ animalId: '', date: '', protocol: '', semenBull: '', veterinarian: '', result: 'Pendente', notes: '' });
    setIsAddInseminationOpen(false);
    toast.success('Inseminação registrada com sucesso!');
  };

  const handleDeleteSemen = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este sêmen?')) {
      setSemen(semen.filter(s => s.id !== id));
      toast.success('Sêmen deletado com sucesso!');
    }
  };

  const handleDeleteEmbryo = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este embrião?')) {
      setEmbryos(embryos.filter(e => e.id !== id));
      toast.success('Embrião deletado com sucesso!');
    }
  };

  const pregnancyStats = {
    total: inseminations.length,
    pregnant: inseminations.filter(i => i.result === 'Prenhe').length,
    notPregnant: inseminations.filter(i => i.result === 'Não Prenhe').length,
    pending: inseminations.filter(i => i.result === 'Pendente').length,
  };

  const pregnancyRate = pregnancyStats.total > 0 ? ((pregnancyStats.pregnant / pregnancyStats.total) * 100).toFixed(1) : 0;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento de Reprodução</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm text-gray-600">Sêmen Disponível</p>
            <p className="text-3xl font-bold text-blue-600">{semen.filter(s => s.status === 'Disponível').reduce((sum, s) => sum + s.quantity, 0)}</p>
            <p className="text-xs text-gray-500">doses</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm text-gray-600">Embriões Disponíveis</p>
            <p className="text-3xl font-bold text-purple-600">{embryos.filter(e => e.status === 'Disponível').reduce((sum, e) => sum + e.quantity, 0)}</p>
            <p className="text-xs text-gray-500">embriões</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm text-gray-600">Taxa de Prenhez</p>
            <p className="text-3xl font-bold text-green-600">{pregnancyRate}%</p>
            <p className="text-xs text-gray-500">{pregnancyStats.pregnant}/{pregnancyStats.total}</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <p className="text-sm text-gray-600">Inseminações</p>
            <p className="text-3xl font-bold text-orange-600">{inseminations.length}</p>
            <p className="text-xs text-gray-500">registradas</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="semen" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="semen">Sêmen</TabsTrigger>
            <TabsTrigger value="embryos">Embriões</TabsTrigger>
            <TabsTrigger value="protocols">Protocolos</TabsTrigger>
            <TabsTrigger value="inseminations">Inseminações</TabsTrigger>
          </TabsList>

          {/* Sêmen Tab */}
          <TabsContent value="semen">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Droplet className="w-5 h-5 text-blue-600" />
                  Estoque de Sêmen
                </h2>
                <Dialog open={isAddSemenOpen} onOpenChange={setIsAddSemenOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Adicionar Sêmen
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Novo Sêmen</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome do Touro *</Label>
                        <Input
                          placeholder="Ex: Touro Premium Nelore"
                          value={semenForm.bullName}
                          onChange={(e) => setSemenForm({ ...semenForm, bullName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Raça *</Label>
                        <Input
                          placeholder="Ex: Nelore"
                          value={semenForm.breed}
                          onChange={(e) => setSemenForm({ ...semenForm, breed: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Quantidade (doses) *</Label>
                        <Input
                          type="number"
                          placeholder="Quantidade"
                          value={semenForm.quantity}
                          onChange={(e) => setSemenForm({ ...semenForm, quantity: e.target.value })}
                          min="1"
                        />
                      </div>
                      <div>
                        <Label>Data de Validade</Label>
                        <Input
                          type="date"
                          value={semenForm.expiryDate}
                          onChange={(e) => setSemenForm({ ...semenForm, expiryDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Preço por Dose</Label>
                        <Input
                          type="number"
                          placeholder="R$"
                          value={semenForm.pricePerUnit}
                          onChange={(e) => setSemenForm({ ...semenForm, pricePerUnit: e.target.value })}
                          step="0.01"
                        />
                      </div>
                      <Button onClick={handleAddSemen} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        Adicionar Sêmen
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="mb-4">
                <Input
                  placeholder="Pesquisar sêmen..."
                  value={semenSearch}
                  onChange={(e) => setSemenSearch(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Touro</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Raça</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Quantidade</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Validade</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Preço/Dose</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSemen.map((s) => (
                      <tr key={s.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-semibold text-gray-800">{s.bullName}</td>
                        <td className="px-4 py-2 text-gray-600">{s.breed}</td>
                        <td className="px-4 py-2 text-center text-gray-800">{s.quantity}</td>
                        <td className="px-4 py-2 text-gray-600">{s.expiryDate}</td>
                        <td className="px-4 py-2 text-right text-gray-800">R$ {s.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            s.status === 'Disponível' ? 'bg-green-100 text-green-800' :
                            s.status === 'Reservado' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDeleteSemen(s.id)} className="text-red-600 hover:text-red-800">
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

          {/* Embriões Tab */}
          <TabsContent value="embryos">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Beaker className="w-5 h-5 text-purple-600" />
                  Estoque de Embriões
                </h2>
                <Dialog open={isAddEmbryoOpen} onOpenChange={setIsAddEmbryoOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Adicionar Embrião
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Novo Embrião</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Raça do Touro *</Label>
                        <Input
                          placeholder="Ex: Nelore"
                          value={embryoForm.sireBreed}
                          onChange={(e) => setEmbryoForm({ ...embryoForm, sireBreed: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Raça da Vaca *</Label>
                        <Input
                          placeholder="Ex: Nelore"
                          value={embryoForm.damBreed}
                          onChange={(e) => setEmbryoForm({ ...embryoForm, damBreed: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Quantidade *</Label>
                        <Input
                          type="number"
                          placeholder="Quantidade"
                          value={embryoForm.quantity}
                          onChange={(e) => setEmbryoForm({ ...embryoForm, quantity: e.target.value })}
                          min="1"
                        />
                      </div>
                      <div>
                        <Label>Data de Validade</Label>
                        <Input
                          type="date"
                          value={embryoForm.expiryDate}
                          onChange={(e) => setEmbryoForm({ ...embryoForm, expiryDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Preço por Embrião</Label>
                        <Input
                          type="number"
                          placeholder="R$"
                          value={embryoForm.pricePerUnit}
                          onChange={(e) => setEmbryoForm({ ...embryoForm, pricePerUnit: e.target.value })}
                          step="0.01"
                        />
                      </div>
                      <Button onClick={handleAddEmbryo} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                        Adicionar Embrião
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="mb-4">
                <Input
                  placeholder="Pesquisar embriões..."
                  value={embryoSearch}
                  onChange={(e) => setEmbryoSearch(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Raça Touro</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Raça Vaca</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Quantidade</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Validade</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Preço/Embrião</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmbryos.map((e) => (
                      <tr key={e.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-semibold text-gray-800">{e.sireBreed}</td>
                        <td className="px-4 py-2 text-gray-600">{e.damBreed}</td>
                        <td className="px-4 py-2 text-center text-gray-800">{e.quantity}</td>
                        <td className="px-4 py-2 text-gray-600">{e.expiryDate}</td>
                        <td className="px-4 py-2 text-right text-gray-800">R$ {e.pricePerUnit.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            e.status === 'Disponível' ? 'bg-green-100 text-green-800' :
                            e.status === 'Transferido' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {e.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDeleteEmbryo(e.id)} className="text-red-600 hover:text-red-800">
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

          {/* Protocolos Tab */}
          <TabsContent value="protocols">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {protocols.map((p) => (
                <Card key={p.id} className="p-5">
                  <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-600" />
                    {p.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">{p.description}</p>
                  <div className="space-y-2 p-3 bg-gray-50 rounded">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Duração:</span>
                      <span className="font-semibold">{p.duration} dias</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Taxa de Sucesso:</span>
                      <span className="font-semibold text-green-600">{p.successRate}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Animais Usados:</span>
                      <span className="font-semibold">{p.animalsUsed}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Taxa de Prenhez:</span>
                      <span className="font-semibold text-blue-600">{p.pregnancyRate}%</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Inseminações Tab */}
          <TabsContent value="inseminations">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Histórico de Inseminações
                </h2>
                <Dialog open={isAddInseminationOpen} onOpenChange={setIsAddInseminationOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Registrar Inseminação
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Registrar Nova Inseminação</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>ID do Animal *</Label>
                        <Input
                          placeholder="ID do animal"
                          value={inseminationForm.animalId}
                          onChange={(e) => setInseminationForm({ ...inseminationForm, animalId: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={inseminationForm.date}
                          onChange={(e) => setInseminationForm({ ...inseminationForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Protocolo *</Label>
                        <Select value={inseminationForm.protocol} onValueChange={(v) => setInseminationForm({ ...inseminationForm, protocol: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o protocolo" />
                          </SelectTrigger>
                          <SelectContent>
                            {protocols.map(p => (
                              <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Sêmen do Touro</Label>
                        <Input
                          placeholder="Nome do touro"
                          value={inseminationForm.semenBull}
                          onChange={(e) => setInseminationForm({ ...inseminationForm, semenBull: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Veterinário</Label>
                        <Input
                          placeholder="Nome do veterinário"
                          value={inseminationForm.veterinarian}
                          onChange={(e) => setInseminationForm({ ...inseminationForm, veterinarian: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Resultado</Label>
                        <Select value={inseminationForm.result} onValueChange={(v) => setInseminationForm({ ...inseminationForm, result: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Prenhe">Prenhe</SelectItem>
                            <SelectItem value="Não Prenhe">Não Prenhe</SelectItem>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          placeholder="Observações"
                          value={inseminationForm.notes}
                          onChange={(e) => setInseminationForm({ ...inseminationForm, notes: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleAddInsemination} className="w-full bg-green-600 hover:bg-green-700 text-white">
                        Registrar Inseminação
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="mb-4">
                <Input
                  placeholder="Pesquisar inseminações..."
                  value={inseminationSearch}
                  onChange={(e) => setInseminationSearch(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Animal</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Protocolo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Touro</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Veterinário</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInseminations.map((i) => (
                      <tr key={i.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-semibold text-gray-800">{i.animalName}</td>
                        <td className="px-4 py-2 text-gray-600">{i.date}</td>
                        <td className="px-4 py-2 text-gray-600">{i.protocol}</td>
                        <td className="px-4 py-2 text-gray-600">{i.semenBull}</td>
                        <td className="px-4 py-2 text-gray-600">{i.veterinarian}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            i.result === 'Prenhe' ? 'bg-green-100 text-green-800' :
                            i.result === 'Não Prenhe' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {i.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
