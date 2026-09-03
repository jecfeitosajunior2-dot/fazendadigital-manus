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
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
  formControlFlatCls,
} from '@/components/FormFields';
import { cn } from '@/lib/utils';
import { filtrarLotesPorFazenda } from '@/lib/loteFazendaFilter';
import {
  condicaoCastracaoAposTrocaSexo,
  deveMostrarCondicaoCastracaoCadastro,
  isRegistroCastracao,
  isSexoMacho,
  resolverCastradoCadastroInicial,
  textoCastradoSomenteLeitura,
  type CondicaoCastracaoCadastro,
} from '@shared/castracaoManejo';
import {
  HINT_PESO_ENTRADA,
  MSG_PESO_ENTRADA_INVALIDO,
  isPesoEntradaFormValido,
} from '@shared/pesoEntrada';
import { deveExibirDataDesmamaNoFormularioAnimal } from '@shared/desmamaManejo';
import {
  categoriaAposTrocaSexoNoFormulario,
  MSG_BLOQUEIO_SEXO_GENERICA,
  MSG_CAMPOS_OBRIGATORIOS_DESTAQUE,
  opcoesCategoriaComValorAtual,
  toastErroSalvarEditarAnimal,
} from '@shared/validarAlteracaoSexoAnimal';
import { At05RfidReaderControl } from '@/components/At05RfidReaderControl';
import { statusBadgeClass } from '@/lib/fichaAnimalDisplay';
import { deveMostrarLeituraRfidCadastro } from '@/lib/rfidLeituraCadastro';
import {
  formatarDataBaixa,
  isTipoBaixaAnimal,
  STATUS_ANIMAL_LABEL,
  TIPO_BAIXA_LABEL,
  type StatusAnimal,
  type TipoBaixaAnimal,
} from '@shared/animalBaixa';
import { formatarCausaMorteExibicao } from '@shared/causaMorte';

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
  castracaoCondicao: CondicaoCastracaoCadastro;
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
  raca: '', pelagem: '', marca: '', dataNascimento: '', dataDesmama: '', castracaoCondicao: 'nao_informado',
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
}> = ({ title, hint, children }) => (
  <section className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-100">
      <h2 className="text-[13px] font-semibold text-[#4ECDC4]">{title}</h2>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{hint}</p> : null}
    </div>
    <div className="p-5">{children}</div>
  </section>
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
    <section className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left border-b border-gray-100"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-[#4ECDC4]">{title}</h2>
          {!open && subtitle ? (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{subtitle}</p>
          ) : null}
          {open && hint ? (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</p>
          ) : null}
        </div>
        <ChevronDown
          className={cn('w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div className={cn('p-5', !open && 'hidden')}>{children}</div>
    </section>
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
  readOnly?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, type = 'text', required, error, min, step, readOnly, disabled }) => (
  <FormInput
    variant="light"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    type={type}
    required={required}
    invalid={error}
    min={min}
    step={step}
    readOnly={readOnly || disabled}
  />
);

const FieldSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: boolean;
  disabled?: boolean;
  placeholder: string;
  options: { value: string; label: string }[];
}> = ({ value, onChange, required, error, disabled, placeholder, options }) => (
  <FormNativeSelect
    variant="light"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    required={required}
    invalid={error}
    disabled={disabled}
    options={options}
  />
);

const ReadOnlyField: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className={cn(formControlFlatCls, 'flex items-center bg-white text-gray-600')}>
    {children}
  </div>
);

const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => (
  <label className={cn('flex items-center gap-2.5 select-none h-[34px]', disabled ? 'cursor-default opacity-80' : 'cursor-pointer')}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      disabled={disabled}
      className="w-4 h-4 rounded border-gray-300 text-[#4ECDC4] focus:ring-[#4ECDC4] accent-[#4ECDC4]"
    />
    <span className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">{label}</span>
  </label>
);

const ManejoCampoHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-1 text-[11px] text-gray-500 leading-snug">{children}</p>
);

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
  const [bloqueioSexoMsg, setBloqueioSexoMsg] = useState<string | null>(null);

  // ── Dados do animal (modo edição) ──
  const { data: animal, isLoading: loadingAnimal, error: animalError } =
    trpc.animais.getById.useQuery(
      { id: animalId! },
      { enabled: isEditMode }
    );

  const { data: saudeRegistros } = trpc.saude.list.useQuery(
    { animalId: animalId! },
    { enabled: isEditMode && !!animalId },
  );

  const sexoExibicaoCastrado =
    form.sexo === 'Macho'
      ? 'macho'
      : form.sexo === 'Fêmea'
        ? 'femea'
        : ((animal as { sexo?: string | null } | undefined)?.sexo ?? '');

  const castradoSomenteLeitura = useMemo(() => {
    const flag = (animal as { castrado?: boolean | number | null } | undefined)?.castrado ?? null;
    const temEvento = (saudeRegistros ?? []).some(r => isRegistroCastracao(r.tipo));
    return textoCastradoSomenteLeitura({
      sexo: sexoExibicaoCastrado,
      castrado: flag,
      temEventoCastracao: temEvento,
    });
  }, [animal, sexoExibicaoCastrado, saudeRegistros]);

  const mostrarCastradoEdicao = isEditMode && isSexoMacho(sexoExibicaoCastrado);

  const genealogiaExibicao = useMemo(() => {
    if (!isEditMode || !animal) {
      return { mae: form.mae, pai: form.pai };
    }
    const display = (animal as { genealogiaDisplay?: { mae?: string; pai?: string } })
      .genealogiaDisplay;
    return {
      mae: display?.mae ?? '',
      pai: display?.pai ?? '',
    };
  }, [isEditMode, animal, form.mae, form.pai]);

  const temMaeEstruturada =
    isEditMode &&
    (animal as { maeId?: number | null } | undefined)?.maeId != null &&
    Number((animal as { maeId?: number | null }).maeId) > 0;
  const temPaiEstruturado =
    isEditMode &&
    (animal as { paiId?: number | null } | undefined)?.paiId != null &&
    Number((animal as { paiId?: number | null }).paiId) > 0;

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
  const { data: todosLotes } = trpc.lotes.list.useQuery({ somenteAtivos: true });
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
      castracaoCondicao: 'nao_informado',
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
      pai: (animal as any).paiId ? '' : ((animal as any).pai || ''),
      mae: (animal as any).maeId ? '' : ((animal as any).mae || ''),
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  // ── Validação ──
  const hasDataReferencia = !!(form.dataNascimento.trim() || form.dataEntrada.trim());

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
    if (!isPesoEntradaFormValido(form.pesoEntrada)) {
      e.pesoEntrada = MSG_PESO_ENTRADA_INVALIDO;
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
      ...(isEditMode ? { dataDesmama: resolveData(form.dataDesmama) } : {}),
      castrado: resolverCastradoCadastroInicial({
        sexo: sexoMapped,
        condicao: form.castracaoCondicao,
      }),
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
    onError: (err) => {
      const aviso = toastErroSalvarEditarAnimal({
        temErroRequired: false,
        mensagemBackend: err.message || MSG_BLOQUEIO_SEXO_GENERICA,
      });
      if (aviso.tipo === 'sexo') {
        setBloqueioSexoMsg(aviso.mensagem);
        return;
      }
      toast.error(aviso.mensagem);
    },
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSave = (novo = false) => {
    if (!validate()) {
      toast.error(MSG_CAMPOS_OBRIGATORIOS_DESTAQUE);
      return;
    }
    if (isEditMode) {
      const payload = buildPayload();
      // Em modo edição: campos vazios enviam null para limpar o valor no banco
      const resolveStr = (v: string) => v.trim() ? v.trim() : null;
      // Campos operacionais NÃO são alterados aqui — vão por Manejo.
      const {
        brinco: _brincoOp,
        brincoEletronico: _rfidOp,
        loteId: _loteOp,
        pastoId: _pastoOp,
        castrado: _castradoOp,
        dataDesmama: _desmamaOp,
        ...cadastralPayload
      } = payload as Record<string, unknown>;

      const editPayload = {
        ...cadastralPayload,
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
        ...(temMaeEstruturada ? {} : { mae: resolveStr(form.mae) }),
        ...(temPaiEstruturado ? {} : { pai: resolveStr(form.pai) }),
        observacoes: resolveStr(form.observacoes),
      };

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
  const pageSubtitle = isEditMode ? 'Atualize as informações do animal' : null;
  const statusAtual = (isEditMode ? form.status : 'ativo') as StatusAnimal;
  const statusTexto = STATUS_ANIMAL_LABEL[statusAtual] ?? 'Ativo';
  const baixaAnimal = isEditMode
    ? (animal as {
        baixa?: {
          tipo?: string | null;
          dataBaixa?: string | Date | null;
          destino?: string | null;
          motivo?: string | null;
        } | null;
      } | undefined)?.baixa ?? null
    : null;
  const tipoBaixa = baixaAnimal && isTipoBaixaAnimal(baixaAnimal.tipo) ? baixaAnimal.tipo : null;
  const dataBaixaTexto = formatarDataBaixa(baixaAnimal?.dataBaixa);
  const temDataBaixa = Boolean(baixaAnimal && dataBaixaTexto !== '—');
  const destinoBaixa = baixaAnimal?.destino?.trim() || '';
  const motivoBaixa =
    tipoBaixa === 'morte' ? formatarCausaMorteExibicao(baixaAnimal?.motivo) ?? '' : '';

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto pb-10">
        <button
          type="button"
          onClick={() => setLocation('/rebanho/lista-animais')}
          disabled={isSubmitting}
          className="mb-4 flex items-center gap-1.5 text-gray-500 disabled:opacity-50"
          aria-label="Voltar"
        >
          <span className="material-icons text-[18px]">arrow_back</span>
          <span className="text-[13px]">Voltar</span>
        </button>

        <div className="mb-5">
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: 'Fraunces, serif' }}>
            {pageTitle}
          </h1>
          {pageSubtitle ? (
            <p className="text-[13px] text-gray-500 mt-1">{pageSubtitle}</p>
          ) : null}
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handleSave(false); }}
          className="space-y-5"
        >
          {/* ── Identificação Principal ── */}
          <SectionCard title="Identificação Principal" hint="Campos obrigatórios em destaque">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Fazenda</FormLabel>
                  <FieldSelect
                    value={fazendaId}
                    onChange={v => {
                      setFazendaId(v);
                      set('loteId', '');
                      setPastoId('');
                      if (errors.fazenda) setErrors(prev => ({ ...prev, fazenda: '' }));
                    }}
                    placeholder="Selecione uma Fazenda"
                    required
                    error={!!errors.fazenda}
                    disabled={isEditMode}
                    options={(fazendas ?? []).map(f => ({ value: String(f.id), label: f.nome }))}
                  />
                  {errors.fazenda && <p className="text-xs text-red-600 mt-1">{errors.fazenda}</p>}
                </div>
                <div>
                  <FormLabel required>Número do Brinco</FormLabel>
                  <FieldInput
                    value={form.brinco}
                    onChange={v => set('brinco', v)}
                    placeholder="ex: BR-12345"
                    required
                    error={!!errors.brinco}
                    readOnly={isEditMode}
                  />
                  {errors.brinco && <p className="text-xs text-red-600 mt-1">{errors.brinco}</p>}
                  {isEditMode && (
                    <ManejoCampoHint>
                      Alterações de brinco são realizadas em Manejo → Identificação.
                    </ManejoCampoHint>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Sexo</FormLabel>
                  <FieldSelect
                    value={form.sexo}
                    onChange={v => {
                      setForm(prev => ({
                        ...prev,
                        sexo: v,
                        categoria: categoriaAposTrocaSexoNoFormulario({
                          modo: isEditMode ? 'edit' : 'create',
                          categoriaAtual: prev.categoria,
                        }),
                        castracaoCondicao: condicaoCastracaoAposTrocaSexo(),
                      }));
                      if (errors.sexo) setErrors(prev => ({ ...prev, sexo: '' }));
                    }}
                    required
                    error={!!errors.sexo}
                    placeholder="Selecione"
                    options={[
                      { value: 'Macho', label: 'Macho' },
                      { value: 'Fêmea', label: 'Fêmea' },
                    ]}
                  />
                  {errors.sexo && <p className="text-xs text-red-600 mt-1">{errors.sexo}</p>}
                  {!isEditMode && deveMostrarCondicaoCastracaoCadastro(form.sexo) && (
                    <Checkbox
                      checked={form.castracaoCondicao === 'castrado'}
                      onChange={v => set('castracaoCondicao', v ? 'castrado' : 'nao_informado')}
                      label="Castrado"
                    />
                  )}
                </div>
                <div>
                  <FormLabel required>Categoria</FormLabel>
                  <FieldSelect
                    value={form.categoria}
                    onChange={v => set('categoria', v)}
                    required
                    error={!!errors.categoria}
                    placeholder="Selecione"
                    options={opcoesCategoriaComValorAtual(form.sexo, form.categoria).map(cat => ({
                      value: cat,
                      label: cat,
                    }))}
                  />
                  {errors.categoria && <p className="text-xs text-red-600 mt-1">{errors.categoria}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel>Lote</FormLabel>
                  <FieldSelect
                    value={form.loteId}
                    onChange={v => set('loteId', v)}
                    disabled={isEditMode}
                    placeholder="Sem lote"
                    options={lotesFiltrados.map(l => ({ value: String(l.id), label: l.nome }))}
                  />
                </div>
                <div>
                  <FormLabel>Subdivisão</FormLabel>
                  <FieldSelect
                    value={pastoId}
                    onChange={setPastoId}
                    disabled={!fazendaId || isEditMode}
                    placeholder={fazendaId ? 'Selecione a subdivisão' : 'Selecione uma fazenda primeiro'}
                    options={(pastos ?? [])
                      .slice()
                      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }))
                      .map(p => ({ value: String(p.id), label: p.nome }))}
                  />
                </div>
              </div>
              {isEditMode ? (
                <ManejoCampoHint>
                  Alterações de Lote e subdivisão são realizadas em Manejo → Troca de Lote.
                </ManejoCampoHint>
              ) : null}
            </div>
          </SectionCard>

          {/* ── Dados Zootécnicos Básicos ── */}
          <SectionCard title="Dados Zootécnicos Básicos">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel>Raça</FormLabel>
                <FieldSelect
                  value={form.raca}
                  onChange={v => set('raca', v)}
                  placeholder="Selecione"
                  options={RACAS.map(r => ({ value: r, label: r }))}
                />
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
                <FormDatePicker
                  value={form.dataNascimento}
                  onChange={v => {
                    set('dataNascimento', v);
                    clearDataReferenciaErrors(v, form.dataEntrada);
                  }}
                  required={!form.dataEntrada}
                  invalid={!!errors.dataNascimento}
                />
                {errors.dataNascimento && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.dataNascimento}</p>
                )}
              </div>
              {deveExibirDataDesmamaNoFormularioAnimal(isEditMode ? 'edit' : 'create') && (
                <div>
                  <FormLabel>Data de Desmama</FormLabel>
                  <ReadOnlyField>
                    {form.dataDesmama
                      ? form.dataDesmama.split('-').reverse().join('/')
                      : '—'}
                  </ReadOnlyField>
                  <ManejoCampoHint>
                    Desmama é registrada em Manejo → Desmama.
                  </ManejoCampoHint>
                </div>
              )}
              {mostrarCastradoEdicao && (
                <div>
                  <FormLabel>Castrado</FormLabel>
                  <ReadOnlyField>
                    {castradoSomenteLeitura ?? '—'}
                  </ReadOnlyField>
                  <ManejoCampoHint>
                    Castração é registrada em Manejo → Castração.
                  </ManejoCampoHint>
                </div>
              )}
            </div>
          </SectionCard>

          {/* ── Entrada do Animal ── */}
          <SectionCard title="Entrada do Animal">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel required={!form.dataNascimento}>
                  Data de Entrada
                  {!form.dataNascimento && (
                    <span className="ml-1 text-[11px] text-gray-400 font-normal">(ou Data de Nascimento)</span>
                  )}
                </FormLabel>
                <FormDatePicker
                  value={form.dataEntrada}
                  onChange={v => {
                    set('dataEntrada', v);
                    clearDataReferenciaErrors(form.dataNascimento, v);
                  }}
                  required={!form.dataNascimento}
                  invalid={!!errors.dataEntrada}
                />
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
                  min="0.01"
                  step="0.1"
                  error={!!errors.pesoEntrada}
                />
                <ManejoCampoHint>{HINT_PESO_ENTRADA}</ManejoCampoHint>
                {errors.pesoEntrada && (
                  <p className="mt-1 text-[11px] text-red-500">{errors.pesoEntrada}</p>
                )}
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
            defaultOpen={!isEditMode}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>{isEditMode ? 'Código do Brinco Eletrônico' : 'RFID eletrônico'}</FormLabel>
                <FieldInput
                  value={form.brincoEletronico}
                  onChange={v => set('brincoEletronico', v)}
                  placeholder="ex: 076000000000001 ou código RFID"
                  readOnly={isEditMode}
                />
                {isEditMode ? (
                  <ManejoCampoHint>
                    Alterações de RFID são realizadas em Manejo → Identificação.
                  </ManejoCampoHint>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                      Informe o RFID manualmente ou utilize o bastão para leitura.
                    </p>
                    {deveMostrarLeituraRfidCadastro(isEditMode) ? (
                      <At05RfidReaderControl
                        currentValue={form.brincoEletronico}
                        onRfidRead={rfid => set('brincoEletronico', rfid)}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </CollapsibleSectionCard>

          {/* ── Dados comerciais da aquisição (recolhível) ── */}
          <CollapsibleSectionCard
            title="Dados comerciais da aquisição"
            subtitle="Informe preço e frete quando o animal tiver sido comprado."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel>SISBOV</FormLabel>
                <FieldInput value={form.sisbov} onChange={v => set('sisbov', v)} placeholder="ex: 076000000000001" />
              </div>
              <div>
                <FormLabel>Data RND</FormLabel>
                <FormDatePicker
                  value={form.dataRnd}
                  onChange={v => set('dataRnd', v)}
                />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Pai (Reprodutor)</FormLabel>
                <FieldInput
                  value={isEditMode ? genealogiaExibicao.pai : form.pai}
                  onChange={v => set('pai', v)}
                  readOnly={isEditMode}
                  disabled={isEditMode}
                  placeholder={isEditMode ? '—' : 'Nome / brinco do pai'}
                />
              </div>
              <div>
                <FormLabel>Mãe (Matriz)</FormLabel>
                <FieldInput
                  value={isEditMode ? genealogiaExibicao.mae : form.mae}
                  onChange={v => set('mae', v)}
                  readOnly={isEditMode}
                  disabled={isEditMode}
                  placeholder={isEditMode ? '—' : 'Nome / brinco da mãe'}
                />
              </div>
            </div>
          </CollapsibleSectionCard>

          {isEditMode ? (
            <SectionCard title="Status">
              <div className={cn('grid gap-4', baixaAnimal && 'grid-cols-1 sm:grid-cols-2')}>
                <div>
                  <FormLabel>Status atual</FormLabel>
                  <ReadOnlyField>
                    <span
                      className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
                        statusBadgeClass(statusAtual),
                      )}
                    >
                      {statusTexto}
                    </span>
                  </ReadOnlyField>
                </div>
                {tipoBaixa ? (
                  <div>
                    <FormLabel>Tipo da baixa</FormLabel>
                    <ReadOnlyField>{TIPO_BAIXA_LABEL[tipoBaixa]}</ReadOnlyField>
                  </div>
                ) : null}
                {temDataBaixa ? (
                  <div>
                    <FormLabel>Data da baixa</FormLabel>
                    <ReadOnlyField>{dataBaixaTexto}</ReadOnlyField>
                  </div>
                ) : null}
                {destinoBaixa && tipoBaixa !== 'morte' ? (
                  <div>
                    <FormLabel>{tipoBaixa === 'venda' ? 'Destino / Comprador' : 'Destino'}</FormLabel>
                    <ReadOnlyField>{destinoBaixa}</ReadOnlyField>
                  </div>
                ) : null}
                {motivoBaixa && tipoBaixa === 'morte' ? (
                  <div>
                    <FormLabel>Causa</FormLabel>
                    <ReadOnlyField>{motivoBaixa}</ReadOnlyField>
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {/* ── Observações Gerais ── */}
          <SectionCard title="Observações Gerais">
            <FormTextarea
              variant="light"
              value={form.observacoes}
              onChange={v => set('observacoes', v)}
              placeholder="Digite informações adicionais relevantes..."
              rows={3}
            />
          </SectionCard>

          {/* ── Ações ── */}
          <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setLocation('/rebanho/lista-animais')}
              disabled={isSubmitting}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>

            {!isEditMode && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Salvando...' : 'Salvar e Novo'}
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isSubmitting ? 'Salvando...' : isEditMode ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </form>
      </div>

      {/* Bloqueio histórico de Sexo — padrão centralizado aprovado nos Manejos. */}
      <Dialog open={Boolean(bloqueioSexoMsg)}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onEscapeKeyDown={e => e.preventDefault()}
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-gray-900">Não foi possível concluir</DialogTitle>
            </div>
            <DialogDescription className="text-gray-600 leading-relaxed whitespace-pre-line">
              {bloqueioSexoMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setBloqueioSexoMsg(null)}
              className="w-full text-white hover:opacity-95"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Entendi
            </Button>
          </DialogFooter>
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
