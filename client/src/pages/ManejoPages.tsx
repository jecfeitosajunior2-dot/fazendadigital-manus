import AppLayout from "@/components/AppLayout";
import { CorralGateIcon } from "@/components/icons/CorralGateIcon";
import { useLocation, useSearch } from "wouter";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Nfc,
  Weight,
  Syringe,
  HeartPulse,
  ArrowLeftRight,
  Stethoscope,
  MilkOff,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
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

const MOTIVO_TROCA_OPCOES = [
  { value: "perda", label: "Perda do brinco" },
  { value: "danificado", label: "Brinco danificado" },
  { value: "reidentificacao", label: "Reidentificação" },
  { value: "erro_cadastro", label: "Erro de cadastro" },
  { value: "outro", label: "Outro" },
] as const;

type MotivoTrocaBrinco = (typeof MOTIVO_TROCA_OPCOES)[number]["value"];
type OperacaoBrinco = "rfid" | "brinco" | "ambos";

type AnimalBuscaRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  loteId?: number | null;
  loteNome?: string | null;
  fazendaId?: number | null;
  status?: string | null;
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

/** Manejo pontual — Brinco Eletrônico (fluxo funcional). */
function ManejoBrincoEletronicoForm() {
  const [, setLocation] = useLocation();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [data, setData] = useState(todayISODate);
  const [loteId, setLoteId] = useState("");
  const [buscaAnimal, setBuscaAnimal] = useState("");
  const [animalId, setAnimalId] = useState<number | null>(null);
  const [animalSel, setAnimalSel] = useState<AnimalBuscaRow | null>(null);
  const [operacao, setOperacao] = useState<OperacaoBrinco | "">("");
  const [novoRfid, setNovoRfid] = useState("");
  const [novoBrinco, setNovoBrinco] = useState("");
  const [motivo, setMotivo] = useState<MotivoTrocaBrinco | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [maisDetalhesAberto, setMaisDetalhesAberto] = useState(false);
  const [erroFazenda, setErroFazenda] = useState("");
  const [listaAberta, setListaAberta] = useState(false);
  const buscaRef = useRef<HTMLDivElement | null>(null);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const buscaAtiva = Boolean(fazendaNum) && buscaAnimal.trim().length >= 1 && !animalSel;

  const { data: animaisBusca = [], isFetching: buscandoAnimais } = trpc.animais.list.useQuery(
    {
      fazendaId: fazendaNum || undefined,
      loteId: loteId ? Number(loteId) : undefined,
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

  const limparOperacao = () => {
    setOperacao("");
    setNovoRfid("");
    setNovoBrinco("");
    setMotivo("");
  };

  const limparAnimal = () => {
    setAnimalId(null);
    setAnimalSel(null);
    setBuscaAnimal("");
    setListaAberta(false);
    limparOperacao();
  };

  const limparDependentesFazenda = () => {
    setLoteId("");
    limparAnimal();
  };

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
      setLoteId("");
      setAnimalId(null);
      setAnimalSel(null);
      setBuscaAnimal("");
      setListaAberta(false);
      setOperacao("");
      setNovoRfid("");
      setNovoBrinco("");
      setMotivo("");
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

  const lotesDaFazenda = useMemo(() => {
    if (!fazendaNum) return [];
    return lotes.filter(l => l.fazendaId === fazendaNum);
  }, [lotes, fazendaNum]);

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

  const onChangeLote = (value: string) => {
    setLoteId(value);
    limparAnimal();
  };

  const selecionarAnimal = (a: AnimalBuscaRow) => {
    setAnimalId(a.id);
    setAnimalSel(a);
    setBuscaAnimal(labelAnimalBusca(a));
    setListaAberta(false);
    if (a.loteId) setLoteId(String(a.loteId));
    limparOperacao();
  };

  const brincoAtual = animalSel?.brinco?.trim() || "";
  const rfidAtual = animalSel?.brincoEletronico?.trim() || "";
  const temRfidAtual = Boolean(rfidAtual);
  const mostraNovoRfid = operacao === "rfid" || operacao === "ambos";
  const mostraNovoBrinco = operacao === "brinco" || operacao === "ambos";
  const exigeMotivo =
    operacao === "brinco" ||
    operacao === "ambos" ||
    (operacao === "rfid" && temRfidAtual);

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
    if (mostraNovoRfid && !novoRfid.trim()) {
      toast.error("Informe o novo RFID.");
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

    saveMutation.mutate({
      fazendaId: Number(fazendaId),
      data,
      loteId: loteId ? Number(loteId) : null,
      animalId,
      operacao,
      novoRfid: mostraNovoRfid ? novoRfid.trim() : undefined,
      novoBrinco: mostraNovoBrinco ? novoBrinco.trim() : undefined,
      motivo: exigeMotivo && motivo ? motivo : undefined,
      observacoes: observacoes.trim() || undefined,
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
            onClick={() => setLocation("/manejo/registros")}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={saveMutation.isPending}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {unicaFazenda && fazendaId && nomeFazenda ? (
              <div className="sm:col-span-2">
                <p className="text-[11px] text-gray-500">
                  Fazenda:{" "}
                  <span className="font-medium text-gray-800">{nomeFazenda}</span>
                </p>
              </div>
            ) : (
              <div className="sm:col-span-2">
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

            <div>
              <label className={labelCls}>Data</label>
              <input
                type="date"
                value={data}
                onChange={e => setData(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Lote</label>
              <select
                value={loteId}
                onChange={e => onChangeLote(e.target.value)}
                className={fieldCls}
                disabled={!fazendaId}
              >
                <option value="">Selecione um lote</option>
                {lotesDaFazenda.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Animal */}
        <div className="border-t border-gray-100 pt-5">
          <p className={sectionTitleCls}>Animal</p>
          <label className={labelCls}>
            Animal<span className="text-red-500">*</span>
          </label>
          {animalSel ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#4ECDC4]/40 bg-[#4ECDC4]/[0.06] px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">
                  {labelAnimalBusca(animalSel)}
                </div>
                {subtituloAnimalBusca(animalSel) ? (
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {subtituloAnimalBusca(animalSel)}
                  </div>
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

          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/70 px-4 py-3">
            <p className="text-[11px] font-semibold text-gray-600 mb-2">Identificação atual</p>
            {animalSel ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                <div>
                  <dt className="text-gray-400 text-[10px] uppercase font-semibold">
                    Brinco visual
                  </dt>
                  <dd className="font-medium text-gray-800 mt-0.5">
                    {brincoAtual || "Não vinculado"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400 text-[10px] uppercase font-semibold">RFID</dt>
                  <dd className="font-medium text-gray-800 mt-0.5">
                    {rfidAtual || "Não vinculado"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-[11px] text-gray-400">
                Selecione um animal para ver brinco e RFID atuais.
              </p>
            )}
          </div>
        </div>

        {/* Operação */}
        <div className="border-t border-gray-100 pt-5">
          <p className={sectionTitleCls}>Operação</p>
          <label className={labelCls}>
            Operação<span className="text-red-500">*</span>
          </label>
          <select
            value={operacao}
            onChange={e => {
              setOperacao(e.target.value as OperacaoBrinco | "");
              setNovoRfid("");
              setNovoBrinco("");
              setMotivo("");
            }}
            disabled={!animalSel}
            className={fieldCls}
          >
            <option value="">Selecione a operação</option>
            <option value="rfid">{temRfidAtual ? "Trocar RFID" : "Vincular RFID"}</option>
            <option value="brinco">Trocar brinco</option>
            <option value="ambos">
              {temRfidAtual ? "Trocar brinco e RFID" : "Trocar brinco e vincular RFID"}
            </option>
          </select>

          {mostraNovoRfid || mostraNovoBrinco || exigeMotivo ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {mostraNovoRfid ? (
                <div className={mostraNovoBrinco ? "" : "sm:col-span-2"}>
                  <label className={labelCls}>
                    Novo RFID<span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoRfid}
                    onChange={e => setNovoRfid(e.target.value)}
                    className={fieldCls}
                    placeholder="Informe o RFID"
                    autoComplete="off"
                  />
                </div>
              ) : null}
              {mostraNovoBrinco ? (
                <div className={mostraNovoRfid ? "" : "sm:col-span-2"}>
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
              {exigeMotivo ? (
                <div className="sm:col-span-2">
                  <label className={labelCls}>
                    Motivo<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={motivo}
                    onChange={e => setMotivo(e.target.value as MotivoTrocaBrinco | "")}
                    className={fieldCls}
                  >
                    <option value="">Selecione o motivo</option>
                    {MOTIVO_TROCA_OPCOES.map(o => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Mais detalhes */}
        <div className="border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setMaisDetalhesAberto(v => !v)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900 transition"
            aria-expanded={maisDetalhesAberto}
          >
            <span className="material-icons text-[16px]">
              {maisDetalhesAberto ? "expand_less" : "expand_more"}
            </span>
            Mais detalhes
          </button>
          {maisDetalhesAberto ? (
            <div className="mt-3">
              <label className={labelCls}>Observações</label>
              <textarea
                rows={2}
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                className={`${fieldCls} resize-none`}
                placeholder="Adicione uma observação, se necessário."
              />
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
