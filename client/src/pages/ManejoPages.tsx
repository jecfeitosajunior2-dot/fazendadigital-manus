import AppLayout from "@/components/AppLayout";
import { CorralGateIcon } from "@/components/icons/CorralGateIcon";
import { useLocation, useSearch } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Nfc,
  Weight,
  Syringe,
  HeartPulse,
  ArrowLeftRight,
  Stethoscope,
  MilkOff,
  Bluetooth,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAt05Reader } from "@/hooks/useAt05Reader";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
  REBANHO_FAZENDA_STORAGE_KEY,
} from "@shared/animal-filter-types";

const FD_PRIMARY = "#4ECDC4";
const ICON_CLASS = "h-5 w-5 shrink-0";
const ICON_STROKE = 2;

export const TIPOS_MANEJO = [
  {
    id: "brinco-eletronico",
    label: "Brinco Eletrônico",
    icon: Nfc,
    descricao: "Brincos, chip e identificação eletrônica do animal",
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
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Registros de Manejo
            </h1>
            <p className="text-[12px] text-gray-500 mt-1">
              Escolha como deseja registrar o manejo.
            </p>
          </div>

          <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            {/* Sessão — destaque operacional de campo */}
            <button
              type="button"
              onClick={() => setLocation("/manejo/registros/sessao")}
              className="h-full text-left rounded-xl border-2 border-[#4ECDC4] bg-[#4ECDC4]/[0.07] p-4 hover:bg-[#4ECDC4]/[0.12] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ECDC4]/50"
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
                  <div className="text-[13px] font-semibold text-gray-900">Sessão no curral</div>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed flex-1">
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

            <div className="h-full rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3 h-full">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-gray-700 shrink-0"
                  aria-hidden
                >
                  <span className="material-icons text-[22px]">edit_note</span>
                </span>
                <div className="min-w-0 flex flex-col flex-1">
                  <div className="text-[13px] font-semibold text-gray-900">Manejo pontual</div>
                  <p className="text-[11px] text-gray-600 mt-1 leading-relaxed flex-1">
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
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80">
            <h2 className="text-[13px] font-semibold text-gray-800">Manejo pontual</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Selecione o manejo que deseja registrar.
            </p>
          </div>

          <div className="overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Tipo
                  </th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                    Descrição
                  </th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[120px]">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIPOS_MANEJO.map(tipo => {
                  const Icon = tipo.icon;
                  return (
                    <tr
                      key={tipo.id}
                      className="border-b border-gray-100 hover:bg-[#4ECDC4]/[0.05] transition-colors"
                    >
                      <td className="px-5 py-3 align-middle">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="inline-flex h-[22px] w-[22px] items-center justify-center shrink-0 text-[#4ECDC4]"
                            aria-hidden="true"
                          >
                            <Icon className={ICON_CLASS} strokeWidth={ICON_STROKE} />
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{tipo.label}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5 sm:hidden">
                              {tipo.descricao}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 align-middle text-gray-500 hidden sm:table-cell">
                        {tipo.descricao}
                      </td>
                      <td className="px-5 py-3 align-middle text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setLocation(
                              `/manejo/registros/cadastro?tipo=${encodeURIComponent(tipo.id)}`,
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:brightness-95 transition min-h-[36px]"
                          style={{ backgroundColor: FD_PRIMARY }}
                        >
                          <span className="material-icons text-[14px]">add</span>
                          Registrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Manejo pontual
          </p>
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {tipo.label}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/manejo/registros")}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px]"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Salvar
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Data</label>
            <input
              type="date"
              defaultValue={todayISODate()}
              className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Lote</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]">
              <option>Selecione um lote</option>
              <option>Lote Vacas</option>
              <option>Lote Engorda</option>
              <option>Lote Recria</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-gray-600 font-medium mb-1">
              Responsável
            </label>
            <input
              type="text"
              placeholder="Digite o nome"
              className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] text-gray-600 font-medium mb-1">Observações</label>
          <textarea
            rows={3}
            className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none"
            placeholder="Notas adicionais..."
          />
        </div>
      </div>
    </AppLayout>
  );
}

const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";

/** Select customizado: mesma aparência dos campos nativos e lista sempre abaixo. */
function FormDownSelect({
  value,
  onChange,
  placeholder,
  disabled,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative w-full min-w-0 max-w-full" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={`${fieldCls} flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={`truncate ${selected ? "text-gray-700" : "text-gray-400"}`}>
          {selected?.label ?? placeholder}
        </span>
        <span className="material-icons text-[18px] text-gray-400 shrink-0" aria-hidden>
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open && !disabled ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto overflow-x-hidden rounded border border-gray-200 bg-white shadow-lg"
        >
          {options.map(o => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#4ECDC4]/[0.08] ${
                  o.value === value ? "font-semibold text-gray-900" : "text-gray-700"
                }`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const MOTIVO_TROCA_OPCOES = [
  { value: "perda", label: "Perda do brinco" },
  { value: "danificado", label: "Brinco danificado" },
  // Label separado do valor interno — permite renomear a UI sem migrar enum.
  { value: "reidentificacao", label: "Reidentificação" },
  { value: "erro_cadastro", label: "Erro de cadastro" },
  { value: "outro", label: "Outro" },
] as const;

type MotivoTrocaBrinco = (typeof MOTIVO_TROCA_OPCOES)[number]["value"];
type OperacaoBrinco = "rfid" | "brinco" | "ambos";

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
};

function labelAnimalBusca(a: AnimalBuscaRow) {
  const nome = a.nome?.trim();
  const brinco = a.brinco?.trim();
  if (nome) return nome;
  if (brinco) return `Brinco ${brinco}`;
  return `#${a.id}`;
}

function subtituloAnimalBusca(a: AnimalBuscaRow) {
  const partes: string[] = [];
  const nome = a.nome?.trim();
  const brinco = a.brinco?.trim();
  const rfid = a.brincoEletronico?.trim();
  if (nome && brinco) partes.push(`Brinco ${brinco}`);
  if (rfid) partes.push(`RFID ${rfid}`);
  if (a.loteNome?.trim()) partes.push(`Lote ${a.loteNome.trim()}`);
  else if (a.loteId) partes.push(`Lote #${a.loteId}`);
  return partes.join(" · ");
}

/** Identificador principal do animal selecionado (sem prefixo "Animal"). */
function labelAnimalSelecionado(a: AnimalBuscaRow) {
  const nome = a.nome?.trim() || "";
  const brinco = a.brinco?.trim() || "";
  const identificador = brinco || nome || String(a.id);

  const nomeUtil =
    Boolean(nome) &&
    nome.localeCompare(identificador, undefined, { sensitivity: "accent" }) !== 0;

  if (nomeUtil) return `${identificador} · ${nome}`;
  return identificador;
}

function loteAnimalSelecionado(a: AnimalBuscaRow) {
  if (a.loteNome?.trim()) return a.loteNome.trim();
  if (a.loteId) return `#${a.loteId}`;
  return null;
}

function sexoDotClass(sexo?: string | null) {
  if (sexo === "macho") return "bg-blue-400";
  if (sexo === "femea") return "bg-pink-400";
  return "bg-gray-300";
}

/** Manejo pontual — Brinco Eletrônico (fluxo funcional). */
function ManejoBrincoEletronicoForm() {
  const [, setLocation] = useLocation();
  const trpcUtils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [buscaAnimal, setBuscaAnimal] = useState("");
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [operacao, setOperacao] = useState<OperacaoBrinco | "">("");
  const [novoRfid, setNovoRfid] = useState("");
  const [novoBrinco, setNovoBrinco] = useState("");
  const [motivo, setMotivo] = useState<MotivoTrocaBrinco | "">("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [erroFazenda, setErroFazenda] = useState("");
  const [listaAberta, setListaAberta] = useState(false);
  const [at05Feedback, setAt05Feedback] = useState<string | null>(null);
  const [at05LookupBusy, setAt05LookupBusy] = useState(false);
  const [at05ReadSeq, setAt05ReadSeq] = useState(0);
  /** Roteamento explícito: identificar animal × capturar Novo RFID. */
  const [at05ReadRoute, setAt05ReadRoute] = useState<At05ReadRoute>("identify-animal");
  const [novoRfidError, setNovoRfidError] = useState<string | null>(null);
  const buscaRef = useRef<HTMLDivElement | null>(null);
  const at05ReadRouteRef = useRef<At05ReadRoute>("identify-animal");
  const fazendaNumRef = useRef(0);
  const nomeFazendaRef = useRef<string | undefined>(undefined);
  const animalIdRef = useRef<number | null>(null);
  const animalRfidRef = useRef<string>("");
  const operacaoRef = useRef<OperacaoBrinco | "">("");
  const animalLookupSeqRef = useRef(0);
  const captureSeqRef = useRef(0);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const buscaAtiva = Boolean(fazendaNum) && buscaAnimal.trim().length >= 1 && !animalSel;

  const { data: animaisBusca = [], isFetching: buscandoAnimais } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      status: "ativo",
      search: buscaAnimal.trim() || undefined,
    },
    { enabled: buscaAtiva },
  );

  const saveMutation = trpc.manejo.registrarPontualBrinco.useMutation({
    onSuccess: () => {
      toast.success("Identificação do animal atualizada com sucesso.");
      setLocation("/manejo/registros");
    },
    onError: err => {
      const msg = err.message || "Não foi possível salvar.";
      if (msg.toLowerCase().includes("já está sendo usado")) {
        toast.error("Este brinco já está vinculado a outro animal.");
        return;
      }
      toast.error(msg);
    },
  });

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
    setBuscaAnimal("");
    setListaAberta(false);
    limparOperacao();
  }, [limparOperacao]);

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
      setBuscaAnimal("");
      setListaAberta(false);
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

  useEffect(() => {
    if (!listaAberta) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!buscaRef.current?.contains(e.target as Node)) {
        setListaAberta(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [listaAberta]);

  const unicaFazenda = fazendas.length === 1;
  const nomeFazenda = fazendas.find(f => String(f.id) === fazendaId)?.nome;

  fazendaNumRef.current = fazendaNum;
  nomeFazendaRef.current = nomeFazenda;
  animalIdRef.current = animalId;
  animalRfidRef.current = animalSel?.brincoEletronico?.trim() || "";
  operacaoRef.current = operacao;

  const resultadosBusca = useMemo(() => {
    return (animaisBusca as AnimalBuscaRow[]).slice(0, 20);
  }, [animaisBusca]);

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    setErroFazenda("");
    limparDependentesFazenda();
    if (value) persistRebanhoFazendaId(value);
    else persistRebanhoFazendaId("");
  };

  const selecionarAnimal = useCallback(
    (a: AnimalBuscaRow) => {
      animalIdRef.current = a.id;
      animalRfidRef.current = a.brincoEletronico?.trim() || "";
      setAnimalId(a.id);
      setAnimalSel(a);
      setBuscaAnimal(labelAnimalBusca(a));
      setListaAberta(false);
      limparOperacao();
    },
    [limparOperacao],
  );

  const brincoAtual = animalSel?.brinco?.trim() || "";
  const rfidAtual = animalSel?.brincoEletronico?.trim() || "";
  const loteAtual = animalSel ? loteAnimalSelecionado(animalSel) : null;
  const temRfidAtual = Boolean(rfidAtual);
  const mostraNovoRfid = operacao === "rfid" || operacao === "ambos";
  const mostraNovoBrinco = operacao === "brinco" || operacao === "ambos";
  const exigeMotivo =
    operacao === "brinco" ||
    operacao === "ambos" ||
    (operacao === "rfid" && temRfidAtual);

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
            setNovoRfid("");
            setNovoRfidError("Este RFID já está vinculado a outro animal.");
            toast.error("Este RFID já está vinculado a outro animal.");
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
    [setReadRoute, trpcUtils],
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
        ? "AT05 conectado"
        : at05UiStatus === "error"
          ? at05Error
            ? `Erro: ${at05Error}`
            : "Erro na conexão"
          : "AT05 não conectado";

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
    if (!animalId || !animalSel) {
      toast.error("Selecione um animal válido.");
      return;
    }
    if (!operacao) {
      toast.error("Selecione a operação.");
      return;
    }
    if (mostraNovoRfid && novoRfidError) {
      toast.error(novoRfidError);
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
      animalId,
      operacao,
      novoRfid: mostraNovoRfid ? novoRfid.trim() : undefined,
      novoBrinco: mostraNovoBrinco ? novoBrinco.trim() : undefined,
      motivo: exigeMotivo && motivo ? motivo : undefined,
      motivoDetalhe:
        exigeMotivo && motivo === "outro" ? motivoOutro.trim() : undefined,
    });
  };

  const sectionTitleCls =
    "text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2";

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Manejo pontual
          </p>
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Brinco Eletrônico
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCancelar()}
            disabled={cancelandoAt05}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px] disabled:opacity-60"
          >
            {cancelandoAt05 ? "Desconectando AT05…" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={
              saveMutation.isPending || !animalId || !animalSel || Boolean(novoRfidError)
            }
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px] disabled:opacity-60"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            {saveMutation.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded shadow-sm border border-gray-100 p-6 space-y-6">
        {/* Contexto */}
        <div>
          <p className={sectionTitleCls}>Contexto</p>
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(10.5rem,12rem)] gap-3 items-start">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="min-w-0">
                <label className={labelCls}>Fazenda</label>
                <div
                  className={`${fieldCls} bg-gray-50 text-gray-800 font-medium flex items-center`}
                >
                  {nomeFazenda}
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <label className={labelCls}>
                  Fazenda<span className="text-red-500">*</span>
                </label>
                <select
                  value={fazendaId}
                  onChange={e => onChangeFazenda(e.target.value)}
                  className={fieldCls}
                  disabled={loadingFazendas || !fazendaInitDone}
                >
                  <option value="">Selecione uma Fazenda</option>
                  {fazendas.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                {erroFazenda ? (
                  <p className="text-[11px] text-red-600 mt-1">{erroFazenda}</p>
                ) : null}
              </div>
            )}

            <div className="min-w-0">
              <label className={labelCls}>Data</label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        {/* Animal */}
        <div className="border-t border-gray-100 pt-5">
          <p className={sectionTitleCls}>Animal</p>
          {animalSel ? (
            <div className="rounded-lg border border-[#4ECDC4]/40 bg-[#4ECDC4]/[0.06] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-[12px] text-gray-600">
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${sexoDotClass(animalSel.sexo)}`}
                      title={
                        animalSel.sexo === "macho"
                          ? "Macho"
                          : animalSel.sexo === "femea"
                            ? "Fêmea"
                            : undefined
                      }
                      aria-hidden
                    />
                    <span className="text-[13px] font-semibold text-gray-900">
                      {labelAnimalSelecionado(animalSel)}
                    </span>
                  </span>
                  <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                    |
                  </span>
                  <span className="shrink-0">
                    Brinco{" "}
                    <span className="font-medium text-gray-800">
                      {brincoAtual || "Não vinculado"}
                    </span>
                  </span>
                  <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                    |
                  </span>
                  <span className="shrink-0">
                    RFID{" "}
                    <span className="font-medium text-gray-800">
                      {rfidAtual || "Não vinculado"}
                    </span>
                  </span>
                  {loteAtual ? (
                    <>
                      <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                        |
                      </span>
                      <span className="shrink-0">
                        Lote <span className="font-medium text-gray-800">{loteAtual}</span>
                      </span>
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={limparAnimal}
                  className="text-[11px] font-semibold text-gray-600 underline shrink-0"
                >
                  Alterar animal
                </button>
              </div>
            </div>
          ) : (
            <div className="relative" ref={buscaRef}>
              <input
                type="search"
                value={buscaAnimal}
                onChange={e => {
                  setBuscaAnimal(e.target.value);
                  setListaAberta(true);
                }}
                onFocus={() => setListaAberta(true)}
                disabled={!fazendaId}
                placeholder="Buscar por brinco, RFID ou nome..."
                className={fieldCls}
                autoComplete="off"
              />
              {listaAberta && buscaAtiva ? (
                <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {buscandoAnimais ? (
                    <li className="px-3 py-2.5 text-[11px] text-gray-400">Buscando…</li>
                  ) : resultadosBusca.length === 0 ? (
                    <li className="px-3 py-2.5 text-[11px] text-gray-400">
                      Nenhum animal encontrado.
                    </li>
                  ) : (
                    resultadosBusca.map(a => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => selecionarAnimal(a)}
                          className="w-full text-left px-3 py-2.5 hover:bg-[#4ECDC4]/[0.08] transition"
                        >
                          <div className="text-[13px] font-semibold text-gray-900">
                            {labelAnimalBusca(a)}
                          </div>
                          {subtituloAnimalBusca(a) ? (
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {subtituloAnimalBusca(a)}
                            </div>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          )}

          {/* Integração discreta AT05 — identifica animal (não salva manejo) */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-3 space-y-2">
            <p className="text-[12px] font-semibold text-gray-800">Brinco eletrônico / AT05</p>
            <p className="text-[12px] text-gray-600" aria-live="polite">
              Conexão: {at05ConnectionText}
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
                  Conectar AT05
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Operação */}
        <div className="border-t border-gray-100 pt-5">
          <p className={sectionTitleCls}>Operação</p>
          <label className={labelCls}>
            Operação<span className="text-red-500">*</span>
          </label>
          <FormDownSelect
            value={operacao}
            placeholder="Selecione a operação"
            disabled={!animalSel}
            options={[
              {
                value: "rfid",
                label: temRfidAtual ? "Trocar RFID" : "Vincular RFID",
              },
              { value: "brinco", label: "Trocar brinco" },
              {
                value: "ambos",
                label: temRfidAtual
                  ? "Trocar brinco e RFID"
                  : "Trocar brinco e vincular RFID",
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
            <div className="mt-4 space-y-4">
              {mostraNovoRfid || mostraNovoBrinco ? (
                <div
                  className={
                    mostraNovoRfid && mostraNovoBrinco
                      ? "grid grid-cols-1 md:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] gap-4 items-start"
                      : "grid grid-cols-1 gap-4"
                  }
                >
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
                      {novoRfidError ? (
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
                                : "Clique em “Ler com bastão” para conectar e capturar o Novo RFID."}
                      </p>
                    </div>
                  ) : null}
                  {mostraNovoBrinco ? (
                    <div className="min-w-0">
                      <label className={labelCls}>
                        Novo brinco<span className="text-red-500">*</span>
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
                </div>
              ) : null}
              {exigeMotivo ? (
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>
                      Motivo<span className="text-red-500">*</span>
                    </label>
                    <FormDownSelect
                      value={motivo}
                      placeholder="Selecione o motivo"
                      options={MOTIVO_TROCA_OPCOES.map(o => ({
                        value: o.value,
                        label: o.label,
                      }))}
                      onChange={next => {
                        const value = next as MotivoTrocaBrinco;
                        setMotivo(value);
                        if (value !== "outro") setMotivoOutro("");
                      }}
                    />
                  </div>
                  {motivo === "outro" ? (
                    <div>
                      <label className={labelCls}>
                        Informe o motivo<span className="text-red-500">*</span>
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
        </div>
      </div>
    </AppLayout>
  );
}

type SessaoFase = "setup" | "ativa" | "encerrada";

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
};

/** Sessão no curral: setup → operação → resumo. Esqueleto para validação. */
export function ManejoSessaoPage() {
  const [, setLocation] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });
  const { data: animais = [], isLoading: loadingAnimais } = trpc.animais.list.useQuery();

  const [fase, setFase] = useState<SessaoFase>("setup");
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [loteId, setLoteId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [buscaAnimal, setBuscaAnimal] = useState("");
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [tipoEmFoco, setTipoEmFoco] = useState<TipoManejoId | null>(null);
  const [rascunhoResumo, setRascunhoResumo] = useState("");
  const [pendentesAnimal, setPendentesAnimal] = useState<ManejoSessaoItem[]>([]);
  const [historicoSessao, setHistoricoSessao] = useState<ManejoSessaoItem[]>([]);

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
    if (!responsavel && user?.name) setResponsavel(user.name);
  }, [user?.name, responsavel]);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const lotesDaFazenda = useMemo(
    () =>
      lotes.filter(l => {
        if (!fazendaNum) return true;
        return l.fazendaId == null || l.fazendaId === fazendaNum;
      }),
    [lotes, fazendaNum],
  );

  const nomeFazenda = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId)?.nome ?? "—",
    [fazendas, fazendaId],
  );

  const nomeLoteSessao = useMemo(() => {
    if (!loteId) return null;
    return lotes.find(l => String(l.id) === loteId)?.nome ?? null;
  }, [lotes, loteId]);

  const animaisEscopo = useMemo(() => {
    const rows = animais as AnimalRow[];
    return rows.filter(a => {
      if (a.status === "inativo") return false;
      if (fazendaNum && a.fazendaId != null && a.fazendaId !== fazendaNum) return false;
      if (loteId && a.loteId != null && String(a.loteId) !== loteId) return false;
      return true;
    });
  }, [animais, fazendaNum, loteId]);

  const filtrados = useMemo(() => {
    const q = buscaAnimal.trim().toLowerCase();
    if (!q) return animaisEscopo.slice(0, 15);
    return animaisEscopo
      .filter(a => {
        const brinco = (a.brinco || "").toLowerCase();
        const nome = (a.nome || "").toLowerCase();
        const rfid = (a.brincoEletronico || "").toLowerCase();
        return (
          brinco.includes(q) ||
          nome.includes(q) ||
          rfid.includes(q) ||
          String(a.id).includes(q)
        );
      })
      .slice(0, 25);
  }, [animaisEscopo, buscaAnimal]);

  const animalAtual = useMemo(
    () => (animalId == null ? null : animaisEscopo.find(a => a.id === animalId) ?? null),
    [animaisEscopo, animalId],
  );

  const loteAnimalNome = useMemo(() => {
    if (!animalAtual?.loteId) return "—";
    return lotes.find(l => l.id === animalAtual.loteId)?.nome ?? `Lote #${animalAtual.loteId}`;
  }, [animalAtual, lotes]);

  const limparContextoAnimal = () => {
    setAnimalId(null);
    setBuscaAnimal("");
    setTipoEmFoco(null);
    setRascunhoResumo("");
    setPendentesAnimal([]);
  };

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
    setLoteId("");
    limparContextoAnimal();
    setPendentesAnimal([]);
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
    const id = newSessaoId();
    setSessaoId(id);
    setHistoricoSessao([]);
    limparContextoAnimal();
    setFase("ativa");
    toast.success("Sessão iniciada. Localize o primeiro animal.");
  };

  const registrarManejoPendente = (tipoId: TipoManejoId) => {
    if (!animalAtual) {
      toast.error("Selecione o animal atual.");
      return;
    }
    const tipo = TIPOS_MANEJO.find(t => t.id === tipoId);
    if (!tipo) return;
    const resumo = rascunhoResumo.trim() || "Registrado na sessão";
    const item: ManejoSessaoItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tipoId,
      label: tipo.label,
      resumo,
      animalId: animalAtual.id,
      animalLabel: labelAnimal(animalAtual),
    };
    setPendentesAnimal(prev => [...prev, item]);
    setTipoEmFoco(null);
    setRascunhoResumo("");
    toast.success(`${tipo.label} adicionado ao animal.`);
  };

  const concluirAnimal = () => {
    if (!animalAtual) {
      toast.error("Nenhum animal selecionado.");
      return;
    }
    if (pendentesAnimal.length === 0) {
      toast.error("Registre ao menos um manejo antes de concluir o animal.");
      return;
    }
    // Cada item permanece independente; sessão só agrupa (sessaoId).
    setHistoricoSessao(prev => [...prev, ...pendentesAnimal]);
    toast.success(
      `${pendentesAnimal.length} registro(s) salvos para ${labelAnimal(animalAtual)}. Próximo animal.`,
    );
    limparContextoAnimal();
  };

  const encerrarSessao = () => {
    if (pendentesAnimal.length > 0) {
      toast.error("Conclua o animal atual antes de encerrar a sessão.");
      return;
    }
    setFase("encerrada");
    setAnimalId(null);
  };

  const resumoPorTipo = useMemo(() => {
    const map = new Map<TipoManejoId, number>();
    for (const item of pendentesAnimal) {
      map.set(item.tipoId, (map.get(item.tipoId) ?? 0) + 1);
    }
    return TIPOS_MANEJO.map(t => ({
      id: t.id,
      label: t.label,
      count: map.get(t.id) ?? 0,
    })).filter(t => t.count > 0);
  }, [pendentesAnimal]);

  // ── Setup ────────────────────────────────────────────────────────────────
  if (fase === "setup") {
    return (
      <AppLayout>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4ECDC4] mb-0.5">
              Sessão no curral
            </p>
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Iniciar sessão
            </h1>
            <p className="text-[12px] text-gray-500 mt-1">
              Defina o contexto. Depois você localiza o animal e registra os manejos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLocation("/manejo/registros")}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px]"
          >
            <span className="material-icons text-[16px]">arrow_back</span>
            Voltar
          </button>
        </div>

        <div className="bg-white rounded shadow-sm border border-gray-100 p-4 sm:p-6 max-w-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-gray-600 font-medium mb-1">Fazenda</label>
              <select
                value={fazendaId}
                onChange={e => onChangeFazenda(e.target.value)}
                className="w-full text-[12px] border border-gray-200 rounded px-3 py-2.5 text-gray-700 min-h-[44px]"
                disabled={loadingFazendas}
              >
                <option value="">Selecione a fazenda</option>
                {fazendas.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 font-medium mb-1">Data</label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className="w-full text-[12px] border border-gray-200 rounded px-3 py-2.5 text-gray-700 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 font-medium mb-1">
                Lote <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select
                value={loteId}
                onChange={e => {
                  setLoteId(e.target.value);
                  limparContextoAnimal();
                }}
                className="w-full text-[12px] border border-gray-200 rounded px-3 py-2.5 text-gray-700 min-h-[44px]"
                disabled={!fazendaId}
              >
                <option value="">Todos os animais da fazenda</option>
                {lotesDaFazenda.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 font-medium mb-1">
                Responsável
              </label>
              <input
                type="text"
                value={responsavel}
                onChange={e => setResponsavel(e.target.value)}
                placeholder="Funcionário, técnico, veterinário…"
                className="w-full text-[12px] border border-gray-200 rounded px-3 py-2.5 text-gray-700 min-h-[44px]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={iniciarSessao}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg text-white text-[13px] font-semibold min-h-[48px] hover:brightness-95"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Iniciar sessão
            <span className="material-icons text-[18px]">arrow_forward</span>
          </button>
        </div>
      </AppLayout>
    );
  }

  // ── Encerrada ────────────────────────────────────────────────────────────
  if (fase === "encerrada") {
    const porAnimal = new Map<number, ManejoSessaoItem[]>();
    for (const item of historicoSessao) {
      const list = porAnimal.get(item.animalId) ?? [];
      list.push(item);
      porAnimal.set(item.animalId, list);
    }

    return (
      <AppLayout>
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
            Sessão encerrada
          </p>
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Resumo da sessão
          </h1>
          <p className="text-[12px] text-gray-500 mt-1">
            {nomeFazenda} · {data}
            {nomeLoteSessao ? ` · ${nomeLoteSessao}` : ""}
            {responsavel ? ` · ${responsavel}` : ""}
          </p>
          {sessaoId && (
            <p className="text-[10px] text-gray-400 mt-1 font-mono break-all">ID: {sessaoId}</p>
          )}
        </div>

        <div className="bg-white rounded shadow-sm border border-gray-100 p-4 sm:p-5 space-y-4">
          <p className="text-[13px] text-gray-800">
            <span className="font-semibold">{historicoSessao.length}</span> registro(s) em{" "}
            <span className="font-semibold">{porAnimal.size}</span> animal(is). Cada manejo
            permanece independente no histórico.
          </p>

          {historicoSessao.length === 0 ? (
            <p className="text-[12px] text-gray-400">Nenhum manejo foi registrado nesta sessão.</p>
          ) : (
            <ul className="space-y-3">
              {[...porAnimal.entries()].map(([aid, items]) => (
                <li key={aid} className="border border-gray-100 rounded-lg p-3">
                  <div className="text-[12px] font-semibold text-gray-900 mb-1">
                    {items[0]?.animalLabel ?? `#${aid}`}
                  </div>
                  <ul className="space-y-1">
                    {items.map(it => (
                      <li key={it.id} className="text-[11px] text-gray-600 flex gap-2">
                        <span className="text-[#4ECDC4]">✓</span>
                        <span>
                          {it.label}
                          {it.resumo ? ` — ${it.resumo}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setFase("setup");
                setSessaoId(null);
                setHistoricoSessao([]);
                limparContextoAnimal();
              }}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-white text-[12px] font-semibold min-h-[44px]"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              Nova sessão
            </button>
            <button
              type="button"
              onClick={() => setLocation("/manejo/registros")}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold min-h-[44px] hover:bg-gray-50"
            >
              Voltar aos registros
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Operação ativa ───────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#4ECDC4] mb-0.5">
            Sessão no curral
          </p>
          <h1
            className="text-[18px] sm:text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Operação em campo
          </h1>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            {nomeFazenda} · {data}
            {nomeLoteSessao ? ` · ${nomeLoteSessao}` : ""}
            {responsavel ? ` · ${responsavel}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={encerrarSessao}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-[12px] text-red-700 font-semibold hover:bg-red-50 min-h-[44px]"
        >
          Encerrar sessão
        </button>
      </div>

      <div className="space-y-4 max-w-2xl">
        {/* Animal atual */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Animal atual
          </h2>

          {animalAtual ? (
            <div className="space-y-3">
              <div className="rounded-xl border-2 border-[#4ECDC4] bg-[#4ECDC4]/[0.06] p-4">
                <div className="text-[22px] sm:text-[26px] font-bold text-gray-900 leading-tight">
                  {labelAnimal(animalAtual)}
                </div>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <dt className="text-gray-400 text-[10px] uppercase font-semibold">RFID</dt>
                    <dd className="font-medium text-gray-800">
                      {animalAtual.brincoEletronico || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 text-[10px] uppercase font-semibold">Lote</dt>
                    <dd className="font-medium text-gray-800">{loteAnimalNome}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 text-[10px] uppercase font-semibold">Sexo</dt>
                    <dd className="font-medium text-gray-800">
                      {animalAtual.sexo === "macho"
                        ? "Macho"
                        : animalAtual.sexo === "femea"
                          ? "Fêmea"
                          : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-400 text-[10px] uppercase font-semibold">ID</dt>
                    <dd className="font-medium text-gray-800">{animalAtual.id}</dd>
                  </div>
                </dl>
              </div>
              <button
                type="button"
                onClick={limparContextoAnimal}
                className="text-[11px] font-semibold text-gray-600 underline"
              >
                Trocar animal (sem concluir)
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                value={buscaAnimal}
                onChange={e => setBuscaAnimal(e.target.value)}
                placeholder="Brinco, RFID ou nome…"
                className="w-full text-[14px] border border-gray-200 rounded-lg px-4 py-3 text-gray-800 min-h-[48px] mb-2"
                autoComplete="off"
                autoFocus
              />
              {loadingAnimais ? (
                <p className="text-[11px] text-gray-400 py-2">Carregando animais…</p>
              ) : filtrados.length === 0 ? (
                <p className="text-[11px] text-gray-400 py-2">Nenhum animal encontrado neste escopo.</p>
              ) : (
                <ul className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {filtrados.map(a => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setAnimalId(a.id);
                          setBuscaAnimal("");
                          setPendentesAnimal([]);
                          setTipoEmFoco(null);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-[#4ECDC4]/[0.08] transition min-h-[48px]"
                      >
                        <span className="text-[14px] font-semibold text-gray-900">
                          {labelAnimal(a)}
                        </span>
                        {a.brincoEletronico ? (
                          <span className="text-[11px] text-gray-500 ml-2">
                            RFID {a.brincoEletronico}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {animalAtual && (
          <>
            {/* Tipos — mesmos do pontual */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Manejos neste animal
              </h2>
              <p className="text-[11px] text-gray-500 mb-3">
                Toque no tipo para registrar. Formulários completos entram na próxima etapa.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TIPOS_MANEJO.map(tipo => {
                  const Icon = tipo.icon;
                  const ativo = tipoEmFoco === tipo.id;
                  return (
                    <button
                      key={tipo.id}
                      type="button"
                      onClick={() => {
                        setTipoEmFoco(ativo ? null : tipo.id);
                        setRascunhoResumo("");
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left min-h-[52px] transition ${
                        ativo
                          ? "border-[#4ECDC4] bg-[#4ECDC4]/10"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <Icon className="h-5 w-5 text-[#4ECDC4] shrink-0" strokeWidth={ICON_STROKE} />
                      <span className="text-[13px] font-semibold text-gray-900">{tipo.label}</span>
                    </button>
                  );
                })}
              </div>

              {tipoEmFoco && (
                <div className="mt-3 rounded-lg border border-gray-200 p-3 space-y-3">
                  <p className="text-[12px] font-semibold text-gray-800">
                    {TIPOS_MANEJO.find(t => t.id === tipoEmFoco)?.label}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    Esqueleto — o formulário completo deste tipo será conectado depois, com as
                    mesmas regras do manejo pontual. Data da sessão: {data}.
                  </p>
                  <input
                    type="text"
                    value={rascunhoResumo}
                    onChange={e => setRascunhoResumo(e.target.value)}
                    placeholder="Resumo rápido (ex.: 425 kg, vacinação…)"
                    className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2.5 min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => registrarManejoPendente(tipoEmFoco)}
                    className="w-full inline-flex items-center justify-center gap-1 rounded-lg text-white text-[13px] font-semibold min-h-[48px]"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    Adicionar a este animal
                  </button>
                </div>
              )}
            </div>

            {/* Realizados nesta passagem */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
              <h2 className="text-[12px] font-semibold text-gray-800 mb-2">
                Realizados nesta sessão
              </h2>
              {resumoPorTipo.length === 0 ? (
                <p className="text-[11px] text-gray-400">Nenhum manejo neste animal ainda.</p>
              ) : (
                <ul className="space-y-1.5">
                  {resumoPorTipo.map(t => (
                    <li key={t.id} className="text-[13px] text-gray-800 flex items-center gap-2">
                      <span className="text-[#4ECDC4] font-bold">✓</span>
                      {t.label}
                      {t.count > 1 ? (
                        <span className="text-[11px] text-gray-500">({t.count})</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              onClick={concluirAnimal}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl text-white text-[14px] font-semibold min-h-[52px] hover:brightness-95"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[20px]">check_circle</span>
              Concluir animal
            </button>
          </>
        )}
      </div>
    </AppLayout>
  );
}
