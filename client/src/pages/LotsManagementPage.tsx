import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Eye, ArrowRight } from 'lucide-react';
import { animalsList } from '@/lib/data';

interface Lot {
  id: string;
  name: string;
  subdivision: string;
  capacity: number;
  currentAnimals: number;
  description: string;
  createdDate: string;
  status: 'Ativo' | 'Inativo' | 'Manutenção';
}

const initialLots: Lot[] = [
  { id: '1', name: 'Lote Vacas', subdivision: 'Pasto Norte', capacity: 100, currentAnimals: 85, description: 'Lote de vacas em lactação', createdDate: '01/01/2026', status: 'Ativo' },
  { id: '2', name: 'Lote Bezerros (as)', subdivision: 'Pasto Sul', capacity: 80, currentAnimals: 62, description: 'Bezerros até 12 meses', createdDate: '15/01/2026', status: 'Ativo' },
  { id: '3', name: 'Lote Engorda', subdivision: 'Confinamento', capacity: 150, currentAnimals: 120, description: 'Animais em engorda', createdDate: '20/01/2026', status: 'Ativo' },
  { id: '4', name: 'Lote Recria', subdivision: 'Pasto Leste', capacity: 120, currentAnimals: 95, description: 'Recria de novilhos', createdDate: '10/02/2026', status: 'Ativo' },
  { id: '5', name: 'Lote Novilhas', subdivision: 'Pasto Oeste', capacity: 100, currentAnimals: 78, description: 'Novilhas da estação', createdDate: '25/02/2026', status: 'Ativo' },
];

export const LotsManagementPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const [lots, setLots] = useState<Lot[]>(initialLots);
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [formData, setFormData] = useState({ name: '', subdivision: '', capacity: '', description: '', status: 'Ativo' });
  const [moveData, setMoveData] = useState({ fromLot: '', toLot: '', quantity: '', animalId: '' });

  const filtered = useMemo(() => {
    if (!search.trim()) return lots;
    const q = search.toLowerCase();
    return lots.filter(l => l.name.toLowerCase().includes(q) || l.subdivision.toLowerCase().includes(q));
  }, [search, lots]);

  const handleCreateLot = () => {
    if (!formData.name || !formData.subdivision || !formData.capacity) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    const newLot: Lot = {
      id: String(lots.length + 1),
      name: formData.name,
      subdivision: formData.subdivision,
      capacity: parseInt(formData.capacity),
      currentAnimals: 0,
      description: formData.description,
      createdDate: new Date().toLocaleDateString('pt-BR'),
      status: formData.status as 'Ativo' | 'Inativo' | 'Manutenção',
    };
    setLots([...lots, newLot]);
    setFormData({ name: '', subdivision: '', capacity: '', description: '', status: 'Ativo' });
    setIsCreateOpen(false);
    toast.success('Lote criado com sucesso!');
  };

  const handleEditLot = () => {
    if (!selectedLot || !formData.name || !formData.subdivision || !formData.capacity) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setLots(lots.map(l => l.id === selectedLot.id ? {
      ...l,
      name: formData.name,
      subdivision: formData.subdivision,
      capacity: parseInt(formData.capacity),
      description: formData.description,
      status: formData.status as 'Ativo' | 'Inativo' | 'Manutenção',
    } : l));
    setFormData({ name: '', subdivision: '', capacity: '', description: '', status: 'Ativo' });
    setSelectedLot(null);
    setIsEditOpen(false);
    toast.success('Lote atualizado com sucesso!');
  };

  const handleDeleteLot = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este lote?')) {
      setLots(lots.filter(l => l.id !== id));
      toast.success('Lote deletado com sucesso!');
    }
  };

  const handleMoveLot = () => {
    if (!moveData.fromLot || !moveData.toLot || !moveData.quantity) {
      toast.error('Preencha todos os campos');
      return;
    }
    const quantity = parseInt(moveData.quantity);
    const fromLot = lots.find(l => l.id === moveData.fromLot);
    const toLot = lots.find(l => l.id === moveData.toLot);

    if (!fromLot || !toLot) {
      toast.error('Lotes não encontrados');
      return;
    }

    if (fromLot.currentAnimals < quantity) {
      toast.error('Quantidade insuficiente de animais no lote de origem');
      return;
    }

    if (toLot.currentAnimals + quantity > toLot.capacity) {
      toast.error('Capacidade do lote de destino insuficiente');
      return;
    }

    setLots(lots.map(l => {
      if (l.id === moveData.fromLot) return { ...l, currentAnimals: l.currentAnimals - quantity };
      if (l.id === moveData.toLot) return { ...l, currentAnimals: l.currentAnimals + quantity };
      return l;
    }));

    setMoveData({ fromLot: '', toLot: '', quantity: '', animalId: '' });
    setIsMoveOpen(false);
    toast.success(`${quantity} animal(is) movido(s) com sucesso!`);
  };

  const openEditDialog = (lot: Lot) => {
    setSelectedLot(lot);
    setFormData({
      name: lot.name,
      subdivision: lot.subdivision,
      capacity: String(lot.capacity),
      description: lot.description,
      status: lot.status,
    });
    setIsEditOpen(true);
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Gerenciamento de Lotes</h1>
          <div className="flex items-center gap-2">
            <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  Mover Animais
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mover Animais Entre Lotes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Lote de Origem</Label>
                    <Select value={moveData.fromLot} onValueChange={(v) => setMoveData({ ...moveData, fromLot: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o lote de origem" />
                      </SelectTrigger>
                      <SelectContent>
                        {lots.map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name} ({l.currentAnimals}/{l.capacity})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lote de Destino</Label>
                    <Select value={moveData.toLot} onValueChange={(v) => setMoveData({ ...moveData, toLot: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o lote de destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {lots.filter(l => l.id !== moveData.fromLot).map(l => (
                          <SelectItem key={l.id} value={l.id}>{l.name} ({l.currentAnimals}/{l.capacity})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantidade de Animais</Label>
                    <Input
                      type="number"
                      placeholder="Quantidade"
                      value={moveData.quantity}
                      onChange={(e) => setMoveData({ ...moveData, quantity: e.target.value })}
                      min="1"
                    />
                  </div>
                  <Button onClick={handleMoveLot} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Mover Animais
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Novo Lote
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Lote</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome do Lote *</Label>
                    <Input
                      placeholder="Ex: Lote Engorda"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Subdivisão *</Label>
                    <Input
                      placeholder="Ex: Confinamento"
                      value={formData.subdivision}
                      onChange={(e) => setFormData({ ...formData, subdivision: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Capacidade *</Label>
                    <Input
                      type="number"
                      placeholder="Capacidade máxima"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input
                      placeholder="Descrição do lote"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Ativo">Ativo</SelectItem>
                        <SelectItem value="Inativo">Inativo</SelectItem>
                        <SelectItem value="Manutenção">Manutenção</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateLot} className="w-full bg-green-600 hover:bg-green-700 text-white">
                    Criar Lote
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            placeholder="Pesquisar lotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Lots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(lot => (
            <Card key={lot.id} className="p-5 hover:shadow-lg transition-shadow">
              <div className="mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-800">{lot.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    lot.status === 'Ativo' ? 'bg-green-100 text-green-800' :
                    lot.status === 'Inativo' ? 'bg-gray-100 text-gray-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {lot.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{lot.subdivision}</p>
              </div>

              <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Animais:</span>
                  <span className="font-semibold text-gray-800">{lot.currentAnimals}/{lot.capacity}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${(lot.currentAnimals / lot.capacity) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">{Math.round((lot.currentAnimals / lot.capacity) * 100)}% utilizado</p>
              </div>

              {lot.description && (
                <p className="text-sm text-gray-600 mb-4">{lot.description}</p>
              )}

              <p className="text-xs text-gray-500 mb-4">Criado em: {lot.createdDate}</p>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setLocation(`/rebanho/lotes/${lot.id}`)}
                  className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm"
                  size="sm"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Ver Animais
                </Button>
                <Button
                  onClick={() => openEditDialog(lot)}
                  className="flex-1 bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm"
                  size="sm"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Editar
                </Button>
                <Button
                  onClick={() => handleDeleteLot(lot.id)}
                  className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm"
                  size="sm"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Deletar
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filtered.length === 0 && (
          <Card className="p-12 text-center">
            <p className="text-gray-500">Nenhum lote encontrado</p>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Lote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome do Lote *</Label>
                <Input
                  placeholder="Ex: Lote Engorda"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Subdivisão *</Label>
                <Input
                  placeholder="Ex: Confinamento"
                  value={formData.subdivision}
                  onChange={(e) => setFormData({ ...formData, subdivision: e.target.value })}
                />
              </div>
              <div>
                <Label>Capacidade *</Label>
                <Input
                  type="number"
                  placeholder="Capacidade máxima"
                  value={formData.capacity}
                  onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                  min="1"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  placeholder="Descrição do lote"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                    <SelectItem value="Manutenção">Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleEditLot} className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                Atualizar Lote
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};
