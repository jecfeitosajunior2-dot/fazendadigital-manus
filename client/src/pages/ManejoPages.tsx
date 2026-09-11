import AppLayout from "@/components/AppLayout";
import { CorralGateIcon } from "@/components/icons/CorralGateIcon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocation, useSearch } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Check,
  Tag,
  Weight,
  Syringe,
  HeartPulse,
  ArrowLeftRight,
  Stethoscope,
  MilkOff,
  Bluetooth,
  AlertCircle,
  LogOut,
  MoreVertical,
  Plus,
  Settings2,
  Trash2,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAt05Reader } from "@/hooks/useAt05Reader";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDateBR } from "@/lib/date-utils";
import { shouldLoadSemenPartidasParaInseminacao } from "@/lib/semenInseminacaoQuery";
import { invalidateSemenQueriesAfterConsumo, invalidateSemenUtilizadoQueries } from "@/lib/invalidateSemenAfterConsumo";
import { formatUltimoPesoKg } from "@/lib/listaAnimaisTable";
import { sortPesagensDesc } from "@/lib/fichaAnimalDisplay";
import {
  calcularQuantidadeEstoquePorDose,
  calcularCustoReferenciaPorUnidadeDose,
  OPCOES_UNIDADE_DOSE_SANITARIO,
  produtoControlaSaldo,
  siglaUnidade,
  sugerirUnidadeDoseSanitaria,
} from "@/lib/produto-types";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
  REBANHO_FAZENDA_STORAGE_KEY,
} from "@shared/animal-filter-types";
import {
  calcPrevisaoParto283,
  getReproRelacionadoLabel,
  getReproRelacionadoPlaceholder,
  getReproResultadoOptions,
  isReproResultadoRequiredManejo,
  MSG_REPRO_RESULTADO_INCOMPATIVEL,
  shouldCalcPrevisaoParto,
  shouldShowPrevisaoPartoForm,
  showReproDescricaoOutroManejo,
  showReproDescricaoResultadoOutroManejo,
  showReproReprodutorFieldManejo,
  showReproResultadoFieldManejo,
  validateReproResultadoForSave,
} from "@shared/reproRegistroMeta";
import {
  buildReproAnimalElegibilidadeInput,
  getReproTipoOptionsElegiveis,
  hasCategoriaIdadeMismatchRepro,
  isFemeaReprodutivamenteMadura,
  isMachoBloqueadoReproPorCastracao,
  isReproTipoPermitidoParaAnimal,
  mensagemReproInelegivelAnimal,
  MSG_REPRO_INELEGIVEL,
  MSG_REPRO_MACHO_CASTRADO,
  MSG_REPRO_MACHO_CASTRADO_REPRODUTOR,
} from "@shared/reproElegibilidade";
import { buildReproReprodutorPayload } from "@shared/reproReprodutorPersist";
import {
  custoDoseInseminacaoExternaInformado,
  sanitizeReproEccInputString,
  validateReproCustoDoseInseminacaoExterna,
  validateReproEcc,
} from "@shared/reproInseminacao";
import {
  formatSemenCustoTotalDisplay,
  formatSemenPartidaInseminacaoOptionLabel,
  parseSemenCustoTotal,
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  tryBuildSemenReprodutorKeyExterno,
} from "@shared/semenEstoque";
import {
  filterMachosReprodutoresCandidatos,
  resolveMachoIdFromSelecao,
} from "@shared/reproMachoSelect";
import { resolveAnimalIdFromSelecao } from "@shared/animalAutocomplete";
import {
  labelAnimalBusca,
  labelSexoAnimal,
  sexoDotClassName,
  subtituloAnimalBusca,
  subtituloMachoReprodutor,
} from "@shared/animalBuscaDisplay";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import { SemenReprodutorExternoField } from "@/components/SemenReprodutorExternoField";
import { CadastrarSemenExternoDialog } from "@/components/semen/CadastrarSemenExternoDialog";
import {
  FormDatePicker,
  FormDownSelect,
  FormInput,
  FormLabel,
  FormNativeSelect,
  FormSelect,
  FormTextarea,
  formCheckboxCls,
} from "@/components/FormFields";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import {
  BrincoNumpadField,
  type EntradaIdentOrigem,
} from "@/components/curral/BrincoNumpadField";
import { CurralCastracaoPanel } from "@/components/curral/CurralCastracaoPanel";
import { CurralCadastroAnimalPanel } from "@/components/curral/CurralCadastroAnimalPanel";
import { CurralDesmamaPanel } from "@/components/curral/CurralDesmamaPanel";
import { CurralSanitarioPanel } from "@/components/curral/CurralSanitarioPanel";
import { CurralBrincoEletronicoPanel } from "@/components/curral/CurralBrincoEletronicoPanel";
import { CurralTrocaLotePanel } from "@/components/curral/CurralTrocaLotePanel";
import { CurralReprodutivoPanel } from "@/components/curral/CurralReprodutivoPanel";
import { ReproPipelineConfigDialog } from "@/components/curral/ReproPipelineConfigDialog";
import { formatReproPipelineConfigResumo } from "@shared/reproPipelineConfig";
import { ScaleReaderControl } from "@/components/curral/ScaleReaderControl";
import { formatPesoKgParaCampo } from "@/lib/hardware/scaleProtocol";
import {
  getCurralManejoJetBovEntry,
  isCurralManejoDisponivel,
  labelStatusCurralManejo,
  podeSelecionarManejoNoHub,
  primeiroManejoDisponivelNaOrdem,
  manejosCurralOperacionaisNaOrdem,
} from "@shared/curralManejoJetBovMap";
import {
  aplicarOrdemDesmamaJetBov,
  CURRAL_DESMAMA_HUB_SUBTITULO,
  CURRAL_DESMAMA_ORDEM_JETBOV_LABEL,
  manejosDesmamaJetBovFaltando,
} from "@shared/curralDesmamaHub";
import { pesagemReutilizavelDesmama } from "@shared/desmamaManejo";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import {
  FAZENDA_SELECT_PLACEHOLDER,
  ManejoPontualFormShell,
  ManejoSectionCard,
} from "@/components/ManejoPontualFormLayout";
import { SelectItem } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ConfirmDialog";
import { formatCurrencyBrl, cn } from "@/lib/utils";
import { ManejoAnimalField } from "@/components/ManejoAnimalField";
import { ManejoTrocaLoteForm } from "./ManejoTrocaLoteForm";
import { ManejoCastracaoForm } from "./ManejoCastracaoForm";
import { ManejoDesmamaForm } from "./ManejoDesmamaForm";
import { ManejoBaixaAnimalForm } from "./ManejoBaixaAnimalForm";
import {
  MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO,
  MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS,
  MSG_REPRO_LOTE_INELEGIVEL,
  MSG_REPRO_MATRIZ_INELEGIVEL,
  coberturaAlvoPermiteModoIndividual,
  isEstacaoMontaMacho,
  showReproCoberturaAlvoFieldManejo,
} from "@shared/reproCoberturaAlvo";
import {
  getCategoriasPorSexo,
  isCategoriaValidaParaSexo,
  RACAS,
} from "@shared/animal-types";
import { isMensagemBloqueioBaixa } from "@shared/animalBaixa";
import {
  getReproMachoTipoHint,
  orderReproTipoOptionsMachoCurral,
} from "@/lib/curralReprodutivoUi";

const FD_PRIMARY = "#4ECDC4";
const ICON_CLASS = "h-5 w-5 shrink-0";
const ICON_STROKE = 2;

const stepCard = "border border-gray-200 rounded shadow-sm bg-white p-4";

const btnRegistrar =
  "inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 transition min-h-[40px] shrink-0";

export const TIPOS_MANEJO = [
  {
    id: "brinco-eletronico",
    label: "Identificação",
    icon: Tag,
    descricao: "Brinco visual, RFID e identificação do animal",
  },
  {
    id: "pesagem",
    label: "Pesagem",
    icon: Weight,
    descricao: "Registro de peso dos animais",
  },
  {
    id: "sanitario",
    label: "Sanitário",
    icon: Syringe,
    descricao: "Vacinação, vermifugação e tratamentos",
  },
  {
    id: "reprodutivo",
    label: "Reprodutivo",
    icon: HeartPulse,
    descricao: "Cobertura, IATF e manejo reprodutivo",
  },
  {
    id: "troca-lote",
    label: "Troca de Lote",
    icon: ArrowLeftRight,
    descricao: "Movimentação entre lotes",
  },
  {
    id: "castracao",
    label: "Castração",
    icon: Stethoscope,
    descricao: "Registro de castração",
  },
  {
    id: "desmama",
    label: "Desmama",
    icon: MilkOff,
    descricao: "Separação de bezerros",
  },
  {
    id: "baixa-animal",
    label: "Movimentação do Animal",
    icon: LogOut,
    descricao: "Morte e transferência de animais.",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: ComponentType<LucideProps>;
  descricao: string;
}>;

export type TipoManejoId = (typeof TIPOS_MANEJO)[number]["id"];

function todayISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const MSG_PESAGEM_DATA_FUTURA = "A data da pesagem não pode ser futura.";
const MSG_IDENTIFICACAO_DATA_FUTURA = "A data da identificação não pode ser futura.";
const MSG_SANITARIO_DATA_FUTURA = "A data do manejo sanitário não pode ser futura.";
const MSG_REPRODUTIVO_DATA_FUTURA = "A data do manejo reprodutivo não pode ser futura.";
const MSG_SANITARIO_ESTOQUE_INSUFICIENTE =
  "Estoque insuficiente para a quantidade informada.";
const CATEGORIA_SANITARIO_INSUMOS = "Farmácia";

function parseCustoMedioClient(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatMoedaBrlSanitario(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type EstoqueSanitarioItem = {
  id: number;
  nome: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
  unidade?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
  fabricante?: string | null;
  fazendaId?: number | null;
  situacao?: string | null;
  embalagens?: string | null;
};

/** Tipos do manejo sanitário pontual (valores persistidos em saude_registros.tipo). */
const TIPOS_SANITARIO_MANEJO = [
  { value: "Vacinação", label: "Vacinação" },
  { value: "Vermifugação", label: "Vermifugação" },
  { value: "Tratamento", label: "Tratamento" },
  { value: "Outro", label: "Outro" },
] as const;

type TipoSanitarioManejo = (typeof TIPOS_SANITARIO_MANEJO)[number]["value"];

/** Vias de aplicação — lista local (não havia enum no projeto). */
const VIAS_APLICACAO_SANITARIO = [
  { value: "Intramuscular", label: "Intramuscular" },
  { value: "Subcutânea", label: "Subcutânea" },
  { value: "Oral", label: "Oral" },
  { value: "Tópica", label: "Tópica" },
  { value: "Pour-on", label: "Pour-on" },
  { value: "Intravenosa", label: "Intravenosa" },
  { value: "Outra", label: "Outra" },
] as const;

function newSessaoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manejo-sessao-${crypto.randomUUID()}`;
  }
  return `manejo-sessao-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function labelAnimal(a: {
  id: number;
  brinco?: string | null;
  nome?: string | null;
}) {
  return a.brinco?.trim() || a.nome?.trim() || `#${a.id}`;
}

function NovoManejoButton({ className }: { className?: string }) {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation("/manejo/registros")}
      className={
        className ??
        "inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 transition shrink-0 min-h-[44px]"
      }
      style={{ backgroundColor: FD_PRIMARY }}
    >
      <span className="material-icons text-[16px]">add</span>
      Novo manejo
    </button>
  );
}

/** Stub de Visão Geral — layout interno será definido em tarefa posterior. */
export function ManejoVisaoGeralPage() {
  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Visão Geral — Manejo
          </h1>
          <NovoManejoButton />
        </div>
        <div className="p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">assignment</span>
          <p className="text-[12px] text-gray-400">Visão Geral em desenvolvimento</p>
          <p className="text-[11px] text-gray-300 mt-1">
            Use Registros de Manejo para consultar o histórico ou registre um novo manejo.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

/** Hub: Sessão no curral + Manejo pontual. */
export function ManejoRegistrosPage() {
  const [, setLocation] = useLocation();

  const scrollToManejoPontual = () => {
    const el = document.getElementById("manejo-pontual-secao");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Registros de Manejo
            </h1>
          </div>

          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            <button
              type="button"
              onClick={() => setLocation("/manejo/registros/sessao")}
              className={cn(
                stepCard,
                "h-full text-left border-[#4ECDC4] bg-[#4ECDC4]/[0.06] hover:bg-[#4ECDC4]/[0.1] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/40",
              )}
            >
              <div className="flex items-start gap-3 h-full">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white shrink-0"
                  style={{ backgroundColor: FD_PRIMARY }}
                  aria-hidden="true"
                >
                  <CorralGateIcon size={28} />
                </span>
                <div className="min-w-0 flex flex-col flex-1">
                  <div className="text-[13px] font-semibold text-[#4ECDC4]">Sessão no curral</div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed flex-1">
                    Realize vários manejos no mesmo animal durante o trabalho de campo.
                  </p>
                  <span
                    className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold"
                    style={{ color: FD_PRIMARY }}
                  >
                    Iniciar sessão
                    <span className="material-icons text-[14px]">arrow_forward</span>
                  </span>
                </div>
              </div>
            </button>

            <div className={cn(stepCard, "h-full")}>
              <div className="flex items-start gap-3 h-full">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-gray-600 shrink-0"
                  aria-hidden
                >
                  <span className="material-icons text-[22px]">edit_note</span>
                </span>
                <div className="min-w-0 flex flex-col flex-1">
                  <div className="text-[13px] font-semibold text-[#4ECDC4]">Manejo pontual</div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed flex-1">
                    Registre um manejo específico de forma rápida e individual.
                  </p>
                  <button
                    type="button"
                    onClick={scrollToManejoPontual}
                    className="inline-flex items-center gap-1 mt-3 text-[11px] font-semibold text-gray-600 hover:text-gray-900 transition self-start focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded"
                  >
                    Escolher manejo ↓
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          id="manejo-pontual-secao"
          className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden scroll-mt-20"
        >
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Manejo pontual</h2>
            <p className="mt-1 text-[11px] text-gray-500">
              Selecione o manejo que deseja registrar.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {TIPOS_MANEJO.map(tipo => {
              const Icon = tipo.icon;
              return (
                <div
                  key={tipo.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-[#4ECDC4]/[0.04] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-[#4ECDC4] shrink-0"
                      aria-hidden="true"
                    >
                      <Icon className={ICON_CLASS} strokeWidth={ICON_STROKE} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900">{tipo.label}</div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                        {tipo.descricao}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setLocation(
                        `/manejo/registros/cadastro?tipo=${encodeURIComponent(tipo.id)}`,
                      )
                    }
                    className={btnRegistrar}
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    <span className="material-icons text-[16px]">add</span>
                    Registrar
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

/** Cadastro de um único tipo (modo pontual). */
export function ManejoFormPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tipoId = useMemo(() => {
    const raw = new URLSearchParams(search).get("tipo") ?? "";
    return TIPOS_MANEJO.some(t => t.id === raw) ? (raw as TipoManejoId) : null;
  }, [search]);
  const tipo = TIPOS_MANEJO.find(t => t.id === tipoId) ?? null;

  useEffect(() => {
    if (!tipo) setLocation("/manejo/registros");
  }, [tipo, setLocation]);

  if (!tipo) return null;

  if (tipo.id === "brinco-eletronico") {
    return <ManejoBrincoEletronicoForm />;
  }

  if (tipo.id === "pesagem") {
    return <ManejoPesagemForm />;
  }

  if (tipo.id === "sanitario") {
    return <ManejoSanitarioForm />;
  }

  if (tipo.id === "reprodutivo") {
    return <ManejoReprodutivoForm />;
  }

  if (tipo.id === "troca-lote") {
    return <ManejoTrocaLoteForm />;
  }

  if (tipo.id === "castracao") {
    return <ManejoCastracaoForm />;
  }

  if (tipo.id === "desmama") {
    return <ManejoDesmamaForm />;
  }

  if (tipo.id === "baixa-animal") {
    return <ManejoBaixaAnimalForm />;
  }

  return null;
}

const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";

const MOTIVO_TROCA_VALUES = [
  "perda",
  "danificado",
  "reidentificacao",
  "erro_cadastro",
  "outro",
] as const;

type MotivoTrocaBrinco = (typeof MOTIVO_TROCA_VALUES)[number];
type OperacaoBrinco = "rfid" | "brinco" | "ambos";

/** Labels de motivo conforme a operação (valores internos preservados). */
function motivosPorOperacao(
  operacao: OperacaoBrinco,
): ReadonlyArray<{ value: MotivoTrocaBrinco; label: string }> {
  if (operacao === "rfid") {
    return [
      { value: "perda", label: "Perda do RFID" },
      { value: "danificado", label: "RFID danificado" },
      { value: "reidentificacao", label: "Reidentificação" },
      { value: "erro_cadastro", label: "Erro de cadastro" },
      { value: "outro", label: "Outro" },
    ];
  }
  if (operacao === "ambos") {
    return [
      { value: "perda", label: "Perda da identificação" },
      { value: "danificado", label: "Identificação danificada" },
      { value: "reidentificacao", label: "Reidentificação" },
      { value: "erro_cadastro", label: "Erro de cadastro" },
      { value: "outro", label: "Outro" },
    ];
  }
  return [
    { value: "perda", label: "Perda do brinco" },
    { value: "danificado", label: "Brinco danificado" },
    { value: "reidentificacao", label: "Reidentificação" },
    { value: "erro_cadastro", label: "Erro de cadastro" },
    { value: "outro", label: "Outro" },
  ];
}

/** Bloqueios de regra de negócio da Identificação → modal central (não toast). */
function isBloqueioNegocioIdentificacao(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("já existe um animal ativo com o brinco visual") ||
    m.includes("já está sendo usado por outro animal ativo") ||
    m.includes("rfid já está vinculado") ||
    m.includes("rfid já foi vinculado") ||
    m.includes("não pode ser reutilizado") ||
    m.includes("data da identificação não pode ser futura")
  );
}

/**
 * Status visual do bastão AnimalTAG AT05 (UI do Brinco Eletrônico).
 * Separado do último evento RFID — conexão ≠ RFID processado.
 */
type At05ReaderUiStatus =
  | "idle"
  | "disconnected"
  | "connecting"
  | "connected"
  | "listening"
  | "error";

/** Destino lógico da próxima IDENTIFICAÇÃO RFID (não cria reader novo). */
type At05ReadRoute = "identify-animal" | "capture-new-rfid";

type AnimalBuscaRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  loteId?: number | null;
  loteNome?: string | null;
  fazendaId?: number | null;
  status?: string | null;
  sexo?: string | null;
  categoria?: string | null;
  idadeMeses?: number | null;
  dataNascimento?: string | null;
  ultimoPeso?: number | null;
  castrado?: boolean | number | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | null;
  categoria?: string | null;
};

/** Normaliza peso digitado (pt-BR ou US) para decimal do banco. Null se inválido/≤0. */
function parsePesoKgParaPersistir(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  // "300,5" / "1.300,5" → parseMoedaBr; "300.5" também.
  let normalized = t;
  if (t.includes(",")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Valor numérico da dose sanitária (pt-BR ou US).
 * Retorna string de exibição (ex.: "5", "2,5") ou null se vazio/inválido/≤0.
 */
function parseDoseValorSanitario(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let normalized = t;
  if (t.includes(",")) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded).replace(".", ",");
}

/** Combina valor + unidade em um único texto para `saude_registros.dosagem` (ex.: "5 mL"). */
function montarDosagemSanitaria(valorRaw: string, unidadeRaw: string): {
  dosagem: string | undefined;
  erro: string | null;
} {
  const valorTrim = valorRaw.trim();
  const unidade = unidadeRaw.trim();
  if (!valorTrim && !unidade) return { dosagem: undefined, erro: null };
  if (valorTrim && !unidade) {
    return { dosagem: undefined, erro: "Informe a unidade da dose." };
  }
  if (!valorTrim && unidade) {
    return { dosagem: undefined, erro: "Informe o valor da dose." };
  }
  const valor = parseDoseValorSanitario(valorTrim);
  if (!valor) {
    return { dosagem: undefined, erro: "Informe um valor de dose válido maior que zero." };
  }
  return { dosagem: `${valor} ${unidade}`, erro: null };
}

/** Manejo pontual — Pesagem (mesmo padrão visual da Identificação). */
function ManejoPesagemForm() {
  const [, setLocation] = useLocation();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [novoPeso, setNovoPeso] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erroFazenda, setErroFazenda] = useState("");
  /** Modal central para bloqueios de regra de negócio (não limpa o formulário). */
  const [bloqueioNegocioMsg, setBloqueioNegocioMsg] = useState<string | null>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const { data: animaisFazendaAtivos = [], isFetching: carregandoAnimaisFazenda } =
    trpc.animais.list.useQuery(
      { fazendaId: fazendaNum || undefined, status: "ativo", dataManejo: data },
      { enabled: Boolean(fazendaNum) },
    );

  const { data: pesagensAnimal = [] } = trpc.pesagens.list.useQuery(
    { animalId: animalId! },
    { enabled: Boolean(animalId) },
  );

  const saveMutation = trpc.pesagens.create.useMutation({
    onSuccess: () => {
      toast.success("Pesagem registrada com sucesso.");
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar a pesagem.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(
          isMensagemBloqueioBaixa(msg) ? msg : MSG_PESAGEM_DATA_FUTURA,
        );
        return;
      }
      toast.error(msg);
    },
  });

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REBANHO_FAZENDA_STORAGE_KEY) return;
      const ids = fazendas.map(f => f.id);
      const next = readPersistedRebanhoFazendaId(ids);
      if (!next || next === fazendaId) return;
      setFazendaId(next);
      setAnimalId(null);
      setAnimalSel(null);
      setNovoPeso("");
      setObservacoes("");
      setErroFazenda("");
      toast.message("Fazenda do contexto atualizada. Dados dependentes foram limpos.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fazendas, fazendaId]);

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    setErroFazenda("");
    setAnimalId(null);
    setAnimalSel(null);
    setNovoPeso("");
    setObservacoes("");
  };

  const handleAnimalSelect = useCallback((a: AnimalBuscaRow | null) => {
    if (!a) {
      setAnimalId(null);
      setAnimalSel(null);
      setNovoPeso("");
      setObservacoes("");
      return;
    }
    setAnimalId(resolveAnimalIdFromSelecao(a) ?? null);
    setAnimalSel(a);
    setNovoPeso("");
    setObservacoes("");
  }, []);

  const ultimaPesagem = useMemo(() => {
    if (!animalId || !pesagensAnimal.length) return null;
    const desc = sortPesagensDesc(
      pesagensAnimal.map(p => ({
        id: p.id,
        peso: p.peso,
        data: p.data,
        observacoes: p.observacoes,
        createdAt: p.createdAt,
      })),
    );
    return desc[0] ?? null;
  }, [animalId, pesagensAnimal]);

  const ultimoPesoNum =
    ultimaPesagem?.peso != null && Number.isFinite(Number(ultimaPesagem.peso))
      ? Number(ultimaPesagem.peso)
      : animalSel?.ultimoPeso != null && Number.isFinite(animalSel.ultimoPeso)
        ? animalSel.ultimoPeso
        : null;
  const ultimoPesoFmt = formatUltimoPesoKg(ultimoPesoNum);
  const ultimaPesagemDataFmt = ultimaPesagem?.data
    ? formatDateBR(ultimaPesagem.data)
    : null;

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const fecharBloqueioNegocio = () => setBloqueioNegocioMsg(null);

  const handleSalvar = () => {
    if (!fazendaId) {
      setErroFazenda("Selecione uma Fazenda");
      toast.error("Selecione uma Fazenda");
      return;
    }
    if (!resolveAnimalIdFromSelecao(animalSel) || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da pesagem.");
      return;
    }
    // Data civil YYYY-MM-DD vs hoje local — não usa timestamp/horário.
    if (data > todayISODate()) {
      setBloqueioNegocioMsg(MSG_PESAGEM_DATA_FUTURA);
      return;
    }
    const pesoPersistir = parsePesoKgParaPersistir(novoPeso);
    if (!pesoPersistir) {
      toast.error("Informe um peso válido maior que zero.");
      return;
    }

    saveMutation.mutate({
      animalId: resolveAnimalIdFromSelecao(animalSel)!,
      peso: pesoPersistir,
      data,
      observacoes: observacoes.trim() || undefined,
    });
  };

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Pesagem"
        onCancel={() => setLocation("/manejo/registros")}
        onSave={handleSalvar}
        saveDisabled={!animalId || !animalSel}
        savePending={saveMutation.isPending}
      >
        <ManejoSectionCard title="Contexto">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <FormLabel>Fazenda</FormLabel>
                <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
              </div>
            ) : (
              <div className="min-w-0">
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={onChangeFazenda}
                  fazendas={fazendas}
                  emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                  disabled={loadingFazendas || !fazendaInitDone}
                  required
                />
                {erroFazenda ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroFazenda}</p>
                ) : null}
              </div>
            )}

            <div className="min-w-0">
              <FormLabel required>Data</FormLabel>
              <FormDatePicker
                value={data}
                onChange={setData}
                max={todayISODate()}
              />
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <ManejoAnimalField
            embedded
            selected={animalSel}
            onSelect={handleAnimalSelect}
            animals={animaisFazendaAtivos as AnimalBuscaRow[]}
            loading={carregandoAnimaisFazenda}
            disabled={!fazendaNum}
            selectedExtra={
              <>
                <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                  |
                </span>
                <span className="shrink-0">
                  Último peso{" "}
                  <span className="font-medium text-gray-800">
                    {ultimoPesoFmt
                      ? `${ultimoPesoFmt} kg${ultimaPesagemDataFmt ? ` · ${ultimaPesagemDataFmt}` : ""}`
                      : "—"}
                  </span>
                </span>
              </>
            }
          />
        </ManejoSectionCard>

        {animalSel ? (
          <ManejoSectionCard title="Pesagem">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Novo peso (kg)</FormLabel>
                <FormInput
                  variant="light"
                  type="text"
                  inputMode="decimal"
                  value={novoPeso}
                  onChange={setNovoPeso}
                  placeholder="Ex.: 320 ou 320,5"
                  required
                />
              </div>
            </div>
            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                variant="light"
                rows={3}
                value={observacoes}
                onChange={setObservacoes}
                placeholder="Opcional"
              />
            </div>
          </ManejoSectionCard>
        ) : null}
      </ManejoPontualFormShell>

      {/* Bloqueio de regra de negócio — mesmo padrão visual da Identificação */}
      <Dialog open={Boolean(bloqueioNegocioMsg)}>
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
              {bloqueioNegocioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={fecharBloqueioNegocio}
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
}

/** Manejo pontual — Sanitário (mesmo padrão visual de Identificação/Pesagem). */
function ManejoSanitarioForm() {
  const [, setLocation] = useLocation();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [tipoSanitario, setTipoSanitario] = useState<TipoSanitarioManejo | "">("");
  const [estoqueId, setEstoqueId] = useState<number | null>(null);
  /** Snapshot do insumo selecionado (não depende só da lista filtrada). */
  const [produtoSel, setProdutoSel] = useState<EstoqueSanitarioItem | null>(null);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [listaProdutoAberta, setListaProdutoAberta] = useState(false);
  const [doseValor, setDoseValor] = useState("");
  const [doseUnidade, setDoseUnidade] = useState("");
  const [viaAplicacao, setViaAplicacao] = useState("");
  const [descricaoOutro, setDescricaoOutro] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erroFazenda, setErroFazenda] = useState("");
  const [erroDose, setErroDose] = useState("");
  const [erroProduto, setErroProduto] = useState("");
  const [bloqueioNegocioMsg, setBloqueioNegocioMsg] = useState<string | null>(null);
  const produtoRef = useRef<HTMLDivElement>(null);
  const doseUnidadeManualRef = useRef<{ produtoId: number | null; manual: boolean }>({
    produtoId: null,
    manual: false,
  });

  const aplicarSugestaoUnidadeDose = useCallback((p: EstoqueSanitarioItem) => {
    if (
      doseUnidadeManualRef.current.produtoId === p.id &&
      doseUnidadeManualRef.current.manual
    ) {
      return;
    }
    const sugerida = sugerirUnidadeDoseSanitaria({
      unidadeEstoque: p.unidade,
      embalagensRaw: p.embalagens,
    });
    if (sugerida) {
      setDoseUnidade(sugerida);
      doseUnidadeManualRef.current = { produtoId: p.id, manual: false };
    }
  }, []);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const exigeProduto = Boolean(tipoSanitario) && tipoSanitario !== "Outro";
  const exigeDescricaoOutro = tipoSanitario === "Outro";

  const { data: animaisFazendaAtivos = [], isFetching: carregandoAnimaisFazenda } =
    trpc.animais.list.useQuery(
      { fazendaId: fazendaNum || undefined, status: "ativo", dataManejo: data },
      { enabled: Boolean(fazendaNum) },
    );

  const { data: estoqueFarmácia = [], isFetching: loadingEstoque } =
    trpc.estoque.listByCategories.useQuery(
      { categorias: [CATEGORIA_SANITARIO_INSUMOS] },
      { enabled: Boolean(fazendaNum) && Boolean(animalSel) },
    );

  const produtosFazenda = useMemo(() => {
    if (!fazendaNum) return [];
    return (estoqueFarmácia as EstoqueSanitarioItem[]).filter(item => {
      const sit = String(item.situacao || "ativo").toLowerCase();
      if (sit === "inativo") return false;
      if (!produtoControlaSaldo((item as { controlarSaldo?: boolean | null }).controlarSaldo)) {
        return false;
      }
      const fid = Number(item.fazendaId);
      return Number.isFinite(fid) && fid === fazendaNum;
    });
  }, [estoqueFarmácia, fazendaNum]);

  const produtosFiltrados = useMemo(() => {
    const q = buscaProduto.trim().toLowerCase();
    if (!q) return produtosFazenda.slice(0, 40);
    return produtosFazenda
      .filter(p => {
        const nome = String(p.nome || "").toLowerCase();
        const sub = String(p.subcategoria || "").toLowerCase();
        const fab = String(p.fabricante || "").toLowerCase();
        return nome.includes(q) || sub.includes(q) || fab.includes(q);
      })
      .slice(0, 40);
  }, [produtosFazenda, buscaProduto]);

  const custoMedioProduto = produtoSel
    ? parseCustoMedioClient(produtoSel.valorUnitario)
    : null;

  const doseNumParsed = useMemo(() => {
    const raw = doseValor.trim();
    if (!raw) return null;
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [doseValor]);

  /** Custo de referência na unidade da dose (ex.: R$/mL), quando conversão é segura. */
  const custoReferenciaDose = useMemo(() => {
    if (!produtoSel || custoMedioProduto == null) return null;
    if (!doseUnidade.trim()) {
      return {
        tipo: "estoque" as const,
        valor: custoMedioProduto,
        rotulo: siglaUnidade(produtoSel.unidade) || produtoSel.unidade || "un",
      };
    }
    const ref = calcularCustoReferenciaPorUnidadeDose({
      custoMedioEstoque: custoMedioProduto,
      unidadeEstoque: produtoSel.unidade,
      unidadeDose: doseUnidade,
      embalagensRaw: produtoSel.embalagens,
    });
    if ("erro" in ref) return { tipo: "erro" as const, erro: ref.erro };
    return {
      tipo: "dose" as const,
      valor: ref.custoPorUnidadeDose,
      rotulo: ref.rotuloUnidadeDose,
    };
  }, [produtoSel, custoMedioProduto, doseUnidade]);

  const consumoCalc = useMemo(() => {
    if (!produtoSel || doseNumParsed == null || !doseUnidade.trim()) return null;
    return calcularQuantidadeEstoquePorDose({
      doseValor: doseNumParsed,
      doseUnidade,
      unidadeEstoque: produtoSel.unidade,
      embalagensRaw: produtoSel.embalagens,
    });
  }, [produtoSel, doseNumParsed, doseUnidade]);

  const custoEstimado = useMemo(() => {
    if (custoReferenciaDose?.tipo === "dose" && doseNumParsed != null) {
      return Math.round(doseNumParsed * custoReferenciaDose.valor * 100) / 100;
    }
    if (consumoCalc && "quantidade" in consumoCalc && custoMedioProduto != null) {
      return Math.round(consumoCalc.quantidade * custoMedioProduto * 100) / 100;
    }
    return null;
  }, [custoReferenciaDose, doseNumParsed, consumoCalc, custoMedioProduto]);

  const selecionarProduto = (p: EstoqueSanitarioItem) => {
    doseUnidadeManualRef.current = { produtoId: p.id, manual: false };
    setEstoqueId(p.id);
    setProdutoSel(p);
    setBuscaProduto(p.nome || "");
    setListaProdutoAberta(false);
    setErroProduto("");
    aplicarSugestaoUnidadeDose(p);
  };

  const limparProduto = () => {
    doseUnidadeManualRef.current = { produtoId: null, manual: false };
    setEstoqueId(null);
    setProdutoSel(null);
    setBuscaProduto("");
    setErroProduto("");
    setDoseUnidade("");
  };

  const trpcUtils = trpc.useUtils();
  const saveMutation = trpc.saude.create.useMutation({
    onSuccess: () => {
      toast.success("Registro sanitário salvo com sucesso.");
      void trpcUtils.estoque.listByCategories.invalidate();
      void trpcUtils.estoque.list.invalidate();
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar o registro sanitário.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(
          isMensagemBloqueioBaixa(msg) ? msg : MSG_SANITARIO_DATA_FUTURA,
        );
        return;
      }
      if (
        msg.toLowerCase().includes("estoque insuficiente") ||
        msg.toLowerCase().includes("não é possível converter") ||
        msg.toLowerCase().includes("custo médio")
      ) {
        setBloqueioNegocioMsg(msg);
        return;
      }
      toast.error(msg);
    },
  });

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REBANHO_FAZENDA_STORAGE_KEY) return;
      const ids = fazendas.map(f => f.id);
      const next = readPersistedRebanhoFazendaId(ids);
      if (!next || next === fazendaId) return;
      setFazendaId(next);
      setAnimalId(null);
      setAnimalSel(null);
      setTipoSanitario("");
      setEstoqueId(null);
      setProdutoSel(null);
      setBuscaProduto("");
      setListaProdutoAberta(false);
      setDoseValor("");
      setDoseUnidade("");
      setViaAplicacao("");
      setDescricaoOutro("");
      setObservacoes("");
      setErroFazenda("");
      setErroDose("");
      setErroProduto("");
      toast.message("Fazenda do contexto atualizada. Dados dependentes foram limpos.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fazendas, fazendaId]);

  useEffect(() => {
    if (!listaProdutoAberta) return;
    const onDoc = (e: MouseEvent) => {
      if (produtoRef.current && !produtoRef.current.contains(e.target as Node)) {
        setListaProdutoAberta(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [listaProdutoAberta]);

  /** Atualiza saldo/custo do snapshot quando a lista de estoque refresca. */
  useEffect(() => {
    if (!estoqueId) return;
    const fresh = produtosFazenda.find(p => p.id === estoqueId);
    if (fresh) {
      setProdutoSel(fresh);
      aplicarSugestaoUnidadeDose(fresh);
    }
  }, [aplicarSugestaoUnidadeDose, produtosFazenda, estoqueId]);

  const conversaoDoseInvalida = Boolean(
    estoqueId &&
      doseValor.trim() &&
      doseUnidade.trim() &&
      consumoCalc &&
      "erro" in consumoCalc,
  );

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    setErroFazenda("");
    setErroDose("");
    setErroProduto("");
    setAnimalId(null);
    setAnimalSel(null);
    setTipoSanitario("");
    setEstoqueId(null);
    setProdutoSel(null);
    setBuscaProduto("");
    setListaProdutoAberta(false);
    setDoseValor("");
    setDoseUnidade("");
    setViaAplicacao("");
    setDescricaoOutro("");
    setObservacoes("");
  };

  const limparSanitarioDependentes = useCallback(() => {
    setTipoSanitario("");
    setEstoqueId(null);
    setProdutoSel(null);
    setBuscaProduto("");
    setListaProdutoAberta(false);
    setDoseValor("");
    setDoseUnidade("");
    setViaAplicacao("");
    setDescricaoOutro("");
    setObservacoes("");
    setErroDose("");
    setErroProduto("");
  }, []);

  const handleAnimalSelect = useCallback(
    (a: AnimalBuscaRow | null) => {
      if (!a) {
        setAnimalId(null);
        setAnimalSel(null);
        limparSanitarioDependentes();
        return;
      }
      setAnimalId(resolveAnimalIdFromSelecao(a) ?? null);
      setAnimalSel(a);
    },
    [limparSanitarioDependentes],
  );

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const fecharBloqueioNegocio = () => setBloqueioNegocioMsg(null);

  const handleSalvar = () => {
    if (!fazendaId) {
      setErroFazenda("Selecione uma Fazenda");
      toast.error("Selecione uma Fazenda");
      return;
    }
    const animalIdSelecionado = resolveAnimalIdFromSelecao(animalSel);
    if (!animalIdSelecionado || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!data) {
      toast.error("Informe a data do manejo sanitário.");
      return;
    }
    if (data > todayISODate()) {
      setBloqueioNegocioMsg(MSG_SANITARIO_DATA_FUTURA);
      return;
    }
    if (!tipoSanitario) {
      toast.error("Selecione o tipo de manejo sanitário.");
      return;
    }
    if (exigeDescricaoOutro && !descricaoOutro.trim()) {
      toast.error("Descreva o manejo sanitário.");
      return;
    }
    if (exigeProduto && !estoqueId) {
      setErroProduto("Selecione um produto / medicamento do estoque.");
      toast.error("Selecione um produto / medicamento do estoque.");
      return;
    }
    if (estoqueId) {
      const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);
      if (doseMontada.erro) {
        setErroDose(doseMontada.erro);
        return;
      }
      setErroDose("");
      if (consumoCalc && "erro" in consumoCalc) {
        setBloqueioNegocioMsg(consumoCalc.erro);
        return;
      }
      if (custoMedioProduto == null) {
        setBloqueioNegocioMsg(
          "Este produto ainda não possui custo médio no estoque. Registre uma entrada com valor antes de usá-lo no manejo sanitário.",
        );
        return;
      }
      if (consumoCalc && "quantidade" in consumoCalc && produtoSel) {
        const disponivel = parseFloat(String(produtoSel.quantidade ?? 0));
        if (Number.isFinite(disponivel) && consumoCalc.quantidade > disponivel + 1e-9) {
          setBloqueioNegocioMsg(MSG_SANITARIO_ESTOQUE_INSUFICIENTE);
          return;
        }
      }
    } else {
      const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);
      if (doseMontada.erro) {
        setErroDose(doseMontada.erro);
        return;
      }
      setErroDose("");
    }

    const doseMontada = montarDosagemSanitaria(doseValor, doseUnidade);

    saveMutation.mutate({
      animalId: animalIdSelecionado,
      fazendaId: Number(fazendaId),
      tipo: tipoSanitario,
      estoqueId: estoqueId ?? undefined,
      dosagem: doseMontada.dosagem,
      doseValor: doseValor.trim() || undefined,
      doseUnidade: doseUnidade.trim() || undefined,
      viaAplicacao: viaAplicacao.trim() || undefined,
      descricao: exigeDescricaoOutro ? descricaoOutro.trim() : undefined,
      dataRegistro: data,
      observacoes: observacoes.trim() || undefined,
    });
  };

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Sanitário"
        onCancel={() => setLocation("/manejo/registros")}
        onSave={handleSalvar}
        saveDisabled={!animalId || !animalSel || conversaoDoseInvalida}
        savePending={saveMutation.isPending}
      >
        <ManejoSectionCard title="Contexto">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <FormLabel>Fazenda</FormLabel>
                <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
              </div>
            ) : (
              <div className="min-w-0">
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={onChangeFazenda}
                  fazendas={fazendas}
                  emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                  disabled={loadingFazendas || !fazendaInitDone}
                  required
                />
                {erroFazenda ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroFazenda}</p>
                ) : null}
              </div>
            )}

            <div className="min-w-0">
              <FormLabel required>Data</FormLabel>
              <FormDatePicker
                value={data}
                onChange={setData}
                max={todayISODate()}
              />
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <ManejoAnimalField
            embedded
            selected={animalSel}
            onSelect={handleAnimalSelect}
            animals={animaisFazendaAtivos as AnimalBuscaRow[]}
            loading={carregandoAnimaisFazenda}
            disabled={!fazendaNum}
            onAfterClear={limparSanitarioDependentes}
          />
        </ManejoSectionCard>

        {animalSel ? (
          <ManejoSectionCard title="Manejo Sanitário">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FormLabel required>Tipo de manejo sanitário</FormLabel>
                <FormSelect
                  variant="light"
                  value={tipoSanitario}
                  onChange={v => {
                    setTipoSanitario(v as TipoSanitarioManejo | "");
                    if (v !== "Outro") setDescricaoOutro("");
                  }}
                  placeholder="Selecione o tipo"
                  required
                >
                  {TIPOS_SANITARIO_MANEJO.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-[12px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
              {(exigeProduto || tipoSanitario === "Outro") ? (
                <div className={exigeProduto ? "" : "sm:col-span-2"}>
                  <FormLabel required={exigeProduto}>
                    Produto / medicamento
                    {!exigeProduto ? (
                      <span className="text-gray-400 font-normal"> (opcional)</span>
                    ) : null}
                  </FormLabel>
                  {produtoSel ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">
                            {produtoSel.nome}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {produtoSel.subcategoria || "Farmácia"}
                            {produtoSel.unidade
                              ? ` · estoque em ${siglaUnidade(produtoSel.unidade) || produtoSel.unidade}`
                              : ""}
                            {produtoSel.quantidade != null
                              ? ` · saldo ${Number(produtoSel.quantidade).toLocaleString("pt-BR")}`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-gray-600 underline shrink-0"
                          onClick={limparProduto}
                        >
                          Alterar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative" ref={produtoRef}>
                      <FormInput
                        variant="light"
                        type="search"
                        value={buscaProduto}
                        onChange={next => {
                          if (estoqueId != null || produtoSel) {
                            setEstoqueId(null);
                            setProdutoSel(null);
                          }
                          setBuscaProduto(next);
                          setListaProdutoAberta(true);
                          if (erroProduto) setErroProduto("");
                        }}
                        onFocus={() => setListaProdutoAberta(true)}
                        placeholder="Buscar e selecionar insumo da Farmácia…"
                        required={exigeProduto}
                        invalid={Boolean(erroProduto)}
                      />
                      {listaProdutoAberta ? (
                        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                          {loadingEstoque ? (
                            <li className="px-3 py-2.5 text-[11px] text-gray-400">Carregando…</li>
                          ) : produtosFiltrados.length === 0 ? (
                            <li className="px-3 py-2.5 text-[11px] text-gray-400">
                              Nenhum produto Farmácia nesta Fazenda. Cadastre em Insumos.
                            </li>
                          ) : (
                            produtosFiltrados.map(p => (
                              <li key={p.id}>
                                <button
                                  type="button"
                                  onClick={() => selecionarProduto(p)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-[#4ECDC4]/[0.08] transition"
                                >
                                  <div className="text-[13px] font-semibold text-gray-900">
                                    {p.nome}
                                  </div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {p.subcategoria || "Farmácia"}
                                    {p.unidade
                                      ? ` · ${siglaUnidade(p.unidade) || p.unidade}`
                                      : ""}
                                    {parseCustoMedioClient(p.valorUnitario) != null
                                      ? ` · ${formatMoedaBrlSanitario(parseCustoMedioClient(p.valorUnitario)!)}`
                                      : ""}
                                  </div>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                      {buscaProduto.trim() && !estoqueId ? (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Selecione o produto na lista para vincular ao estoque e calcular o custo.
                        </p>
                      ) : null}
                    </div>
                  )}
                  {erroProduto ? (
                    <p className="text-[11px] text-red-600 mt-1">{erroProduto}</p>
                  ) : null}
                </div>
              ) : null}
              {exigeDescricaoOutro ? (
                <div className="sm:col-span-2">
                  <FormLabel required>Descreva o manejo</FormLabel>
                  <FormInput
                    variant="light"
                    value={descricaoOutro}
                    onChange={setDescricaoOutro}
                    placeholder="Descreva o manejo sanitário realizado"
                  />
                </div>
              ) : null}
              <div>
                <FormLabel required={Boolean(estoqueId)}>Dose</FormLabel>
                <div className="flex gap-2 items-start min-w-0">
                  <FormInput
                    variant="light"
                    type="text"
                    inputMode="decimal"
                    value={doseValor}
                    onChange={next => {
                      setDoseValor(next);
                      if (erroDose) setErroDose("");
                    }}
                    placeholder="Ex.: 5"
                    className="min-w-0 flex-1"
                    required={Boolean(estoqueId)}
                    invalid={Boolean(erroDose)}
                  />
                  <div className="w-[7.25rem] shrink-0">
                    <FormSelect
                      variant="light"
                      value={doseUnidade}
                      onChange={v => {
                        doseUnidadeManualRef.current = { produtoId: estoqueId, manual: true };
                        setDoseUnidade(v);
                        if (erroDose) setErroDose("");
                      }}
                      placeholder="Unidade"
                      required={Boolean(estoqueId)}
                    >
                      {OPCOES_UNIDADE_DOSE_SANITARIO.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-[12px]">
                          {o.label}
                        </SelectItem>
                      ))}
                    </FormSelect>
                  </div>
                </div>
                {erroDose ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroDose}</p>
                ) : null}
                {consumoCalc && "erro" in consumoCalc && doseValor.trim() && doseUnidade ? (
                  <p className="text-[11px] text-amber-700 mt-1 whitespace-pre-line leading-relaxed">
                    {consumoCalc.erro}
                  </p>
                ) : null}
              </div>
              <div>
                <FormLabel>Via de aplicação</FormLabel>
                <FormSelect
                  variant="light"
                  side="top"
                  value={viaAplicacao}
                  onChange={setViaAplicacao}
                  placeholder="Selecione a via (opcional)"
                >
                  {VIAS_APLICACAO_SANITARIO.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-[12px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </FormSelect>
              </div>
            </div>
            {produtoSel ? (
              <div className="rounded-lg border border-[#4ECDC4]/30 bg-[#4ECDC4]/[0.06] px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                    Custo de referência
                  </p>
                  <p className="text-[15px] text-gray-900 font-semibold tabular-nums">
                    {custoMedioProduto == null
                      ? "Sem custo médio cadastrado"
                      : custoReferenciaDose?.tipo === "erro"
                        ? "—"
                        : custoReferenciaDose
                          ? `${formatMoedaBrlSanitario(custoReferenciaDose.valor)} / ${custoReferenciaDose.rotulo}`
                          : "—"}
                  </p>
                  {custoReferenciaDose?.tipo === "estoque" && !doseUnidade.trim() ? (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Informe a unidade da dose para ver o custo por mL/g/dose.
                    </p>
                  ) : null}
                  {custoReferenciaDose?.tipo === "erro" ? (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Não foi possível calcular o custo para esta unidade.
                    </p>
                  ) : null}
                  {produtoSel.quantidade != null ? (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Estoque disponível:{" "}
                      {Number(produtoSel.quantidade).toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {siglaUnidade(produtoSel.unidade) || produtoSel.unidade || ""}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-0.5">
                    Custo estimado do manejo
                  </p>
                  <p className="text-[15px] text-gray-900 font-semibold tabular-nums">
                    {custoEstimado != null ? formatMoedaBrlSanitario(custoEstimado) : "—"}
                  </p>
                  {consumoCalc && "quantidade" in consumoCalc && custoEstimado != null ? (
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Consumo no estoque:{" "}
                      {consumoCalc.quantidade.toLocaleString("pt-BR", {
                        maximumFractionDigits: 4,
                      })}{" "}
                      {siglaUnidade(produtoSel.unidade) || produtoSel.unidade || ""}
                    </p>
                  ) : null}
                  {consumoCalc && "erro" in consumoCalc && doseValor.trim() && doseUnidade ? (
                    <p className="text-[11px] text-amber-700 mt-1 whitespace-pre-line leading-relaxed">
                      {consumoCalc.erro}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                variant="light"
                rows={3}
                value={observacoes}
                onChange={setObservacoes}
                placeholder="Opcional — reação, reforço previsto, condição observada…"
              />
            </div>
          </ManejoSectionCard>
        ) : null}
      </ManejoPontualFormShell>

      <Dialog open={Boolean(bloqueioNegocioMsg)}>
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
              {bloqueioNegocioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={fecharBloqueioNegocio}
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
}

type CriaPartoSexo = "" | "macho" | "femea";

type CriaPartoFormRow = {
  brinco: string;
  sexo: CriaPartoSexo;
  categoria: string;
  pesoNascimento: string;
  brincoEletronico: string;
  raca: string;
};

type CriaPartoFieldErrors = Partial<
  Record<keyof CriaPartoFormRow, string>
>;

function emptyCriaPartoRow(): CriaPartoFormRow {
  return {
    brinco: "",
    sexo: "",
    categoria: "",
    pesoNascimento: "",
    brincoEletronico: "",
    raca: "",
  };
}

function sexoCriaFormParaCadastro(sexo: CriaPartoSexo): string {
  if (sexo === "macho") return "Macho";
  if (sexo === "femea") return "Fêmea";
  return "";
}

function ManejoReprodutivoForm() {
  const [, setLocation] = useLocation();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [tipoReprodutivo, setTipoReprodutivo] = useState("");
  const [resultado, setResultado] = useState("");
  const [reprodutorSemen, setReprodutorSemen] = useState("");
  const [reprodutorOrigem, setReprodutorOrigem] = useState<"" | "interno" | "externo">("");
  const [machoSel, setMachoSel] = useState<AnimalBuscaRow | null>(null);
  const [erroMacho, setErroMacho] = useState("");
  const [descricaoOutro, setDescricaoOutro] = useState("");
  const [descricaoResultadoOutro, setDescricaoResultadoOutro] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [partidaSemen, setPartidaSemen] = useState("");
  const [semenPartidaId, setSemenPartidaId] = useState<number | null>(null);
  const [centralOrigemSemen, setCentralOrigemSemen] = useState("");
  const [custoDoseSemen, setCustoDoseSemen] = useState("");
  const [inseminador, setInseminador] = useState("");
  const [eccMatriz, setEccMatriz] = useState("");
  const [erroEcc, setErroEcc] = useState("");
  const [erroCustoDose, setErroCustoDose] = useState("");
  const [cadastrarSemenAberto, setCadastrarSemenAberto] = useState(false);
  const [erroFazenda, setErroFazenda] = useState("");
  const [erroResultado, setErroResultado] = useState("");
  const [erroDescricaoOutro, setErroDescricaoOutro] = useState("");
  const [erroDescricaoResultadoOutro, setErroDescricaoResultadoOutro] = useState("");
  const [coberturaSelecaoModo, setCoberturaSelecaoModo] = useState<"" | "individual" | "lote">("");
  const [matrizBusca, setMatrizBusca] = useState("");
  const [matrizSel, setMatrizSel] = useState<AnimalBuscaRow | null>(null);
  const [matrizListaAberta, setMatrizListaAberta] = useState(false);
  const [loteCoberturaId, setLoteCoberturaId] = useState("");
  const [matrizesLoteSelecionadas, setMatrizesLoteSelecionadas] = useState<number[]>([]);
  const [erroCoberturaAlvo, setErroCoberturaAlvo] = useState("");
  const [bloqueioNegocioMsg, setBloqueioNegocioMsg] = useState<string | null>(null);
  const [registrarCrias, setRegistrarCrias] = useState(true);
  const [crias, setCrias] = useState<CriaPartoFormRow[]>([emptyCriaPartoRow()]);
  const [erroCrias, setErroCrias] = useState<Record<number, CriaPartoFieldErrors>>({});
  const matrizBuscaRef = useRef<HTMLDivElement>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const animalSexo = animalSel?.sexo ?? null;

  const { data: animaisFazendaAtivos = [], isFetching: carregandoAnimaisFazenda } =
    trpc.animais.list.useQuery(
      { fazendaId: fazendaNum || undefined, status: "ativo", dataManejo: data },
      { enabled: Boolean(fazendaNum) },
    );

  const animaisFazenda = animaisFazendaAtivos;

  const reproElegibilidadeAnimal = useMemo(
    () => (animalSel ? buildReproAnimalElegibilidadeInput(animalSel) : null),
    [animalSel],
  );

  const reproTipoOptions = useMemo(
    () => (reproElegibilidadeAnimal ? getReproTipoOptionsElegiveis(reproElegibilidadeAnimal) : []),
    [reproElegibilidadeAnimal],
  );

  const reproTipoOptionsManejo = useMemo(
    () =>
      animalSexo === "macho"
        ? orderReproTipoOptionsMachoCurral(reproTipoOptions)
        : reproTipoOptions,
    [animalSexo, reproTipoOptions],
  );

  const reproMachoTipoHint =
    animalSexo === "macho" ? getReproMachoTipoHint(tipoReprodutivo) : null;

  const categoriaIdadeMismatch = useMemo(
    () =>
      reproElegibilidadeAnimal ? hasCategoriaIdadeMismatchRepro(reproElegibilidadeAnimal) : false,
    [reproElegibilidadeAnimal],
  );

  const reproResultadoOptions = useMemo(
    () => getReproResultadoOptions(animalSexo, tipoReprodutivo, resultado),
    [animalSexo, tipoReprodutivo, resultado],
  );

  const showReprodutor = showReproReprodutorFieldManejo(tipoReprodutivo, animalSexo);
  const showCoberturaAlvo = showReproCoberturaAlvoFieldManejo(tipoReprodutivo, animalSexo);
  const estacaoMontaManejo = isEstacaoMontaMacho(tipoReprodutivo);
  const coberturaModoIndividualPermitido = coberturaAlvoPermiteModoIndividual(tipoReprodutivo);
  const showResultado = showReproResultadoFieldManejo(tipoReprodutivo, animalSexo);
  const exigeResultado = isReproResultadoRequiredManejo(tipoReprodutivo, animalSexo);
  const showDescricaoOutro = showReproDescricaoOutroManejo(tipoReprodutivo);
  const showDescricaoResultadoOutro = showReproDescricaoResultadoOutroManejo(
    tipoReprodutivo,
    resultado,
  );
  const showPrevisaoParto =
    shouldShowPrevisaoPartoForm(animalSexo) &&
    shouldCalcPrevisaoParto(tipoReprodutivo, animalSexo);
  const isDadosCobertura = tipoReprodutivo === "Cobertura";
  const isDadosInseminacao = tipoReprodutivo === "Inseminação";
  const showBlocoCoberturaInseminacao = isDadosCobertura || isDadosInseminacao;
  const showReprodutorFemea =
    showBlocoCoberturaInseminacao && animalSexo === "femea";
  const reprodutorModoInterno =
    isDadosCobertura || (isDadosInseminacao && reprodutorOrigem === "interno");
  const reprodutorModoExterno = isDadosInseminacao && reprodutorOrigem === "externo";
  const machoIdReproInseminacao = machoSel ? resolveMachoIdFromSelecao(machoSel) : null;
  const reprodutorSemenDebounced = useDebounce(reprodutorSemen, 300);
  const reprodutorKeyExterno = useMemo(
    () =>
      reprodutorOrigem === "externo"
        ? tryBuildSemenReprodutorKeyExterno(reprodutorSemenDebounced)
        : null,
    [reprodutorOrigem, reprodutorSemenDebounced],
  );

  const { data: reprodutoresExternosCatalogo = [], isFetching: carregandoReprodutoresExternos } =
    trpc.semen.listCatalogoExternos.useQuery(
      { fazendaId: fazendaNum },
      { enabled: isDadosInseminacao && reprodutorOrigem === "externo" && fazendaNum > 0 },
    );

  const partidasSemenQueryEnabled = shouldLoadSemenPartidasParaInseminacao({
    tipoReprodutivo,
    fazendaId: fazendaNum,
    origemReprodutor: reprodutorOrigem,
    machoId: machoIdReproInseminacao,
    reprodutorKeyExterno,
  });

  const { data: partidasSemenDisponiveis = [], isFetching: carregandoPartidasSemen } =
    trpc.semen.listDisponiveisParaInseminacao.useQuery(
      {
        fazendaId: fazendaNum,
        origemReprodutor:
          reprodutorOrigem === "interno" ? SEMEN_ORIGEM_INTERNO : SEMEN_ORIGEM_EXTERNO,
        machoId:
          reprodutorOrigem === "interno" ? machoIdReproInseminacao ?? undefined : undefined,
        reprodutorKey: reprodutorOrigem === "externo" ? reprodutorKeyExterno ?? undefined : undefined,
        reprodutorTexto:
          reprodutorOrigem === "externo" ? reprodutorSemenDebounced.trim() : undefined,
      },
      { enabled: partidasSemenQueryEnabled },
    );

  const partidaSemenSelecionada = useMemo(
    () => partidasSemenDisponiveis.find(p => p.id === semenPartidaId) ?? null,
    [partidasSemenDisponiveis, semenPartidaId],
  );
  const isParto = tipoReprodutivo === "Parto";
  const isPartoCriaViva =
    isParto && (resultado === "Normal" || resultado === "Com assistência");
  const isPartoNatimorto = isParto && resultado === "Natimorto";
  const showPartoCriasSection = isPartoCriaViva;
  const usePartoComCriasEndpoint =
    isPartoNatimorto || (isPartoCriaViva && registrarCrias);
  const previsaoPartoEstimada = useMemo(() => {
    if (!showPrevisaoParto || !data) return null;
    return calcPrevisaoParto283(data);
  }, [showPrevisaoParto, data]);
  const previsaoPartoEstimadaFmt = previsaoPartoEstimada
    ? formatDateBR(previsaoPartoEstimada)
    : null;
  const reproRelacionadoLabel = getReproRelacionadoLabel(animalSexo);
  const reproRelacionadoPlaceholder = getReproRelacionadoPlaceholder(animalSexo);

  const filterMachoReprodutor = useCallback(
    (a: AnimalBuscaRow) =>
      filterMachosReprodutoresCandidatos([{ ...a, status: "ativo" }], {
        fazendaId: fazendaNum,
        excludeAnimalId: animalId,
      }).length > 0,
    [fazendaNum, animalId],
  );

  const { data: lotesTodos = [] } = trpc.lotes.list.useQuery(
    { somenteAtivos: true },
    { enabled: Boolean(fazendaNum) && showCoberturaAlvo },
  );

  const matrizBuscaAtiva =
    showCoberturaAlvo &&
    coberturaSelecaoModo === "individual" &&
    Boolean(fazendaNum) &&
    matrizBusca.trim().length >= 1 &&
    !matrizSel;

  const { data: matrizesBuscaRaw = [], isFetching: buscandoMatrizes } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      status: "ativo",
      dataManejo: data,
      sexo: "femea",
      search: matrizBusca.trim() || undefined,
    },
    { enabled: matrizBuscaAtiva },
  );

  const matrizesElegiveisPorLote = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of animaisFazenda as AnimalBuscaRow[]) {
      if (a.sexo !== "femea") continue;
      if (!isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(a))) continue;
      if (!a.loteId) continue;
      map.set(a.loteId, (map.get(a.loteId) ?? 0) + 1);
    }
    return map;
  }, [animaisFazenda]);

  const lotesDaFazenda = useMemo(() => {
    return lotesTodos.filter(l => {
      if (!fazendaNum) return false;
      return l.fazendaId == null || l.fazendaId === fazendaNum;
    });
  }, [lotesTodos, fazendaNum]);

  const lotesCoberturaElegiveis = useMemo(() => {
    return lotesDaFazenda.filter(l => (matrizesElegiveisPorLote.get(l.id) ?? 0) > 0);
  }, [lotesDaFazenda, matrizesElegiveisPorLote]);

  const matrizesBusca = useMemo(() => {
    return (matrizesBuscaRaw as AnimalBuscaRow[])
      .filter(a => isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(a)))
      .slice(0, 40);
  }, [matrizesBuscaRaw]);

  const matrizesDoLoteElegiveis = useMemo(() => {
    const loteNum = loteCoberturaId ? Number(loteCoberturaId) : 0;
    if (!loteNum) return [];
    return (animaisFazenda as AnimalBuscaRow[])
      .filter(a => {
        if (a.loteId !== loteNum) return false;
        if (a.sexo !== "femea") return false;
        return isFemeaReprodutivamenteMadura(buildReproAnimalElegibilidadeInput(a));
      })
      .sort((a, b) => labelAnimalBusca(a).localeCompare(labelAnimalBusca(b), "pt-BR"));
  }, [animaisFazenda, loteCoberturaId]);

  const limparCoberturaAlvo = useCallback(() => {
    setCoberturaSelecaoModo("");
    setMatrizBusca("");
    setMatrizSel(null);
    setMatrizListaAberta(false);
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
    setErroCoberturaAlvo("");
  }, []);

  const limparPartoCriasState = useCallback(() => {
    setRegistrarCrias(true);
    setCrias([emptyCriaPartoRow()]);
    setErroCrias({});
  }, []);

  const limparReprodutorMacho = useCallback(() => {
    setReprodutorOrigem("");
    setMachoSel(null);
    setErroMacho("");
  }, []);

  const limparReproCondicionais = useCallback(() => {
    setTipoReprodutivo("");
    setResultado("");
    setReprodutorSemen("");
    setDescricaoOutro("");
    setDescricaoResultadoOutro("");
    setObservacoes("");
    setPartidaSemen("");
    setSemenPartidaId(null);
    setCentralOrigemSemen("");
    setCustoDoseSemen("");
    setInseminador("");
    setEccMatriz("");
    setErroEcc("");
    setErroCustoDose("");
    setErroResultado("");
    setErroDescricaoOutro("");
    setErroDescricaoResultadoOutro("");
    limparCoberturaAlvo();
    limparPartoCriasState();
    limparReprodutorMacho();
  }, [limparCoberturaAlvo, limparPartoCriasState, limparReprodutorMacho]);

  const trpcUtils = trpc.useUtils();

  const invalidatePosReproSave = useCallback(() => {
    void trpcUtils.reproducao.list.invalidate();
    void trpcUtils.animais.list.invalidate();
    void trpcUtils.dashboard.stats.invalidate();
    void trpcUtils.pesagens.list.invalidate();
    void invalidateSemenUtilizadoQueries(trpcUtils);
    void trpcUtils.semen.listCatalogoExternos.invalidate();
  }, [trpcUtils]);

  const aplicarReprodutorExternoCatalogo = useCallback(
    (item: { reprodutorTexto: string; centralPadrao: string | null }) => {
      setReprodutorSemen(item.reprodutorTexto);
      setSemenPartidaId(null);
      setPartidaSemen("");
      setCentralOrigemSemen(item.centralPadrao ?? "");
      setCustoDoseSemen("");
      setErroCustoDose("");
    },
    [],
  );

  const saveMutation = trpc.reproducao.create.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success("Registro reprodutivo salvo com sucesso.");
      invalidatePosReproSave();
      if (variables.semenPartidaId != null && variables.semenPartidaId > 0) {
        await invalidateSemenQueriesAfterConsumo(trpcUtils, {
          partidaId: variables.semenPartidaId,
        });
      }
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar o registro reprodutivo.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(
          isMensagemBloqueioBaixa(msg) ? msg : MSG_REPRODUTIVO_DATA_FUTURA,
        );
        return;
      }
      if (
        msg.includes(MSG_REPRO_MACHO_CASTRADO) ||
        msg.includes(MSG_REPRO_MACHO_CASTRADO_REPRODUTOR) ||
        msg.includes(MSG_REPRO_INELEGIVEL)
      ) {
        setBloqueioNegocioMsg(msg);
        return;
      }
      if (
        msg.includes(MSG_REPRO_MATRIZ_INELEGIVEL) ||
        msg.includes(MSG_REPRO_LOTE_INELEGIVEL) ||
        msg.includes(MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO) ||
        msg.includes(MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS)
      ) {
        setBloqueioNegocioMsg(msg);
        return;
      }
      if (msg.includes(MSG_REPRO_RESULTADO_INCOMPATIVEL)) {
        setBloqueioNegocioMsg(MSG_REPRO_RESULTADO_INCOMPATIVEL);
        return;
      }
      toast.error(msg);
    },
  });

  const savePartoComCriasMutation = trpc.reproducao.registrarPartoComCrias.useMutation({
    onSuccess: () => {
      toast.success("Parto registrado com sucesso.");
      invalidatePosReproSave();
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível registrar o parto.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(
          isMensagemBloqueioBaixa(msg) ? msg : MSG_REPRODUTIVO_DATA_FUTURA,
        );
        return;
      }
      if (
        msg.includes(MSG_REPRO_MACHO_CASTRADO) ||
        msg.includes(MSG_REPRO_MACHO_CASTRADO_REPRODUTOR) ||
        msg.includes(MSG_REPRO_INELEGIVEL)
      ) {
        setBloqueioNegocioMsg(msg);
        return;
      }
      if (msg.includes(MSG_REPRO_RESULTADO_INCOMPATIVEL)) {
        setBloqueioNegocioMsg(MSG_REPRO_RESULTADO_INCOMPATIVEL);
        return;
      }
      toast.error(msg);
    },
  });

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REBANHO_FAZENDA_STORAGE_KEY) return;
      const ids = fazendas.map(f => f.id);
      const next = readPersistedRebanhoFazendaId(ids);
      if (!next || next === fazendaId) return;
      setFazendaId(next);
      limparReproCondicionais();
      setAnimalId(null);
      setAnimalSel(null);
      setErroFazenda("");
      toast.message("Fazenda do contexto atualizada. Dados dependentes foram limpos.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fazendas, fazendaId, limparReproCondicionais]);

  useEffect(() => {
    if (!matrizListaAberta) return;
    const onDoc = (e: MouseEvent) => {
      if (matrizBuscaRef.current && !matrizBuscaRef.current.contains(e.target as Node)) {
        setMatrizListaAberta(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [matrizListaAberta]);

  const onChangeFazenda = (next: string) => {
    setFazendaId(next);
    persistRebanhoFazendaId(next);
    setErroFazenda("");
    setAnimalId(null);
    setAnimalSel(null);
    limparReproCondicionais();
  };

  const handleAnimalSelect = useCallback(
    (a: AnimalBuscaRow | null) => {
      if (!a) {
        setAnimalId(null);
        setAnimalSel(null);
        limparReproCondicionais();
        return;
      }
      setAnimalId(resolveAnimalIdFromSelecao(a) ?? null);
      setAnimalSel(a);
      limparReproCondicionais();
    },
    [limparReproCondicionais],
  );

  const handleMachoSelect = useCallback((a: AnimalBuscaRow | null) => {
    setMachoSel(a);
    setSemenPartidaId(null);
    setPartidaSemen("");
    setCentralOrigemSemen("");
    setCustoDoseSemen("");
    setErroMacho("");
    setErroCustoDose("");
  }, []);

  const onChangeTipo = (newTipo: string) => {
    setTipoReprodutivo(newTipo);
    setResultado("");
    setReprodutorSemen("");
    setDescricaoOutro("");
    setDescricaoResultadoOutro("");
    limparCoberturaAlvo();
    if (isEstacaoMontaMacho(newTipo)) {
      setCoberturaSelecaoModo("lote");
    }
    limparPartoCriasState();
    limparReprodutorMacho();
    if (newTipo === "Cobertura") {
      setReprodutorOrigem("interno");
    }
    setErroResultado("");
    setErroDescricaoOutro("");
    setErroDescricaoResultadoOutro("");
  };

  const onChangeReprodutorOrigem = (next: "" | "interno" | "externo") => {
    setReprodutorOrigem(next);
    setMachoSel(null);
    setReprodutorSemen("");
    setSemenPartidaId(null);
    setPartidaSemen("");
    setCentralOrigemSemen("");
    setCustoDoseSemen("");
    setErroMacho("");
    setErroCustoDose("");
  };

  const onChangeResultado = (v: string) => {
    setResultado(v);
    if (v !== "Outro") setDescricaoResultadoOutro("");
    if (erroResultado) setErroResultado("");
    if (erroDescricaoResultadoOutro) setErroDescricaoResultadoOutro("");

    if (tipoReprodutivo === "Parto") {
      if (v === "Natimorto" || v === "Outro") {
        setRegistrarCrias(true);
        setCrias([]);
        setErroCrias({});
      } else if (v === "Normal" || v === "Com assistência") {
        setRegistrarCrias(true);
        setCrias([emptyCriaPartoRow()]);
        setErroCrias({});
      }
    }
  };

  const addCriaParto = () => {
    setCrias(prev => [...prev, emptyCriaPartoRow()]);
  };

  const removeCriaParto = (index: number) => {
    setCrias(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
    setErroCrias(prev => {
      const next: Record<number, CriaPartoFieldErrors> = {};
      for (const [key, val] of Object.entries(prev)) {
        const i = Number(key);
        if (i < index) next[i] = val;
        else if (i > index) next[i - 1] = val;
      }
      return next;
    });
  };

  const onChangeCriaField = (
    index: number,
    field: keyof CriaPartoFormRow,
    value: string,
  ) => {
    setCrias(prev =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
    setErroCrias(prev => {
      if (!prev[index]?.[field]) return prev;
      const row = { ...prev[index] };
      delete row[field];
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[index];
      else next[index] = row;
      return next;
    });
  };

  const onChangeCriaSexo = (index: number, sexo: "macho" | "femea") => {
    setCrias(prev =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              sexo,
              categoria: sexo === "macho" ? "Bezerro" : "Bezerra",
            }
          : c,
      ),
    );
    setErroCrias(prev => {
      if (!prev[index]) return prev;
      const row = { ...prev[index] };
      delete row.sexo;
      delete row.categoria;
      const next = { ...prev };
      if (Object.keys(row).length === 0) delete next[index];
      else next[index] = row;
      return next;
    });
  };

  const onChangeCoberturaSelecaoModo = (next: "" | "individual" | "lote") => {
    setCoberturaSelecaoModo(next);
    setMatrizBusca("");
    setMatrizSel(null);
    setMatrizListaAberta(false);
    setLoteCoberturaId("");
    setMatrizesLoteSelecionadas([]);
    setErroCoberturaAlvo("");
  };

  const onChangeLoteCobertura = (loteId: string) => {
    setLoteCoberturaId(loteId);
    setMatrizesLoteSelecionadas([]);
    if (erroCoberturaAlvo) setErroCoberturaAlvo("");
  };

  const toggleMatrizLote = (id: number) => {
    setMatrizesLoteSelecionadas(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
    if (erroCoberturaAlvo) setErroCoberturaAlvo("");
  };

  const toggleSelecionarTodasMatrizesLote = () => {
    const todosIds = matrizesDoLoteElegiveis.map(a => a.id);
    setMatrizesLoteSelecionadas(prev =>
      prev.length === todosIds.length && todosIds.every(id => prev.includes(id)) ? [] : todosIds,
    );
    if (erroCoberturaAlvo) setErroCoberturaAlvo("");
  };

  const selecionarMatriz = useCallback((a: AnimalBuscaRow) => {
    setMatrizSel(a);
    setMatrizBusca(labelAnimalBusca(a));
    setMatrizListaAberta(false);
    setErroCoberturaAlvo("");
  }, []);

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  const fecharBloqueioNegocio = () => setBloqueioNegocioMsg(null);

  const handleSalvar = () => {
    if (!fazendaId) {
      setErroFazenda("Selecione uma Fazenda");
      toast.error("Selecione uma Fazenda");
      return;
    }
    const animalIdSelecionado = resolveAnimalIdFromSelecao(animalSel);
    if (!animalIdSelecionado || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!data) {
      toast.error("Informe a data do manejo reprodutivo.");
      return;
    }
    if (data > todayISODate()) {
      setBloqueioNegocioMsg(MSG_REPRODUTIVO_DATA_FUTURA);
      return;
    }
    if (!tipoReprodutivo) {
      toast.error("Selecione o tipo de manejo reprodutivo.");
      return;
    }
    if (
      reproElegibilidadeAnimal &&
      !isReproTipoPermitidoParaAnimal(reproElegibilidadeAnimal, tipoReprodutivo)
    ) {
      setBloqueioNegocioMsg(mensagemReproInelegivelAnimal(reproElegibilidadeAnimal));
      return;
    }
    if (exigeResultado && !resultado.trim()) {
      setErroResultado("Informe o resultado do manejo reprodutivo.");
      toast.error("Informe o resultado do manejo reprodutivo.");
      return;
    }
    if (showDescricaoOutro && !descricaoOutro.trim()) {
      setErroDescricaoOutro("Descreva o manejo reprodutivo.");
      return;
    }
    if (showDescricaoResultadoOutro && !descricaoResultadoOutro.trim()) {
      setErroDescricaoResultadoOutro("Descreva o resultado do manejo reprodutivo.");
      return;
    }

    const validacaoResultado = validateReproResultadoForSave({
      sexo: animalSel.sexo,
      tipo: tipoReprodutivo,
      resultado: showResultado ? resultado : undefined,
      descricaoResultadoOutro: showDescricaoResultadoOutro
        ? descricaoResultadoOutro
        : undefined,
    });
    if (!validacaoResultado.ok) {
      if (validacaoResultado.message.includes("Descreva o resultado")) {
        setErroDescricaoResultadoOutro(validacaoResultado.message);
      } else if (validacaoResultado.message.includes("Informe o resultado")) {
        setErroResultado(validacaoResultado.message);
      } else {
        setBloqueioNegocioMsg(validacaoResultado.message);
      }
      return;
    }

    if (showReprodutorFemea && reprodutorModoInterno && !machoSel) {
      setErroMacho("Selecione um reprodutor da lista.");
      toast.error("Selecione um reprodutor da lista.");
      return;
    }

    if (showReprodutorFemea && isDadosInseminacao && !reprodutorOrigem) {
      toast.error("Selecione a origem do reprodutor.");
      return;
    }

    if (showReprodutorFemea && reprodutorModoExterno && !reprodutorSemen.trim()) {
      toast.error("Informe o reprodutor ou sêmen externo.");
      return;
    }

    if (reprodutorModoExterno) {
      const validacaoCusto = validateReproCustoDoseInseminacaoExterna(
        parseSemenCustoTotal(custoDoseSemen),
      );
      if (!validacaoCusto.ok) {
        setErroCustoDose(validacaoCusto.message);
        toast.error(validacaoCusto.message);
        return;
      }
    }

    let eccPersistido: number | undefined;
    if (isDadosInseminacao && eccMatriz.trim()) {
      const validacaoEcc = validateReproEcc(eccMatriz);
      if (!validacaoEcc.ok) {
        setErroEcc(validacaoEcc.message);
        toast.error(validacaoEcc.message);
        return;
      }
      eccPersistido = validacaoEcc.value;
    }

    if (showCoberturaAlvo) {
      const modoAlvo = estacaoMontaManejo ? "lote" : coberturaSelecaoModo;
      if (!modoAlvo) {
        setErroCoberturaAlvo(MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO);
        toast.error(MSG_REPRO_COBERTURA_ALVO_OBRIGATORIO);
        return;
      }
      if (modoAlvo === "individual" && !matrizSel) {
        setErroCoberturaAlvo("Selecione uma matriz elegível.");
        toast.error("Selecione uma matriz elegível.");
        return;
      }
      if (modoAlvo === "lote") {
        if (!loteCoberturaId) {
          setErroCoberturaAlvo("Selecione um lote.");
          toast.error("Selecione um lote.");
          return;
        }
        if (matrizesLoteSelecionadas.length === 0) {
          setErroCoberturaAlvo(MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS);
          toast.error(MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS);
          return;
        }
      }
    }

    const modoAlvoSalvar = estacaoMontaManejo ? "lote" : coberturaSelecaoModo;
    const coberturaMatrizIds =
      showCoberturaAlvo && modoAlvoSalvar === "individual" && matrizSel
        ? [matrizSel.id]
        : showCoberturaAlvo && modoAlvoSalvar === "lote"
          ? matrizesLoteSelecionadas
          : undefined;

    if (usePartoComCriasEndpoint) {
      if (isPartoCriaViva && registrarCrias) {
        const erros: Record<number, CriaPartoFieldErrors> = {};
        let hasErr = false;
        const brincosLower = new Set<string>();

        crias.forEach((c, i) => {
          const rowErr: CriaPartoFieldErrors = {};
          const brinco = c.brinco.trim();
          if (!brinco) {
            rowErr.brinco = "Brinco é obrigatório.";
            hasErr = true;
          }
          if (!c.sexo) {
            rowErr.sexo = "Selecione o sexo.";
            hasErr = true;
          }
          const categoria = c.categoria.trim();
          if (!categoria) {
            rowErr.categoria = "Selecione a categoria.";
            hasErr = true;
          } else if (
            c.sexo &&
            !isCategoriaValidaParaSexo(sexoCriaFormParaCadastro(c.sexo), categoria)
          ) {
            rowErr.categoria = "Categoria incompatível com o sexo.";
            hasErr = true;
          }
          const pesoRaw = c.pesoNascimento.trim();
          if (pesoRaw) {
            const pesoNum = Number(pesoRaw.replace(",", "."));
            if (!Number.isFinite(pesoNum) || pesoNum <= 0) {
              rowErr.pesoNascimento = "Informe um peso positivo.";
              hasErr = true;
            }
          }
          const bKey = brinco.toLowerCase();
          if (bKey) {
            if (brincosLower.has(bKey)) {
              rowErr.brinco = "Brinco repetido neste parto.";
              hasErr = true;
            }
            brincosLower.add(bKey);
          }
          if (Object.keys(rowErr).length > 0) erros[i] = rowErr;
        });

        if (hasErr) {
          setErroCrias(erros);
          toast.error("Revise os dados das crias.");
          return;
        }
      }

      savePartoComCriasMutation.mutate({
        femeaId: animalIdSelecionado,
        fazendaId: fazendaNum,
        dataParto: data,
        resultado: resultado as "Normal" | "Com assistência" | "Natimorto" | "Outro",
        descricaoResultadoOutro: showDescricaoResultadoOutro
          ? descricaoResultadoOutro.trim()
          : undefined,
        observacoes: observacoes.trim() || undefined,
        crias:
          isPartoNatimorto || !registrarCrias
            ? undefined
            : crias.map(c => ({
                brinco: c.brinco.trim(),
                sexo: c.sexo as "macho" | "femea",
                categoria: c.categoria.trim(),
                pesoNascimento: c.pesoNascimento.trim()
                  ? c.pesoNascimento.trim().replace(",", ".")
                  : undefined,
                brincoEletronico: c.brincoEletronico.trim() || undefined,
                raca: c.raca.trim() || undefined,
              })),
      });
      return;
    }

    const reprodutorPayload = (() => {
      if (showDescricaoOutro) {
        return { reprodutorSemen: descricaoOutro.trim() || undefined };
      }
      if (showReprodutorFemea) {
        return buildReproReprodutorPayload({
          tipo: tipoReprodutivo,
          animalSexo: animalSel.sexo,
          machoId: resolveMachoIdFromSelecao(machoSel),
          machoLabel: machoSel ? labelAnimalBusca(machoSel) : undefined,
          textoExterno: reprodutorSemen,
          origem: isDadosCobertura ? "interno" : reprodutorOrigem,
        });
      }
      if (showReprodutor && reprodutorSemen.trim()) {
        return { reprodutorSemen: reprodutorSemen.trim() };
      }
      return {};
    })();

    saveMutation.mutate({
      animalId: animalIdSelecionado,
      fazendaId: fazendaNum || undefined,
      tipo: tipoReprodutivo,
      dataCobertura: data,
      resultado: showResultado && resultado.trim() ? resultado.trim() : undefined,
      ...reprodutorPayload,
      coberturaSelecaoModo:
        showCoberturaAlvo && modoAlvoSalvar ? modoAlvoSalvar : undefined,
      coberturaMatrizIds,
      coberturaLoteId:
        showCoberturaAlvo && modoAlvoSalvar === "lote" && loteCoberturaId
          ? Number(loteCoberturaId)
          : undefined,
      descricaoResultadoOutro: showDescricaoResultadoOutro
        ? descricaoResultadoOutro.trim()
        : undefined,
      observacoes: observacoes.trim() || undefined,
      partidaSemen: isDadosInseminacao
        ? partidaSemenSelecionada?.partida ?? (partidaSemen.trim() || undefined)
        : undefined,
      semenPartidaId:
        isDadosInseminacao && semenPartidaId != null ? semenPartidaId : undefined,
      custoDoseSemen: isDadosInseminacao
        ? parseSemenCustoTotal(custoDoseSemen) ?? undefined
        : undefined,
      centralOrigem: isDadosInseminacao ? centralOrigemSemen.trim() || undefined : undefined,
      inseminador: isDadosInseminacao ? inseminador.trim() || undefined : undefined,
      ecc: eccPersistido,
      dataPrevistoParto:
        showPrevisaoParto && previsaoPartoEstimada ? previsaoPartoEstimada : undefined,
    });
  };

  const coberturaAlvoCompleto =
    !showCoberturaAlvo ||
    (estacaoMontaManejo &&
      Boolean(loteCoberturaId) &&
      matrizesLoteSelecionadas.length > 0) ||
    (coberturaSelecaoModo === "individual" && Boolean(matrizSel)) ||
    (coberturaSelecaoModo === "lote" &&
      Boolean(loteCoberturaId) &&
      matrizesLoteSelecionadas.length > 0);

  const partoCriasValidas =
    !showPartoCriasSection ||
    !registrarCrias ||
    (crias.length > 0 &&
      crias.every(c => {
        const pesoRaw = c.pesoNascimento.trim();
        const pesoOk =
          !pesoRaw || Number(pesoRaw.replace(",", ".")) > 0;
        return (
          Boolean(c.brinco.trim()) &&
          Boolean(c.sexo) &&
          Boolean(c.categoria.trim()) &&
          isCategoriaValidaParaSexo(
            sexoCriaFormParaCadastro(c.sexo),
            c.categoria.trim(),
          ) &&
          pesoOk
        );
      }));

  const isSaving = saveMutation.isPending || savePartoComCriasMutation.isPending;

  const reprodutorInternoCompleto =
    !showReprodutorFemea || !reprodutorModoInterno || Boolean(machoSel);

  const reprodutorExternoCompleto =
    !showReprodutorFemea || !reprodutorModoExterno || Boolean(reprodutorSemen.trim());

  const custoDoseExternoCompleto = custoDoseInseminacaoExternaInformado(
    reprodutorModoExterno,
    custoDoseSemen,
  );

  const podeSalvar =
    Boolean(animalId && animalSel && tipoReprodutivo && data) &&
    coberturaAlvoCompleto &&
    reprodutorInternoCompleto &&
    reprodutorExternoCompleto &&
    custoDoseExternoCompleto &&
    (!exigeResultado || Boolean(resultado.trim())) &&
    (!showDescricaoOutro || Boolean(descricaoOutro.trim())) &&
    (!showDescricaoResultadoOutro || Boolean(descricaoResultadoOutro.trim())) &&
    partoCriasValidas;

  const sectionTitleCls =
    "text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2";

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Reprodutivo"
        onCancel={() => setLocation("/manejo/registros")}
        onSave={handleSalvar}
        saveDisabled={!podeSalvar}
        savePending={isSaving}
      >
        <ManejoSectionCard title="Contexto">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <FormLabel>Fazenda</FormLabel>
                <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
              </div>
            ) : (
              <div className="min-w-0">
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={onChangeFazenda}
                  fazendas={fazendas}
                  emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                  disabled={loadingFazendas || !fazendaInitDone}
                  required
                />
                {erroFazenda ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroFazenda}</p>
                ) : null}
              </div>
            )}

            <div className="min-w-0">
              <FormLabel required>Data</FormLabel>
              <FormDatePicker
                value={data}
                onChange={setData}
                max={todayISODate()}
              />
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <ManejoAnimalField
            embedded
            selected={animalSel}
            onSelect={handleAnimalSelect}
            animals={animaisFazendaAtivos as AnimalBuscaRow[]}
            loading={carregandoAnimaisFazenda}
            disabled={!fazendaNum}
          />
        </ManejoSectionCard>

        {animalSel ? (
          <ManejoSectionCard title="Manejo Reprodutivo">
            <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormLabel required>Tipo de manejo reprodutivo</FormLabel>
                <FormSelect
                  variant="light"
                  value={tipoReprodutivo}
                  onChange={onChangeTipo}
                  placeholder="Selecione o tipo"
                  required
                >
                  {reproTipoOptionsManejo.map(t => (
                    <SelectItem key={t} value={t} className="text-[12px]">
                      {t}
                    </SelectItem>
                  ))}
                </FormSelect>
                {reproMachoTipoHint ? (
                  <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">
                    {reproMachoTipoHint}
                  </p>
                ) : null}
                {reproTipoOptionsManejo.length === 0 ? (
                  <p className="text-[11px] text-amber-600 mt-1 leading-relaxed">
                    {reproElegibilidadeAnimal &&
                    isMachoBloqueadoReproPorCastracao(reproElegibilidadeAnimal)
                      ? MSG_REPRO_MACHO_CASTRADO
                      : "Este animal não possui manejos reprodutivos compatíveis com a idade ou categoria."}
                  </p>
                ) : null}
                {categoriaIdadeMismatch && reproTipoOptionsManejo.length > 0 ? (
                  <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                    Categoria pode estar desatualizada para a idade do animal.
                  </p>
                ) : null}
              </div>

              {showBlocoCoberturaInseminacao ? (
                <div className="sm:col-span-2 space-y-4 border-t border-gray-100 pt-4">
                  <p className={sectionTitleCls}>
                    {isDadosCobertura ? "Dados da cobertura" : "Dados da inseminação"}
                  </p>

                  {showReprodutorFemea ? (
                    <div className="space-y-4">
                      {isDadosInseminacao ? (
                        <div>
                          <FormLabel>Origem do reprodutor</FormLabel>
                          <FormSelect
                            variant="light"
                            value={reprodutorOrigem}
                            onChange={v =>
                              onChangeReprodutorOrigem(v as "" | "interno" | "externo")
                            }
                            placeholder="Selecione a origem"
                          >
                            <SelectItem value="interno" className="text-[12px]">
                              Animal do rebanho
                            </SelectItem>
                            <SelectItem value="externo" className="text-[12px]">
                              Sêmen / reprodutor externo
                            </SelectItem>
                          </FormSelect>
                        </div>
                      ) : null}

                      {reprodutorModoInterno ? (
                        <AnimalAutocomplete
                          label={
                            isDadosCobertura ? "Reprodutor / Touro" : "Macho do rebanho"
                          }
                          required
                          selected={machoSel}
                          onSelect={handleMachoSelect}
                          animals={animaisFazendaAtivos as AnimalBuscaRow[]}
                          loading={carregandoAnimaisFazenda}
                          disabled={!fazendaNum}
                          inputClassName={fieldCls}
                          placeholder="Busque pelo brinco ou nome do touro"
                          emptyMessage="Nenhum reprodutor elegível encontrado."
                          errorMessage={erroMacho || undefined}
                          hintMessage={
                            erroMacho
                              ? undefined
                              : "Clique para ver touros ou digite para filtrar. Somente machos ativos e elegíveis desta fazenda."
                          }
                          filterCandidate={filterMachoReprodutor}
                          getOptionSubtitle={subtituloMachoReprodutor}
                        />
                      ) : null}

                      {reprodutorModoExterno ? (
                        <SemenReprodutorExternoField
                          value={reprodutorSemen}
                          onChange={texto => {
                            setReprodutorSemen(texto);
                            setSemenPartidaId(null);
                            setPartidaSemen("");
                            setCentralOrigemSemen("");
                            setCustoDoseSemen("");
                          }}
                          onSelect={aplicarReprodutorExternoCatalogo}
                          onCadastrarNovo={() => setCadastrarSemenAberto(true)}
                          options={reprodutoresExternosCatalogo}
                          disabled={!fazendaNum}
                          loading={carregandoReprodutoresExternos}
                          inputClassName={fieldCls}
                          labelClassName={labelCls}
                        />
                      ) : null}

                      {isDadosInseminacao && reprodutorOrigem ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {partidasSemenQueryEnabled && partidasSemenDisponiveis.length > 0 ? (
                            <div className="sm:col-span-2">
                              <FormLabel>
                                Partida cadastrada
                                <span className="text-gray-400 font-normal"> (opcional)</span>
                              </FormLabel>
                              {carregandoPartidasSemen ? (
                                <p className="text-[11px] text-gray-500 mt-1">
                                  Consultando cadastros conhecidos…
                                </p>
                              ) : (
                                <FormSelect
                                  variant="light"
                                  value={semenPartidaId != null ? String(semenPartidaId) : ""}
                                  onChange={v => {
                                    const id = v ? Number(v) : null;
                                    setSemenPartidaId(id);
                                    const sel = partidasSemenDisponiveis.find(p => p.id === id);
                                    setPartidaSemen(sel?.partida ?? "");
                                    setCentralOrigemSemen(sel?.centralOrigem ?? "");
                                    setCustoDoseSemen(
                                      sel && parseSemenCustoTotal(sel.custoUnitario) != null
                                        ? formatSemenCustoTotalDisplay(sel.custoUnitario)
                                        : "",
                                    );
                                  }}
                                  placeholder="Informar sêmen manualmente"
                                >
                                  {partidasSemenDisponiveis.map(p => (
                                    <SelectItem key={p.id} value={String(p.id)} className="text-[12px]">
                                      {formatSemenPartidaInseminacaoOptionLabel({
                                        partida: p.partida,
                                        saldoDoses: p.saldoDoses,
                                        custoUnitario: p.custoUnitario,
                                        centralOrigem: p.centralOrigem,
                                      })}
                                    </SelectItem>
                                  ))}
                                </FormSelect>
                              )}
                            </div>
                          ) : null}
                          <div>
                            <label className={labelCls}>
                              Partida / lote
                              <span className="text-gray-400 font-normal"> (opcional)</span>
                            </label>
                            <input
                              type="text"
                              value={partidaSemen}
                              onChange={e => {
                                setPartidaSemen(e.target.value);
                                setSemenPartidaId(null);
                              }}
                              placeholder="Ex.: P-10FAZ"
                              className={fieldCls}
                              maxLength={120}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>
                              Central
                              <span className="text-gray-400 font-normal"> (opcional)</span>
                            </label>
                            <input
                              type="text"
                              value={centralOrigemSemen}
                              onChange={e => {
                                setCentralOrigemSemen(e.target.value);
                                setSemenPartidaId(null);
                              }}
                              placeholder="Ex.: Alta"
                              className={fieldCls}
                              maxLength={150}
                            />
                          </div>
                          <div>
                            <FormLabel required={reprodutorModoExterno}>
                              Custo da dose (R$)
                              {!reprodutorModoExterno ? (
                                <span className="text-gray-400 font-normal"> (opcional)</span>
                              ) : null}
                            </FormLabel>
                            <FormInput
                              inputMode="decimal"
                              value={custoDoseSemen}
                              onChange={v => {
                                const digits = v.replace(/\D/g, "");
                                setCustoDoseSemen(digits ? formatCurrencyBrl(v) : "");
                                if (erroCustoDose) setErroCustoDose("");
                              }}
                              placeholder="R$ 0,00"
                              variant="light"
                              invalid={Boolean(erroCustoDose)}
                            />
                            {erroCustoDose ? (
                              <p className="text-[11px] text-red-600 mt-1">{erroCustoDose}</p>
                            ) : null}
                          </div>
                          <div>
                            <label className={labelCls}>Inseminador</label>
                            <input
                              type="text"
                              value={inseminador}
                              onChange={e => setInseminador(e.target.value)}
                              placeholder="Ex.: João Silva"
                              className={fieldCls}
                              maxLength={200}
                            />
                          </div>
                          <div>
                            <label className={labelCls}>ECC da matriz</label>
                            <input
                              type="text"
                              inputMode="text"
                              value={eccMatriz}
                              onChange={e => {
                                setEccMatriz(sanitizeReproEccInputString(e.target.value));
                                if (erroEcc) setErroEcc("");
                              }}
                              placeholder="1 a 5 (ex.: 3 ou 3,5)"
                              className={fieldCls}
                              maxLength={4}
                              autoComplete="off"
                              spellCheck={false}
                              name="repro-ecc-matriz"
                            />
                            {erroEcc ? (
                              <p className="text-[11px] text-red-600 mt-1">{erroEcc}</p>
                            ) : (
                              <p className="text-[10px] text-gray-400 mt-1">
                                Escore de condição corporal — escala 1 a 5.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showResultado ? (
                          <div>
                            <FormLabel required={exigeResultado}>
                              Resultado
                              {!exigeResultado ? (
                                <span className="text-gray-400 font-normal"> (opcional)</span>
                              ) : null}
                            </FormLabel>
                            <FormSelect
                              variant="light"
                              side="top"
                              value={resultado}
                              onChange={v => {
                                setResultado(v);
                                if (v !== "Outro") setDescricaoResultadoOutro("");
                                if (erroResultado) setErroResultado("");
                                if (erroDescricaoResultadoOutro) setErroDescricaoResultadoOutro("");
                              }}
                              placeholder={
                                exigeResultado ? "Selecione o resultado" : "Selecione (opcional)"
                              }
                              required={exigeResultado}
                            >
                              {reproResultadoOptions.map(r => (
                                <SelectItem key={r} value={r} className="text-[12px]">
                                  {r}
                                </SelectItem>
                              ))}
                            </FormSelect>
                        {erroResultado ? (
                          <p className="text-[11px] text-red-600 mt-1">{erroResultado}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {showPrevisaoParto ? (
                      <div>
                        <label className={labelCls}>Previsão estimada de parto</label>
                        <div
                          className={`${fieldCls} bg-gray-50 text-gray-800 tabular-nums flex items-center`}
                        >
                          {previsaoPartoEstimadaFmt || "—"}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          Estimativa automática: data do evento + 283 dias.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  {showCoberturaAlvo ? (
                    <div className="sm:col-span-2 space-y-4 border-t border-gray-100 pt-4">
                      <p className={sectionTitleCls}>
                        {estacaoMontaManejo ? "Estação de monta — lote" : "Matrizes atendidas"}
                      </p>
                      {coberturaModoIndividualPermitido ? (
                        <div>
                          <FormLabel required>Forma de seleção</FormLabel>
                          <FormSelect
                            variant="light"
                            value={coberturaSelecaoModo}
                            onChange={v =>
                              onChangeCoberturaSelecaoModo(v as "" | "individual" | "lote")
                            }
                            placeholder="Selecione a forma de seleção"
                            required
                          >
                            <SelectItem value="individual" className="text-[12px]">
                              Matriz individual
                            </SelectItem>
                            <SelectItem value="lote" className="text-[12px]">
                              Por lote
                            </SelectItem>
                          </FormSelect>
                        </div>
                      ) : null}

                      {coberturaModoIndividualPermitido && coberturaSelecaoModo === "individual" ? (
                        <div className="relative" ref={matrizBuscaRef}>
                          <label className={labelCls}>
                            Matriz<span className="text-red-500">*</span>
                          </label>
                          {matrizSel ? (
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                              <span className="text-[12px] font-medium text-gray-800">
                                {labelAnimalBusca(matrizSel)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setMatrizSel(null);
                                  setMatrizBusca("");
                                  setMatrizListaAberta(false);
                                }}
                                className="text-[11px] font-semibold text-gray-600 underline shrink-0"
                              >
                                Alterar
                              </button>
                            </div>
                          ) : (
                            <>
                              <input
                                type="search"
                                value={matrizBusca}
                                onChange={e => {
                                  setMatrizBusca(e.target.value);
                                  setMatrizListaAberta(true);
                                }}
                                onFocus={() => setMatrizListaAberta(true)}
                                placeholder="Buscar fêmea elegível por brinco, RFID ou nome…"
                                className={fieldCls}
                                autoComplete="off"
                              />
                              {matrizListaAberta && matrizBusca.trim() ? (
                                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                                  {buscandoMatrizes ? (
                                    <li className="px-3 py-2.5 text-[11px] text-gray-400">
                                      Buscando…
                                    </li>
                                  ) : matrizesBusca.length === 0 ? (
                                    <li className="px-3 py-2.5 text-[11px] text-gray-400">
                                      Nenhuma matriz elegível encontrada.
                                    </li>
                                  ) : (
                                    matrizesBusca.map(a => (
                                      <li key={a.id}>
                                        <button
                                          type="button"
                                          onClick={() => selecionarMatriz(a)}
                                          className="w-full text-left px-3 py-2.5 hover:bg-[#4ECDC4]/[0.08] transition"
                                        >
                                          <div className="text-[13px] font-semibold text-gray-900">
                                            {labelAnimalBusca(a)}
                                          </div>
                                          <div className="text-[11px] text-gray-500">
                                            {subtituloAnimalBusca(a)}
                                          </div>
                                        </button>
                                      </li>
                                    ))
                                  )}
                                </ul>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}

                      {estacaoMontaManejo || coberturaSelecaoModo === "lote" ? (
                        <div className="space-y-4">
                          <div>
                            <FormLabel required>Lote</FormLabel>
                            <FormSelect
                              variant="light"
                              value={loteCoberturaId}
                              onChange={onChangeLoteCobertura}
                              placeholder="Selecione um lote"
                              required
                            >
                              {lotesCoberturaElegiveis.map(l => (
                                <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">
                                  {`${l.nome} · ${matrizesElegiveisPorLote.get(l.id) ?? 0} matriz(es) elegível(eis)`}
                                </SelectItem>
                              ))}
                            </FormSelect>
                            {lotesCoberturaElegiveis.length === 0 ? (
                              <p className="text-[11px] text-amber-600 mt-1">
                                Nenhum lote com matrizes elegíveis nesta fazenda.
                              </p>
                            ) : null}
                          </div>

                          {loteCoberturaId ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <label className={labelCls}>
                                  Matrizes elegíveis<span className="text-red-500">*</span>
                                </label>
                                {matrizesDoLoteElegiveis.length > 0 ? (
                                  <span className="text-[11px] text-gray-500">
                                    {matrizesDoLoteElegiveis.length} matriz(es) elegível(eis) neste
                                    lote
                                  </span>
                                ) : null}
                              </div>

                              {matrizesDoLoteElegiveis.length === 0 ? (
                                <p className="text-[11px] text-amber-600">
                                  Nenhuma matriz elegível neste lote.
                                </p>
                              ) : (
                                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                                  <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 cursor-pointer hover:bg-gray-100/80">
                                    <input
                                      type="checkbox"
                                      checked={
                                        matrizesLoteSelecionadas.length > 0 &&
                                        matrizesLoteSelecionadas.length ===
                                          matrizesDoLoteElegiveis.length
                                      }
                                      onChange={toggleSelecionarTodasMatrizesLote}
                                      className={formCheckboxCls}
                                    />
                                    <span className="text-[12px] font-semibold text-gray-700">
                                      Selecionar todas as matrizes elegíveis
                                    </span>
                                  </label>
                                  {matrizesDoLoteElegiveis.map(a => (
                                    <label
                                      key={a.id}
                                      className={cn(
                                        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                                        matrizesLoteSelecionadas.includes(a.id)
                                          ? "bg-[#4ECDC4]/10"
                                          : "hover:bg-[#4ECDC4]/[0.05]",
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={matrizesLoteSelecionadas.includes(a.id)}
                                        onChange={() => toggleMatrizLote(a.id)}
                                        className={cn(formCheckboxCls, "mt-0.5")}
                                      />
                                      <span className="min-w-0">
                                        <span className="block text-[13px] font-semibold text-gray-900">
                                          {labelAnimalBusca(a)}
                                        </span>
                                        {subtituloAnimalBusca(a) ? (
                                          <span className="block text-[11px] text-gray-500">
                                            {subtituloAnimalBusca(a)}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {estacaoMontaManejo ? (
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                          Registra exposição à monta na ficha de cada matriz selecionada, vinculada
                          a este touro.
                        </p>
                      ) : null}

                      {erroCoberturaAlvo ? (
                        <p className="text-[11px] text-red-600">{erroCoberturaAlvo}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {showReprodutor ? (
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{reproRelacionadoLabel}</label>
                      <input
                        type="text"
                        value={reprodutorSemen}
                        onChange={e => setReprodutorSemen(e.target.value)}
                        placeholder={reproRelacionadoPlaceholder}
                        className={fieldCls}
                        maxLength={500}
                      />
                    </div>
                  ) : null}

                  {showResultado ? (
                    <div>
                      <FormLabel required={exigeResultado}>
                        Resultado
                        {!exigeResultado ? (
                          <span className="text-gray-400 font-normal"> (opcional)</span>
                        ) : null}
                      </FormLabel>
                      <FormSelect
                        variant="light"
                        side="top"
                        value={resultado}
                        onChange={onChangeResultado}
                        placeholder={
                          exigeResultado ? "Selecione o resultado" : "Selecione (opcional)"
                        }
                        required={exigeResultado}
                      >
                        {reproResultadoOptions.map(r => (
                          <SelectItem key={r} value={r} className="text-[12px]">
                            {r}
                          </SelectItem>
                        ))}
                      </FormSelect>
                      {erroResultado ? (
                        <p className="text-[11px] text-red-600 mt-1">{erroResultado}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {showPrevisaoParto ? (
                    <div>
                      <label className={labelCls}>Previsão estimada de parto</label>
                      <div
                        className={`${fieldCls} bg-gray-50 text-gray-800 tabular-nums flex items-center`}
                      >
                        {previsaoPartoEstimadaFmt || "—"}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">
                        Estimativa automática: data do evento + 283 dias.
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {showDescricaoResultadoOutro ? (
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    Descreva o resultado<span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={descricaoResultadoOutro}
                    onChange={e => {
                      setDescricaoResultadoOutro(e.target.value);
                      if (erroDescricaoResultadoOutro) setErroDescricaoResultadoOutro("");
                    }}
                    className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none"
                    placeholder="Descreva o resultado do exame ou da coleta..."
                    maxLength={2000}
                  />
                  {erroDescricaoResultadoOutro ? (
                    <p className="text-[11px] text-red-600 mt-1">{erroDescricaoResultadoOutro}</p>
                  ) : null}
                </div>
              ) : null}

              {showDescricaoOutro ? (
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    Descreva o manejo<span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={descricaoOutro}
                    onChange={e => {
                      setDescricaoOutro(e.target.value);
                      if (erroDescricaoOutro) setErroDescricaoOutro("");
                    }}
                    className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none"
                    placeholder="Descreva o manejo reprodutivo realizado..."
                    maxLength={2000}
                  />
                  {erroDescricaoOutro ? (
                    <p className="text-[11px] text-red-600 mt-1">{erroDescricaoOutro}</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {showPartoCriasSection ? (
              <div className="border-t border-gray-100 pt-5 space-y-4">
                <p className={sectionTitleCls}>Dados da(s) cria(s)</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={registrarCrias}
                    onChange={e => {
                      const checked = e.target.checked;
                      setRegistrarCrias(checked);
                      if (checked && crias.length === 0) {
                        setCrias([emptyCriaPartoRow()]);
                      }
                      setErroCrias({});
                    }}
                    className={formCheckboxCls}
                  />
                  <span className="text-[12px] font-semibold text-gray-700">
                    Registrar cria(s) no Rebanho
                  </span>
                </label>

                {registrarCrias ? (
                  <div className="space-y-4">
                    {crias.map((cria, index) => {
                      const categoriasCria = cria.sexo
                        ? getCategoriasPorSexo(sexoCriaFormParaCadastro(cria.sexo))
                        : [];
                      const rowErr = erroCrias[index] ?? {};
                      return (
                        <div
                          key={index}
                          className="rounded-lg border border-gray-100 bg-gray-50/40 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[12px] font-semibold text-gray-800 uppercase tracking-wide">
                              Cria {index + 1}
                            </p>
                            {crias.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeCriaParto(index)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remover cria
                              </button>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>
                                Brinco visual<span className="text-red-500">*</span>
                              </label>
                              <input
                                type="text"
                                value={cria.brinco}
                                onChange={e =>
                                  onChangeCriaField(index, "brinco", e.target.value)
                                }
                                className={fieldCls}
                                placeholder="Ex.: 301"
                                maxLength={50}
                              />
                              {rowErr.brinco ? (
                                <p className="text-[11px] text-red-600 mt-1">{rowErr.brinco}</p>
                              ) : null}
                            </div>

                            <div>
                              <label className={labelCls}>
                                Sexo<span className="text-red-500">*</span>
                              </label>
                              <select
                                value={cria.sexo}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v === "macho" || v === "femea") {
                                    onChangeCriaSexo(index, v);
                                  } else {
                                    onChangeCriaField(index, "sexo", "");
                                    onChangeCriaField(index, "categoria", "");
                                  }
                                }}
                                className={fieldCls}
                              >
                                <option value="">Selecione</option>
                                <option value="macho">Macho</option>
                                <option value="femea">Fêmea</option>
                              </select>
                              {rowErr.sexo ? (
                                <p className="text-[11px] text-red-600 mt-1">{rowErr.sexo}</p>
                              ) : null}
                            </div>

                            <div>
                              <label className={labelCls}>
                                Categoria<span className="text-red-500">*</span>
                              </label>
                              <select
                                value={cria.categoria}
                                onChange={e =>
                                  onChangeCriaField(index, "categoria", e.target.value)
                                }
                                className={fieldCls}
                                disabled={!cria.sexo}
                              >
                                <option value="">
                                  {cria.sexo ? "Selecione" : "Selecione o sexo primeiro"}
                                </option>
                                {categoriasCria.map(cat => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                              {rowErr.categoria ? (
                                <p className="text-[11px] text-red-600 mt-1">
                                  {rowErr.categoria}
                                </p>
                              ) : null}
                            </div>

                            <div>
                              <label className={labelCls}>Peso ao nascimento (kg)</label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cria.pesoNascimento}
                                onChange={e =>
                                  onChangeCriaField(index, "pesoNascimento", e.target.value)
                                }
                                className={fieldCls}
                                placeholder="Opcional — ex.: 32,5"
                              />
                              {rowErr.pesoNascimento ? (
                                <p className="text-[11px] text-red-600 mt-1">
                                  {rowErr.pesoNascimento}
                                </p>
                              ) : null}
                            </div>

                            <div>
                              <label className={labelCls}>RFID</label>
                              <input
                                type="text"
                                value={cria.brincoEletronico}
                                onChange={e =>
                                  onChangeCriaField(index, "brincoEletronico", e.target.value)
                                }
                                className={fieldCls}
                                placeholder="Opcional"
                                maxLength={50}
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Raça</label>
                              <select
                                value={cria.raca}
                                onChange={e => onChangeCriaField(index, "raca", e.target.value)}
                                className={fieldCls}
                              >
                                <option value="">Opcional</option>
                                {RACAS.map(r => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={addCriaParto}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar outra cria
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                variant="light"
                rows={3}
                value={observacoes}
                onChange={setObservacoes}
                placeholder="Opcional — contexto adicional que não cabe nos campos estruturados…"
              />
            </div>
            </div>
          </ManejoSectionCard>
        ) : null}
      </ManejoPontualFormShell>

      <CadastrarSemenExternoDialog
        open={cadastrarSemenAberto}
        onOpenChange={setCadastrarSemenAberto}
        fazendaId={fazendaNum}
        onCreated={item => {
          aplicarReprodutorExternoCatalogo(item);
          toast.success("Reprodutor selecionado.");
        }}
      />

      <Dialog open={Boolean(bloqueioNegocioMsg)}>
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
              {bloqueioNegocioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={fecharBloqueioNegocio}
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
}

/** Manejo pontual — Brinco Eletrônico (fluxo funcional). */
function ManejoBrincoEletronicoForm() {
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [operacao, setOperacao] = useState<OperacaoBrinco | "">("");
  const [novoRfid, setNovoRfid] = useState("");
  const [novoBrinco, setNovoBrinco] = useState("");
  const [motivo, setMotivo] = useState<MotivoTrocaBrinco | "">("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [erroFazenda, setErroFazenda] = useState("");
  /** Modal central para bloqueios de regra de negócio (não limpa o formulário). */
  const [bloqueioNegocioMsg, setBloqueioNegocioMsg] = useState<string | null>(null);
  const [at05Feedback, setAt05Feedback] = useState<string | null>(null);
  const [at05LookupBusy, setAt05LookupBusy] = useState(false);
  const [at05ReadSeq, setAt05ReadSeq] = useState(0);
  /** Roteamento explícito: identificar animal × capturar Novo RFID. */
  const [at05ReadRoute, setAt05ReadRoute] = useState<At05ReadRoute>("identify-animal");
  const [novoRfidError, setNovoRfidError] = useState<string | null>(null);
  const at05ReadRouteRef = useRef<At05ReadRoute>("identify-animal");
  const fazendaNumRef = useRef(0);
  const nomeFazendaRef = useRef<string | undefined>(undefined);
  const animalIdRef = useRef<number | null>(null);
  const animalRfidRef = useRef<string>("");
  const operacaoRef = useRef<OperacaoBrinco | "">("");
  const animalLookupSeqRef = useRef(0);
  const captureSeqRef = useRef(0);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const { data: animaisFazendaAtivos = [], isFetching: carregandoAnimaisFazenda } =
    trpc.animais.list.useQuery(
      { fazendaId: fazendaNum || undefined, status: "ativo", dataManejo: data },
      { enabled: Boolean(fazendaNum) },
    );

  const saveMutation = trpc.manejo.registrarPontualBrinco.useMutation({
    onSuccess: () => {
      toast.success("Identificação do animal atualizada com sucesso.");
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar.";
      if (isBloqueioNegocioIdentificacao(msg) || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(msg);
        return;
      }
      toast.error(msg);
    },
  });

  const fecharBloqueioNegocio = useCallback(() => {
    setBloqueioNegocioMsg(null);
  }, []);

  const avisarBloqueioNegocio = useCallback((msg: string) => {
    setBloqueioNegocioMsg(msg);
  }, []);

  const limparOperacao = useCallback(() => {
    setOperacao("");
    setNovoRfid("");
    setNovoBrinco("");
    setMotivo("");
    setMotivoOutro("");
    setNovoRfidError(null);
    at05ReadRouteRef.current = "identify-animal";
    setAt05ReadRoute("identify-animal");
  }, []);

  const limparAnimal = useCallback(() => {
    animalIdRef.current = null;
    animalRfidRef.current = "";
    setAnimalId(null);
    setAnimalSel(null);
    limparOperacao();
  }, [limparOperacao]);

  const handleAnimalSelect = useCallback(
    (a: AnimalBuscaRow | null) => {
      if (!a) {
        limparAnimal();
        return;
      }
      const id = resolveAnimalIdFromSelecao(a) ?? a.id;
      animalIdRef.current = id;
      animalRfidRef.current = a.brincoEletronico?.trim() || "";
      setAnimalId(id);
      setAnimalSel(a);
      limparOperacao();
    },
    [limparAnimal, limparOperacao],
  );

  const selecionarAnimal = handleAnimalSelect;

  const limparDependentesFazenda = () => {
    limparAnimal();
  };

  const setReadRoute = useCallback((route: At05ReadRoute) => {
    at05ReadRouteRef.current = route;
    setAt05ReadRoute(route);
  }, []);

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REBANHO_FAZENDA_STORAGE_KEY) return;
      const ids = fazendas.map(f => f.id);
      const next = readPersistedRebanhoFazendaId(ids);
      if (!next || next === fazendaId) return;
      setFazendaId(next);
      setAnimalId(null);
      setAnimalSel(null);
      setOperacao("");
      setNovoRfid("");
      setNovoBrinco("");
      setMotivo("");
      setMotivoOutro("");
      setErroFazenda("");
      toast.message("Fazenda do contexto atualizada. Dados dependentes foram limpos.");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [fazendas, fazendaId]);

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  fazendaNumRef.current = fazendaNum;
  nomeFazendaRef.current = nomeFazenda;
  animalIdRef.current = animalId;
  animalRfidRef.current = animalSel?.brincoEletronico?.trim() || "";
  operacaoRef.current = operacao;

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    setErroFazenda("");
    limparDependentesFazenda();
    if (value) persistRebanhoFazendaId(value);
    else persistRebanhoFazendaId("");
  };

  const rfidAtual = animalSel?.brincoEletronico?.trim() || "";
  const temRfidAtual = Boolean(rfidAtual);
  const mostraNovoRfid = operacao === "rfid" || operacao === "ambos";
  const mostraNovoBrinco = operacao === "brinco" || operacao === "ambos";
  // Motivo obrigatório em todas as operações de Identificação (inclui Vincular RFID).
  const exigeMotivo =
    operacao === "brinco" || operacao === "ambos" || operacao === "rfid";

  /** Captura Novo RFID (Trocar RFID / Trocar brinco e RFID). Não troca selectedAnimal. */
  const handleNewRfidCapture = useCallback(
    (rfid: string) => {
      const seq = ++captureSeqRef.current;
      // Sai do modo captura imediatamente — leituras seguintes não sobrescrevem.
      setReadRoute("identify-animal");
      setAt05Feedback(`RFID recebido para Novo RFID: ${rfid}`);

      const currentAnimalId = animalIdRef.current;
      const currentRfid = animalRfidRef.current;

      if (!currentAnimalId) {
        setNovoRfid("");
        setNovoRfidError("Selecione um animal antes de capturar o novo RFID.");
        toast.error("Selecione um animal antes de capturar o novo RFID.");
        return;
      }

      if (currentRfid && rfid === currentRfid) {
        setNovoRfid("");
        setNovoRfidError("O novo RFID é igual ao RFID atual do animal.");
        toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
        return;
      }

      setAt05LookupBusy(true);
      void (async () => {
        try {
          const linked = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
            brincoEletronico: rfid,
          });
          if (seq !== captureSeqRef.current) return;

          if (linked && Number(linked.id) !== currentAnimalId) {
            const status = (linked.status ?? "").toString().trim().toLowerCase();
            const msg =
              status === "ativo"
                ? "Este RFID já está vinculado a outro animal ativo nesta fazenda."
                : "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.";
            // Mantém o RFID no campo para o usuário corrigir; bloqueio só no modal (sem erro inline).
            setNovoRfid(rfid);
            setNovoRfidError(null);
            avisarBloqueioNegocio(msg);
            setAt05Feedback(
              `RFID ${rfid} já vinculado a outro animal — seleção atual preservada.`,
            );
            return;
          }

          if (linked && Number(linked.id) === currentAnimalId) {
            setNovoRfid("");
            setNovoRfidError("O novo RFID é igual ao RFID atual do animal.");
            toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
            return;
          }

          // Não vinculado → aceitar no campo (não seleciona outro animal).
          setNovoRfid(rfid);
          setNovoRfidError(null);
          setAt05Feedback(`Novo RFID capturado: ${rfid}`);
        } catch (error) {
          if (seq !== captureSeqRef.current) return;
          const err = error as Error;
          setNovoRfid("");
          setNovoRfidError(err?.message || "Falha ao validar o novo RFID.");
          toast.error(err?.message || "Falha ao validar o novo RFID.");
        } finally {
          if (seq === captureSeqRef.current) setAt05LookupBusy(false);
        }
      })();
    },
    [setReadRoute, trpcUtils, avisarBloqueioNegocio],
  );

  /** Identificação normal do animal (modo identify-animal). */
  const handleAnimalIdentification = useCallback(
    (rfid: string) => {
      const seq = ++animalLookupSeqRef.current;
      console.info("[AT05 PROD] IDENTIFY ANIMAL", rfid);

      limparAnimal();
      setAt05Feedback(`RFID recebido: ${rfid}`);
      setAt05LookupBusy(true);

      void (async () => {
        try {
          const animal = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
            brincoEletronico: rfid,
          });
          if (seq !== animalLookupSeqRef.current) return;

          if (!animal) {
            const msg = "Brinco eletrônico não vinculado a nenhum animal.";
            limparAnimal();
            setAt05Feedback(`RFID recebido: ${rfid}. ${msg}`);
            toast.error(msg);
            return;
          }

          const farmSel = fazendaNumRef.current;
          const farmNomeSel = nomeFazendaRef.current;
          if (!farmSel) {
            limparAnimal();
            setAt05Feedback(`RFID recebido: ${rfid}. Selecione uma Fazenda antes de identificar.`);
            toast.error("Selecione uma Fazenda antes de identificar o animal.");
            return;
          }

          if (animal.fazendaId != null && Number(animal.fazendaId) !== farmSel) {
            const nomeOutra =
              animal.fazendaNome == null || String(animal.fazendaNome).trim() === ""
                ? `Fazenda #${animal.fazendaId}`
                : String(animal.fazendaNome).trim();
            const nomeAtual = farmNomeSel?.trim() || `Fazenda #${farmSel}`;
            const aviso = `Este animal pertence à ${nomeOutra}. A fazenda selecionada é ${nomeAtual}.`;
            limparAnimal();
            setAt05Feedback(`RFID recebido: ${rfid}. ${aviso}`);
            toast.error(aviso);
            return;
          }

          const row: AnimalBuscaRow = {
            id: Number(animal.id),
            brinco: animal.brinco == null ? null : String(animal.brinco),
            brincoEletronico:
              animal.brincoEletronico == null ? null : String(animal.brincoEletronico),
            loteId: animal.loteId == null ? null : Number(animal.loteId),
            loteNome: animal.loteNome == null ? null : String(animal.loteNome),
            fazendaId: animal.fazendaId == null ? null : Number(animal.fazendaId),
            status: animal.status == null ? null : String(animal.status),
            sexo: animal.sexo == null ? null : String(animal.sexo),
          };
          const labelBrinco = row.brinco?.trim() || `#${row.id}`;
          if (seq !== animalLookupSeqRef.current) return;

          selecionarAnimal(row);
          setAt05Feedback(`RFID recebido: ${rfid}. Animal encontrado: ${labelBrinco}`);
        } catch (error) {
          if (seq !== animalLookupSeqRef.current) return;
          const err = error as Error;
          limparAnimal();
          setAt05Feedback(
            `RFID recebido: ${rfid}. Falha na consulta: ${err?.message ?? String(error)}`,
          );
          toast.error(err?.message || "Não foi possível consultar o animal pelo RFID.");
        } finally {
          if (seq === animalLookupSeqRef.current) setAt05LookupBusy(false);
        }
      })();
    },
    [limparAnimal, selecionarAnimal, trpcUtils],
  );

  /**
   * Roteamento central da IDENTIFICAÇÃO RFID (cartões já filtrados no hook).
   * capture-new-rfid → Novo RFID (não limpa animal).
   * identify-animal → lookup / seleção de animal.
   */
  const handleRfidRead = useCallback(
    (rfid: string) => {
      setAt05ReadSeq(n => n + 1);

      if (at05ReadRouteRef.current === "capture-new-rfid") {
        console.info("[AT05 PROD] ROUTE capture-new-rfid", rfid);
        handleNewRfidCapture(rfid);
        return;
      }

      // Durante Trocar/Vincular RFID com animal já escolhido, não identificar outro
      // animal nem limpar o formulário — só captura sob “Ler com bastão”.
      const op = operacaoRef.current;
      if (animalIdRef.current && (op === "rfid" || op === "ambos")) {
        setAt05Feedback(
          "Clique em “Ler com bastão” para capturar o Novo RFID (animal atual preservado).",
        );
        return;
      }

      console.info("[AT05 PROD] ROUTE identify-animal", rfid);
      handleAnimalIdentification(rfid);
    },
    [handleAnimalIdentification, handleNewRfidCapture],
  );

  const {
    supported: at05Supported,
    status: at05Status,
    error: at05Error,
    busy: at05Busy,
    sessionActive: at05SessionActive,
    connect: connectAt05,
    disconnect: disconnectAt05,
  } = useAt05Reader({ onRead: handleRfidRead });

  // Conexão serial ≠ último RFID. Nunca mapear "RFID processado" como desconectado.
  const at05UiStatus: At05ReaderUiStatus = !at05Supported
    ? "error"
    : at05Status === "connecting"
      ? "connecting"
      : at05Status === "listening"
        ? "listening"
        : at05Status === "connected"
          ? "connected"
          : at05Status === "error"
            ? "error"
            : at05Status === "disconnected"
              ? "disconnected"
              : "idle";

  const at05ConnectionText = !at05Supported
    ? "Web Serial indisponível — use Microsoft Edge no desktop"
    : at05UiStatus === "connecting"
      ? "Conectando…"
      : at05UiStatus === "listening" || at05UiStatus === "connected"
        ? "Conectado"
        : at05UiStatus === "error"
          ? at05Error
            ? `Erro: ${at05Error}`
            : "Erro na conexão"
          : "Não conectado";

  const at05LastEventText =
    at05ReadRoute === "capture-new-rfid"
      ? "Aguardando Novo RFID…"
      : at05LookupBusy
        ? "Consultando…"
        : at05Feedback
          ? "RFID processado"
          : at05SessionActive
            ? "Aguardando leitura"
            : null;

  /** Conectar / manter sessão para identificação de animal. */
  const connectAt05Identify = () => {
    setReadRoute("identify-animal");
    if (!at05SessionActive) void connectAt05();
  };

  /**
   * Arma captura de Novo RFID. Não cria segundo reader —
   * só define o destino da próxima IDENTIFICAÇÃO RFID.
   * Pode ser clicado mesmo com sessão já ativa (não usa at05Busy).
   */
  const armCaptureNewRfid = () => {
    if (!at05Supported) return;
    setNovoRfid("");
    setNovoRfidError(null);
    setReadRoute("capture-new-rfid");
    setAt05Feedback("Aguardando leitura do novo RFID…");
    if (!at05SessionActive) {
      void connectAt05();
    }
  };

  const [cancelandoAt05, setCancelandoAt05] = useState(false);

  const handleCancelar = async () => {
    if (cancelandoAt05) return;
    setCancelandoAt05(true);
    try {
      // Libera COM/reader ANTES de navegar — evita porta presa no Edge.
      await disconnectAt05();
    } catch (err) {
      console.error("[AT05 PROD] disconnect on Cancelar", err);
      toast.error(
        "Não foi possível liberar o AT05. Tente fechar a aba se a porta continuar ocupada.",
      );
    } finally {
      setCancelandoAt05(false);
      setLocation("/manejo/registros");
    }
  };

  const handleSalvar = () => {
    if (!fazendaId) {
      setErroFazenda("Selecione uma Fazenda");
      toast.error("Selecione uma Fazenda");
      return;
    }
    const animalIdSelecionado = resolveAnimalIdFromSelecao(animalSel);
    if (!animalIdSelecionado || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da identificação.");
      return;
    }
    // Data civil YYYY-MM-DD vs hoje local — mesma estratégia da Pesagem (sem horário/timezone).
    if (data > todayISODate()) {
      avisarBloqueioNegocio(MSG_IDENTIFICACAO_DATA_FUTURA);
      return;
    }
    if (!operacao) {
      toast.error("Selecione a operação.");
      return;
    }
    if (mostraNovoRfid && novoRfidError) {
      if (isBloqueioNegocioIdentificacao(novoRfidError)) {
        // Bloqueio de negócio: só modal, sem manter erro inline.
        setNovoRfidError(null);
        avisarBloqueioNegocio(novoRfidError);
      } else {
        toast.error(novoRfidError);
      }
      return;
    }
    if (mostraNovoRfid && !novoRfid.trim()) {
      toast.error("Informe o novo RFID.");
      return;
    }
    if (mostraNovoRfid && rfidAtual && novoRfid.trim() === rfidAtual) {
      toast.error("O novo RFID é igual ao RFID atual. Não é necessário trocar.");
      return;
    }
    if (mostraNovoBrinco && !novoBrinco.trim()) {
      toast.error("Informe o novo brinco.");
      return;
    }
    if (exigeMotivo && !motivo) {
      toast.error("Informe o motivo da troca de identificação.");
      return;
    }
    if (exigeMotivo && motivo === "outro" && !motivoOutro.trim()) {
      toast.error("Informe o motivo da alteração.");
      return;
    }

    saveMutation.mutate({
      fazendaId: Number(fazendaId),
      data,
      animalId: animalIdSelecionado,
      operacao,
      novoRfid: mostraNovoRfid ? novoRfid.trim() : undefined,
      novoBrinco: mostraNovoBrinco ? novoBrinco.trim() : undefined,
      motivo: exigeMotivo && motivo ? motivo : undefined,
      motivoDetalhe:
        exigeMotivo && motivo === "outro" ? motivoOutro.trim() : undefined,
    });
  };

  return (
    <AppLayout>
      <ManejoPontualFormShell
        title="Identificação"
        onCancel={() => void handleCancelar()}
        cancelDisabled={cancelandoAt05}
        cancelLabel={cancelandoAt05 ? "Desconectando AT05…" : "Cancelar"}
        onSave={handleSalvar}
        saveDisabled={!animalId || !animalSel || Boolean(novoRfidError)}
        savePending={saveMutation.isPending}
      >
        <ManejoSectionCard title="Contexto">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <FormLabel>Fazenda</FormLabel>
                <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
              </div>
            ) : (
              <div className="min-w-0">
                <FormLabel required>Fazenda</FormLabel>
                <FazendaOverviewSelect
                  value={fazendaId}
                  onChange={onChangeFazenda}
                  fazendas={fazendas}
                  emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                  disabled={loadingFazendas || !fazendaInitDone}
                  required
                />
                {erroFazenda ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroFazenda}</p>
                ) : null}
              </div>
            )}

            <div className="min-w-0">
              <FormLabel required>Data</FormLabel>
              <FormDatePicker
                value={data}
                onChange={setData}
                max={todayISODate()}
              />
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Animal">
          <ManejoAnimalField
            embedded
            selected={animalSel}
            onSelect={handleAnimalSelect}
            animals={animaisFazendaAtivos as AnimalBuscaRow[]}
            loading={carregandoAnimaisFazenda}
            disabled={!fazendaNum}
            onAfterClear={limparOperacao}
          />

          <div className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-3 space-y-2">
            <p className="text-[12px] font-semibold text-gray-800">Leitura RFID / Bastão</p>
            <p className="text-[12px] text-gray-600" aria-live="polite">
              Dispositivo: AT05
            </p>
            <p className="text-[12px] text-gray-600" aria-live="polite">
              Status: {at05ConnectionText}
            </p>
            {at05LastEventText ? (
              <p className="text-[12px] text-gray-600" aria-live="polite">
                Último evento: {at05LastEventText}
                {at05SessionActive && at05Feedback ? " · Pronto para próxima leitura" : ""}
              </p>
            ) : null}
            {at05Feedback ? (
              <p className="text-[11px] text-gray-700" aria-live="polite">
                {at05Feedback}
                {at05ReadSeq > 0 ? (
                  <span className="text-gray-400"> · leitura #{at05ReadSeq}</span>
                ) : null}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {at05SessionActive ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-2 rounded border border-[#4ECDC4]/50 text-gray-800 bg-[#4ECDC4]/10 text-[12px] font-semibold min-h-[36px] opacity-90 cursor-default"
                >
                  <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  Pronto para próxima leitura
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!at05Supported || at05Busy}
                  onClick={connectAt05Identify}
                  className={`inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-2 rounded border text-[12px] font-semibold min-h-[36px] disabled:opacity-60 disabled:cursor-not-allowed ${
                    at05Supported
                      ? "border-[#4ECDC4]/50 text-gray-800 bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/15"
                      : "border-gray-200 text-gray-500 bg-gray-50"
                  }`}
                >
                  <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  Conectar bastão
                </button>
              )}
            </div>
          </div>
        </ManejoSectionCard>

        <ManejoSectionCard title="Operação">
          <FormLabel required>Operação</FormLabel>
          <FormDownSelect
            value={operacao}
            placeholder="Selecione a operação"
            disabled={!animalSel}
            options={[
              { value: "brinco", label: "Trocar brinco visual" },
              {
                value: "rfid",
                label: temRfidAtual ? "Trocar RFID" : "Vincular RFID",
              },
              {
                value: "ambos",
                label: temRfidAtual
                  ? "Trocar brinco visual e RFID"
                  : "Trocar brinco visual e vincular RFID",
              },
            ]}
            onChange={next => {
              setOperacao(next as OperacaoBrinco);
              setNovoRfid("");
              setNovoBrinco("");
              setMotivo("");
              setMotivoOutro("");
              setNovoRfidError(null);
              setReadRoute("identify-animal");
            }}
          />

          {mostraNovoRfid || mostraNovoBrinco || exigeMotivo ? (
            <div className="space-y-4">
              {mostraNovoRfid || mostraNovoBrinco ? (
                <div
                  className={
                    mostraNovoRfid && mostraNovoBrinco
                      ? "grid grid-cols-1 md:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] gap-4 items-start"
                      : "grid grid-cols-1 gap-4"
                  }
                >
                  {mostraNovoBrinco ? (
                    <div className="min-w-0">
                      <label className={labelCls}>
                        Novo brinco visual<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={novoBrinco}
                        onChange={e => setNovoBrinco(e.target.value)}
                        className={fieldCls}
                        placeholder="Informe o brinco visual"
                        autoComplete="off"
                      />
                    </div>
                  ) : null}
                  {mostraNovoRfid ? (
                    <div className="min-w-0">
                      <label className={labelCls}>
                        Novo RFID<span className="text-red-500">*</span>
                      </label>
                      <div className="flex flex-row gap-2 items-stretch">
                        <input
                          type="text"
                          value={novoRfid}
                          onChange={e => {
                            setNovoRfid(e.target.value);
                            setNovoRfidError(null);
                          }}
                          className={`${fieldCls} flex-1 min-w-0`}
                          placeholder="Informe o RFID"
                          autoComplete="off"
                          maxLength={80}
                        />
                        <button
                          type="button"
                          disabled={!at05Supported || at05Status === "connecting"}
                          title={
                            !at05Supported
                              ? "Web Serial indisponível — use Microsoft Edge no desktop"
                              : at05ReadRoute === "capture-new-rfid"
                                ? "Aguardando leitura do novo RFID…"
                                : "Armar captura do novo RFID com o bastão AT05"
                          }
                          aria-label="Ler com bastão"
                          onClick={() => {
                            if (!at05Supported) return;
                            armCaptureNewRfid();
                          }}
                          className={`inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap px-3 py-2 rounded border text-[12px] font-semibold min-h-[40px] sm:min-h-[34px] disabled:opacity-60 disabled:cursor-not-allowed ${
                            at05ReadRoute === "capture-new-rfid"
                              ? "border-amber-300 text-amber-900 bg-amber-50"
                              : at05Supported
                                ? "border-[#4ECDC4]/50 text-gray-800 bg-[#4ECDC4]/10 hover:bg-[#4ECDC4]/15"
                                : "border-gray-200 text-gray-500 bg-gray-50"
                          }`}
                        >
                          <Bluetooth className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                          {at05ReadRoute === "capture-new-rfid"
                            ? "Aguardando…"
                            : "Ler com bastão"}
                        </button>
                      </div>
                      {novoRfidError && !isBloqueioNegocioIdentificacao(novoRfidError) ? (
                        <p className="text-[11px] text-red-600 mt-1.5">{novoRfidError}</p>
                      ) : null}
                      <p className="text-[10px] text-gray-400 mt-1.5 min-h-[1rem]" aria-live="polite">
                        {!at05Supported
                          ? "Web Serial indisponível. Use Microsoft Edge no desktop para ler com o AT05."
                          : at05Status === "connecting"
                            ? "Conectando ao bastão…"
                            : at05ReadRoute === "capture-new-rfid"
                              ? "Modo captura ativo — aproxime o novo brinco eletrônico do bastão."
                              : at05SessionActive
                                ? "Clique em “Ler com bastão” para capturar o Novo RFID (não troca o animal)."
                                : "Clique em “Ler com bastão” para capturar o Novo RFID."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {exigeMotivo ? (
                <div className="space-y-3">
                  <div>
                    <FormLabel required>Motivo</FormLabel>
                    <FormSelect
                      variant="light"
                      side="top"
                      value={motivo}
                      onChange={next => {
                        const value = next as MotivoTrocaBrinco;
                        setMotivo(value);
                        if (value !== "outro") setMotivoOutro("");
                      }}
                      placeholder="Selecione o motivo"
                      required
                    >
                      {(operacao ? motivosPorOperacao(operacao) : []).map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-[12px]">
                          {o.label}
                        </SelectItem>
                      ))}
                    </FormSelect>
                  </div>
                  {motivo === "outro" ? (
                    <div>
                      <label className={labelCls}>
                        Descreva o motivo<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={motivoOutro}
                        onChange={e => setMotivoOutro(e.target.value)}
                        className={fieldCls}
                        placeholder="Descreva o motivo da alteração"
                        autoComplete="off"
                        maxLength={500}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </ManejoSectionCard>
      </ManejoPontualFormShell>

      {/* Bloqueio de regra de negócio — mesmo padrão visual de FazendaDeleteBlockedDialog */}
      <Dialog open={Boolean(bloqueioNegocioMsg)}>
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
              {bloqueioNegocioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={fecharBloqueioNegocio}
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
}

type SessaoFase = "hub" | "ativa";

/** Coluna única centralizada — mesmo fluxo mobile, confortável no desktop. */
const SESSAO_CURRAL_SHELL = "max-w-3xl mx-auto w-full";
/** Valor sentinela do select de lote no hub da sessão (Radix não aceita value=""). */
const LOTE_SESSAO_TODOS = "__todos__";


type ManejoSessaoItem = {
  id: string;
  tipoId: TipoManejoId;
  label: string;
  resumo: string;
  animalId: number;
  animalLabel: string;
};

type AnimalRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  sexo?: string | null;
  status?: string | null;
  fazendaId?: number | null;
  loteId?: number | null;
  ultimoPeso?: number | null;
  castrado?: boolean | number | null;
  dataDesmama?: string | Date | null;
  dataNascimento?: string | null;
  categoria?: string | null;
};

/** Sessão no curral: hub (ícones) → operação em loop → resumo. */
export function ManejoSessaoPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const trpcUtils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const [fase, setFase] = useState<SessaoFase>("hub");
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [manejosSessaoOrdem, setManejosSessaoOrdem] = useState<TipoManejoId[]>(["pesagem"]);
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [loteId, setLoteId] = useState("");
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [animalId, setAnimalId] = useState<number | null>(null);
  /** Índice do manejo atual na fila JetBov (mesmo animal, ordem do hub). */
  const [manejoAtualIdx, setManejoAtualIdx] = useState(0);
  const [historicoSessao, setHistoricoSessao] = useState<ManejoSessaoItem[]>([]);
  const [novoPeso, setNovoPeso] = useState("");
  const [bloqueioNegocioMsg, setBloqueioNegocioMsg] = useState<string | null>(null);
  const [entradaIdentValor, setEntradaIdentValor] = useState("");
  const [entradaIdentOrigem, setEntradaIdentOrigem] = useState<EntradaIdentOrigem>(null);
  const [identFeedback, setIdentFeedback] = useState<{ kind: "ok" | "erro"; text: string } | null>(
    null,
  );
  const [rfidLookupBusy, setRfidLookupBusy] = useState(false);
  const [cadastroCurral, setCadastroCurral] = useState<{
    aberto: boolean;
    brinco?: string;
    rfid?: string;
    initKey: number;
  }>({ aberto: false, initKey: 0 });
  const [historicoSessaoAberto, setHistoricoSessaoAberto] = useState(false);
  const [reproPipelineConfigOpen, setReproPipelineConfigOpen] = useState(false);
  const pesoInputRef = useRef<HTMLInputElement>(null);
  const aplicarPesoBalanca = useCallback((kg: number) => {
    setNovoPeso(formatPesoKgParaCampo(kg));
    window.setTimeout(() => {
      pesoInputRef.current?.focus();
      pesoInputRef.current?.select();
    }, 30);
  }, []);
  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery({
    status: "ativo",
    dataManejo: data,
  });

  const { data: pesagensAnimal = [] } = trpc.pesagens.list.useQuery(
    { animalId: animalId! },
    { enabled: Boolean(animalId) },
  );

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const lotesDaFazenda = useMemo(
    () =>
      lotes.filter(l => {
        if (!fazendaNum) return true;
        return l.fazendaId == null || l.fazendaId === fazendaNum;
      }),
    [lotes, fazendaNum],
  );

  const opcoesLoteSessao = useMemo(
    () => [
      { value: LOTE_SESSAO_TODOS, label: "Todos os lotes" },
      ...lotesDaFazenda.map(l => ({ value: String(l.id), label: l.nome })),
    ],
    [lotesDaFazenda],
  );

  const unicaFazenda = fazendas.length === 1;

  const nomeFazenda = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId)?.nome ?? "—",
    [fazendas, fazendaId],
  );

  const nomeLoteSessao = useMemo(() => {
    if (!loteId) return null;
    return lotes.find(l => String(l.id) === loteId)?.nome ?? null;
  }, [lotes, loteId]);

  const manejosOperacionaisSessao = useMemo(
    () => manejosCurralOperacionaisNaOrdem(manejosSessaoOrdem),
    [manejosSessaoOrdem],
  );

  const hubIncluiReprodutivo = useMemo(
    () => manejosSessaoOrdem.includes("reprodutivo"),
    [manejosSessaoOrdem],
  );

  const hubIncluiDesmama = useMemo(
    () => manejosSessaoOrdem.includes("desmama"),
    [manejosSessaoOrdem],
  );

  const desmamaHubFaltando = useMemo(
    () => (hubIncluiDesmama ? manejosDesmamaJetBovFaltando(manejosSessaoOrdem) : []),
    [hubIncluiDesmama, manejosSessaoOrdem],
  );

  const { data: reproPipelineConfigHub } = trpc.reproducao.getPipelineConfig.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fase === "hub" && hubIncluiReprodutivo && fazendaNum > 0 },
  );

  const reproPipelineResumoHub = useMemo(
    () =>
      reproPipelineConfigHub ? formatReproPipelineConfigResumo(reproPipelineConfigHub) : null,
    [reproPipelineConfigHub],
  );

  const manejoAtualId = useMemo((): TipoManejoId | null => {
    if (manejosOperacionaisSessao.length === 0) return null;
    const idx = Math.min(manejoAtualIdx, manejosOperacionaisSessao.length - 1);
    return manejosOperacionaisSessao[idx] ?? null;
  }, [manejosOperacionaisSessao, manejoAtualIdx]);

  const manejoSessaoMeta = useMemo(
    () => (manejoAtualId ? TIPOS_MANEJO.find(t => t.id === manejoAtualId) ?? null : null),
    [manejoAtualId],
  );

  const toggleManejoHub = useCallback((id: TipoManejoId) => {
    if (!podeSelecionarManejoNoHub(id)) return;
    setManejosSessaoOrdem(prev => {
      const idx = prev.indexOf(id);
      if (idx >= 0) return prev.filter(x => x !== id);
      const next = [...prev, id];
      if (id === "desmama") {
        const faltando = manejosDesmamaJetBovFaltando(next);
        if (faltando.length > 0) {
          queueMicrotask(() => {
            const nomes = faltando
              .map(fid => TIPOS_MANEJO.find(t => t.id === fid)?.label ?? fid)
              .join(" e ");
            toast.info(
              `Para desmama completa no curral, inclua também: ${nomes}.`,
              { duration: 6000 },
            );
          });
        }
      }
      return next;
    });
  }, []);

  const aplicarOrdemDesmamaHub = useCallback(() => {
    setManejosSessaoOrdem(prev => aplicarOrdemDesmamaJetBov(prev));
    toast.success(`Ordem aplicada: ${CURRAL_DESMAMA_ORDEM_JETBOV_LABEL}.`);
  }, []);

  const tiposHubOrdenados = useMemo(
    () => TIPOS_MANEJO.filter(t => t.id !== "baixa-animal"),
    [],
  );

  const tiposHubDisponiveis = useMemo(
    () => tiposHubOrdenados.filter(t => podeSelecionarManejoNoHub(t.id)),
    [tiposHubOrdenados],
  );

  const tiposHubEmBreve = useMemo(
    () => tiposHubOrdenados.filter(t => !podeSelecionarManejoNoHub(t.id)),
    [tiposHubOrdenados],
  );

  const animaisEscopo = useMemo(() => {
    const rows = animais as AnimalRow[];
    return rows.filter(a => {
      if (fazendaNum && a.fazendaId != null && a.fazendaId !== fazendaNum) return false;
      if (loteId && a.loteId != null && String(a.loteId) !== loteId) return false;
      return true;
    });
  }, [animais, fazendaNum, loteId]);

  const animaisEscopoBusca = useMemo(
    () =>
      animaisEscopo.map(a => ({
        ...a,
        loteNome: a.loteId ? lotes.find(l => l.id === a.loteId)?.nome ?? null : null,
      })) as AnimalBuscaRow[],
    [animaisEscopo, lotes],
  );

  const toAnimalBuscaRow = useCallback(
    (a: AnimalRow): AnimalBuscaRow => ({
      ...a,
      loteNome: a.loteId ? lotes.find(l => l.id === a.loteId)?.nome ?? null : null,
    }),
    [lotes],
  );

  const animalAtual = animalSel;

  const limparEntradaIdent = useCallback(() => {
    setEntradaIdentValor("");
    setEntradaIdentOrigem(null);
  }, []);

  const limparContextoAnimal = useCallback(() => {
    setAnimalSel(null);
    setAnimalId(null);
    setManejoAtualIdx(0);
    setNovoPeso("");
    limparEntradaIdent();
    setIdentFeedback(null);
  }, [limparEntradaIdent]);

  const handleAnimalSelect = useCallback(
    (a: AnimalBuscaRow | null) => {
      if (!a) {
        limparContextoAnimal();
        return;
      }
      setAnimalSel(a);
      setAnimalId(a.id);
      setManejoAtualIdx(0);
      setNovoPeso("");
      setIdentFeedback(null);
      limparEntradaIdent();
    },
    [limparContextoAnimal, limparEntradaIdent],
  );

  const avancarFilaManejoAnimal = useCallback(
    (item: ManejoSessaoItem) => {
      setHistoricoSessao(prev => [...prev, item]);
      const proximoIdx = manejoAtualIdx + 1;
      if (proximoIdx < manejosOperacionaisSessao.length) {
        setManejoAtualIdx(proximoIdx);
        setNovoPeso("");
        setIdentFeedback(null);
        const proximoId = manejosOperacionaisSessao[proximoIdx];
        const proximoLabel = TIPOS_MANEJO.find(t => t.id === proximoId)?.label ?? proximoId;
        toast.success(`${item.label} registrada · ${item.animalLabel}. Próximo: ${proximoLabel}.`);
        return;
      }
      toast.success(`${item.label} registrada — ${item.animalLabel}. Próximo animal.`);
      limparContextoAnimal();
    },
    [limparContextoAnimal, manejoAtualIdx, manejosOperacionaisSessao],
  );

  const registrarSanitarioCurral = useCallback(
    (payload: { animalId: number; resumo: string }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      setHistoricoSessao(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tipoId: "sanitario",
          label: "Sanitário",
          resumo: payload.resumo,
          animalId: payload.animalId,
          animalLabel,
        },
      ]);
    },
    [animaisEscopo],
  );

  const concluirSanitarioCurral = useCallback(() => {
    if (!animalSel) return;
    const animalLabel = labelAnimal(animalSel);
    const proximoIdx = manejoAtualIdx + 1;
    if (proximoIdx < manejosOperacionaisSessao.length) {
      setManejoAtualIdx(proximoIdx);
      setIdentFeedback(null);
      const proximoId = manejosOperacionaisSessao[proximoIdx];
      const proximoLabel = TIPOS_MANEJO.find(t => t.id === proximoId)?.label ?? proximoId;
      toast.success(`Sanitário concluído · ${animalLabel}. Próximo: ${proximoLabel}.`);
      return;
    }
    toast.success(`Sanitário concluído — ${animalLabel}. Próximo animal.`);
    limparContextoAnimal();
  }, [animalSel, limparContextoAnimal, manejoAtualIdx, manejosOperacionaisSessao]);

  const registrarTrocaLoteCurral = useCallback(
    (payload: {
      animalId: number;
      resumo: string;
      novoLoteId: number;
      novoLoteNome: string;
    }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      setAnimalSel(prev =>
        prev && prev.id === payload.animalId
          ? { ...prev, loteId: payload.novoLoteId, loteNome: payload.novoLoteNome }
          : prev,
      );
      const item: ManejoSessaoItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipoId: "troca-lote",
        label: "Troca de Lote",
        resumo: payload.resumo,
        animalId: payload.animalId,
        animalLabel,
      };
      avancarFilaManejoAnimal(item);
    },
    [animaisEscopo, avancarFilaManejoAnimal],
  );

  const loteAtualAnimalSessao = useMemo(() => {
    if (!animalSel?.loteId) return null;
    return lotes.find(l => l.id === animalSel.loteId) ?? null;
  }, [animalSel?.loteId, lotes]);

  const registrarReprodutivoCurral = useCallback(
    (payload: { animalId: number; resumo: string }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      setHistoricoSessao(prev => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          tipoId: "reprodutivo",
          label: "Reprodutivo",
          resumo: payload.resumo,
          animalId: payload.animalId,
          animalLabel,
        },
      ]);
    },
    [animaisEscopo],
  );

  const concluirReprodutivoCurral = useCallback(() => {
    if (!animalSel) return;
    const animalLabel = labelAnimal(animalSel);
    const proximoIdx = manejoAtualIdx + 1;
    if (proximoIdx < manejosOperacionaisSessao.length) {
      setManejoAtualIdx(proximoIdx);
      setIdentFeedback(null);
      const proximoId = manejosOperacionaisSessao[proximoIdx];
      const proximoLabel = TIPOS_MANEJO.find(t => t.id === proximoId)?.label ?? proximoId;
      toast.success(`Reprodutivo concluído · ${animalLabel}. Próximo: ${proximoLabel}.`);
      return;
    }
    toast.success(`Reprodutivo concluído — ${animalLabel}. Próximo animal.`);
    limparContextoAnimal();
  }, [animalSel, limparContextoAnimal, manejoAtualIdx, manejosOperacionaisSessao]);

  const registrarCastracaoCurral = useCallback(
    (payload: { animalId: number; resumo: string }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      avancarFilaManejoAnimal({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipoId: "castracao",
        label: "Castração",
        resumo: payload.resumo,
        animalId: payload.animalId,
        animalLabel,
      });
    },
    [animaisEscopo, avancarFilaManejoAnimal],
  );

  const registrarDesmamaCurral = useCallback(
    (payload: { animalId: number; resumo: string }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      avancarFilaManejoAnimal({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipoId: "desmama",
        label: "Desmama",
        resumo: payload.resumo,
        animalId: payload.animalId,
        animalLabel,
      });
    },
    [animaisEscopo, avancarFilaManejoAnimal],
  );

  const registrarBrincoCurral = useCallback(
    (payload: {
      animalId: number;
      resumo: string;
      novoRfid?: string | null;
      novoBrinco?: string | null;
    }) => {
      const row = animaisEscopo.find(a => a.id === payload.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${payload.animalId}`;
      setAnimalSel(prev =>
        prev && prev.id === payload.animalId
          ? {
              ...prev,
              brincoEletronico: payload.novoRfid ?? prev.brincoEletronico,
              brinco: payload.novoBrinco ?? prev.brinco,
            }
          : prev,
      );
      const item: ManejoSessaoItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipoId: "brinco-eletronico",
        label: "Identificação",
        resumo: payload.resumo,
        animalId: payload.animalId,
        animalLabel,
      };
      avancarFilaManejoAnimal(item);
    },
    [animaisEscopo, avancarFilaManejoAnimal],
  );

  const selecionarAnimal = useCallback(
    (a: AnimalRow) => {
      handleAnimalSelect(toAnimalBuscaRow(a));
    },
    [handleAnimalSelect, toAnimalBuscaRow],
  );

  const fecharCadastroCurral = useCallback(() => {
    setCadastroCurral(prev => {
      if (!prev.aberto) return prev;
      const brinco = (prev.brinco ?? "").trim();
      const rfid = (prev.rfid ?? "").trim();
      if (brinco) {
        setEntradaIdentValor(brinco);
        setEntradaIdentOrigem("manual");
      } else if (rfid) {
        setEntradaIdentValor(rfid);
        setEntradaIdentOrigem("rfid");
      }
      setIdentFeedback(null);
      return { ...prev, aberto: false };
    });
  }, []);

  const abrirCadastroCurral = useCallback((rascunho?: { brinco?: string; rfid?: string }) => {
    setCadastroCurral(prev => ({
      aberto: true,
      brinco: rascunho?.brinco,
      rfid: rascunho?.rfid,
      initKey: prev.initKey + 1,
    }));
    setIdentFeedback(null);
  }, []);

  const handleSalvarEManejarCurral = useCallback(
    async (animalId: number) => {
      setCadastroCurral(prev => ({ ...prev, aberto: false }));
      try {
        const animal = await trpcUtils.animais.getById.fetch({ id: animalId });
        if (!animal) {
          toast.error("Animal cadastrado, mas não foi possível carregá-lo.");
          return;
        }
        handleAnimalSelect(animal as AnimalBuscaRow);
        setIdentFeedback({
          kind: "ok",
          text: `${labelAnimal(animal as AnimalBuscaRow)} cadastrado e selecionado.`,
        });
      } catch (error) {
        const err = error as Error;
        toast.error(err?.message || "Animal cadastrado, mas falha ao selecionar.");
      }
    },
    [handleAnimalSelect, trpcUtils],
  );

  const identificarPorBrinco = useCallback(() => {
    const brinco = entradaIdentValor.trim();
    if (!brinco) {
      setIdentFeedback({ kind: "erro", text: "Digite o brinco visual." });
      return;
    }
    if (!fazendaNum) {
      setIdentFeedback({ kind: "erro", text: "Aguardando contexto da sessão." });
      return;
    }
    const brincoNorm = brinco.toLowerCase();
    const matches = animaisEscopoBusca.filter(
      a => (a.brinco || "").trim().toLowerCase() === brincoNorm,
    );
    if (matches.length === 0) {
      abrirCadastroCurral({ brinco });
      limparEntradaIdent();
      return;
    }
    if (matches.length > 1) {
      setIdentFeedback({
        kind: "erro",
        text: "Mais de um animal com este brinco no escopo. Confira o brinco digitado.",
      });
      return;
    }
    const row = matches[0]!;
    selecionarAnimal(row);
    limparEntradaIdent();
    setIdentFeedback({ kind: "ok", text: `${labelAnimal(row)} identificado.` });
  }, [abrirCadastroCurral, animaisEscopoBusca, entradaIdentValor, fazendaNum, limparEntradaIdent, selecionarAnimal]);

  const identificarPorRfid = useCallback(
    async (rfidBruto: string) => {
      const rfid = normalizeRfidKey(rfidBruto);
      if (!rfid) return;
      if (animalSel || rfidLookupBusy) return;
      if (!fazendaNum) {
        setIdentFeedback({ kind: "erro", text: "Selecione a fazenda da sessão." });
        return;
      }
      setRfidLookupBusy(true);
      try {
        const animal = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
          brincoEletronico: rfid,
        });
        if (!animal) {
          abrirCadastroCurral({ rfid });
          limparEntradaIdent();
          return;
        }
        const row = animaisEscopo.find(a => a.id === animal.id);
        if (!row) {
          setIdentFeedback({
            kind: "erro",
            text: "Animal fora do escopo da sessão (fazenda ou lote).",
          });
          return;
        }
        selecionarAnimal(row);
        limparEntradaIdent();
        setIdentFeedback({ kind: "ok", text: `${labelAnimal(row)} identificado.` });
      } catch (error) {
        const err = error as Error;
        setIdentFeedback({ kind: "erro", text: err?.message || "Falha ao buscar animal." });
      } finally {
        setRfidLookupBusy(false);
      }
    },
    [abrirCadastroCurral, animalSel, animaisEscopo, fazendaNum, limparEntradaIdent, rfidLookupBusy, selecionarAnimal, trpcUtils],
  );

  const preencherRfidNoDisplay = useCallback(
    (rfidBruto: string) => {
      if (animalSel || rfidLookupBusy) return;
      const rfid = normalizeRfidKey(rfidBruto);
      if (!rfid) return;
      setEntradaIdentValor(rfid);
      setEntradaIdentOrigem("rfid");
      setIdentFeedback(null);
    },
    [animalSel, rfidLookupBusy],
  );

  /** Uma sessão serial para hub + operação — conexão persiste ao iniciar a sessão. */
  const at05ReadDispatchRef = useRef<(rfid: string) => void>(() => undefined);
  const at05CurralSession = useAt05Reader({
    onRead: rfid => at05ReadDispatchRef.current(rfid),
  });
  const bindAt05ReadHandler = useCallback((handler: (rfid: string) => void) => {
    at05ReadDispatchRef.current = handler;
    return () => {
      if (at05ReadDispatchRef.current === handler) {
        at05ReadDispatchRef.current = () => undefined;
      }
    };
  }, []);

  const confirmarEntradaIdent = useCallback(() => {
    const valor = entradaIdentValor.trim();
    if (!valor) {
      setIdentFeedback({ kind: "erro", text: "Informe o RFID ou o brinco visual." });
      return;
    }
    if (entradaIdentOrigem === "rfid") {
      void identificarPorRfid(valor);
      return;
    }
    setEntradaIdentOrigem("manual");
    identificarPorBrinco();
  }, [entradaIdentOrigem, entradaIdentValor, identificarPorBrinco, identificarPorRfid]);

  const pesagemMutation = trpc.pesagens.create.useMutation({
    onSuccess: (_result, vars) => {
      const row = animaisEscopo.find(a => a.id === vars.animalId);
      const animalLabel = row ? labelAnimal(row) : `#${vars.animalId}`;
      const pesoFmt = formatUltimoPesoKg(Number(vars.peso));
      const item: ManejoSessaoItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tipoId: "pesagem",
        label: "Pesagem",
        resumo: pesoFmt ? `${pesoFmt} kg` : `${vars.peso} kg`,
        animalId: vars.animalId,
        animalLabel,
      };
      avancarFilaManejoAnimal(item);
      void trpcUtils.pesagens.list.invalidate({ animalId: vars.animalId });
      void trpcUtils.animais.list.invalidate();
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar a pesagem.";
      if (msg.includes("não pode ser futura") || isMensagemBloqueioBaixa(msg)) {
        setBloqueioNegocioMsg(
          isMensagemBloqueioBaixa(msg) ? msg : MSG_PESAGEM_DATA_FUTURA,
        );
        return;
      }
      toast.error(msg);
    },
  });

  const ultimaPesagem = useMemo(() => {
    if (!animalId || !pesagensAnimal.length) return null;
    const desc = sortPesagensDesc(
      pesagensAnimal.map(p => ({
        id: p.id,
        peso: p.peso,
        data: p.data,
        observacoes: p.observacoes,
        createdAt: p.createdAt,
      })),
    );
    return desc[0] ?? null;
  }, [animalId, pesagensAnimal]);

  const ultimoPesoNum =
    ultimaPesagem?.peso != null && Number.isFinite(Number(ultimaPesagem.peso))
      ? Number(ultimaPesagem.peso)
      : animalAtual?.ultimoPeso != null && Number.isFinite(animalAtual.ultimoPeso)
        ? animalAtual.ultimoPeso
        : null;
  const ultimoPesoFmt = formatUltimoPesoKg(ultimoPesoNum);
  const ultimaPesagemDataFmt = ultimaPesagem?.data ? formatDateBR(ultimaPesagem.data) : null;
  const pesoPesagemDesmamaCurral = useMemo(() => {
    if (!animalId || manejoAtualId !== "desmama") return null;
    const reuse = pesagemReutilizavelDesmama(
      pesagensAnimal.map(p => ({
        id: p.id,
        data: p.data,
        peso: p.peso,
        observacoes: p.observacoes,
      })),
      data,
    );
    if (!reuse || reuse.jaMarcadaDesmama) return null;
    return reuse.peso;
  }, [animalId, data, manejoAtualId, pesagensAnimal]);
  const animalSexoDotCls = animalSel ? sexoDotClassName(animalSel.sexo) : null;
  const animalSexoLabel = animalSel ? labelSexoAnimal(animalSel.sexo) : null;

  useEffect(() => {
    if (animalId == null || manejoAtualId !== "pesagem") return;
    const t = window.setTimeout(() => {
      pesoInputRef.current?.focus();
      pesoInputRef.current?.select();
    }, 50);
    return () => window.clearTimeout(t);
  }, [animalId, manejoAtualId]);

  const registrarPesagemCurral = () => {
    if (!animalAtual) {
      toast.error("Selecione o animal atual.");
      return;
    }
    if (data > todayISODate()) {
      setBloqueioNegocioMsg(MSG_PESAGEM_DATA_FUTURA);
      return;
    }
    const pesoPersistir = parsePesoKgParaPersistir(novoPeso);
    if (!pesoPersistir) {
      toast.error("Informe um peso válido maior que zero.");
      return;
    }
    pesagemMutation.mutate({
      animalId: animalAtual.id,
      peso: pesoPersistir,
      data,
    });
  };

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
    setLoteId("");
    limparContextoAnimal();
  };

  const iniciarSessao = () => {
    if (!fazendaId) {
      toast.error("Selecione a fazenda da sessão.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da sessão.");
      return;
    }
    if (manejosSessaoOrdem.length === 0) {
      toast.error("Selecione ao menos um manejo.");
      return;
    }
    const operacional = primeiroManejoDisponivelNaOrdem(manejosSessaoOrdem);
    if (!operacional) {
      toast.error("Nenhum manejo selecionado está disponível no curral ainda.");
      return;
    }
    const id = newSessaoId();
    setSessaoId(id);
    setHistoricoSessao([]);
    setManejoAtualIdx(0);
    limparContextoAnimal();
    setCadastroCurral(prev => ({ ...prev, aberto: false }));
    setFase("ativa");
    const ordemLabels = manejosCurralOperacionaisNaOrdem(manejosSessaoOrdem)
      .map(id => TIPOS_MANEJO.find(t => t.id === id)?.label ?? id)
      .join(" → ");
    toast.success(
      manejosCurralOperacionaisNaOrdem(manejosSessaoOrdem).length > 1
        ? `Sessão iniciada (${ordemLabels}). Localize o primeiro animal.`
        : `Sessão de ${ordemLabels || "manejo"} iniciada. Localize o primeiro animal.`,
    );
  };

  const encerrarSessao = useCallback(() => {
    if (animalSel) {
      toast.error("Conclua ou descarte o animal atual antes de encerrar a sessão.");
      return;
    }
    const total = historicoSessao.length;
    const qtdAnimais = new Set(historicoSessao.map(item => item.animalId)).size;

    setFase("hub");
    setSessaoId(null);
    setHistoricoSessao([]);
    limparContextoAnimal();
    setCadastroCurral(prev => ({ ...prev, aberto: false }));

    if (total > 0) {
      toast.success(
        `Sessão encerrada · ${total} registro${total === 1 ? "" : "s"} em ${qtdAnimais} animal${qtdAnimais === 1 ? "" : "is"}.`,
      );
    } else {
      toast.success("Sessão encerrada sem registros.");
    }
  }, [animalSel, historicoSessao, limparContextoAnimal]);

  const solicitarEncerrarSessao = useCallback(async () => {
    if (animalSel) {
      toast.error("Conclua ou descarte o animal atual antes de encerrar a sessão.");
      return;
    }
    const total = historicoSessao.length;
    const ok = await confirm({
      title: "Encerrar sessão?",
      description:
        total > 0
          ? `${total} registro${total === 1 ? "" : "s"} nesta sessão. Os dados já foram salvos e você voltará à tela inicial do curral.`
          : "Nenhum registro foi feito ainda. Deseja encerrar e voltar à tela inicial do curral?",
      confirmText: "Encerrar sessão",
      cancelText: "Continuar no curral",
      variant: total > 0 ? "default" : "warning",
    });
    if (ok) encerrarSessao();
  }, [animalSel, confirm, encerrarSessao, historicoSessao.length]);

  const totalRegistrosSessao = historicoSessao.length;

  // ── Hub (escolha do manejo + contexto) ─────────────────────────────────
  if (fase === "hub") {
    const podeIniciar =
      Boolean(
        fazendaId &&
          data &&
          manejosSessaoOrdem.length > 0 &&
          primeiroManejoDisponivelNaOrdem(manejosSessaoOrdem),
      );
    const hintIniciarSessao = (() => {
      if (podeIniciar) return null;
      if (!fazendaId) return "Selecione a fazenda para iniciar a sessão.";
      if (!data) return "Informe a data da sessão.";
      if (manejosSessaoOrdem.length === 0) return null;
      if (!primeiroManejoDisponivelNaOrdem(manejosSessaoOrdem)) {
        return "Nenhum manejo selecionado está operacional no curral ainda.";
      }
      return null;
    })();

    return (
      <AppLayout>
        <div className={SESSAO_CURRAL_SHELL}>
        <button
          type="button"
          onClick={() => setLocation("/manejo/registros")}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          aria-label="Voltar"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span className="text-[13px]">Voltar</span>
        </button>

        <div className="mb-5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4ECDC4] mb-0.5">
                Curral
              </p>
              <h1
                className="text-[20px] sm:text-[22px] font-semibold text-gray-900"
                style={{ fontFamily: "Fraunces, serif" }}
              >
                Sessão no curral
              </h1>
              {manejosSessaoOrdem.length > 1 ? (
                <p className="text-[12px] sm:text-[13px] text-gray-500 mt-1">
                  {manejosSessaoOrdem
                    .map(id => TIPOS_MANEJO.find(t => t.id === id)?.label ?? id)
                    .join(" → ")}
                </p>
              ) : null}
        </div>

        <div className="flex flex-col gap-5 pb-[max(2.5rem,env(safe-area-inset-bottom,0px))]">
          <ManejoSectionCard title="Contexto" className="order-1">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
              {unicaFazenda && fazendaId && nomeFazenda ? (
                <div className="min-w-0">
                  <FormLabel>Fazenda</FormLabel>
                  <FormInput variant="light" value={nomeFazenda} onChange={() => {}} readOnly />
                </div>
              ) : (
                <div className="min-w-0">
                  <FormLabel required>Fazenda</FormLabel>
                  <FazendaOverviewSelect
                    value={fazendaId}
                    onChange={onChangeFazenda}
                    fazendas={fazendas}
                    emptyLabel={FAZENDA_SELECT_PLACEHOLDER}
                    disabled={loadingFazendas || !fazendaInitDone}
                    required
                  />
                </div>
              )}

              <div className="min-w-0">
                <FormLabel required>Data</FormLabel>
                <FormDatePicker value={data} onChange={setData} max={todayISODate()} />
              </div>
            </div>

            <div className="min-w-0 max-w-md">
              <FormLabel>Lote</FormLabel>
              <FormNativeSelect
                variant="light"
                value={loteId || LOTE_SESSAO_TODOS}
                onChange={value => {
                  setLoteId(value === LOTE_SESSAO_TODOS ? "" : value);
                  limparContextoAnimal();
                }}
                placeholder="Todos os lotes"
                options={opcoesLoteSessao}
                disabled={!fazendaId}
              />
              <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
                Filtro opcional da sessão. &quot;Todos os lotes&quot; inclui todos os animais ativos
                da fazenda.
              </p>
            </div>
          </ManejoSectionCard>

          <ManejoSectionCard title="Manejos de curral" className="order-2 sm:order-3">
            <p className="text-[12px] text-gray-600 mb-4 -mt-1 font-medium leading-relaxed">
              Escolha a ordem dos manejos disponíveis.{" "}
              <span className="sm:hidden">Toque na ordem em que serão realizados no curral.</span>
              <span className="hidden sm:inline">
                Clique na ordem em que serão realizados no curral.
              </span>
            </p>

            {tiposHubDisponiveis.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4ECDC4]">
                  Disponível agora
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {tiposHubDisponiveis.map(tipo => {
                    const Icon = tipo.icon;
                    const ordemIdx = manejosSessaoOrdem.indexOf(tipo.id);
                    const selecionado = ordemIdx >= 0;
                    return (
                      <button
                        key={tipo.id}
                        type="button"
                        onClick={() => toggleManejoHub(tipo.id)}
                        className={cn(
                          "relative flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border text-center min-h-[116px] transition",
                          selecionado
                            ? "border-[#4ECDC4] bg-[#4ECDC4]/10 shadow-sm"
                            : "border-gray-200 bg-white hover:border-[#4ECDC4]/40 hover:bg-[#4ECDC4]/[0.04]",
                        )}
                      >
                        {selecionado ? (
                          <span className="absolute top-2 right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4ECDC4] text-white shadow-sm">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            "relative inline-flex h-11 w-11 items-center justify-center rounded-xl shrink-0",
                            selecionado
                              ? "text-white"
                              : "bg-gray-50 border border-gray-200 text-[#4ECDC4]",
                          )}
                          style={selecionado ? { backgroundColor: FD_PRIMARY } : undefined}
                        >
                          {selecionado ? (
                            <span className="absolute -top-1.5 -left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white text-[10px] font-bold">
                              {ordemIdx + 1}
                            </span>
                          ) : null}
                          <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} />
                        </span>
                        <span className="text-[12px] font-semibold text-gray-900 leading-tight px-1">
                          {tipo.label}
                        </span>
                        <span className="text-[10px] font-medium leading-tight text-[#4ECDC4]">
                          Disponível
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {tiposHubEmBreve.length > 0 ? (
              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Próximos manejos
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                    Visíveis como referência — serão liberados na sessão de curral em versões
                    futuras.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {tiposHubEmBreve.map(tipo => {
                    const Icon = tipo.icon;
                    const roadmap = getCurralManejoJetBovEntry(tipo.id);
                    const statusLabel = roadmap
                      ? labelStatusCurralManejo(roadmap.statusCurral)
                      : "Em breve";
                    return (
                      <div
                        key={tipo.id}
                        aria-disabled="true"
                        className="relative flex flex-col items-center justify-center gap-1 p-3 rounded-xl border border-gray-100 bg-gray-50/80 text-center min-h-[96px] opacity-60"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0 bg-white border border-gray-200 text-gray-400">
                          <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
                        </span>
                        <span className="text-[11px] font-semibold text-gray-600 leading-tight px-1">
                          {tipo.label}
                        </span>
                        <span className="text-[10px] font-medium leading-tight text-gray-400">
                          {statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {manejosSessaoOrdem.length > 0 ? (
              <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
                Ordem selecionada:{" "}
                {manejosSessaoOrdem
                  .map((id, i) => {
                    const label = TIPOS_MANEJO.find(t => t.id === id)?.label ?? id;
                    return `${i + 1}. ${label}`;
                  })
                  .join(" → ")}
              </p>
            ) : null}
          </ManejoSectionCard>

          <ManejoSectionCard title="Equipamentos" className="order-3 sm:order-2">
            <p className="text-[11px] text-gray-500 mb-3 -mt-1">
              Conecte bastão RFID e balança antes de iniciar. As conexões permanecem na
              operação.
            </p>
            {!fazendaId ? (
              <p className="text-[11px] text-amber-700">Selecione a fazenda para usar os equipamentos.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-700 mb-2">Bastão RFID</p>
                  <At05RfidReaderControl
                    variant="hub"
                    disabled={!fazendaId}
                    onRfidRead={() => {}}
                    session={at05CurralSession}
                    bindReadHandler={bindAt05ReadHandler}
                  />
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[11px] font-semibold text-gray-700 mb-2">Balança</p>
                  <ScaleReaderControl variant="hub" disabled={!fazendaId} />
                </div>
              </div>
            )}
          </ManejoSectionCard>

          <div className="order-4 pt-4 pb-4 border-t border-gray-200 space-y-3">
            {hintIniciarSessao ? (
              <p className="text-[11px] text-amber-700 text-center leading-relaxed">{hintIniciarSessao}</p>
            ) : null}
            {hubIncluiDesmama ? (
              <div className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 space-y-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-gray-800">
                  <MilkOff className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  Desmama no curral
                </span>
                <p className="pl-6 text-[11px] text-gray-500 leading-relaxed">
                  {CURRAL_DESMAMA_HUB_SUBTITULO}
                </p>
                <p className="pl-6 text-[10px] font-medium text-[#2D5A5A]/80 leading-relaxed">
                  Ordem sugerida: {CURRAL_DESMAMA_ORDEM_JETBOV_LABEL}
                </p>
                {desmamaHubFaltando.length > 0 ? (
                  <button
                    type="button"
                    onClick={aplicarOrdemDesmamaHub}
                    className="ml-6 mt-1 inline-flex items-center rounded-full border border-[#3dbdb5] bg-[#4ECDC4]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-900 hover:bg-[#4ECDC4]/20 transition-colors"
                  >
                    Usar ordem sugerida
                  </button>
                ) : null}
              </div>
            ) : null}
            {hubIncluiReprodutivo && fazendaNum > 0 ? (
              <button
                type="button"
                onClick={() => setReproPipelineConfigOpen(true)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-left hover:border-gray-300 hover:bg-gray-50/80 transition-colors"
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold text-gray-800">
                  <Settings2 className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  Parâmetros reprodutivos da fazenda
                </span>
                <span className="block mt-1.5 pl-6 text-[11px] text-gray-500 leading-relaxed">
                  Prazos de diagnóstico e alertas de inseminação — ajuste aqui antes de entrar no
                  curral.
                </span>
                {reproPipelineResumoHub ? (
                  <span className="block mt-1 pl-6 text-[10px] font-medium text-[#2D5A5A]/80 leading-relaxed">
                    Atual nesta fazenda: {reproPipelineResumoHub}
                  </span>
                ) : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={iniciarSessao}
              disabled={!podeIniciar}
              className="w-full min-h-[48px] rounded-full border-2 border-[#3dbdb5] py-3 text-[11px] font-bold uppercase tracking-wide text-gray-900 transition-opacity hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Iniciar sessão
            </button>
          </div>
        </div>
        </div>
        {fazendaNum > 0 ? (
          <ReproPipelineConfigDialog
            fazendaId={fazendaNum}
            open={reproPipelineConfigOpen}
            onOpenChange={setReproPipelineConfigOpen}
          />
        ) : null}
      </AppLayout>
    );
  }

  // ── Operação ativa ───────────────────────────────────────────────────────
  const renderCurralToolbarBadge = (
    Icon: ComponentType<LucideProps>,
    label: string,
    suffix = "",
  ) => (
    <div className="inline-flex items-center gap-1.5 min-w-0 shrink-0">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#4ECDC4]/15 text-[#2D5A5A] shrink-0">
        <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      </span>
      <span className="text-[12px] font-semibold text-gray-900 truncate">
        {label}
        {suffix}
      </span>
    </div>
  );

  const ManejoToolbarIcon = manejoSessaoMeta?.icon;
  const identificacaoToolbarBadge = renderCurralToolbarBadge(Tag, "Identificação");
  const manejoToolbarBadge =
    manejoSessaoMeta && ManejoToolbarIcon
      ? renderCurralToolbarBadge(
          ManejoToolbarIcon,
          manejoSessaoMeta.label,
          manejosOperacionaisSessao.length > 1
            ? ` (${manejoAtualIdx + 1}/${manejosOperacionaisSessao.length})`
            : "",
        )
      : null;

  const mostrarEncerrarSessaoTopo = !animalSel && historicoSessao.length > 0;
  /** Menu ⋮ só na identificação; nas telas de manejo (animal selecionado) fica oculto. */
  const mostrarMenuSessao = !animalSel;

  const menuOpcoesSessao = mostrarMenuSessao ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Ordem dos manejos da sessão"
          className={cn(
            "inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0",
            mostrarEncerrarSessaoTopo
              ? "h-11 w-11 min-h-[44px] min-w-[44px]"
              : "h-8 w-8 !min-h-8 !min-w-8",
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {manejosSessaoOrdem.length > 0 ? (
          <DropdownMenuItem disabled className="text-[11px] text-gray-500 focus:bg-transparent">
            Ordem:{" "}
            {manejosSessaoOrdem
              .map(id => TIPOS_MANEJO.find(t => t.id === id)?.label ?? id)
              .join(" → ")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <AppLayout>
      <div className={cn(SESSAO_CURRAL_SHELL, "mb-3 space-y-2")}>
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center min-w-0 flex-1">
            {!animalSel && fazendaNum && !cadastroCurral.aberto ? (
              <At05RfidReaderControl
                variant="compact"
                className="w-full max-w-md"
                mode="identificar"
                continuous
                disabled={rfidLookupBusy}
                onRfidRead={preencherRfidNoDisplay}
                session={at05CurralSession}
                bindReadHandler={bindAt05ReadHandler}
              />
            ) : !animalSel ? (
              <span className="text-[10px] text-amber-700 truncate">Aguardando contexto da sessão</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!animalSel ? identificacaoToolbarBadge : manejoToolbarBadge}
            {totalRegistrosSessao > 0 ? (
              !animalSel ? (
                <button
                  type="button"
                  onClick={() => setHistoricoSessaoAberto(true)}
                  className="text-[11px] font-semibold text-[#4ECDC4] tabular-nums min-h-[44px] px-2 -mr-2 hover:underline underline-offset-2"
                  aria-label="Ver registros desta sessão"
                >
                  {totalRegistrosSessao} reg.
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-[#4ECDC4] tabular-nums">
                  {totalRegistrosSessao} reg.
                </span>
              )
            ) : null}
            {mostrarMenuSessao && !mostrarEncerrarSessaoTopo ? menuOpcoesSessao : null}
          </div>
        </div>

        {mostrarEncerrarSessaoTopo ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void solicitarEncerrarSessao()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 min-h-[44px] hover:bg-gray-50 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              Encerrar sessão
            </button>
            {menuOpcoesSessao}
          </div>
        ) : null}
      </div>

      <div className={cn(SESSAO_CURRAL_SHELL, "space-y-5 pb-10")}>
        {manejosOperacionaisSessao.length === 0 ? (
          <ManejoSectionCard title="Sessão indisponível">
            <p className="text-[12px] text-gray-600">
              Nenhum manejo selecionado está operacional no curral. Encerre e configure outra sessão
              no hub.
            </p>
          </ManejoSectionCard>
        ) : (
          <>
        <ManejoSectionCard>
          {!animalSel ? (
            cadastroCurral.aberto && fazendaNum ? (
              <CurralCadastroAnimalPanel
                fazendaNum={fazendaNum}
                dataEntrada={data}
                loteIdSessao={loteId ? Number(loteId) : null}
                rascunho={{ brinco: cadastroCurral.brinco, rfid: cadastroCurral.rfid }}
                initKey={cadastroCurral.initKey}
                onSalvarEManejar={handleSalvarEManejarCurral}
                onCancelar={fecharCadastroCurral}
                at05Session={at05CurralSession}
                bindAt05ReadHandler={bindAt05ReadHandler}
              />
            ) : (
              <div className="space-y-4">
                <BrincoNumpadField
                  value={entradaIdentValor}
                  origem={entradaIdentOrigem}
                  onChange={v => {
                    setEntradaIdentValor(v);
                    if (!v) setEntradaIdentOrigem(null);
                    setIdentFeedback(null);
                  }}
                  onManualInput={() => setEntradaIdentOrigem("manual")}
                  onConfirm={confirmarEntradaIdent}
                  disabled={!fazendaNum}
                  confirmPending={rfidLookupBusy}
                />

                {identFeedback ? (
                  <p
                    className={`text-[11px] font-medium ${identFeedback.kind === "ok" ? "text-teal-700" : "text-red-600"}`}
                    aria-live="polite"
                  >
                    {identFeedback.text}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Leia a tag no bastão ou digite o brinco visual, depois confirme com{" "}
                    <span className="font-semibold text-gray-700">OK</span>.
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[#4ECDC4]/40 bg-[#4ECDC4]/[0.06] px-4 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: FD_PRIMARY }}
                  aria-hidden
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[22px] sm:text-[26px] font-bold text-gray-900 tabular-nums leading-tight flex items-center gap-2 min-w-0"
                    aria-live="polite"
                  >
                    {animalSexoDotCls ? (
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${animalSexoDotCls}`}
                        title={animalSexoLabel ?? undefined}
                        aria-hidden
                      />
                    ) : null}
                    <span className="truncate">{labelAnimal(animalSel)}</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {ultimoPesoFmt ? (
                      <>
                        Ref.{" "}
                        <span className="font-semibold text-gray-700">{ultimoPesoFmt} kg</span>
                        {ultimaPesagemDataFmt ? ` · ${ultimaPesagemDataFmt}` : ""}
                      </>
                    ) : (
                      "Sem pesagem anterior"
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAnimalSelect(null)}
                className="text-[11px] font-semibold text-gray-500 underline underline-offset-2 shrink-0 !min-h-8 !min-w-0 px-1 hover:text-gray-800"
              >
                Trocar
              </button>
            </div>
          )}

          {animalSel && manejoAtualId === "pesagem" ? (
            <div className="mt-4 space-y-4">
              <ScaleReaderControl
                variant="operacao"
                disabled={pesagemMutation.isPending}
                onStableWeight={aplicarPesoBalanca}
              />

              <div>
                <FormLabel required>Novo peso (kg)</FormLabel>
                <input
                  ref={pesoInputRef}
                  type="text"
                  inputMode="decimal"
                  value={novoPeso}
                  onChange={e => setNovoPeso(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      registrarPesagemCurral();
                    }
                  }}
                  placeholder="Ex.: 425 ou 425,5"
                  disabled={pesagemMutation.isPending}
                  className="w-full text-[22px] sm:text-[26px] lg:text-[28px] font-bold border border-gray-200 rounded-xl px-4 py-3 sm:py-3.5 text-gray-900 min-h-[56px] sm:min-h-[60px] text-center tracking-tight bg-white disabled:bg-gray-50"
                  autoComplete="off"
                />
              </div>

              <button
                type="button"
                onClick={registrarPesagemCurral}
                disabled={pesagemMutation.isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                <span className="material-icons text-[20px]">scale</span>
                {pesagemMutation.isPending ? "Salvando…" : "Registrar pesagem"}
              </button>

              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                {manejoAtualIdx + 1 < manejosOperacionaisSessao.length
                  ? "Enter registra e avança para o próximo manejo deste animal."
                  : "Enter registra e prepara o próximo animal."}{" "}
                Balança conectada preenche automaticamente quando estabilizar.
              </p>
            </div>
          ) : null}

          {animalSel && manejoAtualId === "sanitario" && animalId ? (
            <CurralSanitarioPanel
              key={`sanitario-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              data={data}
              animalId={animalId}
              onRegistrado={registrarSanitarioCurral}
              onConcluir={concluirSanitarioCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
              hasNextManejoNaFila={manejoAtualIdx + 1 < manejosOperacionaisSessao.length}
            />
          ) : null}

          {animalSel && manejoAtualId === "troca-lote" && animalId ? (
            <CurralTrocaLotePanel
              key={`troca-lote-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              fazendaNome={nomeFazenda}
              data={data}
              animalId={animalId}
              loteAtualId={animalSel.loteId}
              loteAtualNome={loteAtualAnimalSessao?.nome ?? animalSel.loteNome}
              pastoAtualNome={
                (loteAtualAnimalSessao as { pastoNome?: string | null } | null)?.pastoNome ?? null
              }
              lotes={lotes}
              onRegistrado={registrarTrocaLoteCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
              hasNextManejoNaFila={manejoAtualIdx + 1 < manejosOperacionaisSessao.length}
            />
          ) : null}

          {animalSel && manejoAtualId === "brinco-eletronico" && animalId ? (
            <CurralBrincoEletronicoPanel
              key={`brinco-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              data={data}
              animalId={animalId}
              brincoAtual={animalSel.brinco}
              rfidAtual={animalSel.brincoEletronico}
              onRegistrado={registrarBrincoCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
              hasNextManejoNaFila={manejoAtualIdx + 1 < manejosOperacionaisSessao.length}
              at05Session={at05CurralSession}
              bindAt05ReadHandler={bindAt05ReadHandler}
            />
          ) : null}

          {animalSel && manejoAtualId === "reprodutivo" && animalId ? (
            <CurralReprodutivoPanel
              key={`reprodutivo-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              data={data}
              animal={animalSel}
              onRegistrado={registrarReprodutivoCurral}
              onConcluir={concluirReprodutivoCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
              hasNextManejoNaFila={manejoAtualIdx + 1 < manejosOperacionaisSessao.length}
            />
          ) : null}

          {animalSel && manejoAtualId === "castracao" && animalId ? (
            <CurralCastracaoPanel
              key={`castracao-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              data={data}
              animalId={animalId}
              animal={animalSel}
              onRegistrado={registrarCastracaoCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
            />
          ) : null}

          {animalSel && manejoAtualId === "desmama" && animalId ? (
            <CurralDesmamaPanel
              key={`desmama-${animalId}-${manejoAtualIdx}`}
              fazendaNum={fazendaNum}
              data={data}
              animalId={animalId}
              animal={animalSel}
              pesoPesagemSessao={pesoPesagemDesmamaCurral}
              onRegistrado={registrarDesmamaCurral}
              onBloqueioNegocio={setBloqueioNegocioMsg}
            />
          ) : null}

          {animalSel &&
          manejoAtualId &&
          manejoAtualId !== "pesagem" &&
          manejoAtualId !== "sanitario" &&
          manejoAtualId !== "troca-lote" &&
          manejoAtualId !== "brinco-eletronico" &&
          manejoAtualId !== "reprodutivo" &&
          manejoAtualId !== "castracao" &&
          manejoAtualId !== "desmama" ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 space-y-2">
              <p className="text-[12px] text-gray-800">
                O modo curral para{" "}
                <span className="font-semibold">{manejoSessaoMeta?.label ?? "este manejo"}</span>{" "}
                ainda não está disponível. Conclua os manejos anteriores ou toque em{" "}
                <span className="font-semibold">Trocar</span> para descartar este animal.
              </p>
            </div>
          ) : null}

          {!animalSel ? (
            <div className="mt-5 pt-5 border-t border-gray-100 opacity-50 pointer-events-none select-none">
              <p className="text-[11px] text-gray-500 text-center">
                Identifique um animal para registrar os manejos da sessão.
              </p>
            </div>
          ) : null}
        </ManejoSectionCard>

        {historicoSessao.length > 0 && animalSel ? (
          <ManejoSectionCard title="Registros nesta sessão">
            <ul className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto">
              {[...historicoSessao].reverse().slice(0, 12).map(item => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 text-[12px] border-b border-gray-50 pb-2 last:border-0 last:pb-0"
                >
                  <span className="font-semibold text-gray-900 shrink-0">{item.animalLabel}</span>
                  <span className="text-gray-600 text-right">
                    {item.label} · {item.resumo}
                  </span>
                </li>
              ))}
            </ul>
            {historicoSessao.length > 12 ? (
              <p className="text-[10px] text-gray-400 mt-2">
                Mostrando os 12 registros mais recentes de {historicoSessao.length}.
              </p>
            ) : null}
          </ManejoSectionCard>
        ) : null}

          </>
        )}
      </div>

      <Dialog open={historicoSessaoAberto} onOpenChange={setHistoricoSessaoAberto}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Registros nesta sessão</DialogTitle>
            <DialogDescription>
              {totalRegistrosSessao} registro{totalRegistrosSessao === 1 ? "" : "s"} até agora.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 overflow-y-auto flex-1 min-h-0 py-1">
            {[...historicoSessao].reverse().slice(0, 12).map(item => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 text-[12px] border-b border-gray-50 pb-2 last:border-0 last:pb-0"
              >
                <span className="font-semibold text-gray-900 shrink-0">{item.animalLabel}</span>
                <span className="text-gray-600 text-right">
                  {item.label} · {item.resumo}
                </span>
              </li>
            ))}
          </ul>
          {historicoSessao.length > 12 ? (
            <p className="text-[10px] text-gray-400">
              Mostrando os 12 registros mais recentes de {historicoSessao.length}.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(bloqueioNegocioMsg)}>
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
              {bloqueioNegocioMsg}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setBloqueioNegocioMsg(null)}
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
}
