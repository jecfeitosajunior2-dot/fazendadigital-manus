import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, Heart, Zap } from 'lucide-react';

const ManagerialReportData = [
  { month: 'Jan', revenue: 45000, expenses: 28000, profit: 17000 },
  { month: 'Fev', revenue: 52000, expenses: 31000, profit: 21000 },
  { month: 'Mar', revenue: 48000, expenses: 29000, profit: 19000 },
  { month: 'Abr', revenue: 61000, expenses: 35000, profit: 26000 },
  { month: 'Mai', revenue: 58000, expenses: 32000, profit: 26000 },
  { month: 'Jun', revenue: 65000, expenses: 38000, profit: 27000 },
];

const HerdAgeDistribution = [
  { name: '0-6 meses', value: 45, fill: '#3b82f6' },
  { name: '6-12 meses', value: 62, fill: '#8b5cf6' },
  { name: '1-2 anos', value: 85, fill: '#ec4899' },
  { name: '2-3 anos', value: 78, fill: '#f59e0b' },
  { name: '3+ anos', value: 95, fill: '#10b981' },
];

const ReproductiveMetrics = [
  { month: 'Jan', pregnancyRate: 65, birthRate: 42, mortalityRate: 3 },
  { month: 'Fev', pregnancyRate: 68, birthRate: 48, mortalityRate: 2 },
  { month: 'Mar', pregnancyRate: 72, birthRate: 52, mortalityRate: 2 },
  { month: 'Abr', pregnancyRate: 75, birthRate: 58, mortalityRate: 1 },
  { month: 'Mai', pregnancyRate: 78, birthRate: 62, mortalityRate: 1 },
  { month: 'Jun', pregnancyRate: 82, birthRate: 68, mortalityRate: 1 },
];

const OperationalMetrics = [
  { metric: 'Animais Ativos', value: 365, target: 350, percentage: 104 },
  { metric: 'Taxa de Lotação', value: 92, target: 85, percentage: 108 },
  { metric: 'Eficiência de Manejos', value: 88, target: 90, percentage: 98 },
  { metric: 'Disponibilidade de Insumos', value: 95, target: 95, percentage: 100 },
];

const SalesData = [
  { month: 'Jan', bezerros: 12, novilhos: 8, vacas: 5, total: 25 },
  { month: 'Fev', bezerros: 15, novilhos: 10, vacas: 6, total: 31 },
  { month: 'Mar', bezerros: 18, novilhos: 12, vacas: 7, total: 37 },
  { month: 'Abr', bezerros: 20, novilhos: 14, vacas: 8, total: 42 },
  { month: 'Mai', bezerros: 22, novilhos: 16, vacas: 9, total: 47 },
  { month: 'Jun', bezerros: 25, novilhos: 18, vacas: 10, total: 53 },
];

const EvolutionData = [
  { month: 'Jan', herdSize: 285, weight: 420, productivity: 65 },
  { month: 'Fev', herdSize: 298, weight: 425, productivity: 68 },
  { month: 'Mar', herdSize: 315, weight: 432, productivity: 72 },
  { month: 'Abr', herdSize: 328, weight: 438, productivity: 75 },
  { month: 'Mai', herdSize: 345, weight: 445, productivity: 78 },
  { month: 'Jun', herdSize: 365, weight: 452, productivity: 82 },
];

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

export const ReportsManagementPage: React.FC = () => {
  const [selectedMetric, setSelectedMetric] = useState('all');

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Relatórios e Análises</h1>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Receita Total</p>
                <p className="text-2xl font-bold text-blue-600">R$ 329.000</p>
                <p className="text-xs text-gray-500 mt-1">Últimos 6 meses</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-400 opacity-50" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Lucro Líquido</p>
                <p className="text-2xl font-bold text-green-600">R$ 136.000</p>
                <p className="text-xs text-gray-500 mt-1">+41% vs período anterior</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400 opacity-50" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Taxa de Prenhez</p>
                <p className="text-2xl font-bold text-purple-600">82%</p>
                <p className="text-xs text-gray-500 mt-1">Acima da meta (80%)</p>
              </div>
              <Heart className="w-8 h-8 text-purple-400 opacity-50" />
            </div>
          </Card>

          <Card className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Eficiência Operacional</p>
                <p className="text-2xl font-bold text-orange-600">92%</p>
                <p className="text-xs text-gray-500 mt-1">Muito bom</p>
              </div>
              <Activity className="w-8 h-8 text-orange-400 opacity-50" />
            </div>
          </Card>
        </div>

        {/* Reports Tabs */}
        <Tabs defaultValue="managerial" className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="managerial">Gerenciais</TabsTrigger>
            <TabsTrigger value="reproductive">Reprodutivos</TabsTrigger>
            <TabsTrigger value="operational">Operacionais</TabsTrigger>
            <TabsTrigger value="sales">Vendas</TabsTrigger>
            <TabsTrigger value="evolution">Evolução</TabsTrigger>
          </TabsList>

          {/* Managerial Reports */}
          <TabsContent value="managerial" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Receita, Despesa e Lucro (Últimos 6 Meses)</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={ManagerialReportData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#10b981" name="Receita" />
                  <Bar dataKey="expenses" fill="#ef4444" name="Despesa" />
                  <Bar dataKey="profit" fill="#3b82f6" name="Lucro" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Receita Média Mensal</p>
                <p className="text-2xl font-bold text-green-600">R$ 54.833</p>
                <p className="text-xs text-gray-500 mt-2">Crescimento de 8% vs mês anterior</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Despesa Média Mensal</p>
                <p className="text-2xl font-bold text-red-600">R$ 32.167</p>
                <p className="text-xs text-gray-500 mt-2">Redução de 2% vs mês anterior</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Margem de Lucro</p>
                <p className="text-2xl font-bold text-blue-600">41,4%</p>
                <p className="text-xs text-gray-500 mt-2">Acima da meta (40%)</p>
              </Card>
            </div>
          </TabsContent>

          {/* Reproductive Reports */}
          <TabsContent value="reproductive" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Distribuição do Rebanho por Idade</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={HerdAgeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {HerdAgeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Métricas Reprodutivas (Últimos 6 Meses)</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={ReproductiveMetrics}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="pregnancyRate" stroke="#10b981" name="Taxa de Prenhez %" strokeWidth={2} />
                  <Line type="monotone" dataKey="birthRate" stroke="#3b82f6" name="Taxa de Nascimento %" strokeWidth={2} />
                  <Line type="monotone" dataKey="mortalityRate" stroke="#ef4444" name="Taxa de Mortalidade %" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Taxa de Prenhez Média</p>
                <p className="text-2xl font-bold text-green-600">74,7%</p>
                <p className="text-xs text-gray-500 mt-2">Tendência crescente</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Taxa de Nascimento Média</p>
                <p className="text-2xl font-bold text-blue-600">55,0%</p>
                <p className="text-xs text-gray-500 mt-2">+30% vs 6 meses atrás</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Taxa de Mortalidade Média</p>
                <p className="text-2xl font-bold text-red-600">1,5%</p>
                <p className="text-xs text-gray-500 mt-2">Abaixo da meta (2%)</p>
              </Card>
            </div>
          </TabsContent>

          {/* Operational Reports */}
          <TabsContent value="operational" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Métricas Operacionais</h2>
              <div className="space-y-4">
                {OperationalMetrics.map((metric, index) => (
                  <div key={index} className="border-b pb-4 last:border-b-0">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-800">{metric.metric}</span>
                      <span className={`text-lg font-bold ${metric.percentage >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                        {metric.percentage}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <span>Atual: {metric.value}</span>
                      <span>|</span>
                      <span>Meta: {metric.target}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${metric.percentage >= 100 ? 'bg-green-600' : 'bg-orange-600'}`}
                        style={{ width: `${Math.min(metric.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-sm text-gray-600 mb-2">Eficiência Geral</p>
              <p className="text-3xl font-bold text-blue-600">95,3%</p>
              <p className="text-xs text-gray-500 mt-2">Excelente desempenho operacional</p>
            </Card>
          </TabsContent>

          {/* Sales Reports */}
          <TabsContent value="sales" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Vendas por Categoria (Últimos 6 Meses)</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={SalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="bezerros" fill="#3b82f6" name="Bezerros" />
                  <Bar dataKey="novilhos" fill="#8b5cf6" name="Novilhos" />
                  <Bar dataKey="vacas" fill="#ec4899" name="Vacas" />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Total de Vendas</p>
                <p className="text-2xl font-bold text-blue-600">235 cabeças</p>
                <p className="text-xs text-gray-500 mt-2">+112% vs período anterior</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Receita de Vendas</p>
                <p className="text-2xl font-bold text-green-600">R$ 987.500</p>
                <p className="text-xs text-gray-500 mt-2">Preço médio: R$ 4.202/cabeça</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Categoria Mais Vendida</p>
                <p className="text-2xl font-bold text-purple-600">Bezerros</p>
                <p className="text-xs text-gray-500 mt-2">112 cabeças (47,7%)</p>
              </Card>
            </div>
          </TabsContent>

          {/* Evolution Reports */}
          <TabsContent value="evolution" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Evolução do Rebanho (Últimos 6 Meses)</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={EvolutionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="herdSize" stroke="#3b82f6" name="Tamanho do Rebanho" strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="weight" stroke="#10b981" name="Peso Médio (kg)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Crescimento do Rebanho</p>
                <p className="text-2xl font-bold text-blue-600">+28,1%</p>
                <p className="text-xs text-gray-500 mt-2">De 285 para 365 cabeças</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Ganho de Peso Médio</p>
                <p className="text-2xl font-bold text-green-600">+7,6%</p>
                <p className="text-xs text-gray-500 mt-2">De 420 para 452 kg</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-gray-600 mb-2">Produtividade</p>
                <p className="text-2xl font-bold text-purple-600">+26,2%</p>
                <p className="text-xs text-gray-500 mt-2">De 65% para 82%</p>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};
