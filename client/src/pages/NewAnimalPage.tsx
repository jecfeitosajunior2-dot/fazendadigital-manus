/**
 * AnimalFormPage — componente único para Cadastro e Edição de Animal.
 *
 * Modo detectado automaticamente:
 *   • Sem ?id=  → mode = "create"  → botão "Cadastrar Animal"
 *   • Com ?id=X → mode = "edit"    → carrega dados, botão "Salvar Alterações"
 *
 * Exporta dois aliases para compatibilidade com rotas existentes:
 *   NewAnimalPage   → /rebanho/novo-animal
 *   EditAnimalPage  → /rebanho/editar-animal?id=X
 */
import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Loader2, Plus, AlertCircle, Save, History, Tag, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  FormLabel,
  FieldBox,
  FormDatePicker,
  inputClass,
} from '@/components/FormFields';
import { cn } from '@/lib/utils';
import { filtrarLotesPorFazenda } from '@/lib/loteFazendaFilter';
import { getCategoriasPorSexo, todasAsCategorias } from '@shared/animal-types';

// ─── Constantes ──────────────────────────────────────────────────────────────

const RACAS = [
  'Nelore', 'Nelore Mocho', 'Angus', 'Senepol', 'Brahman',
  'Girolando', 'Gir', 'Holandês', 'Mestiço', 'Outro',
];

// ─── Tipos ───────────────────────────────────────────────────────────────────

type FormState = {
  // Identificação principal
  brinco: string;
  brincoEletronico: string;
  sexo: string;
  loteId: string;
  categoria: string;
  // Dados zootécnicos
  raca: string;
  pelagem: string;
  marca: string;
  dataNascimento: string;
  dataDesmama: string;
  castrado: boolean;
  // Entrada / aquisição
  dataEntrada: string;
  pesoEntrada: string;
  produtorOrigem: string;
  precoKg: string;
  frete: string;
  // Rastreabilidade
  sisbov: string;
  dataRnd: string;
  rgn: string;
  rgd: string;
  rastreadoNascimento: boolean;
  // Genealogia
  pai: string;
  mae: string;
  // Status (só em edição)
  status: string;
  // Observações
  observacoes: string;
};

const INITIAL: FormState = {
  brinco: '', brincoEletronico: '', sexo: '', loteId: '', categoria: '',
  raca: '', pelagem: '', marca: '', dataNascimento: '', dataDesmama: '', castrado: false,
  dataEntrada: '', pesoEntrada: '', produtorOrigem: '', precoKg: '', frete: '',
  sisbov: '', dataRnd: '', rgn: '', rgd: '', rastreadoNascimento: false,
  pai: '', mae: '',
  status: 'ativo',
  observacoes: '',
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string;
  hint?: string;
  children: React.ReactNode;
  compact?: boolean;
}> = ({ title, hint, children, compact }) => (
  <div className={cn('bg-white rounded-lg shadow-sm border border-gray-100', compact ? 'p-4' : 'p-5')}>
    <div className={cn('flex items-center justify-between', compact ? 'mb-3' : 'mb-4')}>
      <h2 className="text-sm font-bold text-gray-800">{title}</h2>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
    {children}
  </div>
);

const CollapsibleSectionCard: React.FC<{
  title: string;
  subtitle?: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, hint, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-gray-50/80 transition-colors"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          {!open && subtitle && (
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{subtitle}</p>
          )}
          {open && hint && (
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>
          )}
        </div>
        <ChevronDown
          className={cn('w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div className={cn('px-5 pb-5 pt-1 border-t border-gray-50', !open && 'hidden')}>
        {children}
      </div>
    </div>
  );
};

const FieldInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  error?: boolean;
  min?: string;
  step?: string;
}> = ({ value, onChange, placeholder, type = 'text', required, error, min, step }) => (
  <FieldBox required={required} className={cn(error && 'border-l-red-500')}>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      step={step}
      className={cn(inputClass, 'min-h-[42px]', error && 'text-red-600')}
    />
  </FieldBox>
);

const FieldSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}> = ({ value, onChange, required, error, children }) => (
  <FieldBox required={required} className={cn(error && 'border-l-red-500')}>
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(inputClass, 'appearance-none cursor-pointer min-h-[42px]')}
    >
      {children}
    </select>
  </FieldBox>
);

const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none h-[42px]">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-gray-300 text-[#4ECDC4] focus:ring-[#4ECDC4] accent-[#4ECDC4]"
    />
    <span className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">{label}</span>
  </label>
);

// ─── Constantes de motivo de troca de brinco ────────────────────────────────
type MotivoTroca = 'perda' | 'danificado' | 'reidentificacao' | 'erro_cadastro' | 'outro';

const MOTIVO_OPCOES: { value: MotivoTroca; label: string }[] = [
  { value: 'perda', label: 'Perda do brinco' },
  { value: 'danificado', label: 'Brinco danificado' },
  { value: 'reidentificacao', label: 'Reidentificação' },
  { value: 'erro_cadastro', label: 'Erro de cadastro' },
  { value: 'outro', label: 'Outro' },
];

const MOTIVO_LABELS: Record<MotivoTroca, string> = Object.fromEntries(
  MOTIVO_OPCOES.map(o => [o.value, o.label]),
) as Record<MotivoTroca, string>;

function formatHistoricoDataHora(reg: { dataAlteracao: string; createdAt?: Date | string | null }) {
  if (reg.createdAt) {
    const d = new Date(reg.createdAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }
  }
  if (!reg.dataAlteracao) return '—';
  const [y, m, day] = reg.dataAlteracao.split('-');
  if (y && m && day) return `${day}/${m}/${y}`;
  return reg.dataAlteracao;
}

type HistoricoBrincoRegistro = {
  id: number;
  brincoAnterior: string | null;
  brincoNovo: string;
  motivo: MotivoTroca;
  observacoes?: string | null;
  dataAlteracao: string;
  usuarioNome?: string | null;
  createdAt?: Date | string | null;
};

function HistoricoMetaField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-gray-500">{label}:</dt>
      <dd className="mt-0.5 text-[13px] text-gray-800 break-words">{value}</dd>
    </div>
  );
}

function HistoricoBrincoCard({ reg }: { reg: HistoricoBrincoRegistro }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {reg.brincoAnterior ? (
          <>
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500">De:</span>
              <span className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[13px] font-semibold text-gray-700">
                {reg.brincoAnterior}
              </span>
            </div>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden />
            <div className="inline-flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-gray-500">Para:</span>
              <span className="rounded border border-[#4ECDC4]/40 bg-[#4ECDC4]/10 px-2 py-0.5 font-mono text-[13px] font-semibold text-[#2D5A5A]">
                {reg.brincoNovo}
              </span>
            </div>
          </>
        ) : (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-gray-500">Para:</span>
            <span className="rounded border border-[#4ECDC4]/40 bg-[#4ECDC4]/10 px-2 py-0.5 font-mono text-[13px] font-semibold text-[#2D5A5A]">
              {reg.brincoNovo}
            </span>
          </div>
        )}
      </div>

      <dl className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
        <HistoricoMetaField label="Data" value={formatHistoricoDataHora(reg)} />
        <HistoricoMetaField label="Motivo" value={MOTIVO_LABELS[reg.motivo] ?? reg.motivo} />
        <HistoricoMetaField label="Registrado por" value={reg.usuarioNome?.trim() || '—'} />
        {reg.observacoes?.trim() && (
          <HistoricoMetaField label="Observação" value={reg.observacoes.trim()} />
        )}
      </dl>
    </article>
  );
}

function MotivoSelect({
  value,
  onChange,
  className,
}: {
  value: MotivoTroca;
  onChange: (v: MotivoTroca) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as MotivoTroca)}
      className={className}
    >
      {MOTIVO_OPCOES.map(op => (
        <option key={op.value} value={op.value}>{op.label}</option>
      ))}
    </select>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const AnimalFormPage: React.FC = () => {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // Detecta modo pelo parâmetro ?id=
  const searchParams = new URLSearchParams(window.location.search);
  const animalIdParam = searchParams.get('id');
  const animalId = animalIdParam ? parseInt(animalIdParam) : null;
  const isEditMode = !!animalId;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [populated, setPopulated] = useState(false); // evita sobrescrever após populate

  // ── Histórico de Trocas de Brinco (consulta) ──
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);

  // Intercepta troca de brinco ao salvar: armazena o payload pendente e abre modal de motivo
  const [pendingSavePayload, setPendingSavePayload] = useState<null | { id: number; payload: Record<string, unknown>; brincoAnterior: string | null }>(null);
  const [showConfirmarTrocaModal, setShowConfirmarTrocaModal] = useState(false);
  const [motivoTroca, setMotivoTroca] = useState<MotivoTroca>('reidentificacao');
  const [obsTroca, setObsTroca] = useState('');
  const [obsTrocaError, setObsTrocaError] = useState('');

  const podeConfirmarTrocaBrinco = motivoTroca !== 'outro' || obsTroca.trim().length > 0;

  const cancelarTrocaBrinco = () => {
    if (pendingSavePayload) {
      set('brinco', pendingSavePayload.brincoAnterior ?? animal?.brinco ?? '');
      setPendingSavePayload(null);
    }
    setShowConfirmarTrocaModal(false);
    setMotivoTroca('reidentificacao');
    setObsTroca('');
    setObsTrocaError('');
  };

  const { data: historicoBrincos, refetch: refetchHistorico } = trpc.brincos.list.useQuery(
    { animalId: animalId! },
    { enabled: isEditMode && !!animalId }
  );

  const registrarBrincoMutation = trpc.brincos.registrar.useMutation({
    onSuccess: () => {
      refetchHistorico();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  // ── Dados do animal (modo edição) ──
  const { data: animal, isLoading: loadingAnimal, error: animalError } =
    trpc.animais.getById.useQuery(
      { id: animalId! },
      { enabled: isEditMode }
    );

  // ── Fazendas ──
  const [fazendaId, setFazendaId] = useState('');
  const { data: fazendas } = trpc.fazendas.list.useQuery();

  // ── Pastos (subdivisões) filtrados por fazenda ──
  const [pastoId, setPastoId] = useState('');
  const { data: pastos } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: Number(fazendaId) },
    { enabled: !!fazendaId }
  );

  // ── Lotes (filtrados por fazenda se selecionada) ──
  const { data: todosLotes } = trpc.lotes.list.useQuery();
  const lotesFiltrados = filtrarLotesPorFazenda(todosLotes ?? [], fazendaId || null)
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  // ── Preenche formulário com dados do animal ao carregar (modo edição) ──
  useEffect(() => {
    if (!animal || populated) return;

    // Helper: converte Date ou string ISO para "YYYY-MM-DD"
    const toDateStr = (v: unknown): string => {
      if (!v) return '';
      if (typeof v === 'string') return v.split('T')[0];
      if (v instanceof Date) return v.toISOString().split('T')[0];
      return '';
    };

    // Preenche fazendaId e pastoId vindos do banco (importação ou cadastro anterior)
    if ((animal as any).fazendaId) setFazendaId(String((animal as any).fazendaId));
    if ((animal as any).pastoId) setPastoId(String((animal as any).pastoId));

    setForm({
      brinco: animal.brinco || '',
      brincoEletronico: (animal as any).brincoEletronico || '',
      sexo: animal.sexo === 'macho' ? 'Macho' : animal.sexo === 'femea' ? 'Fêmea' : '',
      loteId: animal.loteId ? String(animal.loteId) : '',
      categoria: animal.categoria || '',
      raca: animal.raca || '',
      pelagem: (animal as any).pelagem || '',
      marca: (animal as any).marca || '',
      dataNascimento: toDateStr(animal.dataNascimento),
      dataDesmama: toDateStr((animal as any).dataDesmama),
      castrado: !!(animal as any).castrado,
      dataEntrada: toDateStr((animal as any).dataEntrada),
      pesoEntrada: (animal as any).pesoEntrada || '',
      produtorOrigem: (animal as any).produtorOrigem || '',
      precoKg: (animal as any).precoKg || '',
      frete: (animal as any).frete || '',
      sisbov: (animal as any).sisbov || '',
      dataRnd: toDateStr((animal as any).dataRnd),
      rgn: (animal as any).rgn || '',
      rgd: (animal as any).rgd || '',
      rastreadoNascimento: !!(animal as any).rastreadoNascimento,
      pai: (animal as any).pai || '',
      mae: (animal as any).mae || '',
      status: animal.status || 'ativo',
      observacoes: animal.observacoes || '',
    });
    setPopulated(true);
  }, [animal, populated]);

  // ── Re-sincroniza fazendaId/pastoId quando as fazendas chegam depois do animal ──
  useEffect(() => {
    if (!animal || !fazendas || fazendas.length === 0) return;
    if (fazendaId) return; // já está preenchido
    const fid = (animal as any).fazendaId;
    if (fid) setFazendaId(String(fid));
    const pid = (animal as any).pastoId;
    if (pid) setPastoId(String(pid));
  }, [animal, fazendas]);

  // ── Criação rápida de lote ──
  const [loteDialogOpen, setLoteDialogOpen] = useState(false);
  const [novoLoteNome, setNovoLoteNome] = useState('');
  const [novoLoteDescricao, setNovoLoteDescricao] = useState('');

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const createLoteMutation = trpc.lotes.create.useMutation({
    onError: (err) => toast.error(`Erro ao criar lote: ${err.message}`),
  });

  const handleLoteSelectChange = (v: string) => {
    if (v === '__new__') { setLoteDialogOpen(true); return; }
    set('loteId', v);
  };

  const handleCriarLote = () => {
    const nome = novoLoteNome.trim();
    if (!fazendaId) { toast.error('Selecione uma fazenda antes de criar o lote.'); return; }
    if (!nome) { toast.error('Informe o nome do lote.'); return; }
    createLoteMutation.mutate(
      {
        nome,
        descricao: novoLoteDescricao.trim() || undefined,
        fazendaId: fazendaId ? Number(fazendaId) : undefined,
      },
      {
        onSuccess: async (res) => {
          toast.success('Lote criado com sucesso!');
          await utils.lotes.list.invalidate();
          if (res?.id != null) set('loteId', String(res.id));
          setNovoLoteNome('');
          setNovoLoteDescricao('');
          setLoteDialogOpen(false);
        },
      },
    );
  };

  // ── Validação ──
  const hasDataReferencia = !!(form.dataNascimento.trim() || form.dataEntrada.trim());
  const canSubmit =
    !!fazendaId &&
    !!form.brinco.trim() &&
    !!form.sexo &&
    !!form.categoria &&
    hasDataReferencia;

  const essentialFieldsHint = isEditMode
    ? 'Para salvar, preencha: Fazenda, Número do Brinco, Sexo, Categoria e Data de Nascimento ou Data de Entrada.'
    : 'Para cadastrar, preencha: Fazenda, Número do Brinco, Sexo, Categoria e Data de Nascimento ou Data de Entrada.';

  const clearDataReferenciaErrors = (nascimento: string, entrada: string) => {
    if (nascimento.trim() || entrada.trim()) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.dataNascimento;
        delete next.dataEntrada;
        return next;
      });
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fazendaId) e.fazenda = 'Selecione uma fazenda';
    if (!form.brinco.trim()) e.brinco = 'Número do brinco é obrigatório';
    if (!form.sexo) e.sexo = 'Sexo é obrigatório';
    if (!form.categoria) e.categoria = 'Categoria é obrigatória';
    if (!hasDataReferencia) {
      const msg = 'Informe Data de Nascimento ou Data de Entrada';
      e.dataNascimento = msg;
      e.dataEntrada = msg;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Payload comum ──
  const buildPayload = () => {
    const sexoMapped = form.sexo === 'Macho' ? 'macho' : 'femea';
    // Em modo de edição: campo de data vazio deve enviar null para limpar o valor no banco.
    // Em modo de criação: campo de data vazio envia undefined (omite o campo).
    const resolveData = (v: string) => {
      if (v) return v;                     // tem valor: envia o valor
      return isEditMode ? null : undefined; // vazio: null (limpa) em edição, undefined (omite) em criação
    };
    return {
      nome: form.brinco.trim(),
      brinco: form.brinco.trim() || undefined,
      brincoEletronico: form.brincoEletronico.trim() || undefined,
      sexo: sexoMapped as 'macho' | 'femea',
      loteId: form.loteId ? parseInt(form.loteId) : undefined,
      categoria: form.categoria.trim() || undefined,
      raca: form.raca.trim() || undefined,
      pelagem: form.pelagem.trim() || undefined,
      marca: form.marca.trim() || undefined,
      dataNascimento: resolveData(form.dataNascimento),
      dataDesmama: resolveData(form.dataDesmama),
      castrado: form.castrado,
      dataEntrada: resolveData(form.dataEntrada),
      pesoEntrada: form.pesoEntrada.trim() || undefined,
      produtorOrigem: form.produtorOrigem.trim() || undefined,
      precoKg: form.precoKg.trim() || undefined,
      frete: form.frete.trim() || undefined,
      sisbov: form.sisbov.trim() || undefined,
      dataRnd: resolveData(form.dataRnd),
      rgn: form.rgn.trim() || undefined,
      rgd: form.rgd.trim() || undefined,
      rastreadoNascimento: form.rastreadoNascimento,
      pai: form.pai.trim() || undefined,
      mae: form.mae.trim() || undefined,
      status: form.status as 'ativo' | 'vendido' | 'morto' | 'transferido',
      observacoes: form.observacoes.trim() || undefined,
      fazendaId: fazendaId ? parseInt(fazendaId) : undefined,
      pastoId: pastoId ? parseInt(pastoId) : undefined,
    };
  };

  // ── Mutations ──
  const createMutation = trpc.animais.create.useMutation({
    onError: (err) => toast.error(`Erro ao cadastrar animal: ${err.message}`),
  });

  const updateMutation = trpc.animais.update.useMutation({
    onError: (err) => toast.error(`Erro ao atualizar animal: ${err.message}`),
  });

  const confirmarTrocaBrinco = async () => {
    if (!pendingSavePayload) return;
    if (motivoTroca === 'outro' && !obsTroca.trim()) {
      setObsTrocaError('Informe o motivo da troca nas observações.');
      return;
    }
    setObsTrocaError('');
    const { id, payload, brincoAnterior } = pendingSavePayload;
    const brincoNovo = String((payload as { brinco?: string }).brinco ?? form.brinco);
    const confirmadoEm = new Date();
    try {
      await updateMutation.mutateAsync({ id, ...(payload as Record<string, unknown>) });
      await registrarBrincoMutation.mutateAsync({
        animalId: id,
        brincoAnterior,
        brincoNovo,
        motivo: motivoTroca,
        observacoes: obsTroca.trim() || null,
        dataAlteracao: confirmadoEm.toISOString().split('T')[0],
      });
      setPendingSavePayload(null);
      setShowConfirmarTrocaModal(false);
      setMotivoTroca('reidentificacao');
      setObsTroca('');
      toast.success('Animal atualizado e troca de brinco registrada!');
      utils.animais.list.invalidate();
      utils.animais.getById.invalidate({ id: animalId! });
      await refetchHistorico();
      setLocation('/rebanho/lista-animais');
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Falha ao salvar'}`);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending
    || registrarBrincoMutation.isPending;

  const handleSave = (novo = false) => {
    if (!validate()) {
      toast.error('Preencha os campos obrigatórios em destaque.');
      return;
    }
    if (isEditMode) {
      const payload = buildPayload();
      // Em modo edição: campos vazios enviam null para limpar o valor no banco
      const resolveStr = (v: string) => v.trim() ? v.trim() : null;
      const editPayload = {
        ...payload,
        loteId: form.loteId ? parseInt(form.loteId) : null,
        pastoId: pastoId ? parseInt(pastoId) : null,
        // Campos de texto: null limpa, string atualiza
        brincoEletronico: resolveStr(form.brincoEletronico),
        raca: resolveStr(form.raca),
        pelagem: resolveStr(form.pelagem),
        marca: resolveStr(form.marca),
        pesoEntrada: resolveStr(form.pesoEntrada),
        produtorOrigem: resolveStr(form.produtorOrigem),
        precoKg: resolveStr(form.precoKg),
        frete: resolveStr(form.frete),
        sisbov: resolveStr(form.sisbov),
        rgn: resolveStr(form.rgn),
        rgd: resolveStr(form.rgd),
        pai: resolveStr(form.pai),
        mae: resolveStr(form.mae),
        observacoes: resolveStr(form.observacoes),
      };

      // Detecta mudança de brinco: abre modal de motivo antes de salvar
      const brincoOriginal = animal?.brinco ?? null;
      const brincoNovo = form.brinco.trim();
      if (brincoOriginal && brincoNovo && brincoNovo !== brincoOriginal) {
        // Armazena payload e abre modal de confirmação de troca
        setPendingSavePayload({ id: animalId!, payload: editPayload as Record<string, unknown>, brincoAnterior: brincoOriginal });
        setMotivoTroca('reidentificacao');
        setObsTroca('');
        setObsTrocaError('');
        setShowConfirmarTrocaModal(true);
        return; // Aguarda confirmação no modal
      }

      updateMutation.mutate({ id: animalId!, ...editPayload }, {
        onSuccess: () => {
          toast.success('Animal atualizado com sucesso!');
          utils.animais.list.invalidate();
          utils.animais.getById.invalidate({ id: animalId! });
          setLocation('/rebanho/lista-animais');
        },
      });
    } else {
      createMutation.mutate(buildPayload(), {
        onSuccess: () => {
          toast.success('Animal cadastrado com sucesso!');
          utils.animais.list.invalidate();
          if (novo) {
            // Preserva contexto do lote/rebanho; limpa identificação e dados por animal
            setForm({
              ...INITIAL,
              sexo: form.sexo,
              categoria: form.categoria,
              loteId: form.loteId,
              raca: form.raca,
              pelagem: form.pelagem,
              marca: form.marca,
              produtorOrigem: form.produtorOrigem,
            });
            setErrors({});
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            setLocation('/rebanho/lista-animais');
          }
        },
      });
    }
  };

  // ── Estados de carregamento / erro (modo edição) ──
  if (isEditMode && !animalId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-4">ID de animal inválido</h2>
            <Button onClick={() => setLocation('/rebanho/lista-animais')}>Voltar para Lista de Animais</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isEditMode && loadingAnimal) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-[#4ECDC4]" />
          <span className="ml-3 text-gray-600">Carregando dados do animal...</span>
        </div>
      </AppLayout>
    );
  }

  if (isEditMode && (animalError || !animal)) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Animal não encontrado</h2>
            <p className="text-gray-500 mb-4">O animal com ID {animalId} não foi encontrado.</p>
            <Button onClick={() => setLocation('/rebanho/lista-animais')}>Voltar para Lista de Animais</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Título dinâmico ──
  const pageTitle = isEditMode
    ? `Editar Animal — ${animal?.brinco || animal?.nome || `#${animalId}`}`
    : 'Cadastro de Animal';
  const pageSubtitle = isEditMode
    ? 'Atualize as informações do animal'
    : 'Preencha os dados principais do animal. Informações avançadas podem ser completadas depois.';

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto pb-10">
        <button
          type="button"
          onClick={() => setLocation('/rebanho/lista-animais')}
          disabled={isSubmitting}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-[13px]">Voltar</span>
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{pageSubtitle}</p>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handleSave(false); }}
          className="space-y-4"
        >
          {/* ── Identificação Principal ── */}
          <SectionCard title="Identificação Principal" hint="Campos obrigatórios em destaque">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Fazenda</FormLabel>
                  <FieldBox required className={cn(errors.fazenda && 'border-l-red-500')}>
                    <select
                      value={fazendaId}
                      onChange={e => {
                        setFazendaId(e.target.value);
                        set('loteId', '');
                        setPastoId('');
                        if (errors.fazenda) setErrors(prev => ({ ...prev, fazenda: '' }));
                      }}
                      className={cn(inputClass, 'appearance-none cursor-pointer min-h-[42px]', errors.fazenda && 'text-red-600')}
                    >
                      <option value="">Selecione uma Fazenda</option>
                      {fazendas?.map(f => (
                        <option key={f.id} value={String(f.id)}>{f.nome}</option>
                      ))}
                    </select>
                  </FieldBox>
                  {errors.fazenda && <p className="text-xs text-red-600 mt-1">{errors.fazenda}</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <FormLabel required>Número do Brinco</FormLabel>
                    {isEditMode && (
                      <button
                        type="button"
                        onClick={() => setShowHistoricoModal(true)}
                        title="Histórico de Trocas de Brinco"
                        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#4ECDC4] transition-colors px-2 py-0.5 rounded border border-gray-200 hover:border-[#4ECDC4] bg-white"
                      >
                        <History className="w-3 h-3" />
                        Histórico
                        {historicoBrincos && historicoBrincos.length > 0 && (
                          <span className="ml-0.5 bg-[#4ECDC4] text-white text-[9px] rounded-full px-1.5 font-bold">
                            {historicoBrincos.length}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                  <FieldInput
                    value={form.brinco}
                    onChange={v => set('brinco', v)}
                    placeholder="ex: BR-12345"
                    required
                    error={!!errors.brinco}
                  />
                  {errors.brinco && <p className="text-xs text-red-600 mt-1">{errors.brinco}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Sexo</FormLabel>
                  <FieldSelect
                    value={form.sexo}
                    onChange={v => { set('sexo', v); set('categoria', ''); }}
                    required
                    error={!!errors.sexo}
                  >
                    <option value="">Selecione</option>
                    <option value="Macho">Macho</option>
                    <option value="Fêmea">Fêmea</option>
                  </FieldSelect>
                  {errors.sexo && <p className="text-xs text-red-600 mt-1">{errors.sexo}</p>}
                </div>
                <div>
                  <FormLabel required>Categoria</FormLabel>
                  <FieldSelect value={form.categoria} onChange={v => set('categoria', v)} required error={!!errors.categoria}>
                    <option value="">Selecione</option>
                    {(form.sexo ? getCategoriasPorSexo(form.sexo) : todasAsCategorias()).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </FieldSelect>
                  {errors.categoria && <p className="text-xs text-red-600 mt-1">{errors.categoria}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel>Lote</FormLabel>
                  <FieldSelect value={form.loteId} onChange={handleLoteSelectChange}>
                    <option value="">Sem lote</option>
                    {lotesFiltrados.map(l => (
                      <option key={l.id} value={l.id}>{l.nome}</option>
                    ))}
                  </FieldSelect>
                </div>
                <div>
                  <FormLabel>Subdivisão</FormLabel>
                  <FieldBox>
                    <select
                      value={pastoId}
                      onChange={e => setPastoId(e.target.value)}
                      disabled={!fazendaId}
                      className={cn(inputClass, 'appearance-none cursor-pointer min-h-[42px]', !fazendaId && 'opacity-50 cursor-not-allowed')}
                    >
                      <option value="">{fazendaId ? 'Selecione a subdivisão' : 'Selecione uma fazenda primeiro'}</option>
                      {(pastos ?? []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' })).map(p => (
                        <option key={p.id} value={String(p.id)}>{p.nome}</option>
                      ))}
                    </select>
                  </FieldBox>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* ── Dados Zootécnicos Básicos ── */}
          <SectionCard title="Dados Zootécnicos Básicos" compact>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel>Raça</FormLabel>
                <FieldSelect value={form.raca} onChange={v => set('raca', v)}>
                  <option value="">Selecione</option>
                  {RACAS.map(r => <option key={r} value={r}>{r}</option>)}
                </FieldSelect>
              </div>
              <div>
                <FormLabel>Pelagem</FormLabel>
                <FieldInput value={form.pelagem} onChange={v => set('pelagem', v)} placeholder="ex: Branca" />
              </div>
              <div>
                <FormLabel>Marca</FormLabel>
                <FieldInput value={form.marca} onChange={v => set('marca', v)} placeholder="ex: Marca a fogo" />
              </div>
              <div>
                <FormLabel required={!form.dataEntrada}>
                  Data de Nascimento
                  {!form.dataEntrada && (
                    <span className="ml-1 text-[11px] text-gray-400 font-normal">(ou Data de Entrada)</span>
                  )}
                </FormLabel>
                <div className={cn(errors.dataNascimento && 'ring-1 ring-red-400 rounded-sm')}>
                  <FormDatePicker
                    value={form.dataNascimento}
                    onChange={v => {
                      set('dataNascimento', v);
                      clearDataReferenciaErrors(v, form.dataEntrada);
                    }}
                    placeholder="dd/mm/aaaa"
                  />
                </div>
                {errors.dataNascimento && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.dataNascimento}</p>
                )}
              </div>
              <div>
                <FormLabel>Data de Desmama</FormLabel>
                <FormDatePicker
                  value={form.dataDesmama}
                  onChange={v => set('dataDesmama', v)}
                  placeholder="dd/mm/aaaa"
                />
              </div>
              <div className="flex items-end">
                <Checkbox checked={form.castrado} onChange={v => set('castrado', v)} label="Castrado" />
              </div>
            </div>
          </SectionCard>

          {/* ── Entrada do Animal ── */}
          <SectionCard title="Entrada do Animal" compact>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel required={!form.dataNascimento}>
                  Data de Entrada
                  {!form.dataNascimento && (
                    <span className="ml-1 text-[11px] text-gray-400 font-normal">(ou Data de Nascimento)</span>
                  )}
                </FormLabel>
                <div className={cn(errors.dataEntrada && 'ring-1 ring-red-400 rounded-sm')}>
                  <FormDatePicker
                    value={form.dataEntrada}
                    onChange={v => {
                      set('dataEntrada', v);
                      clearDataReferenciaErrors(form.dataNascimento, v);
                    }}
                    placeholder="dd/mm/aaaa"
                  />
                </div>
                {errors.dataEntrada && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.dataEntrada}</p>
                )}
              </div>
              <div>
                <FormLabel>Peso na Entrada (kg)</FormLabel>
                <FieldInput
                  value={form.pesoEntrada}
                  onChange={v => set('pesoEntrada', v)}
                  placeholder="ex: 320"
                  type="number"
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <FormLabel>Produtor de Origem</FormLabel>
                <FieldInput value={form.produtorOrigem} onChange={v => set('produtorOrigem', v)} placeholder="Nome do produtor" />
              </div>
            </div>
          </SectionCard>

          {/* ── Brinco Eletrônico / RFID (recolhível) ── */}
          <CollapsibleSectionCard
            title="Brinco Eletrônico / RFID — opcional"
            subtitle="Informe o código RFID ou transponder eletrônico, se houver."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <div>
                <FormLabel>Código do Brinco Eletrônico</FormLabel>
                <FieldInput
                  value={form.brincoEletronico}
                  onChange={v => set('brincoEletronico', v)}
                  placeholder="ex: 076000000000001 ou código RFID"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Número do transponder eletrônico (EID/RFID) ou código de rastreabilidade eletrônica.
                </p>
              </div>
            </div>
          </CollapsibleSectionCard>

          {/* ── Dados comerciais da aquisição (recolhível) ── */}
          <CollapsibleSectionCard
            title="Dados comerciais da aquisição"
            subtitle="Informe preço e frete quando o animal tiver sido comprado."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <div>
                <FormLabel>Preço (R$/kg)</FormLabel>
                <FieldInput
                  value={form.precoKg}
                  onChange={v => set('precoKg', v)}
                  placeholder="ex: 12,50"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <FormLabel>Frete (R$)</FormLabel>
                <FieldInput
                  value={form.frete}
                  onChange={v => set('frete', v)}
                  placeholder="ex: 350,00"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </CollapsibleSectionCard>

          {/* ── Rastreabilidade (recolhível) ── */}
          <CollapsibleSectionCard
            title="Rastreabilidade e Registros Oficiais"
            subtitle="SISBOV, RGN, RGD e demais registros oficiais."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-3">
              <div>
                <FormLabel>SISBOV</FormLabel>
                <FieldInput value={form.sisbov} onChange={v => set('sisbov', v)} placeholder="ex: 076000000000001" />
              </div>
              <div>
                <FormLabel>Data RND</FormLabel>
                <FormDatePicker value={form.dataRnd} onChange={v => set('dataRnd', v)} placeholder="dd/mm/aaaa" />
              </div>
              <div>
                <FormLabel>RGN</FormLabel>
                <FieldInput value={form.rgn} onChange={v => set('rgn', v)} placeholder="Registro Geral de Nascimento" />
              </div>
              <div>
                <FormLabel>RGD</FormLabel>
                <FieldInput value={form.rgd} onChange={v => set('rgd', v)} placeholder="Registro Genealógico Definitivo" />
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-2">
                <Checkbox
                  checked={form.rastreadoNascimento}
                  onChange={v => set('rastreadoNascimento', v)}
                  label="Rastreado no Nascimento"
                />
              </div>
            </div>
          </CollapsibleSectionCard>

          {/* ── Genealogia (recolhível) ── */}
          <CollapsibleSectionCard
            title="Genealogia"
            subtitle="Pai e mãe do animal, quando conhecidos."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <div>
                <FormLabel>Pai (Reprodutor)</FormLabel>
                <FieldInput value={form.pai} onChange={v => set('pai', v)} placeholder="Nome / brinco do pai" />
              </div>
              <div>
                <FormLabel>Mãe (Matriz)</FormLabel>
                <FieldInput value={form.mae} onChange={v => set('mae', v)} placeholder="Nome / brinco da mãe" />
              </div>
            </div>
          </CollapsibleSectionCard>

          {/* ── Status ── */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-4 py-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <h2 className="text-sm font-bold text-gray-800 shrink-0">Status do Animal</h2>
              <div className="w-full sm:max-w-[200px]">
                <FieldSelect value={form.status} onChange={v => set('status', v)}>
                  <option value="ativo">Ativo</option>
                  <option value="vendido">Vendido</option>
                  <option value="morto">Morto</option>
                  <option value="transferido">Transferido</option>
                </FieldSelect>
              </div>
            </div>
          </div>

          {/* ── Observações Gerais ── */}
          <SectionCard title="Observações Gerais" compact>
            <FieldBox>
              <textarea
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Digite informações adicionais relevantes..."
                rows={3}
                className={cn(inputClass, 'resize-y min-h-[80px]')}
              />
            </FieldBox>
          </SectionCard>

          {/* ── Ações ── */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {!canSubmit ? (
                <p className="flex items-center gap-1.5 text-[11px] text-amber-700/90 sm:max-w-md">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" aria-hidden />
                  <span>{essentialFieldsHint}</span>
                </p>
              ) : (
                <span className="hidden sm:block" aria-hidden />
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation('/rebanho/lista-animais')}
                disabled={isSubmitting}
                className={cn(
                  'min-h-[44px] bg-white border-[#CBD5E1] text-[#1E293B] hover:bg-slate-50 hover:text-[#1E293B]',
                  isSubmitting && 'opacity-60 cursor-not-allowed hover:bg-white',
                )}
              >
                Cancelar
              </Button>

              {!isEditMode && (
                <Button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={isSubmitting || !canSubmit}
                  className={cn(
                    'min-h-[44px] bg-white border-[#4ECDC4] text-[#159A91] hover:bg-[rgba(78,205,196,0.08)]',
                    (isSubmitting || !canSubmit) &&
                      'border-[#4ECDC4]/45 text-[#159A91]/45 cursor-not-allowed hover:bg-white',
                  )}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar e Novo
                </Button>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className={cn(
                  'min-h-[44px] text-white border border-transparent',
                  canSubmit && !isSubmitting
                    ? 'bg-[#4ECDC4] hover:bg-[#38BDB4]'
                    : 'bg-[#B8E8E4] text-white/75 cursor-not-allowed hover:bg-[#B8E8E4]',
                )}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {isEditMode ? 'Salvar Alterações' : 'Cadastrar Animal'}
              </Button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* ── Diálogo: criar novo lote ── */}
      <Dialog open={loteDialogOpen} onOpenChange={setLoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar novo lote</DialogTitle>
            <DialogDescription>
              O lote criado ficará disponível e será selecionado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <FormLabel required>Nome do lote</FormLabel>
              <Input
                value={novoLoteNome}
                onChange={e => setNovoLoteNome(e.target.value)}
                placeholder="ex: Lote Recria 2026"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCriarLote(); } }}
              />
            </div>
            <div>
              <FormLabel>Descrição (opcional)</FormLabel>
              <Input
                value={novoLoteDescricao}
                onChange={e => setNovoLoteDescricao(e.target.value)}
                placeholder="ex: Bezerros desmamados"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => setLoteDialogOpen(false)}
              className="bg-gray-400 hover:bg-gray-500 text-white"
              disabled={createLoteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCriarLote}
              className="text-white"
              style={{ backgroundColor: '#4ECDC4' }}
              disabled={createLoteMutation.isPending}
            >
              {createLoteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar lote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Histórico de Trocas de Brinco ─────────────────────────────────────────────────── */}
      <Dialog open={showHistoricoModal} onOpenChange={setShowHistoricoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-[#4ECDC4]" />
              Histórico de Trocas de Brinco
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {!historicoBrincos || historicoBrincos.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Tag className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm text-gray-600">
                  Nenhuma troca de brinco registrada para este animal.
                </p>
                <p className="mt-2 text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                  Quando o número do brinco for alterado na edição do animal, o histórico será registrado automaticamente.
                </p>
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {historicoBrincos.map((reg) => (
                  <HistoricoBrincoCard
                    key={reg.id}
                    reg={reg as HistoricoBrincoRegistro}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end border-t pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowHistoricoModal(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal: Confirmar Troca de Brinco ao Salvar ───────────────────────────────────────────────────── */}
      <Dialog
        open={showConfirmarTrocaModal}
        onOpenChange={open => {
          if (!open) cancelarTrocaBrinco();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-amber-500" />
              Troca de Brinco Detectada
            </DialogTitle>
            <DialogDescription>
              O número do brinco foi alterado. Informe o motivo para registrar no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            {/* Visualização da troca */}
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-sm font-mono bg-red-100 text-red-700 px-2 py-1 rounded border border-red-200">
                {pendingSavePayload?.brincoAnterior ?? '—'}
              </span>
              <span className="text-amber-500 font-bold">→</span>
              <span className="text-sm font-mono bg-green-100 text-green-700 px-2 py-1 rounded border border-green-200">
                {form.brinco.trim()}
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo da Troca *</label>
              <MotivoSelect
                value={motivoTroca}
                onChange={motivo => {
                  setMotivoTroca(motivo);
                  if (motivo !== 'outro') setObsTrocaError('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Observações{motivoTroca === 'outro' ? ' *' : ' (opcional)'}
              </label>
              <textarea
                value={obsTroca}
                onChange={e => {
                  setObsTroca(e.target.value);
                  if (e.target.value.trim()) setObsTrocaError('');
                }}
                rows={2}
                placeholder="Detalhe o motivo da troca..."
                className={cn(
                  'w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#4ECDC4]',
                  obsTrocaError ? 'border-red-400' : 'border-gray-300',
                )}
              />
              {obsTrocaError && (
                <p className="mt-1 text-[11px] text-red-500">{obsTrocaError}</p>
              )}
            </div>
            <div className="flex gap-3 pt-2 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={cancelarTrocaBrinco}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: '#4ECDC4' }}
                disabled={isSubmitting || !podeConfirmarTrocaBrinco}
                onClick={confirmarTrocaBrinco}
              >
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" /> Salvar e Registrar Troca</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

// ─── Aliases de exportação ────────────────────────────────────────────────────
// Ambas as rotas (/rebanho/novo-animal e /rebanho/editar-animal?id=X)
// usam exatamente o mesmo componente.

export const NewAnimalPage = AnimalFormPage;
export const EditAnimalPage = AnimalFormPage;
export default AnimalFormPage;
