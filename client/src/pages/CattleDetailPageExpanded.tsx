import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, Loader2, Weight, Syringe, HeartPulse, MapPin, Tag } from 'lucide-react';
import {
  FormLabel,
  FieldBox,
  FormDatePicker,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  inputClassCompact,
} from '@/components/FormFields';
import { formatDateBR, parseLocalDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import {
  formatTempoNoPastoMovimentacaoLote,
  statusMovimentacaoLote,
  type StatusMovimentacaoLote,
} from '@shared/historicoMovimentacaoLote';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  computeResumoPeso,
  EM_CARENCIA_SIM_BADGE_CLASS,
  formatTipoSanitarioTabelaDisplay,
  computeCustoSanitarioResumo,
  formatCustoRegistroDisplay,
  formatGanhoDisplay,
  formatGmdDisplay,
  formatIdadeResumo,
  formatPesoAtualDisplay,
  ganhoToneClass,
  sortPesagensDesc,
  calcularGmdEntrePesagens,
  calcularVariacaoPesagem,
  statusAccentClass,
  statusBadgeClass,
  statusLabel,
} from '@/lib/fichaAnimalDisplay';
import { DeleteActionIcon, EditActionIcon, TableIconButton } from '@/components/icons/FarmActionIcons';
import { useConfirm } from '@/components/ConfirmDialog';
import { formatUltimoPesoKg } from '@/lib/listaAnimaisTable';
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from '@shared/carenciaAnimal';
import {
  calcPrevisaoParto283,
  formatTipoReproTabelaDisplay,
  getReproRelacionadoLabel,
  getReproRelacionadoPlaceholder,
  getReproRelacionadoTabelaHeader,
  getReproResultadoOptions,
  getReproTipoOptions,
  isReproResultadoValidForTipo,
  reproRegistroToFormValues,
  shouldCalcPrevisaoParto,
  shouldShowPrevisaoColumn,
  shouldShowPrevisaoPartoForm,
  unpackReproObservacoes,
} from '@shared/reproRegistroMeta';
import {
  getLinhasAlteracaoIdentificacao,
  mapHistoricoBrincoToDisplay,
  sortHistoricoIdentificacaoDesc,
  type HistoricoBrincoRow,
} from '@shared/historicoIdentificacao';

const FD_ACTION = '#4ECDC4';

const EMPTY_REPRO_FORM = {
  tipo: '',
  data: new Date().toISOString().split('T')[0],
  resultado: '',
  reprodutorSemen: '',
  previsaoParto: '',
  responsavel: '',
  observacoes: '',
};

const TAB_TRIGGER_CLASS =
  'rounded-md border border-transparent px-2 py-2 text-[12px] font-medium text-gray-500 transition-all data-[state=active]:bg-white data-[state=active]:text-[#2D5A5A] data-[state=active]:shadow-sm data-[state=active]:border-[#4ECDC4]/35';

const INLINE_FORM_CARD = 'mb-6 bg-white border border-gray-200 rounded-md px-4 py-3';
const INLINE_FORM_TITLE = 'font-semibold text-gray-800 mb-3';

type HistoricoSubdivisaoRow = {
  id: string;
  tipo: 'lote_pasto' | 'transferencia_lote';
  dataEntrada?: string | null;
  dataSaida?: string | null;
  pastoOrigemId?: number | null;
  pastoOrigemNome?: string | null;
  pastoDestinoNome?: string | null;
  observacoes?: string | null;
  responsavel?: string | null;
};

function historicoSubdivisaoTexto(value: string | null | undefined): string {
  const texto = value?.trim();
  return texto || '—';
}

function historicoSubdivisaoDestino(row: HistoricoSubdivisaoRow): string | null {
  const destino = row.pastoDestinoNome?.trim();
  return destino && destino !== '—' ? destino : null;
}

function historicoSubdivisaoMovimentacao(row: HistoricoSubdivisaoRow): string {
  const origem = row.pastoOrigemNome?.trim();
  const destino = historicoSubdivisaoDestino(row);
  if (origem && origem !== '—' && destino) return `${origem} → ${destino}`;
  if (destino) return `Registro inicial no ${destino}`;
  return '—';
}

function historicoSubdivisaoHojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function historicoSubdivisaoMovInput(row: HistoricoSubdivisaoRow) {
  return {
    dataEntrada: row.dataEntrada ?? '',
    dataSaida: row.dataSaida,
    pastoOrigemId: row.pastoOrigemId,
    pastoOrigemNome: row.pastoOrigemNome,
  };
}

function historicoSubdivisaoStatus(
  row: HistoricoSubdivisaoRow,
): StatusMovimentacaoLote | 'transferencia' {
  if (row.tipo === 'transferencia_lote' || !row.dataEntrada) return 'transferencia';
  return statusMovimentacaoLote(historicoSubdivisaoMovInput(row), historicoSubdivisaoHojeISO());
}

function historicoSubdivisaoEstaAtual(row: HistoricoSubdivisaoRow): boolean {
  return historicoSubdivisaoStatus(row) === 'atual';
}

function historicoSubdivisaoTempo(row: HistoricoSubdivisaoRow): string {
  if (!row.dataEntrada || row.tipo === 'transferencia_lote') return '—';
  const tempo = formatTempoNoPastoMovimentacaoLote(
    historicoSubdivisaoMovInput(row),
    historicoSubdivisaoHojeISO(),
  );
  return tempo ?? '—';
}

function HistoricoSubdivisaoStatusBadge({
  status,
}: {
  status: StatusMovimentacaoLote | 'transferencia';
}) {
  const base =
    'inline-flex items-center justify-center rounded text-[9px] font-semibold leading-none px-2 py-[4px] min-w-[58px]';
  if (status === 'atual') {
    return (
      <span className={cn(base, 'bg-green-100 text-green-800 border border-green-200')}>
        Atual
      </span>
    );
  }
  return (
    <span className={cn(base, 'font-medium bg-gray-100 text-gray-600 border border-gray-200')}>
      Encerrada
    </span>
  );
}

const HISTORICO_SUBDIVISAO_COLUNAS = [
  { id: 'data', label: 'Data', width: '15%', head: 'text-center', cell: 'text-center' },
  { id: 'mov', label: 'Movimentação', width: '42%', head: 'text-center', cell: 'text-center' },
  { id: 'status', label: 'Status', width: '18%', head: 'text-center', cell: 'text-center' },
  { id: 'tempo', label: 'Tempo', width: '25%', head: 'text-center', cell: 'text-center' },
] as const;

function HistoricoSubdivisaoCelulaTruncada({
  texto,
  className,
  title,
}: {
  texto: string;
  className?: string;
  title?: string;
}) {
  const exibir = historicoSubdivisaoTexto(texto === '—' ? null : texto);
  const tooltip = title ?? (exibir !== '—' ? exibir : undefined);
  return (
    <span className={cn('block truncate max-w-full', className)} title={tooltip}>
      {exibir}
    </span>
  );
}

function historicoSubdivisaoTooltipDetalhe(
  movimentacao: string,
  row: HistoricoSubdivisaoRow,
): string | undefined {
  const linhas: string[] = [];
  if (movimentacao !== '—') {
    linhas.push(
      row.tipo === 'transferencia_lote'
        ? `${movimentacao} · Transferência entre lotes`
        : movimentacao,
    );
  }
  const responsavel = row.responsavel?.trim();
  if (responsavel) linhas.push(`Responsável: ${responsavel}`);
  return linhas.length > 0 ? linhas.join('\n') : undefined;
}

function getReproEmptyStateMessage(sexo: string | null | undefined): { titulo: string; orientacao: string } {
  if (sexo === 'femea') {
    return {
      titulo: 'Nenhum registro reprodutivo para esta fêmea.',
      orientacao: 'Novos registros são feitos em Manejo → Registros de Manejo → Reprodutivo.',
    };
  }
  if (sexo === 'macho') {
    return {
      titulo: 'Nenhum registro reprodutivo para este macho.',
      orientacao: 'Novos registros são feitos em Manejo → Registros de Manejo → Reprodutivo.',
    };
  }
  return {
    titulo: 'Nenhum registro reprodutivo para este animal.',
    orientacao: 'Novos registros são feitos em Manejo → Registros de Manejo → Reprodutivo.',
  };
}

function ResumoField({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p
        className={`mt-0.5 text-[13px] font-semibold text-gray-800 ${mono ? 'tabular-nums text-[12px] tracking-tight' : ''} ${truncate ? 'truncate' : ''}`}
        title={typeof value === 'string' && truncate ? value : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export const CattleDetailPageExpanded: React.FC = () => {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('identificacao');
  const utils = trpc.useUtils();
  const confirm = useConfirm();

  // Get animal ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const cattleIdParam = urlParams.get('id');
  const animalId = cattleIdParam ? parseInt(cattleIdParam) : null;

  const { containerRef, state } = usePullToRefresh({
    onRefresh: async () => {
      await utils.animais.getById.invalidate({ id: animalId! });
      await utils.animais.historicoPastos.invalidate({ animalId: animalId! });
      await utils.saude.list.invalidate({ animalId: animalId! });
      await utils.pesagens.list.invalidate({ animalId: animalId! });
      await utils.reproducao.list.invalidate();
      await utils.brincos.list.invalidate({ animalId: animalId! });
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

  const { data: historicoIdentificacaoRaw = [], isLoading: loadingIdentificacao } =
    trpc.brincos.list.useQuery({ animalId: animalId! }, { enabled: !!animalId });

  const { data: reproducaoRegistros, isLoading: loadingRepro } = trpc.reproducao.list.useQuery(
    undefined,
    { enabled: !!animalId }
  );

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: !!animalId });

  const { data: animalListRow } = trpc.animais.list.useQuery(undefined, {
    enabled: !!animalId,
    select: rows => rows.find(r => r.id === animalId),
  });

  // Filter reproduction records for this animal
  const animalRepro = reproducaoRegistros?.filter(
    r => r.femeaId === animalId || r.machoId === animalId
  ) || [];

  // ─── Mutations ────────────────────────────────────────────────────────────
  const deleteReproMutation = trpc.reproducao.delete.useMutation({
    onSuccess: () => {
      toast.success('Registro reprodutivo removido!');
      utils.reproducao.list.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const handleDeleteRepro = async (reg: { id: number }) => {
    const ok = await confirm({
      title: 'Excluir registro reprodutivo',
      description: 'Tem certeza que deseja excluir este registro reprodutivo? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (ok) deleteReproMutation.mutate({ id: reg.id });
  };

  // ─── Add Pesagem Form ─────────────────────────────────────────────────────
  const [showPesagemForm, setShowPesagemForm] = useState(false);
  const [showReproForm, setShowReproForm] = useState(false);
  const [editingReproId, setEditingReproId] = useState<number | null>(null);
  const [reproForm, setReproForm] = useState({ ...EMPTY_REPRO_FORM });
  const [previsaoPartoManual, setPrevisaoPartoManual] = useState(false);
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
      utils.animais.list.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const resetReproFormState = () => {
    setShowReproForm(false);
    setEditingReproId(null);
    setReproForm({ ...EMPTY_REPRO_FORM, data: new Date().toISOString().split('T')[0] });
    setPrevisaoPartoManual(false);
  };

  const handleEditRepro = (reg: {
    id: number;
    tipo: string;
    dataCobertura: Date | string | null;
    dataPrevistoParto?: Date | string | null;
    resultado?: string | null;
    observacoes?: string | null;
  }) => {
    const values = reproRegistroToFormValues(reg);
    setEditingReproId(reg.id);
    setReproForm(values);
    setPrevisaoPartoManual(Boolean(values.previsaoParto));
    setShowReproForm(true);
  };

  const updateReproMutation = trpc.reproducao.update.useMutation({
    onSuccess: () => {
      toast.success('Registro reprodutivo atualizado!');
      resetReproFormState();
      utils.reproducao.list.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const animalSexo = animal?.sexo as string | null | undefined;

  useEffect(() => {
    if (previsaoPartoManual || !shouldShowPrevisaoPartoForm(animalSexo)) {
      if (!shouldShowPrevisaoPartoForm(animalSexo)) {
        setReproForm(p => (p.previsaoParto ? { ...p, previsaoParto: '' } : p));
      }
      return;
    }
    if (shouldCalcPrevisaoParto(reproForm.tipo, animalSexo) && reproForm.data) {
      const calc = calcPrevisaoParto283(reproForm.data);
      setReproForm(p => ({ ...p, previsaoParto: calc ?? '' }));
    } else {
      setReproForm(p => ({ ...p, previsaoParto: '' }));
    }
  }, [reproForm.tipo, reproForm.data, previsaoPartoManual, animalSexo]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const formatDate = (date: Date | string | null | undefined) => formatDateBR(date);

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

  const sortedPesagens = pesagens ? sortPesagensDesc(pesagens) : [];

  const historicoIdentificacao = sortHistoricoIdentificacaoDesc(
    historicoIdentificacaoRaw as HistoricoBrincoRow[],
  ).map(mapHistoricoBrincoToDisplay);

  const sortedSaude = saudeRegistros
    ? [...saudeRegistros].sort((a, b) => {
        const tb = parseLocalDate(b.dataRegistro)?.getTime() ?? 0;
        const ta = parseLocalDate(a.dataRegistro)?.getTime() ?? 0;
        if (tb !== ta) return tb - ta;
        return (b.id ?? 0) - (a.id ?? 0);
      })
    : [];

  const custoSanitarioResumo = computeCustoSanitarioResumo(sortedSaude);

  const sortedAnimalRepro = [...animalRepro].sort(
    (a, b) =>
      (parseLocalDate(b.dataCobertura)?.getTime() ?? 0) -
      (parseLocalDate(a.dataCobertura)?.getTime() ?? 0),
  );

  const reproEmptyState = getReproEmptyStateMessage(animal.sexo);
  const reproTipoOptions = getReproTipoOptions(animal.sexo);
  const reproResultadoOptions = getReproResultadoOptions(
    animal.sexo,
    reproForm.tipo,
    reproForm.resultado,
  );
  const reproRelacionadoLabel = getReproRelacionadoLabel(animal.sexo);
  const reproRelacionadoPlaceholder = getReproRelacionadoPlaceholder(animal.sexo);
  const reproRelacionadoTabelaHeader = getReproRelacionadoTabelaHeader(animal.sexo);
  const showPrevisaoPartoForm = shouldShowPrevisaoPartoForm(animal.sexo);
  const isReproMacho = animal.sexo === 'macho';
  const showPrevisaoColumn = shouldShowPrevisaoColumn(animal.sexo, sortedAnimalRepro);
  const reproFormValid = Boolean(reproForm.tipo && reproForm.data);
  const isEditingRepro = editingReproId != null;
  const reproFormPending = updateReproMutation.isPending;

  const carenciaResumo = (() => {
    const ateLista = (animalListRow as { fimCarenciaAte?: string | null } | undefined)?.fimCarenciaAte;
    if (animalListRow?.emCarencia && ateLista) {
      return { ativo: true, ate: ateLista };
    }
    if (!animalId) {
      return { ativo: false, ate: null as string | null };
    }
    const fimMap = buildFimCarenciaPorAnimal(
      sortedSaude.map(reg => ({
        animalId: animalId,
        medicamento: reg.medicamento,
        dataRegistro: reg.dataRegistro,
        proximaData: reg.proximaData,
      })),
      new Map(),
    );
    const fim = fimMap.get(animalId);
    if (!fim) {
      return { ativo: !!animalListRow?.emCarencia, ate: ateLista ?? null };
    }
    return { ativo: true, ate: toDateOnlyISO(fim) };
  })();

  const resumoPeso = computeResumoPeso(pesagens, animal);
  const ganhoExibicao = animalListRow?.ganhoKg ?? resumoPeso.ganhoKg;
  const gmdExibicao = animalListRow?.gmd ?? resumoPeso.gmd;
  const emCarencia = carenciaResumo.ativo;

  const fazendaNome = animal.fazendaId
    ? (fazendas.find(f => f.id === animal.fazendaId)?.nome ?? null)
    : null;

  const loteNome =
    (animal as { loteNome?: string | null }).loteNome ||
    (animal.loteId ? `#${animal.loteId}` : null);

  const histPastos = historicoPastos as HistoricoSubdivisaoRow[];
  const subdivisaoAtual =
    animalListRow?.pastoNome
    ?? histPastos.find(h => historicoSubdivisaoEstaAtual(h))?.pastoDestinoNome
    ?? null;

  const idadeMesesAnimal =
    animalListRow?.idadeMeses != null
      ? animalListRow.idadeMeses
      : animal.dataNascimento
        ? Math.floor(
            (Date.now() - new Date(animal.dataNascimento).getTime()) / (1000 * 60 * 60 * 24 * 30.44),
          )
        : null;

  const diasNaFazenda =
    (animal as { diasNaFazenda?: number | null }).diasNaFazenda ??
    animalListRow?.diasNaFazenda ??
    null;

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

        {/* Card principal — ficha gerencial */}
        <Card className="mb-5 overflow-hidden border border-gray-200 shadow-sm">
          <div className={`h-1 w-full ${statusAccentClass(animal.status)}`} />
          <div className="p-5">
            <div className="flex flex-col xl:flex-row xl:items-start gap-5">
              {/* Brinco + status */}
              <div className="shrink-0">
                <div className="text-5xl font-black text-gray-800 leading-none tracking-tight tabular-nums">
                  {animal.brinco || `#${animal.id}`}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClass(animal.status)}`}>
                    {statusLabel(animal.status)}
                  </span>
                  {emCarencia && (
                    <div className="inline-flex flex-col items-start gap-0.5">
                      <span className={EM_CARENCIA_SIM_BADGE_CLASS}>Em carência</span>
                      {carenciaResumo.ate && (
                        <span className="text-[10px] font-medium text-amber-700/90 tabular-nums pl-0.5">
                          Até {formatDateBR(carenciaResumo.ate)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dados principais */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Localização</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ResumoField label="Fazenda" value={fazendaNome || '—'} truncate />
                    <ResumoField label="Lote" value={loteNome || 'Sem lote'} truncate />
                    <ResumoField label="Subdivisão atual" value={subdivisaoAtual || '—'} truncate />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                  <ResumoField label="Nº RFID" value={animal.brincoEletronico || '—'} mono />
                  <ResumoField label="Sexo" value={animal.sexo === 'macho' ? 'Macho' : 'Fêmea'} />
                  <ResumoField label="Categoria" value={animal.categoria || '—'} />
                  <ResumoField label="Idade" value={formatIdadeResumo(idadeMesesAnimal)} />
                  <ResumoField
                    label="Dias na Fazenda"
                    value={diasNaFazenda != null ? `${diasNaFazenda} dias` : '—'}
                  />
                </div>
              </div>

              {/* Métricas + ação */}
              <div className="shrink-0 flex flex-col gap-1.5 w-full xl:w-[188px]">
                <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2.5 py-2 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Peso atual</p>
                  <p className={`mt-0.5 text-lg font-bold tabular-nums leading-tight ${resumoPeso.pesoAtual != null ? 'text-gray-800' : 'text-gray-500 text-[15px] font-medium'}`}>
                    {formatPesoAtualDisplay(resumoPeso.pesoAtual)}
                  </p>
                  {resumoPeso.ultimaPesagemData && resumoPeso.pesoAtual != null && (
                    <p className="mt-0.5 text-[10px] text-gray-400 leading-snug">
                      Última pesagem: {formatDate(resumoPeso.ultimaPesagemData)}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Ganho</p>
                    <p className={`mt-0.5 text-[13px] font-bold tabular-nums leading-tight ${ganhoToneClass(ganhoExibicao)}`}>
                      {formatGanhoDisplay(ganhoExibicao)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-2 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">GMD</p>
                    <p className="mt-0.5 text-[13px] font-bold tabular-nums leading-tight text-gray-800">
                      {formatGmdDisplay(gmdExibicao)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end pt-0.5">
                  <Button
                    size="sm"
                    onClick={() => setLocation(`/rebanho/editar-animal?id=${animal.id}`)}
                    className="w-auto px-5 text-white text-[12px] font-semibold min-h-[36px] hover:brightness-95"
                    style={{ backgroundColor: FD_ACTION }}
                  >
                    Editar Animal
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Abas de histórico */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full h-auto grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-4 gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-1">
            <TabsTrigger value="identificacao" className={TAB_TRIGGER_CLASS}>Identificação</TabsTrigger>
            <TabsTrigger value="pesagens" className={TAB_TRIGGER_CLASS}>Pesagens</TabsTrigger>
            <TabsTrigger value="saude" className={TAB_TRIGGER_CLASS}>Sanitário</TabsTrigger>
            <TabsTrigger value="reproducao" className={TAB_TRIGGER_CLASS}>Reprodução</TabsTrigger>
            <TabsTrigger value="pastos" className={TAB_TRIGGER_CLASS}>Subdivisão</TabsTrigger>
            <TabsTrigger value="observacoes" className={TAB_TRIGGER_CLASS}>Observações</TabsTrigger>
          </TabsList>

          {/* ─── Identificação Tab ─────────────────────────────────────────── */}
          <TabsContent value="identificacao">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  <Tag className="w-5 h-5 mr-2 text-[#2D5A5A]" />
                  Identificação
                </h2>
              </div>

              <div className="mb-6 rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Identificação atual
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ResumoField label="Brinco visual" value={animal.brinco || '—'} />
                  <ResumoField
                    label="RFID eletrônico"
                    value={animal.brincoEletronico || '—'}
                    mono
                  />
                </div>
              </div>

              <h3 className="text-[13px] font-semibold text-gray-700 mb-3">
                Histórico de identificação
              </h3>

              {loadingIdentificacao ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin w-6 h-6 text-[#4ECDC4]" />
                </div>
              ) : historicoIdentificacao.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <Tag className="w-12 h-12 mx-auto mb-3 text-[#4ECDC4]/40" />
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    Nenhuma alteração de identificação registrada.
                  </p>
                  <p className="text-[13px] text-gray-500 mt-2 leading-relaxed max-w-md mx-auto">
                    Trocas de brinco ou RFID feitas em Manejo → Identificação aparecerão aqui.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[11px] text-gray-500">
                    {historicoIdentificacao.length} altera
                    {historicoIdentificacao.length !== 1 ? 'ções' : 'ção'} registrada
                    {historicoIdentificacao.length !== 1 ? 's' : ''}
                    <span className="text-gray-400"> · mais recente primeiro</span>
                  </p>
                  <div className="rounded-lg border border-gray-100 overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-[12px] min-w-[480px]">
                      <colgroup>
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '22%' }} />
                        <col style={{ width: '44%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2.5 text-[9px] font-semibold text-gray-500 uppercase tracking-normal text-center">
                            Data
                          </th>
                          <th className="px-3 py-2.5 text-[9px] font-semibold text-gray-500 uppercase tracking-normal text-center">
                            Operação
                          </th>
                          <th className="px-3 py-2.5 text-[9px] font-semibold text-gray-500 uppercase tracking-normal text-center">
                            Alteração
                          </th>
                          <th className="px-3 py-2.5 text-[9px] font-semibold text-gray-500 uppercase tracking-normal text-center">
                            Motivo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoIdentificacao.map(reg => {
                          const linhasAlteracao = getLinhasAlteracaoIdentificacao(reg);
                          return (
                            <tr
                              key={reg.id}
                              className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors"
                            >
                              <td className="px-3 py-2.5 align-middle text-center text-gray-800 tabular-nums whitespace-nowrap">
                                {formatDateBR(reg.dataAlteracao)}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-center text-gray-800 font-medium">
                                {reg.operacaoLabel}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-center">
                                {linhasAlteracao.length === 0 ? (
                                  <span className="text-gray-400">—</span>
                                ) : (
                                  <div className="inline-flex flex-col items-center gap-2.5">
                                    {linhasAlteracao.map(linha => (
                                      <div key={linha.label} className="leading-snug">
                                        <p className="text-[10px] font-medium text-gray-400">
                                          {linha.label}
                                        </p>
                                        <p className="mt-0.5 tabular-nums text-[12px] font-semibold tracking-tight text-gray-800 break-all">
                                          {linha.de} → {linha.para}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {reg.observacaoLivre ? (
                                  <p className="mt-1.5 text-[10px] text-gray-500 leading-snug">
                                    {reg.observacaoLivre}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 align-middle text-center text-gray-700">
                                {reg.motivoLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          {/* ─── Sanitário Tab ─────────────────────────────────────────────── */}
          <TabsContent value="saude">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  <Syringe className="w-5 h-5 mr-2 text-red-600" />
                  Registros Sanitários
                </h2>
              </div>

              {loadingSaude ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                </div>
              ) : sortedSaude.length === 0 ? (
                <div className="text-center py-10 px-4 text-gray-500">
                  <Syringe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    Nenhum registro sanitário para este animal.
                    <br />
                    Novos registros são feitos em Manejo → Registros de Manejo → Sanitário.
                  </p>
                </div>
              ) : sortedSaude.length > 0 ? (
                <>
                  <p className="mb-3 text-[11px] text-gray-500">
                    {sortedSaude.length} registro{sortedSaude.length !== 1 ? 's' : ''} sanitário{sortedSaude.length !== 1 ? 's' : ''}
                    <span className="text-gray-400"> · mais recente primeiro</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full table-fixed border-collapse text-[12px] [&_th]:px-3 [&_th]:py-2.5 [&_td]:px-3 [&_td]:py-2.5 [&_th]:align-middle [&_td]:align-middle [&_th]:text-center [&_td]:text-center">
                      <colgroup>
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '22%' }} />
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Data
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Tipo
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Produto / medicamento
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Dose
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Via
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Custo
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-center">
                            Observações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSaude.map(reg => {
                          const tipoDisplay = formatTipoSanitarioTabelaDisplay(reg.tipo);
                          const produtoOuDescricao =
                            (reg.medicamento && String(reg.medicamento).trim()) ||
                            (reg.descricao && String(reg.descricao).trim()) ||
                            "";
                          const via =
                            "viaAplicacao" in reg && reg.viaAplicacao
                              ? String(reg.viaAplicacao).trim()
                              : "";
                          const obs = reg.observacoes?.trim() || "";
                          return (
                            <tr key={reg.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                              <td className="text-gray-800 tabular-nums whitespace-nowrap">
                                {formatDate(reg.dataRegistro)}
                              </td>
                              <td>
                                <span
                                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium leading-snug bg-red-50 text-red-700 border border-red-100 whitespace-nowrap"
                                  title={tipoDisplay.tituloCompleto !== '—' ? tipoDisplay.tituloCompleto : undefined}
                                >
                                  {tipoDisplay.label}
                                </span>
                              </td>
                              <td className="max-w-0">
                                <span
                                  className="block truncate max-w-full text-gray-800 font-medium"
                                  title={produtoOuDescricao || undefined}
                                >
                                  {produtoOuDescricao || '—'}
                                </span>
                              </td>
                              <td className="text-gray-600 whitespace-nowrap tabular-nums">
                                <span className="inline-block max-w-full truncate" title={reg.dosagem || undefined}>
                                  {reg.dosagem || '—'}
                                </span>
                              </td>
                              <td className="text-gray-600">
                                <span className="inline-block max-w-full truncate" title={via || undefined}>
                                  {via || '—'}
                                </span>
                              </td>
                              <td className="text-gray-800 tabular-nums whitespace-nowrap">
                                {formatCustoRegistroDisplay(reg.custo)}
                              </td>
                              <td className="max-w-0 text-center align-middle">
                                <div
                                  className="w-full text-center text-gray-600 break-words whitespace-normal leading-snug"
                                  title={obs || undefined}
                                >
                                  {obs || '—'}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex flex-col items-end gap-0.5 text-right">
                    <p className="text-[12px] text-gray-700">
                      <span className="font-medium text-gray-600">Total em custos sanitários: </span>
                      <span className="font-semibold tabular-nums text-gray-800">
                        {custoSanitarioResumo.totalFormatado}
                      </span>
                    </p>
                  </div>
                </>
              ) : null}
            </Card>
          </TabsContent>

          {/* ─── Reprodução Tab ────────────────────────────────────────────── */}
          <TabsContent value="reproducao">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800 flex items-center">
                  <HeartPulse className="w-5 h-5 mr-2 text-pink-600" />
                  Histórico Reprodutivo
                </h2>
              </div>

              {showReproForm && isEditingRepro && (
                <div className={INLINE_FORM_CARD}>
                  <h3 className={INLINE_FORM_TITLE}>
                    {isEditingRepro ? 'Editar Registro Reprodutivo' : 'Novo Registro Reprodutivo'}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <FormLabel required className="mb-1">Tipo de Registro</FormLabel>
                      <FormNativeSelect
                        value={reproForm.tipo}
                        onChange={newTipo => {
                          setPrevisaoPartoManual(false);
                          setReproForm(p => {
                            const resultado = isReproResultadoValidForTipo(
                              animal.sexo,
                              newTipo,
                              p.resultado,
                            )
                              ? p.resultado
                              : '';
                            return { ...p, tipo: newTipo, resultado };
                          });
                        }}
                        placeholder="Selecione"
                        required
                        compact
                        variant="light"
                        options={reproTipoOptions.map(tipo => ({ value: tipo, label: tipo }))}
                      />
                    </div>
                    <div>
                      <FormLabel required className="mb-1">Data</FormLabel>
                      <FormDatePicker
                        value={reproForm.data}
                        onChange={v => {
                          setPrevisaoPartoManual(false);
                          setReproForm(p => ({ ...p, data: v }));
                        }}
                        required
                      />
                    </div>
                    <div>
                      <FormLabel className="mb-1">Resultado / Status</FormLabel>
                      <FormNativeSelect
                        value={reproForm.resultado}
                        onChange={v => setReproForm(p => ({ ...p, resultado: v }))}
                        placeholder="Selecione (opcional)"
                        compact
                        variant="light"
                        options={reproResultadoOptions.map(r => ({ value: r, label: r }))}
                      />
                    </div>
                    <div>
                      <FormLabel className="mb-1">{reproRelacionadoLabel}</FormLabel>
                      <FormInput
                        value={reproForm.reprodutorSemen}
                        onChange={v => setReproForm(p => ({ ...p, reprodutorSemen: v }))}
                        placeholder={reproRelacionadoPlaceholder}
                        compact
                        variant="light"
                      />
                    </div>
                    {showPrevisaoPartoForm ? (
                      <>
                        <div>
                          <FormLabel className="mb-1">Previsão de Parto</FormLabel>
                          <FormDatePicker
                            value={reproForm.previsaoParto}
                            onChange={v => {
                              setPrevisaoPartoManual(true);
                              setReproForm(p => ({ ...p, previsaoParto: v }));
                            }}
                          />
                        </div>
                        <div>
                          <FormLabel className="mb-1">Responsável</FormLabel>
                          <FormInput
                            value={reproForm.responsavel}
                            onChange={v => setReproForm(p => ({ ...p, responsavel: v }))}
                            placeholder="Ex: Paulo Gomes"
                            compact
                            variant="light"
                          />
                        </div>
                      </>
                    ) : (
                      <div>
                        <FormLabel className="mb-1">Responsável</FormLabel>
                        <FormInput
                          value={reproForm.responsavel}
                          onChange={v => setReproForm(p => ({ ...p, responsavel: v }))}
                          placeholder="Ex: Paulo Gomes"
                          compact
                          variant="light"
                        />
                      </div>
                    )}
                    <div className="md:col-span-2">
                      <FormLabel className="mb-1">Observações</FormLabel>
                      <FormTextarea
                        value={reproForm.observacoes}
                        onChange={v => setReproForm(p => ({ ...p, observacoes: v }))}
                        placeholder="Descreva detalhes do registro reprodutivo..."
                        rows={3}
                        variant="light"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!reproFormValid) {
                          toast.error('Preencha Tipo de Registro e Data.');
                          return;
                        }
                        const commonPayload = {
                          tipo: reproForm.tipo,
                          dataCobertura: reproForm.data,
                          resultado: reproForm.resultado || undefined,
                          reprodutorSemen: reproForm.reprodutorSemen || undefined,
                          responsavel: reproForm.responsavel || undefined,
                          observacoes: reproForm.observacoes || undefined,
                        };
                        if (!isEditingRepro || editingReproId == null) {
                          toast.error('Novos registros reprodutivos são feitos em Manejo → Reprodutivo.');
                          return;
                        }
                        updateReproMutation.mutate({
                          id: editingReproId,
                          ...commonPayload,
                          dataPrevistoParto: showPrevisaoPartoForm && reproForm.previsaoParto
                            ? reproForm.previsaoParto
                            : null,
                        });
                      }}
                      disabled={!reproFormValid || reproFormPending}
                      className="text-white text-xs"
                      style={{ backgroundColor: FD_ACTION }}
                    >
                      {reproFormPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Salvar Alterações'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetReproFormState}
                      className="text-xs"
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {loadingRepro ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#4ECDC4]" />
                </div>
              ) : sortedAnimalRepro.length === 0 && !showReproForm ? (
                <div className="text-center py-10 px-4 text-gray-500">
                  <HeartPulse className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    {reproEmptyState.titulo}
                    <br />
                    {reproEmptyState.orientacao}
                  </p>
                </div>
              ) : sortedAnimalRepro.length > 0 && !showReproForm ? (
                <>
                  <p className="mb-3 text-[11px] text-gray-500">
                    {sortedAnimalRepro.length} registro{sortedAnimalRepro.length !== 1 ? 's' : ''} reprodutivo{sortedAnimalRepro.length !== 1 ? 's' : ''}
                    <span className="text-gray-400"> · mais recente primeiro</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-[12px] [&_th]:px-3 [&_th]:py-2.5 [&_td]:px-3 [&_td]:py-2.5 [&_th]:align-middle [&_td]:align-middle [&_th]:text-center [&_td]:text-center">
                      <colgroup>
                        {showPrevisaoColumn ? (
                          <>
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '16%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '11%' }} />
                            <col style={{ width: '23%' }} />
                            <col style={{ width: '12%' }} />
                          </>
                        ) : (
                          <>
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '13%' }} />
                            <col style={{ width: '22%' }} />
                            <col style={{ width: '23%' }} />
                            <col style={{ width: '12%' }} />
                          </>
                        )}
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Data
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Tipo
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Resultado
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            {reproRelacionadoTabelaHeader}
                          </th>
                          {showPrevisaoColumn && (
                            <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                              Previsão
                            </th>
                          )}
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            Observações
                          </th>
                          <th className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAnimalRepro.map(reg => {
                          const meta = unpackReproObservacoes(reg.observacoes);
                          const tipoDisplay = formatTipoReproTabelaDisplay(reg.tipo);
                          return (
                          <tr key={reg.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                            <td className="text-gray-800 tabular-nums whitespace-nowrap">
                              {formatDate(reg.dataCobertura)}
                            </td>
                            <td className="overflow-hidden">
                              <span
                                className="inline-block max-w-full truncate px-2 py-0.5 rounded text-[10px] font-medium leading-snug bg-pink-50 text-pink-700 border border-pink-100"
                                title={tipoDisplay.tituloCompleto}
                              >
                                {tipoDisplay.label}
                              </span>
                            </td>
                            <td className="text-gray-600 whitespace-nowrap">
                              {reg.resultado || '—'}
                            </td>
                            <td className="max-w-0">
                              <span
                                className="block truncate max-w-full text-gray-600 text-[11px]"
                                title={meta.reprodutorSemen || undefined}
                              >
                                {meta.reprodutorSemen || '—'}
                              </span>
                            </td>
                            {showPrevisaoColumn && (
                              <td className="text-gray-600 tabular-nums whitespace-nowrap">
                                {reg.dataPrevistoParto ? formatDate(reg.dataPrevistoParto) : '—'}
                              </td>
                            )}
                            <td className="max-w-0">
                              <span
                                className="block truncate max-w-full text-gray-600 text-[11px]"
                                title={meta.observacoes || undefined}
                              >
                                {meta.observacoes || '—'}
                              </span>
                            </td>
                            <td>
                              <div className="inline-flex items-center justify-center gap-1">
                                <TableIconButton
                                  label="Editar registro reprodutivo"
                                  onClick={() => handleEditRepro(reg)}
                                  tone="neutral"
                                >
                                  <EditActionIcon size={17} />
                                </TableIconButton>
                                <TableIconButton
                                  label="Excluir registro reprodutivo"
                                  onClick={() => void handleDeleteRepro(reg)}
                                  tone="danger"
                                >
                                  <DeleteActionIcon size={17} />
                                </TableIconButton>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
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
              </div>

              {false && showPesagemForm && (
                <div className={INLINE_FORM_CARD}>
                  <h3 className={INLINE_FORM_TITLE}>Registrar Pesagem</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <FormLabel required className="mb-1">Peso (kg)</FormLabel>
                      <FormInput
                        type="number"
                        value={pesagemForm.peso}
                        onChange={v => setPesagemForm(p => ({ ...p, peso: v }))}
                        placeholder="ex: 450"
                        min="0"
                        step="0.1"
                        required
                        compact
                        variant="light"
                      />
                    </div>
                    <div>
                      <FormLabel required className="mb-1">Data</FormLabel>
                      <FormDatePicker
                        value={pesagemForm.data}
                        onChange={v => setPesagemForm(p => ({ ...p, data: v }))}
                        required
                      />
                    </div>
                    <div>
                      <FormLabel className="mb-1">Observações</FormLabel>
                      <FormInput
                        value={pesagemForm.observacoes}
                        onChange={v => setPesagemForm(p => ({ ...p, observacoes: v }))}
                        placeholder="Opcional"
                        compact
                        variant="light"
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
                <div className="text-center py-10 px-4 text-gray-500">
                  <Weight className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    Nenhuma pesagem registrada para este animal.
                    <br />
                    Novas pesagens são registradas em Manejo → Registros de Manejo → Pesagem.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[11px] text-gray-500">
                    {sortedPesagens.length}{' '}
                    {sortedPesagens.length !== 1 ? 'pesagens' : 'pesagem'} registrada
                    {sortedPesagens.length !== 1 ? 's' : ''}
                    <span className="text-gray-400"> · mais recente primeiro</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full table-fixed border-collapse text-[12px]">
                      <colgroup>
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '34%' }} />
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2.5 text-center align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Data
                          </th>
                          <th className="px-4 py-2.5 text-center align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Peso (kg)
                          </th>
                          <th className="px-4 py-2.5 text-center align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            Variação (kg)
                          </th>
                          <th className="px-4 py-2.5 text-center align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                            GMD (kg/dia)
                          </th>
                          <th className="px-4 py-2.5 text-center align-middle text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                            Observações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedPesagens.map((pesagem, idx) => {
                          const prev = sortedPesagens[idx + 1];
                          const variation = prev
                            ? calcularVariacaoPesagem(prev.peso, pesagem.peso)
                            : null;
                          const gmdLinha = prev
                            ? calcularGmdEntrePesagens(
                                prev.peso,
                                pesagem.peso,
                                prev.data,
                                pesagem.data,
                              )
                            : null;
                          const pesoFmt = formatUltimoPesoKg(parseFloat(pesagem.peso || ''));
                          return (
                            <tr key={pesagem.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                              <td className="px-4 py-2.5 align-middle text-center text-gray-800 tabular-nums whitespace-nowrap">
                                {formatDate(pesagem.data)}
                              </td>
                              <td className="px-4 py-2.5 align-middle text-center font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                                {pesoFmt || '—'}
                              </td>
                              <td className="px-4 py-2.5 align-middle text-center tabular-nums whitespace-nowrap">
                                {variation !== null ? (
                                  <span className={`font-semibold ${variation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {variation >= 0 ? '+' : ''}
                                    {variation.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 align-middle text-center tabular-nums whitespace-nowrap">
                                {gmdLinha !== null ? (
                                  <span className={`font-medium ${gmdLinha >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                                    {gmdLinha.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 align-middle text-center">
                                <span
                                  className="block truncate text-gray-500 text-[11px] mx-auto max-w-full"
                                  title={pesagem.observacoes || undefined}
                                >
                                  {pesagem.observacoes || '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          {/* ─── Observações Tab ───────────────────────────────────────────── */}
          <TabsContent value="observacoes">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h2 className="text-lg font-bold text-gray-800">Observações do Animal</h2>
              </div>
              {animal.observacoes?.trim() ? (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {animal.observacoes.trim()}
                </div>
              ) : (
                <div className="text-center py-10 px-4">
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    Nenhuma observação registrada para este animal.
                  </p>
                  <p className="text-[13px] text-gray-500 mt-2 leading-relaxed max-w-md mx-auto">
                    Para alterar a observação geral do animal, use Editar Animal.
                  </p>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ─── Subdivisão Tab ─────────────────────────────────────────────────── */}
          <TabsContent value="pastos">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: '#7CB342' }} />
                Histórico de Subdivisões
              </h2>
              {loadingPastos ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin w-6 h-6 text-[#7CB342]" />
                </div>
              ) : histPastos.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <MapPin className="w-12 h-12 mx-auto mb-3 text-[#7CB342]/40" />
                  <p className="text-[13px] text-gray-600 leading-relaxed max-w-md mx-auto">
                    Nenhuma movimentação de subdivisão registrada para este animal.
                  </p>
                  <p className="text-[13px] text-gray-500 mt-2 leading-relaxed max-w-md mx-auto">
                    Quando o animal for movimentado entre pastos, piquetes, currais ou áreas de manejo, o histórico aparecerá aqui.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[11px] text-gray-500">
                    {histPastos.length} movimenta{histPastos.length !== 1 ? 'ções' : 'ção'} registrada{histPastos.length !== 1 ? 's' : ''}
                    <span className="text-gray-400"> · mais recente primeiro</span>
                  </p>
                  <div className="rounded-lg border border-gray-100 overflow-x-auto lg:overflow-x-visible">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-[11px] lg:min-w-0 min-w-[420px]">
                      <colgroup>
                        {HISTORICO_SUBDIVISAO_COLUNAS.map(col => (
                          <col key={col.id} style={{ width: col.width }} />
                        ))}
                      </colgroup>
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {HISTORICO_SUBDIVISAO_COLUNAS.map(col => (
                            <th
                              key={col.id}
                              className={cn(
                                'px-3 py-2.5 text-[9px] font-semibold text-gray-500 uppercase tracking-normal align-middle',
                                col.head,
                              )}
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {histPastos.map(m => {
                          const movimentacao = historicoSubdivisaoMovimentacao(m);
                          const status = historicoSubdivisaoStatus(m);
                          const atual = status === 'atual';
                          const tempo = historicoSubdivisaoTempo(m);
                          const tooltipMov = historicoSubdivisaoTooltipDetalhe(movimentacao, m);

                          return (
                            <tr
                              key={m.id}
                              className={cn(
                                'border-b border-gray-100 hover:bg-gray-50/80 transition-colors',
                                atual && 'bg-green-50/50',
                              )}
                            >
                              <td
                                className="px-3 py-2.5 align-middle text-center text-gray-800 tabular-nums whitespace-nowrap font-medium text-[11px]"
                              >
                                {m.dataEntrada ? formatDate(m.dataEntrada) : '—'}
                              </td>
                              <td className="px-3 py-2.5 align-middle max-w-0 text-center">
                                <HistoricoSubdivisaoCelulaTruncada
                                  texto={movimentacao}
                                  className="text-[12px] font-medium text-gray-800 text-center"
                                  title={tooltipMov}
                                />
                              </td>
                              <td className="px-3 py-2.5 align-middle text-center">
                                <HistoricoSubdivisaoStatusBadge status={status} />
                              </td>
                              <td className="px-2.5 py-2.5 align-middle text-center text-gray-600 tabular-nums text-[10px] leading-snug whitespace-nowrap">
                                {tempo}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </AppLayout>
  );
};
