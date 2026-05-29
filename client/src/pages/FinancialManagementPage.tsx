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
import { Plus, Trash2, Edit2, Download, Upload, TrendingUp, TrendingDown, Wallet, Users } from 'lucide-react';

interface Account {
  id: string;
  name: string;
  bank: string;
  accountNumber: string;
  balance: number;
  type: 'Corrente' | 'Poupança' | 'Aplicação';
  status: 'Ativo' | 'Inativo';
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: 'Entrada' | 'Saída';
  amount: number;
  account: string;
  person?: string;
  notes: string;
}

interface Category {
  id: string;
  name: string;
  type: 'Entrada' | 'Saída';
  color: string;
}

interface Person {
  id: string;
  name: string;
  type: 'Fornecedor' | 'Cliente' | 'Funcionário' | 'Outro';
  email: string;
  phone: string;
  cpfCnpj: string;
}

const initialAccounts: Account[] = [
  { id: '1', name: 'Conta Principal', bank: 'Banco do Brasil', accountNumber: '12345-6', balance: 45250.75, type: 'Corrente', status: 'Ativo' },
  { id: '2', name: 'Conta Poupança', bank: 'Caixa Econômica', accountNumber: '98765-4', balance: 125000.00, type: 'Poupança', status: 'Ativo' },
  { id: '3', name: 'Aplicação CDB', bank: 'Bradesco', accountNumber: '55555-5', balance: 250000.00, type: 'Aplicação', status: 'Ativo' },
];

const initialCategories: Category[] = [
  { id: '1', name: 'Venda de Gado', type: 'Entrada', color: 'bg-green-100 text-green-800' },
  { id: '2', name: 'Venda de Leite', type: 'Entrada', color: 'bg-blue-100 text-blue-800' },
  { id: '3', name: 'Alimentação', type: 'Saída', color: 'bg-red-100 text-red-800' },
  { id: '4', name: 'Medicamentos', type: 'Saída', color: 'bg-orange-100 text-orange-800' },
  { id: '5', name: 'Manutenção', type: 'Saída', color: 'bg-yellow-100 text-yellow-800' },
  { id: '6', name: 'Salários', type: 'Saída', color: 'bg-purple-100 text-purple-800' },
];

const initialPeople: Person[] = [
  { id: '1', name: 'João Silva', type: 'Fornecedor', email: 'joao@example.com', phone: '11999999999', cpfCnpj: '12345678901234' },
  { id: '2', name: 'Maria Santos', type: 'Cliente', email: 'maria@example.com', phone: '11988888888', cpfCnpj: '98765432109876' },
  { id: '3', name: 'Pedro Oliveira', type: 'Funcionário', email: 'pedro@example.com', phone: '11977777777', cpfCnpj: '11122233344' },
];

const initialTransactions: Transaction[] = [
  { id: '1', date: '29/05/2026', description: 'Venda de 10 cabeças de gado', category: 'Venda de Gado', type: 'Entrada', amount: 35000, account: 'Conta Principal', person: 'Maria Santos', notes: 'Lote de novilhos' },
  { id: '2', date: '28/05/2026', description: 'Compra de ração', category: 'Alimentação', type: 'Saída', amount: 5200, account: 'Conta Principal', person: 'João Silva', notes: 'Ração para 100 animais' },
  { id: '3', date: '27/05/2026', description: 'Pagamento de salários', category: 'Salários', type: 'Saída', amount: 12000, account: 'Conta Principal', person: 'Pedro Oliveira', notes: 'Folha de maio' },
  { id: '4', date: '26/05/2026', description: 'Venda de leite', category: 'Venda de Leite', type: 'Entrada', amount: 8500, account: 'Conta Poupança', notes: 'Venda de 2000L' },
];

export const FinancialManagementPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [categories] = useState<Category[]>(initialCategories);
  const [people, setPeople] = useState<Person[]>(initialPeople);

  const [transactionSearch, setTransactionSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'Entrada' | 'Saída' | ''>('');

  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);

  const [transactionForm, setTransactionForm] = useState({
    date: '',
    description: '',
    category: '',
    type: 'Entrada' as 'Entrada' | 'Saída',
    amount: '',
    account: '',
    person: '',
    notes: '',
  });

  const [accountForm, setAccountForm] = useState({
    name: '',
    bank: '',
    accountNumber: '',
    balance: '',
    type: 'Corrente' as 'Corrente' | 'Poupança' | 'Aplicação',
  });

  const [personForm, setPersonForm] = useState({
    name: '',
    type: 'Fornecedor' as 'Fornecedor' | 'Cliente' | 'Funcionário' | 'Outro',
    email: '',
    phone: '',
    cpfCnpj: '',
  });

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (transactionSearch.trim()) {
      const q = transactionSearch.toLowerCase();
      result = result.filter(t => t.description.toLowerCase().includes(q) || t.person?.toLowerCase().includes(q));
    }

    if (selectedAccount) {
      result = result.filter(t => t.account === selectedAccount);
    }

    if (selectedType) {
      result = result.filter(t => t.type === selectedType);
    }

    return result;
  }, [transactionSearch, selectedAccount, selectedType, transactions]);

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalIncome = transactions.filter(t => t.type === 'Entrada').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.amount, 0);

  const handleAddTransaction = () => {
    if (!transactionForm.date || !transactionForm.description || !transactionForm.category || !transactionForm.amount || !transactionForm.account) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const newTransaction: Transaction = {
      id: String(transactions.length + 1),
      date: transactionForm.date,
      description: transactionForm.description,
      category: transactionForm.category,
      type: transactionForm.type,
      amount: parseFloat(transactionForm.amount),
      account: transactionForm.account,
      person: transactionForm.person,
      notes: transactionForm.notes,
    };

    setTransactions([...transactions, newTransaction]);

    // Update account balance
    setAccounts(accounts.map(a => {
      if (a.id === transactionForm.account) {
        const newBalance = transactionForm.type === 'Entrada'
          ? a.balance + parseFloat(transactionForm.amount)
          : a.balance - parseFloat(transactionForm.amount);
        return { ...a, balance: newBalance };
      }
      return a;
    }));

    setTransactionForm({
      date: '',
      description: '',
      category: '',
      type: 'Entrada',
      amount: '',
      account: '',
      person: '',
      notes: '',
    });
    setIsAddTransactionOpen(false);
    toast.success('Transação registrada com sucesso!');
  };

  const handleAddAccount = () => {
    if (!accountForm.name || !accountForm.bank || !accountForm.accountNumber || !accountForm.balance) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const newAccount: Account = {
      id: String(accounts.length + 1),
      name: accountForm.name,
      bank: accountForm.bank,
      accountNumber: accountForm.accountNumber,
      balance: parseFloat(accountForm.balance),
      type: accountForm.type,
      status: 'Ativo',
    };

    setAccounts([...accounts, newAccount]);
    setAccountForm({ name: '', bank: '', accountNumber: '', balance: '', type: 'Corrente' });
    setIsAddAccountOpen(false);
    toast.success('Conta adicionada com sucesso!');
  };

  const handleAddPerson = () => {
    if (!personForm.name || !personForm.email || !personForm.cpfCnpj) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const newPerson: Person = {
      id: String(people.length + 1),
      name: personForm.name,
      type: personForm.type,
      email: personForm.email,
      phone: personForm.phone,
      cpfCnpj: personForm.cpfCnpj,
    };

    setPeople([...people, newPerson]);
    setPersonForm({ name: '', type: 'Fornecedor', email: '', phone: '', cpfCnpj: '' });
    setIsAddPersonOpen(false);
    toast.success('Pessoa adicionada com sucesso!');
  };

  const handleDeleteTransaction = (id: string) => {
    if (confirm('Tem certeza que deseja deletar esta transação?')) {
      setTransactions(transactions.filter(t => t.id !== id));
      toast.success('Transação deletada com sucesso!');
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Gerenciamento Financeiro</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm text-gray-600">Saldo Total</p>
            <p className="text-3xl font-bold text-blue-600">R$ {totalBalance.toFixed(2)}</p>
            <p className="text-xs text-gray-500">{accounts.length} contas</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Receitas
            </p>
            <p className="text-3xl font-bold text-green-600">R$ {totalIncome.toFixed(2)}</p>
            <p className="text-xs text-gray-500">{transactions.filter(t => t.type === 'Entrada').length} transações</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              Despesas
            </p>
            <p className="text-3xl font-bold text-red-600">R$ {totalExpense.toFixed(2)}</p>
            <p className="text-xs text-gray-500">{transactions.filter(t => t.type === 'Saída').length} transações</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm text-gray-600">Resultado</p>
            <p className={`text-3xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              R$ {(totalIncome - totalExpense).toFixed(2)}
            </p>
            <p className="text-xs text-gray-500">Receita - Despesa</p>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="transactions" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="transactions">Transações</TabsTrigger>
            <TabsTrigger value="accounts">Contas</TabsTrigger>
            <TabsTrigger value="people">Pessoas</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800">Movimentações Financeiras</h2>
                <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Nova Transação
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Registrar Nova Transação</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Data *</Label>
                        <Input
                          type="date"
                          value={transactionForm.date}
                          onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Descrição *</Label>
                        <Input
                          placeholder="Ex: Venda de gado"
                          value={transactionForm.description}
                          onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Tipo *</Label>
                        <Select value={transactionForm.type} onValueChange={(v) => setTransactionForm({ ...transactionForm, type: v as 'Entrada' | 'Saída' })}>
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
                        <Label>Categoria *</Label>
                        <Select value={transactionForm.category} onValueChange={(v) => setTransactionForm({ ...transactionForm, category: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a categoria" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.filter(c => c.type === transactionForm.type).map(c => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Valor *</Label>
                        <Input
                          type="number"
                          placeholder="R$"
                          value={transactionForm.amount}
                          onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label>Conta *</Label>
                        <Select value={transactionForm.account} onValueChange={(v) => setTransactionForm({ ...transactionForm, account: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a conta" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Pessoa</Label>
                        <Select value={transactionForm.person} onValueChange={(v) => setTransactionForm({ ...transactionForm, person: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a pessoa (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            {people.map(p => (
                              <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Input
                          placeholder="Observações"
                          value={transactionForm.notes}
                          onChange={(e) => setTransactionForm({ ...transactionForm, notes: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleAddTransaction} className="w-full bg-green-600 hover:bg-green-700 text-white">
                        Registrar Transação
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Input
                  placeholder="Pesquisar..."
                  value={transactionSearch}
                  onChange={(e) => setTransactionSearch(e.target.value)}
                />
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as contas</SelectItem>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as 'Entrada' | 'Saída' | '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os tipos</SelectItem>
                    <SelectItem value="Entrada">Entradas</SelectItem>
                    <SelectItem value="Saída">Saídas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Descrição</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Categoria</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Conta</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Valor</th>
                      <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((t) => (
                      <tr key={t.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600">{t.date}</td>
                        <td className="px-4 py-2 font-semibold text-gray-800">{t.description}</td>
                        <td className="px-4 py-2 text-gray-600">{t.category}</td>
                        <td className="px-4 py-2 text-gray-600">{t.account}</td>
                        <td className={`px-4 py-2 text-right font-semibold ${t.type === 'Entrada' ? 'text-green-600' : 'text-red-600'}`}>
                          {t.type === 'Entrada' ? '+' : '-'} R$ {t.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button onClick={() => handleDeleteTransaction(t.id)} className="text-red-600 hover:text-red-800">
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

          {/* Accounts Tab */}
          <TabsContent value="accounts">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-blue-600" />
                  Contas Bancárias
                </h2>
                <Dialog open={isAddAccountOpen} onOpenChange={setIsAddAccountOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Nova Conta
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Nova Conta</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome da Conta *</Label>
                        <Input
                          placeholder="Ex: Conta Principal"
                          value={accountForm.name}
                          onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Banco *</Label>
                        <Input
                          placeholder="Ex: Banco do Brasil"
                          value={accountForm.bank}
                          onChange={(e) => setAccountForm({ ...accountForm, bank: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Número da Conta *</Label>
                        <Input
                          placeholder="Ex: 12345-6"
                          value={accountForm.accountNumber}
                          onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Saldo Inicial *</Label>
                        <Input
                          type="number"
                          placeholder="R$"
                          value={accountForm.balance}
                          onChange={(e) => setAccountForm({ ...accountForm, balance: e.target.value })}
                          step="0.01"
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select value={accountForm.type} onValueChange={(v) => setAccountForm({ ...accountForm, type: v as 'Corrente' | 'Poupança' | 'Aplicação' })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Corrente">Corrente</SelectItem>
                            <SelectItem value="Poupança">Poupança</SelectItem>
                            <SelectItem value="Aplicação">Aplicação</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddAccount} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        Adicionar Conta
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map((a) => (
                  <Card key={a.id} className="p-4 border-l-4 border-blue-600">
                    <h3 className="font-bold text-gray-800 mb-1">{a.name}</h3>
                    <p className="text-sm text-gray-600 mb-3">{a.bank} - {a.accountNumber}</p>
                    <div className="space-y-2 p-3 bg-gray-50 rounded mb-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tipo:</span>
                        <span className="font-semibold">{a.type}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Saldo:</span>
                        <span className="font-bold text-blue-600">R$ {a.balance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Status:</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${a.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {a.status}
                        </span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* People Tab */}
          <TabsContent value="people">
            <Card className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  Pessoas
                </h2>
                <Dialog open={isAddPersonOpen} onOpenChange={setIsAddPersonOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Nova Pessoa
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Nova Pessoa</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Nome *</Label>
                        <Input
                          placeholder="Nome completo"
                          value={personForm.name}
                          onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Tipo</Label>
                        <Select value={personForm.type} onValueChange={(v) => setPersonForm({ ...personForm, type: v as 'Fornecedor' | 'Cliente' | 'Funcionário' | 'Outro' })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Fornecedor">Fornecedor</SelectItem>
                            <SelectItem value="Cliente">Cliente</SelectItem>
                            <SelectItem value="Funcionário">Funcionário</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={personForm.email}
                          onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Telefone</Label>
                        <Input
                          placeholder="11999999999"
                          value={personForm.phone}
                          onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>CPF/CNPJ *</Label>
                        <Input
                          placeholder="12345678901234"
                          value={personForm.cpfCnpj}
                          onChange={(e) => setPersonForm({ ...personForm, cpfCnpj: e.target.value })}
                        />
                      </div>
                      <Button onClick={handleAddPerson} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                        Adicionar Pessoa
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Nome</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Email</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Telefone</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">CPF/CNPJ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-semibold text-gray-800">{p.name}</td>
                        <td className="px-4 py-2 text-gray-600">{p.type}</td>
                        <td className="px-4 py-2 text-gray-600">{p.email}</td>
                        <td className="px-4 py-2 text-gray-600">{p.phone}</td>
                        <td className="px-4 py-2 text-gray-600">{p.cpfCnpj}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Categorias</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((c) => (
                  <Card key={c.id} className={`p-4 ${c.color}`}>
                    <h3 className="font-bold mb-2">{c.name}</h3>
                    <p className="text-sm opacity-75">{c.type}</p>
                  </Card>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
