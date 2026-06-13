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
import { ArrowLeft, Loader2, Plus, AlertCircle, Save } from 'lucide-react';
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
}> = ({ title, hint, children }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-bold text-gray-800">{title}</h2>
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
    {children}
  </div>
);

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
  const lotesFiltrados = (fazendaId
    ? (todosLotes ?? []).filter(l => l.fazendaId != null && String(l.fazendaId) === fazendaId)
    : (todosLotes ?? [])
  ).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true, sensitivity: 'base' }));

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
    if (!nome) { toast.error('Informe o nome do lote.'); return; }
    createLoteMutation.mutate(
      { nome, descricao: novoLoteDescricao.trim() || undefined },
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
  // Campos mínimos obrigatórios para habilitar o cadastro
  const canSubmit = !!fazendaId && !!form.brinco.trim() && !!form.sexo && !!form.categoria;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!fazendaId) e.fazenda = 'Selecione uma fazenda';
    if (!form.brinco.trim()) e.brinco = 'Número do brinco é obrigatório';
    if (!form.sexo) e.sexo = 'Sexo é obrigatório';
    if (!form.categoria) e.categoria = 'Categoria é obrigatória';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Payload comum ──
  const buildPayload = () => {
    const sexoMapped = form.sexo === 'Macho' ? 'macho' : 'femea';
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
      dataNascimento: form.dataNascimento || undefined,
      dataDesmama: form.dataDesmama || undefined,
      castrado: form.castrado,
      dataEntrada: form.dataEntrada || undefined,
      pesoEntrada: form.pesoEntrada.trim() || undefined,
      produtorOrigem: form.produtorOrigem.trim() || undefined,
      precoKg: form.precoKg.trim() || undefined,
      frete: form.frete.trim() || undefined,
      sisbov: form.sisbov.trim() || undefined,
      dataRnd: form.dataRnd || undefined,
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
    onSuccess: () => {
      toast.success('Animal atualizado com sucesso!');
      utils.animais.list.invalidate();
      utils.animais.getById.invalidate({ id: animalId! });
      setLocation('/rebanho/lista-animais');
    },
    onError: (err) => toast.error(`Erro ao atualizar animal: ${err.message}`),
  });

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleSave = (novo = false) => {
    if (!validate()) {
      toast.error('Preencha os campos obrigatórios em destaque.');
      return;
    }
    if (isEditMode) {
      updateMutation.mutate({ id: animalId!, ...buildPayload() });
    } else {
      createMutation.mutate(buildPayload(), {
        onSuccess: () => {
          toast.success('Animal cadastrado com sucesso!');
          utils.animais.list.invalidate();
          if (novo) {
            // Preserva fazenda, raça, pelagem e marca; limpa subdivisão e demais campos
            const keepRaca = form.raca;
            const keepPelagem = form.pelagem;
            const keepMarca = form.marca;
            setForm({ ...INITIAL, raca: keepRaca, pelagem: keepPelagem, marca: keepMarca });
            setPastoId('');
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
    : 'Preencha as informações completas para registro no sistema';

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto pb-10">
        <Button
          type="button"
          onClick={() => setLocation('/rebanho/lista-animais')}
          className="mb-5 bg-gray-400 hover:bg-gray-500 text-white"
          disabled={isSubmitting}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Lista de Animais
        </Button>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{pageTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">{pageSubtitle}</p>
          </div>
          <div className="min-w-[220px]">
            <FormLabel required>Fazenda</FormLabel>
            <FieldBox required>
              <select
                value={fazendaId}
                onChange={e => { setFazendaId(e.target.value); set('loteId', ''); setPastoId(''); }}
                className={cn(inputClass, 'appearance-none cursor-pointer min-h-[42px]')}
              >
                <option value="">Selecione uma Fazenda</option>
                {fazendas?.map(f => (
                  <option key={f.id} value={String(f.id)}>{f.nome}</option>
                ))}
              </select>
            </FieldBox>
          </div>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); handleSave(false); }}
          className="space-y-5"
        >
          {/* ── Identificação Principal ── */}
          <SectionCard title="Identificação Principal" hint="Campos obrigatórios em destaque">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <FormLabel required>Número do Brinco</FormLabel>
                <FieldInput
                  value={form.brinco}
                  onChange={v => set('brinco', v)}
                  placeholder="ex: BR-12345"
                  required
                  error={!!errors.brinco}
                />
                {errors.brinco && <p className="text-xs text-red-600 mt-1">{errors.brinco}</p>}
              </div>
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
                <FieldSelect value={form.categoria} onChange={v => set('categoria', v)} required>
                  <option value="">Selecione</option>
                  {(form.sexo ? getCategoriasPorSexo(form.sexo) : todasAsCategorias()).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </FieldSelect>
              </div>
              <div>
                <FormLabel>Lote</FormLabel>
                <FieldSelect value={form.loteId} onChange={handleLoteSelectChange}>
                  <option value="">Sem lote</option>
                  {lotesFiltrados.map(l => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </FieldSelect>
              </div>
            </div>
          </SectionCard>

          {/* ── Brinco Eletrônico ── */}
          <SectionCard title="Brinco Eletrônico / RFID">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </SectionCard>

          {/* ── Dados Zootécnicos ── */}
          <SectionCard title="Dados Zootécnicos">
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
                <FormLabel>Subdivisão (Pasto)</FormLabel>
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
              <div>
                <FormLabel>Data de Nascimento</FormLabel>
                <FormDatePicker
                  value={form.dataNascimento}
                  onChange={v => set('dataNascimento', v)}
                  placeholder="dd/mm/aaaa"
                />
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

          {/* ── Entrada / Aquisição ── */}
          <SectionCard title="Entrada / Aquisição">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FormLabel>Data de Entrada</FormLabel>
                <FormDatePicker
                  value={form.dataEntrada}
                  onChange={v => set('dataEntrada', v)}
                  placeholder="dd/mm/aaaa"
                />
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
          </SectionCard>

          {/* ── Rastreabilidade e Registros Oficiais ── */}
          <SectionCard title="Rastreabilidade e Registros Oficiais">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
          </SectionCard>

          {/* ── Genealogia ── */}
          <SectionCard title="Genealogia">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Pai (Reprodutor)</FormLabel>
                <FieldInput value={form.pai} onChange={v => set('pai', v)} placeholder="Nome / brinco do pai" />
              </div>
              <div>
                <FormLabel>Mãe (Matriz)</FormLabel>
                <FieldInput value={form.mae} onChange={v => set('mae', v)} placeholder="Nome / brinco da mãe" />
              </div>
            </div>
          </SectionCard>

          {/* ── Status (exibido em ambos os modos) ── */}
          <SectionCard title="Status do Animal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel>Status</FormLabel>
                <FieldSelect value={form.status} onChange={v => set('status', v)}>
                  <option value="ativo">Ativo</option>
                  <option value="vendido">Vendido</option>
                  <option value="morto">Morto</option>
                  <option value="transferido">Transferido</option>
                </FieldSelect>
              </div>
            </div>
          </SectionCard>

          {/* ── Observações Gerais ── */}
          <SectionCard title="Observações Gerais">
            <FieldBox>
              <textarea
                value={form.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Digite informações adicionais relevantes..."
                rows={4}
                className={cn(inputClass, 'resize-y min-h-[100px]')}
              />
            </FieldBox>
          </SectionCard>

          {/* ── Ações ── */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <p className={`text-[11px] ${!canSubmit ? 'text-amber-500 font-medium' : 'text-gray-400'}`}>
              {!canSubmit
                ? '* Preencha Fazenda, Número do Brinco, Sexo e Categoria para habilitar o cadastro.'
                : '* Campos obrigatórios preenchidos. Pronto para salvar.'
              }
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                onClick={() => setLocation('/rebanho/lista-animais')}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800"
                disabled={isSubmitting}
              >
                Cancelar
              </Button>

              {/* Botão "Salvar e Novo" — apenas no modo criação */}
              {!isEditMode && (
                <Button
                  type="button"
                  onClick={() => handleSave(true)}
                  className="bg-green-700 hover:bg-green-800 text-white"
                  disabled={isSubmitting || !canSubmit}
                  title={!canSubmit ? 'Preencha Fazenda, Número do Brinco e Sexo para salvar' : undefined}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar e Novo
                </Button>
              )}

              <Button
                type="submit"
                className="text-white"
                style={{ backgroundColor: '#2D5A5A', opacity: canSubmit ? 1 : 0.5 }}
                disabled={isSubmitting || !canSubmit}
                title={!canSubmit ? 'Preencha Fazenda, Número do Brinco e Sexo para salvar' : undefined}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {isEditMode ? 'Salvar Alterações' : 'Cadastrar Animal'}
              </Button>
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
    </AppLayout>
  );
};

// ─── Aliases de exportação ────────────────────────────────────────────────────
// Ambas as rotas (/rebanho/novo-animal e /rebanho/editar-animal?id=X)
// usam exatamente o mesmo componente.

export const NewAnimalPage = AnimalFormPage;
export const EditAnimalPage = AnimalFormPage;
export default AnimalFormPage;
