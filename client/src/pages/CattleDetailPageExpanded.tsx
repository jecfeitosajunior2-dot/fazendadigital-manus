import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, Loader2, Weight, Syringe, Heart, DollarSign, TrendingUp, Zap, Plus, Trash2 } from 'lucide-react';
import { FormLabel, FieldBox, inputClassCompact } from '@/components/FormFields';
import { formatDateBR, parseLocalDate } from '@/lib/date-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const CattleDetailPageExpanded: React.FC = () => {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('geral');
  const utils = trpc.useUtils();

  // Get animal ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const cattleIdParam = urlParams.get('id');
  const animalId = cattleIdParam ? parseInt(cattleIdParam) : null;

  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await utils.animais.getById.invalidate({ id: animalId! });
      await utils.saude.list.invalidate({ animalId: animalId! });
      await utils.pesagens.list.invalidate({ animalId: animalId! });
      await utils.reproducao.list.invalidate();
      toast.success("Atualizado!");
    },
    enabled: !!animalId,
  });

  // ─── tRPC Queries ─────────────────────────────────────────────────────────
  const { data: animal, isLoading: loadingAnimal, error: animalError } = trpc.animais.getById.useQuery(
    { id: animalId! },
    { enabled: !!animalId }
  );

  const { data: saudeRegistros, isLoading: loadingSaude } = trpc.saude.list.useQuery(
    { animalId: animalId! },
    { enabled: !!animalId }
  );

  const { data: pesagens, isLoading: loadingPesagens } = trpc.pesagens.list.useQuery(
    { animalId: animalId! },
    { enabled: !!animalId }
  );

  const { data: historicoPastos = [], isLoading: loadingPastos } = trpc.animais.historicoPastos.useQuery(
    { animalId: animalId! },
    { enabled: !!animalId }
  );

  const { data: reproducaoRegistros, isLoading: loadingRepro } = trpc.reproducao.list.useQuery(
    undefined,
    { enabled: !!animalId }
  );

  // Filter reproduction records for this animal
  const animalRepro = reproducaoRegistros?.filter(
    r => r.femeaId === animalId || r.machoId === animalId
  ) || [];

  // ─── Mutations ────────────────────────────────────────────────────────────
  const deleteSaudeMutation = trpc.saude.delete.useMutation({
    onSuccess: () => {
      toast.success('Registro de saúde removido!');
      utils.saude.list.invalidate({ animalId: animalId! });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const deletePesagemMutation = trpc.pesagens.delete.useMutation({
    onSuccess: () => {
      toast.success('Pesagem removida!');
      utils.pesagens.list.invalidate({ animalId: animalId! });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // ─── Add Saúde Form ───────────────────────────────────────────────────────
  const [showSaudeForm, setShowSaudeForm] = useState(false);
  const [saudeForm, setSaudeForm] = useState({
    tipo: '',
    descricao: '',
    medicamento: '',
    dosagem: '',
    veterinario: '',
    custo: '',
    dataRegistro: new Date().toISOString().split('T')[0],
    proximaData: '',
    observacoes: '',
  });

  const createSaudeMutation = trpc.saude.create.useMutation({
    onSuccess: () => {
      toast.success('Registro de saúde criado!');
      setShowSaudeForm(false);
      setSaudeForm({ tipo: '', descricao: '', medicamento: '', dosagem: '', veterinario: '', custo: '', dataRegistro: new Date().toISOString().split('T')[0], proximaData: '', observacoes: '' });
      utils.saude.list.invalidate({ animalId: animalId! });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // ─── Add Pesagem Form ─────────────────────────────────────────────────────
  const [showPesagemForm, setShowPesagemForm] = useState(false);
  const [pesagemForm, setPesagemForm] = useState({
    peso: '',
    data: new Date().toISOString().split('T')[0],
    observacoes: '',
  });

  const createPesagemMutation = trpc.pesagens.create.useMutation({
    onSuccess: () => {
      toast.success('Pesagem registrada!');
      setShowPesagemForm(false);
      setPesagemForm({ peso: '', data: new Date().toISOString().split('T')[0], observacoes: '' });
      utils.pesagens.list.invalidate({ animalId: animalId! });
      utils.animais.getById.invalidate({ id: animalId! });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatDate = (date: Date | string | null | undefined) => formatDateBR(date);

  const calculateAge = (birthDate: Date | string | null | undefined) => {
    if (!birthDate) return '—';
    const birth = new Date(birthDate);
    const today = new Date();
    const ageInMonths = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
    const years = Math.floor(ageInMonths / 12);
    const months = ageInMonths % 12;
    if (years === 0) return `${months} meses`;
    return `${years} anos e ${months} meses`;
  };

  const calculateWeightGain = () => {
    if (!pesagens || pesagens.length < 2) return 0;
    const sorted = [...pesagens].sort((a, b) => (parseLocalDate(b.data)?.getTime() ?? 0) - (parseLocalDate(a.data)?.getTime() ?? 0));
    const latest = parseFloat(sorted[0].peso || '0');
    const oldest = parseFloat(sorted[sorted.length - 1].peso || '0');
    return latest - oldest;
  };

  // ─── Loading / Error States ───────────────────────────────────────────────
  if (!animalId) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto">
          <Button onClick={() => setLocation('/rebanho/lista-animais')} className="mb-6 bg-gray-400 hover:bg-gray-500 text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Lista de Animais
          </Button>
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">ID de animal inválido na URL.</p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (loadingAnimal) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          <span className="ml-3 text-gray-600">Carregando dados do animal...</span>
        </div>
      </AppLayout>
    );
  }

  if (animalError || !animal) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto">
          <Button onClick={() => setLocation('/rebanho/lista-animais')} className="mb-6 bg-gray-400 hover:bg-gray-500 text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Lista de Animais
          </Button>
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-600">Animal não encontrado no banco de dados.</p>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const sortedPesagens = pesagens ? [...pesagens].sort((a, b) => (parseLocalDate(b.data)?.getTime() ?? 0) - (parseLocalDate(a.data)?.getTime() ?? 0)) : [];
  const latestWeight = sortedPesagens[0]?.peso || animal.pesoAtual || '—';

  return (
    <AppLayout>
      <PullToRefreshIndicator
        pullDistance={state.pullDistance}
        isRefreshing={state.isRefreshing}
      />
      <div
        ref={containerRef}
        className="overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
      <div className="max-w-7xl mx-auto">
        <button onClick={() => setLocation('/rebanho/lista-animais')} className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-[13px]">Voltar</span>
        </button>

        {/* Header Card */}
        <Card className="mb-6 overflow-hidden border border-gray-200 shadow-sm">
          {/* Faixa de status superior */}
          <div className={`h-1 w-full ${animal.status === 'ativo' ? 'bg-emerald-500' : 'bg-red-400'}`} />
          <div className="p-5">
            <div className="flex flex-col md:flex-row md:items-start gap-5">
              {/* Número grande + identificação */}
              <div className="flex-shrink-0">
                <div className="text-5xl font-black text-gray-800 leading-none tracking-tight">
                  {animal.nome || animal.brinco || `#${animal.id}`}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    animal.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>{animal.status}</span>
                </div>
              </div>

              {/* Campos em grid */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Brinco</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{animal.brinco || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">N° RFID</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{animal.brincoEletronico || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Sexo</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{animal.sexo === 'macho' ? 'Macho' : 'Fêmea'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Categoria</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{animal.categoria || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Lote</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{(animal as any).loteNome || (animal.loteId ? `#${animal.loteId}` : '—')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Idade</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{calculateAge(animal.dataNascimento)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Dias na Fazenda</p>
                  <p className="font-semibold text-gray-800 mt-0.5">{(animal as any).diasNaFazenda != null ? `${(animal as any).diasNaFazenda}d` : '—'}</p>
                </div>
              </div>

              {/* Métricas de peso + ação */}
              <div className="flex-shrink-0 flex flex-col gap-2 min-w-[160px]">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Peso Atual</p>
                    <p className="text-xl font-bold text-gray-800">{latestWeight}kg</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400">Ganho</p>
                    <p className={`text-xl font-bold ${calculateWeightGain() >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {calculateWeightGain() >= 0 ? '+' : ''}{calculateWeightGain().toFixed(1)}kg
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)}
                  className="w-full text-white text-sm font-medium"
                  style={{ backgroundColor: '#4ECDC4' }}
                >
                  Editar Animal
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="saude">Saúde</TabsTrigger>
            <TabsTrigger value="reproducao">Reprodução</TabsTrigger>
            <TabsTrigger value="pesagens">Pesagens</TabsTrigger>
            <TabsTrigger value="pastos">Pastos</TabsTrigger>
            <TabsTrigger value="observacoes">Observações</TabsTrigger>
          </TabsList>

          {/* ─── Geral Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="geral">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-blue-600" />
                  Dados Completos
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">ID Interno</span>
                    <span className="font-semibold">#{animal.id}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Nome</span>
                    <span className="font-semibold">{animal.nome || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Brinco</span>
                    <span className="font-semibold">{animal.brinco || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Raça</span>
                    <span className="font-semibold">{animal.raca || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Sexo</span>
                    <span className="font-semibold">{animal.sexo === 'macho' ? 'Macho' : 'Fêmea'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Categoria</span>
                    <span className="font-semibold">{animal.categoria || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Status</span>
                    <span className={`font-semibold px-2 py-0.5 rounded text-xs ${animal.status === 'ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{animal.status}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-600">Cadastrado em</span>
                    <span className="font-semibold">{formatDate(animal.createdAt)}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                  Resumo de Peso
                </h2>
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600">Peso Atual (cadastrado)</p>
                    <p className="text-2xl font-bold text-gray-800">{animal.pesoAtual || '—'}kg</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded">
                    <p className="text-xs text-gray-600">Última Pesagem</p>
                    <p className="text-2xl font-bold text-gray-800">{latestWeight}kg</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded border border-green-200">
                    <p className="text-xs text-gray-600">Ganho Total (pesagens)</p>
                    <p className="text-2xl font-bold text-green-600">
                      {calculateWeightGain() >= 0 ? '+' : ''}{calculateWeightGain().toFixed(1)}kg
                    </p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-gray-600">Total de Pesagens</p>
                    <p className="text-2xl font-bold text-blue-600">{pesagens?.length || 0}</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ─── Saúde Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="saude">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  <Syringe className="w-5 h-5 mr-2 text-red-600" />
                  Registros de Saúde
                </h2>
                <Button
                  size="sm"
                  onClick={() => setShowSaudeForm(!showSaudeForm)}
                  className="text-white text-xs"
                  style={{ backgroundColor: '#4ECDC4' }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Novo Registro
                </Button>
              </div>

              {showSaudeForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded border">
                  <h3 className="font-semibold text-gray-700 mb-3">Novo Registro de Saúde</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <FormLabel required className="text-xs font-medium text-gray-700 mb-1">Tipo</FormLabel>
                      <FieldBox required>
                        <select
                          value={saudeForm.tipo}
                          onChange={e => setSaudeForm(p => ({ ...p, tipo: e.target.value }))}
                          className={inputClassCompact}
                        >
                          <option value="">Selecione</option>
                          <option value="Vacinação">Vacinação</option>
                          <option value="Vermifugação">Vermifugação</option>
                          <option value="Tratamento">Tratamento</option>
                          <option value="Exame">Exame</option>
                          <option value="Cirurgia">Cirurgia</option>
                          <option value="Preventivo">Preventivo</option>
                        </select>
                      </FieldBox>
                    </div>
                    <div>
                      <FormLabel required className="text-xs font-medium text-gray-700 mb-1">Data</FormLabel>
                      <FieldBox required>
                        <input
                          type="date"
                          value={saudeForm.dataRegistro}
                          onChange={e => setSaudeForm(p => ({ ...p, dataRegistro: e.target.value }))}
                          className={inputClassCompact}
                        />
                      </FieldBox>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Medicamento</label>
                      <input
                        type="text"
                        value={saudeForm.medicamento}
                        onChange={e => setSaudeForm(p => ({ ...p, medicamento: e.target.value }))}
                        placeholder="ex: Ivermectina"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Dosagem</label>
                      <input
                        type="text"
                        value={saudeForm.dosagem}
                        onChange={e => setSaudeForm(p => ({ ...p, dosagem: e.target.value }))}
                        placeholder="ex: 5ml"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Veterinário</label>
                      <input
                        type="text"
                        value={saudeForm.veterinario}
                        onChange={e => setSaudeForm(p => ({ ...p, veterinario: e.target.value }))}
                        placeholder="ex: Dr. João Silva"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Custo (R$)</label>
                      <input
                        type="number"
                        value={saudeForm.custo}
                        onChange={e => setSaudeForm(p => ({ ...p, custo: e.target.value }))}
                        placeholder="ex: 150.00"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Descrição</label>
                      <input
                        type="text"
                        value={saudeForm.descricao}
                        onChange={e => setSaudeForm(p => ({ ...p, descricao: e.target.value }))}
                        placeholder="Descrição do procedimento"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!saudeForm.tipo || !saudeForm.dataRegistro) {
                          toast.error('Tipo e data são obrigatórios');
                          return;
                        }
                        createSaudeMutation.mutate({
                          animalId: animalId!,
                          tipo: saudeForm.tipo,
                          descricao: saudeForm.descricao || undefined,
                          medicamento: saudeForm.medicamento || undefined,
                          dosagem: saudeForm.dosagem || undefined,
                          veterinario: saudeForm.veterinario || undefined,
                          custo: saudeForm.custo || undefined,
                          dataRegistro: saudeForm.dataRegistro,
                          proximaData: saudeForm.proximaData || undefined,
                          observacoes: saudeForm.observacoes || undefined,
                        });
                      }}
                      disabled={createSaudeMutation.isPending}
                      className="text-white text-xs"
                      style={{ backgroundColor: '#4ECDC4' }}
                    >
                      {createSaudeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowSaudeForm(false)} className="text-xs">Cancelar</Button>
                  </div>
                </div>
              )}

              {loadingSaude ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                </div>
              ) : !saudeRegistros || saudeRegistros.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Syringe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhum registro de saúde encontrado.</p>
                  <p className="text-xs mt-1">Clique em "Novo Registro" para adicionar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {saudeRegistros.map((reg) => (
                    <div key={reg.id} className="border-l-4 border-red-400 pl-4 py-2 flex justify-between items-start">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{reg.tipo} — {formatDate(reg.dataRegistro)}</p>
                        {reg.descricao && <p className="text-xs text-gray-600">{reg.descricao}</p>}
                        {reg.medicamento && <p className="text-xs text-gray-500">Medicamento: {reg.medicamento} {reg.dosagem ? `(${reg.dosagem})` : ''}</p>}
                        {reg.veterinario && <p className="text-xs text-gray-500">Veterinário: {reg.veterinario}</p>}
                        {reg.custo && <p className="text-xs text-gray-500">Custo: R$ {reg.custo}</p>}
                      </div>
                      <button
                        onClick={() => deleteSaudeMutation.mutate({ id: reg.id })}
                        className="text-red-400 hover:text-red-600 ml-4"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Reprodução Tab ────────────────────────────────────────────── */}
          <TabsContent value="reproducao">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                <Heart className="w-5 h-5 mr-2 text-pink-600" />
                Histórico Reprodutivo
              </h2>
              {loadingRepro ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                </div>
              ) : animalRepro.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Heart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhum registro reprodutivo encontrado para este animal.</p>
                  <p className="text-xs mt-1">Acesse o módulo de Reprodução para registrar eventos.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Tipo</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Resultado</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Prev. Parto</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Observações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {animalRepro.map((reg) => (
                        <tr key={reg.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-800">{formatDate(reg.dataCobertura)}</td>
                          <td className="px-4 py-2"><span className="px-2 py-1 rounded text-xs bg-pink-100 text-pink-800">{reg.tipo}</span></td>
                          <td className="px-4 py-2 text-gray-600">{reg.resultado || '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{formatDate(reg.dataPrevistoParto)}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{reg.observacoes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Pesagens Tab ──────────────────────────────────────────────── */}
          <TabsContent value="pesagens">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  <Weight className="w-5 h-5 mr-2 text-blue-600" />
                  Histórico de Pesagens
                </h2>
                <Button
                  size="sm"
                  onClick={() => setShowPesagemForm(!showPesagemForm)}
                  className="text-white text-xs"
                  style={{ backgroundColor: '#4ECDC4' }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Nova Pesagem
                </Button>
              </div>

              {showPesagemForm && (
                <div className="mb-6 p-4 bg-gray-50 rounded border">
                  <h3 className="font-semibold text-gray-700 mb-3">Registrar Pesagem</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <FormLabel required className="text-xs font-medium text-gray-700 mb-1">Peso (kg)</FormLabel>
                      <FieldBox required>
                        <input
                          type="number"
                          value={pesagemForm.peso}
                          onChange={e => setPesagemForm(p => ({ ...p, peso: e.target.value }))}
                          placeholder="ex: 450"
                          min="0"
                          step="0.1"
                          className={inputClassCompact}
                        />
                      </FieldBox>
                    </div>
                    <div>
                      <FormLabel required className="text-xs font-medium text-gray-700 mb-1">Data</FormLabel>
                      <FieldBox required>
                        <input
                          type="date"
                          value={pesagemForm.data}
                          onChange={e => setPesagemForm(p => ({ ...p, data: e.target.value }))}
                          className={inputClassCompact}
                        />
                      </FieldBox>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
                      <input
                        type="text"
                        value={pesagemForm.observacoes}
                        onChange={e => setPesagemForm(p => ({ ...p, observacoes: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!pesagemForm.peso || !pesagemForm.data) {
                          toast.error('Peso e data são obrigatórios');
                          return;
                        }
                        createPesagemMutation.mutate({
                          animalId: animalId!,
                          peso: pesagemForm.peso,
                          data: pesagemForm.data,
                          observacoes: pesagemForm.observacoes || undefined,
                        });
                      }}
                      disabled={createPesagemMutation.isPending}
                      className="text-white text-xs"
                      style={{ backgroundColor: '#4ECDC4' }}
                    >
                      {createPesagemMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowPesagemForm(false)} className="text-xs">Cancelar</Button>
                  </div>
                </div>
              )}

              {loadingPesagens ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                </div>
              ) : sortedPesagens.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Weight className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhuma pesagem registrada.</p>
                  <p className="text-xs mt-1">Clique em "Nova Pesagem" para registrar.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Data</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">Peso (kg)</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-700">Variação</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Observações</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-700">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPesagens.map((pesagem, idx) => {
                        const prev = sortedPesagens[idx + 1];
                        const variation = prev ? parseFloat(pesagem.peso || '0') - parseFloat(prev.peso || '0') : null;
                        return (
                          <tr key={pesagem.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-800">{formatDate(pesagem.data)}</td>
                            <td className="px-4 py-2 text-right font-semibold text-gray-800">{pesagem.peso}kg</td>
                            <td className="px-4 py-2 text-right">
                              {variation !== null ? (
                                <span className={`font-semibold ${variation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {variation >= 0 ? '+' : ''}{variation.toFixed(1)}kg
                                </span>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2 text-gray-500 text-xs">{pesagem.observacoes || '—'}</td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => deletePesagemMutation.mutate({ id: pesagem.id })}
                                className="text-red-400 hover:text-red-600"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Observações Tab ───────────────────────────────────────────── */}
          <TabsContent value="observacoes">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Observações do Animal</h2>
              {animal.observacoes ? (
                <div className="p-4 bg-gray-50 rounded border text-sm text-gray-700 whitespace-pre-wrap">
                  {animal.observacoes}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Nenhuma observação registrada.</p>
                  <Button
                    size="sm"
                    onClick={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)}
                    className="mt-3 text-white text-xs"
                    style={{ backgroundColor: '#4ECDC4' }}
                  >
                    Editar Animal para Adicionar Observações
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Pastos Tab ────────────────────────────────────────────────────────────────────────────────────── */}
          <TabsContent value="pastos">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#7CB342' }} />
                Histórico de Pastos
              </h2>
              {loadingPastos ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>
              ) : historicoPastos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">Nenhuma movimentação de pasto registrada para este animal.</p>
                  <p className="text-xs text-gray-400 mt-1">Mova o lote do animal em <strong>Rebanho &gt; Lotes</strong> para registrar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(historicoPastos as any[]).map((m: any, idx: number) => (
                    <div key={m.id} className="border rounded-lg p-4 text-sm flex items-start gap-3">
                      <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: idx === 0 ? '#7CB342' : '#9E9E9E', marginTop: 6 }} />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800">
                          {m.pastoOrigemNome ? (
                            <span>{m.pastoOrigemNome} <span className="text-gray-400 font-normal">→</span> {m.pastoDestinoNome || '—'}</span>
                          ) : (
                            <span>Entrada em {m.pastoDestinoNome || '—'}</span>
                          )}
                          {idx === 0 && <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#7CB342' }}>Atual</span>}
                        </div>
                        <div className="text-gray-500 text-xs mt-1 flex flex-wrap gap-3">
                          <span>Entrada: {m.dataEntrada ? new Date(m.dataEntrada).toLocaleDateString('pt-BR') : '—'}</span>
                          {m.dataSaida && <span>Saída: {new Date(m.dataSaida).toLocaleDateString('pt-BR')}</span>}
                          {m.diasNoPasto != null && <span>{m.diasNoPasto} dias</span>}
                          {m.qtdAnimais > 0 && <span>{m.qtdAnimais} cabeças no lote</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </AppLayout>
  );
};
