import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, CheckCircle2, Download, Upload, FileUp } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface CattleRecord {
  id: number;
  number: string;
  electronicId: string;
  birthDate: string;
  sex: 'Macho' | 'Fêmea';
  breed: string;
  lot: string;
  activity: string;
  sanitaryStatus: 'Vacinado' | 'Não Vacinado' | 'Pendente';
  lastVaccine?: string;
  salePrice?: number;
  saleDate?: string;
  financialStatus: 'Ativo' | 'Vendido' | 'Descartado';
}

const generateBulkCattle = (count: number): CattleRecord[] => {
  const breeds = ['Nelore', 'Nelore Mocho', 'Senepol', 'Brahman', 'Guzerá'];
  const lots = ['Lote Vacas', 'Lote Bezerros', 'Lote Engorda', 'Lote Recria', 'Lote novilhas da estação'];
  const activities = ['Cria', 'Engorda', 'Recria', 'Reprodução'];
  const sanitaryStatuses = ['Vacinado', 'Não Vacinado', 'Pendente'];
  const financialStatuses = ['Ativo', 'Vendido', 'Descartado'];

  const cattle: CattleRecord[] = [];
  
  for (let i = 1; i <= count; i++) {
    const birthDate = new Date(2020 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    const isSold = Math.random() > 0.8;
    const saleDate = isSold ? new Date(2026, 4, Math.floor(Math.random() * 28) + 1) : undefined;
    
    cattle.push({
      id: i,
      number: String(i).padStart(4, '0'),
      electronicId: `982000455038${String(i).padStart(3, '0')}`,
      birthDate: birthDate.toLocaleDateString('pt-BR'),
      sex: Math.random() > 0.5 ? 'Macho' : 'Fêmea',
      breed: breeds[Math.floor(Math.random() * breeds.length)],
      lot: lots[Math.floor(Math.random() * lots.length)],
      activity: activities[Math.floor(Math.random() * activities.length)],
      sanitaryStatus: sanitaryStatuses[Math.floor(Math.random() * sanitaryStatuses.length)] as 'Vacinado' | 'Não Vacinado' | 'Pendente',
      lastVaccine: Math.random() > 0.3 ? new Date(2026, 3, Math.floor(Math.random() * 28) + 1).toLocaleDateString('pt-BR') : undefined,
      salePrice: isSold ? 2500 + Math.random() * 3500 : undefined,
      saleDate: saleDate?.toLocaleDateString('pt-BR'),
      financialStatus: isSold ? 'Vendido' : (Math.random() > 0.95 ? 'Descartado' : 'Ativo'),
    });
  }
  
  return cattle;
};

const parseCSV = (csvText: string): CattleRecord[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const cattle: CattleRecord[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 2) continue;
    
    const numberIdx = headers.findIndex(h => h.includes('número') || h === 'n' || h === 'nº');
    const idIdx = headers.findIndex(h => h.includes('id'));
    const birthDateIdx = headers.findIndex(h => h.includes('data') && h.includes('nasc'));
    const sexIdx = headers.findIndex(h => h === 'sexo');
    const breedIdx = headers.findIndex(h => h === 'raça');
    const lotIdx = headers.findIndex(h => h === 'lote');
    const activityIdx = headers.findIndex(h => h === 'atividade');
    const sanitaryIdx = headers.findIndex(h => h.includes('sanitário'));
    const vaccineIdx = headers.findIndex(h => h.includes('vacina'));
    const priceIdx = headers.findIndex(h => h.includes('preço'));
    const saleDateIdx = headers.findIndex(h => h.includes('venda') && h.includes('data'));
    const statusIdx = headers.findIndex(h => h.includes('status') && h.includes('financeiro'));
    
    cattle.push({
      id: cattle.length + 1,
      number: numberIdx >= 0 ? values[numberIdx] : `${cattle.length + 1}`.padStart(4, '0'),
      electronicId: idIdx >= 0 ? values[idIdx] : `982000455038${String(cattle.length + 1).padStart(3, '0')}`,
      birthDate: birthDateIdx >= 0 ? values[birthDateIdx] : new Date().toLocaleDateString('pt-BR'),
      sex: (sexIdx >= 0 && (values[sexIdx] === 'Macho' || values[sexIdx] === 'Fêmea')) ? values[sexIdx] as 'Macho' | 'Fêmea' : 'Macho',
      breed: breedIdx >= 0 ? values[breedIdx] : 'Nelore',
      lot: lotIdx >= 0 ? values[lotIdx] : 'Lote Geral',
      activity: activityIdx >= 0 ? values[activityIdx] : 'Cria',
      sanitaryStatus: (sanitaryIdx >= 0 && ['Vacinado', 'Não Vacinado', 'Pendente'].includes(values[sanitaryIdx])) ? values[sanitaryIdx] as 'Vacinado' | 'Não Vacinado' | 'Pendente' : 'Pendente',
      lastVaccine: vaccineIdx >= 0 && values[vaccineIdx] ? values[vaccineIdx] : undefined,
      salePrice: priceIdx >= 0 && values[priceIdx] ? parseFloat(values[priceIdx]) : undefined,
      saleDate: saleDateIdx >= 0 && values[saleDateIdx] ? values[saleDateIdx] : undefined,
      financialStatus: (statusIdx >= 0 && ['Ativo', 'Vendido', 'Descartado'].includes(values[statusIdx])) ? values[statusIdx] as 'Ativo' | 'Vendido' | 'Descartado' : 'Ativo',
    });
  }
  
  return cattle;
};

export const BulkCattleImportPage: React.FC = () => {
  const utils = trpc.useUtils();
  const createMutation = trpc.animais.create.useMutation();
  const [importCount, setImportCount] = useState('1000');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedCattle, setImportedCattle] = useState<CattleRecord[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [importMode, setImportMode] = useState<'manual' | 'csv'>('manual');
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    if (importedCattle.length === 0) return null;
    
    const totalAnimals = importedCattle.length;
    const vaccinated = importedCattle.filter(c => c.sanitaryStatus === 'Vacinado').length;
    const sold = importedCattle.filter(c => c.financialStatus === 'Vendido').length;
    const totalRevenue = importedCattle
      .filter(c => c.salePrice)
      .reduce((sum, c) => sum + (c.salePrice || 0), 0);
    
    return {
      totalAnimals,
      vaccinated,
      vaccinePercentage: ((vaccinated / totalAnimals) * 100).toFixed(1),
      sold,
      soldPercentage: ((sold / totalAnimals) * 100).toFixed(1),
      totalRevenue,
      averagePrice: sold > 0 ? (totalRevenue / sold).toFixed(2) : '0.00',
    };
  }, [importedCattle]);

  const handleImport = async () => {
    const count = parseInt(importCount) || 1000;
    setIsImporting(true);
    setImportProgress(0);
    setImportedCattle([]);
    setCsvError(null);

    for (let i = 0; i <= 100; i += 10) {
      setImportProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const cattle = generateBulkCattle(count);
    setImportedCattle(cattle);
    // Persist to DB
    let saved = 0;
    for (const c of cattle) {
      try {
        await createMutation.mutateAsync({
          nome: c.number,
          brinco: c.electronicId,
          raca: c.breed,
          sexo: c.sex === 'Macho' ? 'macho' : 'femea',
          categoria: c.activity,
        });
        saved++;
      } catch { /* skip individual errors */ }
    }
    utils.animais.list.invalidate();
    toast.success(`${saved} animais importados para o banco de dados!`);
    setImportProgress(100);
    setShowResults(true);
    setIsImporting(false);
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setIsImporting(true);
    setImportProgress(0);
    setImportedCattle([]);

    try {
      const text = await file.text();
      setImportProgress(50);
      await new Promise(resolve => setTimeout(resolve, 300));

      const cattle = parseCSV(text);
      if (cattle.length === 0) {
        setCsvError('Nenhum registro válido encontrado no CSV. Verifique o formato do arquivo.');
        setIsImporting(false);
        return;
      }

      setImportedCattle(cattle);
      // Persist to DB
      let saved = 0;
      for (const c of cattle) {
        try {
          await createMutation.mutateAsync({
            nome: c.number,
            brinco: c.electronicId,
            raca: c.breed,
            sexo: c.sex === 'Macho' ? 'macho' : 'femea',
            categoria: c.activity,
          });
          saved++;
        } catch { /* skip individual errors */ }
      }
      utils.animais.list.invalidate();
      toast.success(`${saved} animais importados para o banco de dados!`);
      setImportProgress(100);
      setShowResults(true);
    } catch (error) {
      setCsvError(`Erro ao processar CSV: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const downloadCSV = () => {
    if (importedCattle.length === 0) return;

    const headers = ['Nº Animal', 'ID Eletrônico', 'Data Nasc.', 'Sexo', 'Raça', 'Lote', 'Atividade', 'Status Sanitário', 'Última Vacina', 'Preço Venda', 'Data Venda', 'Status Financeiro'];
    const rows = importedCattle.map(c => [
      c.number,
      c.electronicId,
      c.birthDate,
      c.sex,
      c.breed,
      c.lot,
      c.activity,
      c.sanitaryStatus,
      c.lastVaccine || '-',
      c.salePrice ? `R$ ${c.salePrice.toFixed(2)}` : '-',
      c.saleDate || '-',
      c.financialStatus,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gados_${importedCattle.length}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const template = 'Número,ID Eletrônico,Data Nasc.,Sexo,Raça,Lote,Atividade,Status Sanitário,Última Vacina,Preço Venda,Data Venda,Status Financeiro\n0001,982000455038001,15/01/2022,Macho,Nelore,Lote Vacas,Cria,Vacinado,15/04/2026,3500.00,29/05/2026,Vendido\n0002,982000455038002,20/03/2023,Fêmea,Brahman,Lote Bezerros,Engorda,Não Vacinado,,2800.00,,Ativo';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_gados.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-fazenda-digital-content p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Importação em Massa de Gados</h1>
          <p className="text-gray-600">Teste de integração com Sanitário, Vendas e Financeiro</p>
        </div>

        {!showResults ? (
          <Card className="p-8 mb-6">
            <div className="space-y-6">
              <div className="flex gap-4 mb-6">
                <button
                  onClick={() => setImportMode('manual')}
                  className={`px-4 py-2 rounded font-medium transition ${
                    importMode === 'manual'
                      ? 'bg-fazenda-digital-green text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Geração Manual
                </button>
                <button
                  onClick={() => setImportMode('csv')}
                  className={`px-4 py-2 rounded font-medium transition ${
                    importMode === 'csv'
                      ? 'bg-fazenda-digital-green text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Upload CSV
                </button>
              </div>

              {importMode === 'manual' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantidade de Gados para Importar
                  </label>
                  <Input
                    type="number"
                    value={importCount}
                    onChange={(e) => setImportCount(e.target.value)}
                    disabled={isImporting}
                    className="max-w-xs"
                    min="1"
                    max="10000"
                  />
                  <p className="text-xs text-gray-500 mt-2">Máximo: 10.000 gados</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Selecione um arquivo CSV
                  </label>
                  <div className="flex gap-3 mb-3">
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <FileUp className="w-4 h-4 mr-2" />
                      Escolher Arquivo
                    </Button>
                    <Button
                      onClick={downloadTemplate}
                      className="bg-gray-600 hover:bg-gray-700 text-white"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Template
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-500">Formato esperado: CSV com colunas (Número, ID Eletrônico, Data Nasc., Sexo, Raça, Lote, Atividade, Status Sanitário, Última Vacina, Preço Venda, Data Venda, Status Financeiro)</p>
                </div>
              )}

              {csvError && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{csvError}</p>
                </div>
              )}

              {isImporting && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Importando...</span>
                    <span className="text-sm text-gray-500">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} className="h-2" />
                </div>
              )}

              {importMode === 'manual' && (
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="bg-fazenda-digital-green hover:bg-fazenda-digital-green-dark text-white"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isImporting ? 'Importando...' : 'Iniciar Importação'}
                </Button>
              )}
            </div>
          </Card>
        ) : null}

        {showResults && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 border-l-4 border-fazenda-digital-green">
                <div className="text-sm text-gray-600 mb-1">Total de Animais</div>
                <div className="text-2xl font-bold text-gray-800">{stats.totalAnimals}</div>
              </Card>

              <Card className="p-4 border-l-4 border-blue-500">
                <div className="text-sm text-gray-600 mb-1">Vacinados</div>
                <div className="text-2xl font-bold text-gray-800">{stats.vaccinated}</div>
                <div className="text-xs text-gray-500 mt-1">{stats.vaccinePercentage}% do rebanho</div>
              </Card>

              <Card className="p-4 border-l-4 border-purple-500">
                <div className="text-sm text-gray-600 mb-1">Vendidos</div>
                <div className="text-2xl font-bold text-gray-800">{stats.sold}</div>
                <div className="text-xs text-gray-500 mt-1">{stats.soldPercentage}% do rebanho</div>
              </Card>

              <Card className="p-4 border-l-4 border-green-600">
                <div className="text-sm text-gray-600 mb-1">Receita Total</div>
                <div className="text-2xl font-bold text-gray-800">R$ {stats.totalRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                <div className="text-xs text-gray-500 mt-1">Média: R$ {stats.averagePrice}</div>
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-fazenda-digital-green" />
                Resumo Sanitário
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Vacinados</div>
                  <div className="text-xl font-bold text-fazenda-digital-green">{stats.vaccinated}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Não Vacinados</div>
                  <div className="text-xl font-bold text-orange-500">
                    {importedCattle.filter(c => c.sanitaryStatus === 'Não Vacinado').length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Pendentes</div>
                  <div className="text-xl font-bold text-yellow-600">
                    {importedCattle.filter(c => c.sanitaryStatus === 'Pendente').length}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-purple-500" />
                Resumo de Vendas
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Vendidos</div>
                  <div className="text-xl font-bold text-purple-500">{stats.sold}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Ativos</div>
                  <div className="text-xl font-bold text-blue-500">
                    {importedCattle.filter(c => c.financialStatus === 'Ativo').length}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Descartados</div>
                  <div className="text-xl font-bold text-red-500">
                    {importedCattle.filter(c => c.financialStatus === 'Descartado').length}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <CheckCircle2 className="w-5 h-5 mr-2 text-green-600" />
                Resumo Financeiro
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Receita Total (Vendas)</div>
                  <div className="text-2xl font-bold text-green-600">
                    R$ {stats.totalRevenue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Preço Médio por Cabeça</div>
                  <div className="text-2xl font-bold text-green-600">
                    R$ {stats.averagePrice}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Primeiros 10 Registros</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Nº</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">ID Eletrônico</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Sexo</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Raça</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Sanitário</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedCattle.slice(0, 10).map((cattle) => (
                      <tr key={cattle.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-800">{cattle.number}</td>
                        <td className="px-4 py-2 text-gray-600 text-xs">{cattle.electronicId}</td>
                        <td className="px-4 py-2 text-gray-800">{cattle.sex}</td>
                        <td className="px-4 py-2 text-gray-800">{cattle.breed}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            cattle.sanitaryStatus === 'Vacinado' ? 'bg-green-100 text-green-800' :
                            cattle.sanitaryStatus === 'Não Vacinado' ? 'bg-orange-100 text-orange-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {cattle.sanitaryStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            cattle.financialStatus === 'Ativo' ? 'bg-blue-100 text-blue-800' :
                            cattle.financialStatus === 'Vendido' ? 'bg-purple-100 text-purple-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {cattle.financialStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex gap-4">
              <Button
                onClick={downloadCSV}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar CSV ({importedCattle.length} registros)
              </Button>
              <Button
                onClick={() => {
                  setShowResults(false);
                  setImportedCattle([]);
                  setImportProgress(0);
                }}
                className="bg-gray-400 hover:bg-gray-500 text-white"
              >
                Nova Importação
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkCattleImportPage;
