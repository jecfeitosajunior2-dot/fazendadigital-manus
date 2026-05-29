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
import { Plus, Trash2, Edit2, AlertTriangle, Package, TrendingDown, TrendingUp } from 'lucide-react';

interface Supply {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minimumQuantity: number;
  unitPrice: number;
  supplier: string;
  lastPurchaseDate: string;
  expiryDate: string;
  notes: string;
}

interface SupplyMovement {
  id: string;
  date: string;
  supplyId: string;
  supplyName: string;
  type: 'Entrada' | 'Saída';
  quantity: number;
  reason: string;
  responsiblePerson: string;
  notes: string;
}

const initialSupplies: Supply[] = [
  { id: '1', name: 'Ração Premium', category: 'Alimentação', unit: 'kg', quantity: 2500, minimumQuantity: 1000, unitPrice: 2.50, supplier: 'Agropecuária Silva', lastPurchaseDate: '20/05/2026', expiryDate: '20/08/2026', notes: 'Ração para engorda' },
  { id: '2', name: 'Sal Mineral', category: 'Suplementação', unit: 'kg', quantity: 450, minimumQuantity: 300, unitPrice: 8.00, supplier: 'Nutrição Animal', lastPurchaseDate: '15/05/2026', expiryDate: '15/11/2026', notes: 'Sal com micronutrientes' },
  { id: '3', name: 'Vacina Aftosa', category: 'Medicamentos', unit: 'dose', quantity: 150, minimumQuantity: 200, unitPrice: 45.00, supplier: 'Laboratório Veterinário', lastPurchaseDate: '10/05/2026', expiryDate: '10/08/2026', notes: 'Vacina obrigatória' },
  { id: '4', name: 'Antibiótico Injetável', category: 'Medicamentos', unit: 'frasco', quantity: 85, minimumQuantity: 100, unitPrice: 120.00, supplier: 'Laboratório Veterinário', lastPurchaseDate: '18/05/2026', expiryDate: '18/06/2027', notes: 'Para infecções bacterianas' },
  { id: '5', name: 'Silagem', category: 'Alimentação', unit: 'tonelada', quantity: 45, minimumQuantity: 30, unitPrice: 350.00, supplier: 'Fazenda Modelo', lastPurchaseDate: '01/05/2026', expiryDate: '01/12/2026', notes: 'Silagem de milho' },
  { id: '6', name: 'Vermífugo', category: 'Medicamentos', unit: 'litro', quantity: 25, minimumQuantity: 50, unitPrice: 85.00, supplier: 'Laboratório Veterinário', lastPurchaseDate: '12/05/2026', expiryDate: '12/05/2027', notes: 'Vermífugo para bovinos' },
  { id: '7', name: 'Calcário', category: 'Suplementação', unit: 'tonelada', quantity: 8, minimumQuantity: 5, unitPrice: 150.00, supplier: 'Mineradora Local', lastPurchaseDate: '25/04/2026', expiryDate: '25/12/2026', notes: 'Calcário agrícola' },
  { id: '8', name: 'Sêmen Congelado', category: 'Reprodução', unit: 'dose', quantity: 320, minimumQuantity: 200, unitPrice: 85.00, supplier: 'Banco de Sêmen', lastPurchaseDate: '01/05/2026', expiryDate: '01/05/2031', notes: 'Sêmen de touros selecionados' },
];

const initialMovements: SupplyMovement[] = [
  { id: '1', date: '28/05/2026', supplyId: '1', supplyName: 'Ração Premium', type: 'Saída', quantity: 200, reason: 'Alimentação diária', responsiblePerson: 'João Silva', notes: 'Fornecimento para lote de engorda' },
  { id: '2', date: '27/05/2026', supplyId: '2', supplyName: 'Sal Mineral', type: 'Saída', quantity: 50, reason: 'Alimentação diária', responsiblePerson: 'Maria Santos', notes: 'Distribuição nos cochos' },
  { id: '3', date: '26/05/2026', supplyId: '3', supplyName: 'Vacina Aftosa', type: 'Saída', quantity: 100, reason: 'Vacinação em massa', responsiblePerson: 'Dr. Carlos', notes: 'Vacinação de 100 animais' },
  { id: '4', date: '25/05/2026', supplyId: '1', supplyName: 'Ração Premium', type: 'Entrada', quantity: 500, reason: 'Compra', responsiblePerson: 'Gerente', notes: 'Compra de 500kg' },
];

export const SuppliesManagementPage: React.FC = () => {
  const [supplies, setSupplies] = useState<Supply[]>(initialSupplies);
  const [movements, setMovements] = useState<SupplyMovement[]>(initialMovements);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isAddSupplyOpen, setIsAddSupplyOpen] = useState(false);
  const [isAddMovementOpen, setIsAddMovementOpen] = useState(false);

  const [supplyForm, setSupplyForm] = useState({
    name: '',
    category: '',
    unit: '',
    quantity: '',
    minimumQuantity: '',
    unitPrice: '',
    supplier: '',
    lastPurchaseDate: '',
    expiryDate: '',
    notes: '',
  });

  const [movementForm, setMovementForm] = useState({
    date: '',
    supplyId: '',
    type: 'Saída' as 'Entrada' | 'Saída',
    quantity: '',
    reason: '',
    responsiblePerson: '',
    notes: '',
  });

  const categories = ['Alimentação', 'Medicamentos', 'Suplementação', 'Reprodução', 'Higiene'];

  const filteredSupplies = useMemo(() => {
    let result = supplies;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(q) || s.supplier.toLowerCase().includes(q));
    }

    if (selectedCategory) {
      result = result.filter(s => s.category === selectedCategory);
    }

    return result;
  }, [searchTerm, selectedCategory, supplies]);

  const alertSupplies = supplies.filter(s => s.quantity <= s.minimumQuantity);
  const totalValue = supplies.reduce((sum, s) => sum + (s.quantity * s.unitPrice), 0);
  const lowStockValue = alertSupplies.reduce((sum, s) => sum + (s.quantity * s.unitPrice), 0);

  const handleAddSupply = () => {
    if (!supplyForm.name || !supplyForm.category || !supplyForm.unit || !supplyForm.quantity || !supplyForm.minimumQuantity) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const newSupply: Supply = {
      id: String(supplies.length + 1),
      name: supplyForm.name,
      category: supplyForm.category,
      unit: supplyForm.unit,
      quantity: parseFloat(supplyForm.quantity),
      minimumQuantity: parseFloat(supplyForm.minimumQuantity),
      unitPrice: parseFloat(supplyForm.unitPrice),
      supplier: supplyForm.supplier,
      lastPurchaseDate: supplyForm.lastPurchaseDate,
      expiryDate: supplyForm.expiryDate,
      notes: supplyForm.notes,
    };

    setSupplies([...supplies, newSupply]);
    setSupplyForm({
      name: '',
      category: '',
      unit: '',
      quantity: '',
      minimumQuantity: '',
      unitPrice: '',
      supplier: '',
      lastPurchaseDate: '',
      expiryDate: '',
      notes: '',
    });
    setIsAddSupplyOpen(false);
    toast.success('Insumo adicionado com sucesso!');
  };

  const handleAddMovement = () => {
    if (!movementForm.date || !movementForm.supplyId || !movementForm.quantity || !movementForm.reason) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const supply = supplies.find(s => s.id === movementForm.supplyId);
    if (!supply) {
      toast.error('Insumo não encontrado');
      return;
    }

    const newMovement: SupplyMovement = {
      id: String(movements.length + 1),
      date: movementForm.date,
      supplyId: movementForm.supplyId,
      supplyName: supply.name,
      type: movementForm.type,
      quantity: parseFloat(movementForm.quantity),
      reason: movementForm.reason,
      responsiblePerson: movementForm.responsiblePerson,
      notes: movementForm.notes,
    };

    setMovements([...movements, newMovement]);

    // Update supply quantity
    setSupplies(supplies.map(s => {
      if (s.id === movementForm.supplyId) {
        const newQuantity = movementForm.type === 'Entrada'
          ? s.quantity + parseFloat(movementForm.quantity)
          : s.quantity - parseFloat(movementForm.quantity);
        return { ...s, quantity: newQuantity };
      }
      return s;
    }));

    setMovementForm({
      date: '',
      supplyId: '',
      type: 'Saída',
      quantity: '',
      reason: '',
      responsiblePerson: '',
      notes: '',
    });
    setIsAddMovementOpen(false);
    toast.success('Movimentação registrada com sucesso!');
  };

  const handleDeleteSupply = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este insumo?')) {
      setSupplies(supplies.filter(s => s.id !== id));
      toast.success('Insumo deletado com sucesso!');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento de Insumos</h1>

        {/* Alert Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm text-gray-600">Total de Insumos</p>
            <p className="text-3xl font-bold text-blue-600">{supplies.length}</p>
            <p className="text-xs text-gray-500">Produtos cadastrados</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  Estoque Baixo
                </p>
                <p className="text-3xl font-bold text-red-600">{alertSupplies.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm text-gray-600">Valor Total em Estoque</p>
            <p className="text-2xl font-bold text-purple-600">R$ {totalValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Todos os insumos</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <p className="text-sm text-gray-600">Valor em Alerta</p>
            <p className="text-2xl font-bold text-orange-600">R$ {lowStockValue.toFixed(2)}</p>
            <p className="text-xs text-gray-500">Estoque baixo</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="stock" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="stock">Estoque</TabsTrigger>
            <TabsTrigger value="movements">Movimentações</TabsTrigger>
            <TabsTrigger value="alerts">Alertas</TabsTrigger>
          </TabsList>

          {/* Stock Tab */}
          <TabsContent value="stock">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Estoque de Insumos</h2>
                <Dialog open={isAddSupplyOpen} onOpenChange={setIsAddSupplyOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Novo Insumo
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Adicionar Novo Insumo</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome do Insumo *</Label>
                        <Input
                          placeholder="Ex: Ração Premium"
                          value={supplyForm.name}
                          onChange={(e) => setSupplyForm({ ...supplyForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Categoria *</Label>
                        <Select value={supplyForm.category} onValueChange={(v) => setSupplyForm({ ...supplyForm, category: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Unidade *</Label>
                        <Input
                          placeholder="Ex: kg, litro, dose"
                          value={supplyForm.unit}
                          onChange={(e) => setSupplyForm({ ...supplyForm, unit: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Quantidade *</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={supplyForm.quantity}
                            onChange={(e) => setSupplyForm({ ...supplyForm, quantity: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Quantidade Mínima *</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={supplyForm.minimumQuantity}
                            onChange={(e) => setSupplyForm({ ...supplyForm, minimumQuantity: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Preço Unitário</Label>
                        <Input
                          type="number"
                          placeholder="R$"
                          value={supplyForm.unitPrice}
                          onChange={(e) => setSupplyForm({ ...supplyForm, unitPrice: e.target.value })}
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label>Fornecedor</Label>
                        <Input
                          placeholder="Nome do fornecedor"
                          value={supplyForm.supplier}
                          onChange={(e) => setSupplyForm({ ...supplyForm, supplier: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Data Última Compra</Label>
                          <Input
                            type="date"
                            value={supplyForm.lastPurchaseDate}
                            onChange={(e) => setSupplyForm({ ...supplyForm, lastPurchaseDate: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label>Data Validade</Label>
                          <Input
                            type="date"
                            value={supplyForm.expiryDate}
                            onChange={(e) => setSupplyForm({ ...supplyForm, expiryDate: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          placeholder="Observações"
                          value={supplyForm.notes}
                          onChange={(e) => setSupplyForm({ ...supplyForm, notes: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleAddSupply} className="w-full bg-green-600 hover:bg-green-700 text-white">
                        Adicionar Insumo
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Input
                  placeholder="Pesquisar insumo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as categorias</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Nome</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Categoria</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Qtd</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Mín</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Valor</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Fornecedor</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSupplies.map((s) => (
                      <tr key={s.id} className={`border-b hover:bg-gray-50 ${s.quantity <= s.minimumQuantity ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-2 font-semibold text-gray-800">{s.name}</td>
                        <td className="px-4 py-2 text-gray-600">{s.category}</td>
                        <td className="px-4 py-2 text-center font-semibold">{s.quantity} {s.unit}</td>
                        <td className="px-4 py-2 text-center text-gray-600">{s.minimumQuantity} {s.unit}</td>
                        <td className="px-4 py-2 text-right text-gray-600">R$ {(s.quantity * s.unitPrice).toFixed(2)}</td>
                        <td className="px-4 py-2 text-gray-600">{s.supplier}</td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDeleteSupply(s.id)} className="text-red-600 hover:text-red-800">
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

          {/* Movements Tab */}
          <TabsContent value="movements">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Movimentações de Estoque</h2>
                <Dialog open={isAddMovementOpen} onOpenChange={setIsAddMovementOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Nova Movimentação
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Registrar Movimentação</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={movementForm.date}
                          onChange={(e) => setMovementForm({ ...movementForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Insumo *</Label>
                        <Select value={movementForm.supplyId} onValueChange={(v) => setMovementForm({ ...movementForm, supplyId: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o insumo" />
                          </SelectTrigger>
                          <SelectContent>
                            {supplies.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tipo *</Label>
                        <Select value={movementForm.type} onValueChange={(v) => setMovementForm({ ...movementForm, type: v as 'Entrada' | 'Saída' })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Entrada">Entrada</SelectItem>
                            <SelectItem value="Saída">Saída</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Quantidade *</Label>
                        <Input
                          type="number"
                          placeholder="0"
                          value={movementForm.quantity}
                          onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Motivo *</Label>
                        <Input
                          placeholder="Ex: Alimentação diária"
                          value={movementForm.reason}
                          onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Responsável</Label>
                        <Input
                          placeholder="Nome da pessoa"
                          value={movementForm.responsiblePerson}
                          onChange={(e) => setMovementForm({ ...movementForm, responsiblePerson: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          placeholder="Observações"
                          value={movementForm.notes}
                          onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleAddMovement} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        Registrar Movimentação
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Insumo</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Tipo</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Quantidade</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Motivo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600">{m.date}</td>
                        <td className="px-4 py-2 font-semibold text-gray-800">{m.supplyName}</td>
                        <td className={`px-4 py-2 text-center font-semibold ${m.type === 'Entrada' ? 'text-green-600' : 'text-red-600'}`}>
                          {m.type}
                        </td>
                        <td className="px-4 py-2 text-center">{m.quantity}</td>
                        <td className="px-4 py-2 text-gray-600">{m.reason}</td>
                        <td className="px-4 py-2 text-gray-600">{m.responsiblePerson}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Alertas de Estoque Baixo
              </h2>

              {alertSupplies.length === 0 ? (
                <p className="text-gray-600 text-center py-8">Nenhum alerta de estoque baixo no momento</p>
              ) : (
                <div className="space-y-4">
                  {alertSupplies.map((s) => (
                    <Card key={s.id} className="p-4 border-l-4 border-red-600 bg-red-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-800">{s.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">Categoria: {s.category}</p>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            <div>
                              <p className="text-xs text-gray-500">Quantidade Atual</p>
                              <p className="text-lg font-bold text-red-600">{s.quantity} {s.unit}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Quantidade Mínima</p>
                              <p className="text-lg font-bold text-orange-600">{s.minimumQuantity} {s.unit}</p>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">Fornecedor: {s.supplier}</p>
                        </div>
                        <Button className="bg-red-600 hover:bg-red-700 text-white">Comprar Agora</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
