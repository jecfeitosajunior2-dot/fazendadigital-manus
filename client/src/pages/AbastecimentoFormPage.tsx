import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  fazendaControlaEstoqueCombustivel,
  findCombustivelReferenciaCatalogo,
  getCombustivelLabel,
  getCombustivelItens,
  getSaldoLitros,
  getValorLitroEstoque,
  temCombustivelCadastrado,
} from "@/lib/combustivel-estoque";
import { produtoControlaSaldo } from "@shared/estoqueControle";
import { formatDateBR, parseLocalDate } from "@/lib/date-utils";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
} from "@/components/FormFields";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";

/** Card de formulário — padrão Nova Venda / Cadastro de Produto */
function FormCard({
  title,
  variant = "section",
  children,
  footer,
}: {
  title: string;
  variant?: "page" | "section";
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const hasBody = Boolean(children) || Boolean(footer);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className={cn("px-5 py-4", hasBody && "border-b border-gray-100")}>
        {variant === "page" ? (
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {title}
          </h1>
        ) : (
          <h2 className="text-[13px] font-semibold text-[#4ECDC4]">{title}</h2>
        )}
      </div>
      {hasBody ? (
        <div className="p-5 space-y-4">
          {children}
          {footer ? (
            <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const COMBUSTIVEIS = [
  { value: "diesel", label: "Diesel" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "arla", label: "Arla" },
] as const;

type Combustivel = (typeof COMBUSTIVEIS)[number]["value"];
type OrigemCombustivel = "estoque" | "externo";
type MedidorTipo = "horimetro" | "quilometragem";

type FormState = {
  data: string;
  /** Fazenda da máquina (filtra a lista de máquinas). */
  fazendaMaquinaId: string;
  maquinaId: string;
  combustivel: Combustivel | "";
  litros: string;
  horimetro: string;
  origem: OrigemCombustivel;
  /**
   * Fazenda de onde sai o combustível do estoque.
   * Mantido alinhado à Fazenda da máquina (sem seletor separado).
   */
  fazendaId: string;
  valorLitro: string;
  /** ID em Financeiro → Pessoas (compra externa / posto). */
  fornecedorId: string;
  responsavel: string;
  observacoes: string;
};

const emptyForm = (): FormState => ({
  data: new Date().toISOString().slice(0, 10),
  fazendaMaquinaId: "",
  maquinaId: "",
  combustivel: "",
  litros: "",
  horimetro: "",
  origem: "estoque",
  fazendaId: "",
  valorLitro: "",
  fornecedorId: "",
  responsavel: "",
  observacoes: "",
});

function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Medidor da máquina: usa tipoMedidor cadastrado; fallback por Tipo (legado). */
function inferMedidorPorTipo(tipo: string | null | undefined): MedidorTipo | null {
  if (!tipo?.trim()) return null;
  const t = tipo.trim();
  const veiculos = new Set(["Veículos", "Caminhão", "Carreta", "Carro", "Moto"]);
  const horas = new Set([
    "Máquinas",
    "Equipamentos com Motor",
    "Trator",
    "Colheitadeira",
    "Plantadeira",
    "Pulverizador",
  ]);
  if (veiculos.has(t)) return "quilometragem";
  if (horas.has(t)) return "horimetro";
  return null;
}

function getMedidorTipo(maquina?: {
  tipo?: string | null;
  tipoMedidor?: string | null;
} | null): MedidorTipo | null {
  const tm = maquina?.tipoMedidor?.trim();
  if (tm === "horimetro") return "horimetro";
  if (tm === "quilometragem") return "quilometragem";
  if (tm === "sem_medidor") return null;
  return inferMedidorPorTipo(maquina?.tipo);
}

function formatLeitura(valor: number, medidor: MedidorTipo | null): string {
  const num = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (medidor === "quilometragem") return `${num} km`;
  if (medidor === "horimetro") return `${num} h`;
  return num;
}

function formatLitros(valor: number): string {
  const inteiro = Math.abs(valor - Math.round(valor)) < 1e-9;
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: inteiro ? 0 : 2,
  })} L`;
}

type CampoObrigatorioAbastecimento =
  | "data"
  | "fazendaMaquinaId"
  | "maquinaId"
  | "combustivel"
  | "litros"
  | "fazendaId"
  | "valorLitro";

const TOAST_ID_OBRIGATORIOS = "abastecimento-obrigatorios";

const ABASTECIMENTO_DRAFT_KEY = "fd:abastecimento-form-draft";

type AbastecimentoDraft = {
  form: FormState;
  initializedForId: number | null;
};

const btnAcaoBaseCls =
  "inline-flex items-center justify-center h-[30px] px-3 rounded text-[11px] font-semibold transition shrink-0";

const btnAcaoPrimariaCls = cn(btnAcaoBaseCls, "text-white hover:brightness-95 active:scale-[0.97]");

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

export default function AbastecimentoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const fazendaIdParam = getSearchParam("fazendaId");
  const retornoUrl = (() => {
    const raw = getSearchParam("retorno");
    if (!raw) return null;
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
    } catch {
      /* ignore */
    }
    return null;
  })();
  const voltarLista = () => {
    if (retornoUrl) {
      setLocation(retornoUrl);
      return;
    }
    const fid = form.fazendaMaquinaId || fazendaIdParam || "";
    setLocation(
      fid
        ? `/maquinas/abastecimento?fazendaId=${encodeURIComponent(fid)}`
        : "/maquinas/abastecimento",
    );
  };
  const initializedForId = useRef<number | null>(null);
  const draftRestoredRef = useRef(false);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [erros, setErros] = useState<Partial<Record<CampoObrigatorioAbastecimento, string>>>({});

  const limparErro = (campo: CampoObrigatorioAbastecimento) => {
    setErros(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === "data") limparErro("data");
    if (key === "fazendaMaquinaId") limparErro("fazendaMaquinaId");
    if (key === "maquinaId") limparErro("maquinaId");
    if (key === "combustivel") limparErro("combustivel");
    if (key === "litros") limparErro("litros");
    if (key === "fazendaId") limparErro("fazendaId");
    if (key === "valorLitro") limparErro("valorLitro");
  };

  const { data: registro, isLoading } = trpc.abastecimentos.get.useQuery(
    { id: editId },
    { enabled: isEdit }
  );

  const maquinaIdNum = Number(form.maquinaId) || undefined;

  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();

  const maquinasOperacionais = useMemo(() => {
    const fazendaFiltro = form.fazendaMaquinaId || fazendaIdParam || "";
    const ativas = maquinas.filter(m => {
      if ((m as { dataDesativacao?: unknown }).dataDesativacao) return false;
      if (String(m.status || "").toLowerCase() === "inativo") return false;
      if (fazendaFiltro && String(m.fazendaId) !== fazendaFiltro) return false;
      return true;
    });
    // Em edição, mantém a máquina do registro mesmo se estiver Inativa (histórico).
    if (isEdit && form.maquinaId) {
      const atual = maquinas.find(m => String(m.id) === form.maquinaId);
      if (atual && !ativas.some(a => a.id === atual.id)) {
        return [...ativas, atual].sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
        );
      }
    }
    return [...ativas].sort((a, b) =>
      String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"),
    );
  }, [maquinas, isEdit, form.maquinaId, form.fazendaMaquinaId, fazendaIdParam]);

  const fazendaContextoId = form.fazendaMaquinaId || fazendaIdParam || "";
  const semFazendaContexto = !isEdit && !fazendaContextoId;
  const { data: estoque = [] } = trpc.estoque.list.useQuery();
  const { data: movimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery();
  const { data: fornecedores = [] } = trpc.pessoas.list.useQuery({ tipo: "fornecedor" });
  const { data: user } = trpc.auth.me.useQuery();
  const { data: historicoMaquina = [] } = trpc.abastecimentos.list.useQuery(
    { maquinaId: maquinaIdNum },
    { enabled: !!maquinaIdNum }
  );
  const utils = trpc.useUtils();

  const createMutation = trpc.abastecimentos.create.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(ABASTECIMENTO_DRAFT_KEY);
      utils.abastecimentos.list.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.listMovimentacoes.invalidate();
      toast.success("Abastecimento registrado!");
      voltarLista();
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.abastecimentos.update.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(ABASTECIMENTO_DRAFT_KEY);
      utils.abastecimentos.list.invalidate();
      utils.estoque.list.invalidate();
      utils.estoque.listMovimentacoes.invalidate();
      toast.success("Abastecimento atualizado!");
      voltarLista();
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novoFornecedorId = params.get("fornecedorId");
    const raw = sessionStorage.getItem(ABASTECIMENTO_DRAFT_KEY);

    if (raw) {
      try {
        const draft = JSON.parse(raw) as AbastecimentoDraft;
        setForm(draft.form);
        initializedForId.current = draft.initializedForId;
        draftRestoredRef.current = true;
      } catch {
        /* rascunho inválido */
      }
      sessionStorage.removeItem(ABASTECIMENTO_DRAFT_KEY);
    }

    if (novoFornecedorId) {
      setForm(f => ({ ...f, fornecedorId: novoFornecedorId }));
      params.delete("fornecedorId");
    }

    let urlLimpa = Boolean(novoFornecedorId);
    if (params.has("produtoId")) {
      params.delete("produtoId");
      urlLimpa = true;
    }

    if (urlLimpa) {
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  /** Ao voltar da movimentação, recarrega saldo e custo médio do estoque. */
  useEffect(() => {
    if (!draftRestoredRef.current) return;
    void Promise.all([
      utils.estoque.list.refetch(),
      utils.estoque.listMovimentacoes.refetch(),
    ]);
  }, [utils]);

  useEffect(() => {
    if (!isEdit || !registro) return;
    if (String(registro.status ?? "registrado") === "estornado") {
      toast.error("Abastecimento estornado não pode ser editado.");
      voltarLista();
    }
  }, [isEdit, registro, setLocation]);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    const maquinaDoRegistro = maquinas.find(m => m.id === registro.maquinaId);
    setForm({
      data: toDateInput(registro.data),
      fazendaMaquinaId: maquinaDoRegistro?.fazendaId
        ? String(maquinaDoRegistro.fazendaId)
        : "",
      maquinaId: String(registro.maquinaId),
      combustivel: (registro.combustivel as Combustivel) ?? "",
      litros: registro.litros ? String(registro.litros) : "",
      horimetro: registro.horimetro ?? "",
      origem: registro.abastecidoNaFazenda ? "estoque" : "externo",
      fazendaId: registro.fazendaId ? String(registro.fazendaId) : "",
      valorLitro: registro.valorLitro
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorLitro)) * 100)))
        : "",
      fornecedorId: "",
      responsavel: registro.responsavel ?? "",
      observacoes: registro.observacoes ?? "",
    });
    initializedForId.current = registro.id;
  }, [isEdit, registro, maquinas]);

  useEffect(() => {
    if (!isEdit || !registro?.fornecedor?.trim() || form.fornecedorId || !fornecedores.length) return;
    const nome = registro.fornecedor.trim().toLowerCase();
    const match = fornecedores.find(f => f.nome.trim().toLowerCase() === nome);
    if (match) setForm(f => ({ ...f, fornecedorId: String(match.id) }));
  }, [isEdit, registro, fornecedores, form.fornecedorId]);

  /** Novo abastecimento: fazenda vem da lista (URL ou persistida). */
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (isEdit || form.fazendaMaquinaId) return;
    const candidato = fazendaIdParam || (() => {
      const persisted = readPersistedRebanhoFazendaId();
      return persisted != null ? String(persisted) : "";
    })();
    if (!candidato) return;
    const existe = fazendas.some(f => String(f.id) === candidato);
    if (existe) {
      setForm(f => ({
        ...f,
        fazendaMaquinaId: candidato,
        ...(f.origem === "estoque" ? { fazendaId: candidato } : {}),
      }));
      persistRebanhoFazendaId(Number(candidato));
    }
  }, [isEdit, form.fazendaMaquinaId, fazendaIdParam, fazendas]);

  useEffect(() => {
    if (isEdit || form.responsavel || !user?.name) return;
    set("responsavel", user.name);
  }, [isEdit, user?.name, form.responsavel]);

  const maquinaSelecionada = useMemo(
    () => maquinas.find(m => String(m.id) === form.maquinaId) ?? null,
    [maquinas, form.maquinaId],
  );

  const medidorTipo = getMedidorTipo(maquinaSelecionada);
  const origemEstoque = form.origem === "estoque";

  const fornecedorOpcoes = useMemo(
    () => fornecedores.map(f => ({ value: String(f.id), label: f.nome })),
    [fornecedores],
  );

  const nomeFornecedorSelecionado = useMemo(() => {
    const p = fornecedores.find(f => String(f.id) === form.fornecedorId);
    return p?.nome?.trim() ?? "";
  }, [fornecedores, form.fornecedorId]);

  const statsHistorico = useMemo(() => {
    const registros = historicoMaquina
      .filter(r => String(r.status ?? "registrado") !== "estornado")
      .filter(r => !isEdit || r.id !== editId)
      .sort((a, b) => {
        const da = a.data ? (parseLocalDate(a.data)?.getTime() ?? 0) : 0;
        const db = b.data ? (parseLocalDate(b.data)?.getTime() ?? 0) : 0;
        return db - da;
      });

    const ultimo = registros[0] ?? null;
    const leituraAbastecimento = ultimo?.horimetro ? parseFloat(String(ultimo.horimetro)) : null;
    const leituraCadastro = maquinaSelecionada?.horimetro
      ? parseFloat(String(maquinaSelecionada.horimetro))
      : null;
    const leituraAnteriorNum =
      leituraAbastecimento != null && !Number.isNaN(leituraAbastecimento)
        ? leituraAbastecimento
        : leituraCadastro != null && !Number.isNaN(leituraCadastro)
          ? leituraCadastro
          : null;
    const leituraAnteriorFmt =
      leituraAnteriorNum != null && !Number.isNaN(leituraAnteriorNum)
        ? formatLeitura(leituraAnteriorNum, medidorTipo)
        : "—";

    const leituraAtual = form.horimetro ? parseFloat(form.horimetro.replace(",", ".")) : null;
    const leituraInvalida =
      leituraAtual !== null &&
      leituraAnteriorNum !== null &&
      !Number.isNaN(leituraAtual) &&
      !Number.isNaN(leituraAnteriorNum) &&
      leituraAtual < leituraAnteriorNum;

    const dataUltimo = ultimo?.data ? formatDateBR(ultimo.data) : "—";

    let consumoMedio = "—";
    const comLeitura = registros.filter(r => r.horimetro && r.litros);
    if (comLeitura.length >= 1 && medidorTipo === "horimetro") {
      const totalLitros = comLeitura.reduce((s, r) => s + parseFloat(String(r.litros || 0)), 0);
      const totalHoras = comLeitura.reduce((s, r) => s + parseFloat(String(r.horimetro || 0)), 0);
      if (totalHoras > 0) {
        consumoMedio =
          (totalLitros / totalHoras).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) +
          " L/hora";
      }
    } else if (comLeitura.length >= 2 && medidorTipo === "quilometragem") {
      const ordenados = [...comLeitura].sort(
        (a, b) => parseFloat(String(a.horimetro || 0)) - parseFloat(String(b.horimetro || 0)),
      );
      const primeiro = ordenados[0];
      const ultimoKm = ordenados[ordenados.length - 1];
      const km =
        parseFloat(String(ultimoKm.horimetro || 0)) - parseFloat(String(primeiro.horimetro || 0));
      const litros = ordenados.reduce((s, r) => s + parseFloat(String(r.litros || 0)), 0);
      if (km > 0) {
        consumoMedio =
          (litros / km).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) + " L/km";
      }
    }

    return {
      leituraAnteriorFmt,
      leituraAnteriorNum,
      dataUltimo,
      consumoMedio,
      leituraInvalida,
      ultimo,
    };
  }, [historicoMaquina, isEdit, editId, form.horimetro, medidorTipo, maquinaSelecionada]);

  const { leituraInvalida, leituraAnteriorFmt, leituraAnteriorNum } = statsHistorico;

  /** Com origem estoque, a Fazenda do combustível é a mesma da lista (contexto). */
  const fazendaEstoqueId = origemEstoque ? fazendaContextoId : "";

  const fazendaIdNum = fazendaContextoId ? Number(fazendaContextoId) : null;

  const combustivelInsumosCtx = useMemo(() => {
    if (!form.combustivel || !fazendaIdNum) return null;
    const naFazenda = getCombustivelItens(estoque, fazendaIdNum, form.combustivel)[0];
    if (naFazenda?.id) {
      return produtoControlaSaldo(naFazenda.controlarSaldo)
        ? { status: "estocavel" as const }
        : { status: "uso_imediato" as const, estoqueId: naFazenda.id };
    }
    const ref = findCombustivelReferenciaCatalogo(estoque, form.combustivel);
    if (ref?.id) {
      return { status: "precisa_vincular" as const, estoqueReferenciaId: ref.id };
    }
    return { status: "nao_cadastrado" as const };
  }, [estoque, fazendaIdNum, form.combustivel]);

  const permiteAbastecimentoEstoque = useMemo(() => {
    if (!fazendaIdNum || !form.combustivel) return false;
    return fazendaControlaEstoqueCombustivel(
      estoque,
      fazendaIdNum,
      form.combustivel,
      produtoControlaSaldo,
    );
  }, [estoque, fazendaIdNum, form.combustivel]);

  const combustivelUsoImediatoNaFazenda = useMemo(() => {
    if (!fazendaIdNum || !form.combustivel) return false;
    return (
      temCombustivelCadastrado(estoque, fazendaIdNum, form.combustivel) &&
      !permiteAbastecimentoEstoque
    );
  }, [estoque, fazendaIdNum, form.combustivel, permiteAbastecimentoEstoque]);

  useEffect(() => {
    if (permiteAbastecimentoEstoque || !combustivelUsoImediatoNaFazenda) return;
    if (form.origem !== "estoque") return;
    setForm(f => ({
      ...f,
      origem: "externo",
      valorLitro: f.valorLitro || "",
      fazendaId: "",
    }));
  }, [permiteAbastecimentoEstoque, combustivelUsoImediatoNaFazenda, form.origem]);

  useEffect(() => {
    if (!origemEstoque) {
      if (form.fazendaId) setForm(f => ({ ...f, fazendaId: "" }));
      return;
    }
    if (form.fazendaMaquinaId && form.fazendaId !== form.fazendaMaquinaId) {
      setForm(f => ({ ...f, fazendaId: form.fazendaMaquinaId }));
    }
  }, [origemEstoque, form.fazendaMaquinaId, form.fazendaId]);

  const estoqueAtualLitros = useMemo(() => {
    if (!origemEstoque || !fazendaEstoqueId || !form.combustivel) return null;
    return getSaldoLitros(estoque, Number(fazendaEstoqueId), form.combustivel, movimentacoes);
  }, [estoque, movimentacoes, origemEstoque, fazendaEstoqueId, form.combustivel]);

  const valorLitroEstoque = useMemo(() => {
    if (!origemEstoque || !fazendaEstoqueId || !form.combustivel) return null;
    return getValorLitroEstoque(
      estoque,
      Number(fazendaEstoqueId),
      form.combustivel,
      movimentacoes,
    );
  }, [estoque, movimentacoes, origemEstoque, fazendaEstoqueId, form.combustivel]);

  const semEstoqueNaFazenda =
    origemEstoque &&
    permiteAbastecimentoEstoque &&
    !!fazendaEstoqueId &&
    !!form.combustivel &&
    (estoqueAtualLitros == null || estoqueAtualLitros <= 0);

  const produtoCombustivelId = useMemo(() => {
    if (!fazendaEstoqueId || !form.combustivel) return undefined;
    const id = getCombustivelItens(estoque, Number(fazendaEstoqueId), form.combustivel)[0]?.id;
    return id != null && id > 0 ? id : undefined;
  }, [estoque, fazendaEstoqueId, form.combustivel]);

  const retornoAtual = () => window.location.pathname + window.location.search;

  const persistirRascunho = () => {
    const draft: AbastecimentoDraft = {
      form,
      initializedForId: initializedForId.current,
    };
    sessionStorage.setItem(ABASTECIMENTO_DRAFT_KEY, JSON.stringify(draft));
  };

  const irCadastrarFornecedor = () => {
    persistirRascunho();
    const retorno = window.location.pathname + window.location.search;
    setLocation(`/financeiro/pessoas?novo=fornecedor&retorno=${encodeURIComponent(retorno)}`);
  };

  const irRegistrarEntrada = (estoqueId?: number) => {
    persistirRascunho();
    const qs = new URLSearchParams();
    if (fazendaEstoqueId) qs.set("fazendaId", fazendaEstoqueId);
    qs.set("retorno", retornoAtual());
    if (form.combustivel) qs.set("combustivel", form.combustivel);
    if (estoqueId != null && estoqueId > 0) qs.set("produtoId", String(estoqueId));
    setLocation(`/insumos/nova-movimentacao?${qs.toString()}`);
  };

  const irInsumosCadastro = (estoqueReferenciaId?: number) => {
    persistirRascunho();
    const qs = new URLSearchParams();
    if (fazendaContextoId) qs.set("fazendaId", fazendaContextoId);
    if (estoqueReferenciaId != null && estoqueReferenciaId > 0) {
      qs.set("id", String(estoqueReferenciaId));
    } else if (form.combustivel) {
      qs.set("nome", getCombustivelLabel(form.combustivel));
    }
    qs.set("retorno", retornoAtual());
    setLocation(`/insumos/cadastro?${qs.toString()}`);
  };

  const custoMedioIndisponivel =
    origemEstoque &&
    !!fazendaEstoqueId &&
    !!form.combustivel &&
    !semEstoqueNaFazenda &&
    (valorLitroEstoque == null || valorLitroEstoque <= 0);

  const valorLitroNumero = useMemo(() => {
    if (origemEstoque) return valorLitroEstoque != null && valorLitroEstoque > 0 ? valorLitroEstoque : null;
    const parsed = parseFloat(parseCurrencyBrl(form.valorLitro) || "");
    return Number.isNaN(parsed) || !form.valorLitro ? null : parsed;
  }, [origemEstoque, valorLitroEstoque, form.valorLitro]);

  const valorTotalPreview = useMemo(() => {
    const litros = parseFloat(form.litros.replace(",", "."));
    if (Number.isNaN(litros) || litros <= 0 || valorLitroNumero == null) return "";
    return (litros * valorLitroNumero).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, [form.litros, valorLitroNumero]);

  const pending = createMutation.isPending || updateMutation.isPending;

  const hojeISO = new Date().toISOString().slice(0, 10);
  const litrosNumForm = parseFloat(form.litros.replace(",", "."));
  const litrosValidos =
    form.litros.trim() !== "" && !Number.isNaN(litrosNumForm) && litrosNumForm > 0;
  const quantidadeAcimaSaldo =
    origemEstoque &&
    estoqueAtualLitros != null &&
    litrosValidos &&
    litrosNumForm > estoqueAtualLitros;

  const avisoOrigemEstoqueIndisponivel = () => {
    toast.error(
      combustivelUsoImediatoNaFazenda
        ? "Nesta fazenda o combustível é de uso imediato. Selecione Compra externa / Posto."
        : `Cadastre ${form.combustivel ? getCombustivelLabel(form.combustivel) : "o combustível"} em Insumos com Controlar saldo: Sim para usar o estoque da fazenda.`,
    );
  };

  const handleOrigemChange = (v: OrigemCombustivel) => {
    if (v === "estoque" && !permiteAbastecimentoEstoque) {
      avisoOrigemEstoqueIndisponivel();
      return;
    }
    setForm(f => ({
      ...f,
      origem: v,
      ...(v === "estoque"
        ? {
            valorLitro: "",
            fazendaId: f.fazendaMaquinaId || fazendaIdParam || "",
            fornecedorId: "",
          }
        : { fazendaId: "" }),
    }));
    limparErro("fazendaId");
    limparErro("valorLitro");
  };

  const handleMaquinaChange = (maquinaId: string) => {
    setForm(f => ({ ...f, maquinaId, horimetro: "" }));
    limparErro("maquinaId");
  };

  const handleCombustivelChange = (combustivel: Combustivel | "") => {
    setForm(f => ({
      ...f,
      combustivel,
      ...(f.origem === "estoque" ? { valorLitro: "" } : {}),
    }));
    limparErro("combustivel");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;

    const next: Partial<Record<CampoObrigatorioAbastecimento, string>> = {};
    if (!form.data.trim()) next.data = "Informe a data do abastecimento.";
    if (!form.fazendaMaquinaId && !fazendaIdParam) {
      toast.error("Selecione uma fazenda na lista de abastecimentos antes de registrar.");
      voltarLista();
      return;
    }
    if (!form.maquinaId) next.maquinaId = "Selecione a máquina.";
    if (!form.combustivel) next.combustivel = "Selecione o combustível.";
    if (!form.litros.trim()) next.litros = "Informe a quantidade abastecida.";
    if (origemEstoque && !fazendaEstoqueId) {
      toast.error("Selecione uma fazenda na lista de abastecimentos antes de usar o estoque.");
      voltarLista();
      return;
    }
    if (!origemEstoque && !form.valorLitro.trim()) {
      next.valorLitro = "Informe o valor por litro.";
    }

    if (Object.keys(next).length > 0) {
      setErros(next);
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      const ordem: CampoObrigatorioAbastecimento[] = [
        "maquinaId",
        "data",
        "combustivel",
        "litros",
        "valorLitro",
      ];
      const primeiro = ordem.find(c => next[c]);
      if (primeiro) {
        requestAnimationFrame(() => {
          const el = document.getElementById(`abast-field-${primeiro}`);
          if (el instanceof HTMLElement) {
            el.focus({ preventScroll: true });
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      }
      return;
    }

    setErros({});

    if (form.data > hojeISO) return toast.error("A data do abastecimento não pode ser futura.");
    if (origemEstoque && !permiteAbastecimentoEstoque) {
      return toast.error(
        "Esta fazenda não controla estoque de combustível. Use Compra externa / Posto.",
      );
    }
    if (origemEstoque && semEstoqueNaFazenda) {
      return toast.error("Não há estoque disponível deste combustível na Fazenda selecionada.");
    }
    if (leituraInvalida && leituraAnteriorNum != null) {
      return toast.error(
        `A leitura informada não pode ser menor que a última leitura registrada: ${formatLeitura(leituraAnteriorNum, medidorTipo)}.`,
      );
    }

    const litrosNum = parseFloat(form.litros.replace(",", "."));
    if (Number.isNaN(litrosNum) || litrosNum <= 0) {
      setErros({ litros: "Informe uma quantidade abastecida válida." });
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      return;
    }

    if (origemEstoque) {
      const saldo =
        fazendaEstoqueId && form.combustivel
          ? getSaldoLitros(estoque, Number(fazendaEstoqueId), form.combustivel, movimentacoes)
          : 0;
      if (saldo <= 0) {
        return toast.error("Não há estoque disponível deste combustível na Fazenda selecionada.");
      }
      if (litrosNum > saldo) {
        return toast.error(
          `O estoque disponível é de ${formatLitros(saldo)}. Informe uma quantidade igual ou inferior ao saldo.`,
        );
      }
      if (valorLitroEstoque == null || valorLitroEstoque <= 0) {
        return toast.error("Custo médio não disponível para este combustível na Fazenda selecionada.");
      }
    }

    if (!origemEstoque) {
      if (valorLitroNumero == null || valorLitroNumero <= 0) {
        setErros({ valorLitro: "Informe um valor por litro válido." });
        toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
        return;
      }
    }

    const valorLitroFinal = origemEstoque
      ? valorLitroEstoque != null
        ? valorLitroEstoque.toFixed(3)
        : undefined
      : form.valorLitro
        ? parseCurrencyBrl(form.valorLitro)
        : undefined;

    const valorTotalFinal =
      valorLitroFinal && !Number.isNaN(litrosNum)
        ? (litrosNum * parseFloat(valorLitroFinal)).toFixed(2)
        : undefined;

    const payload = {
      maquinaId: Number(form.maquinaId),
      data: form.data,
      combustivel: form.combustivel as Combustivel,
      litros: form.litros.replace(",", "."),
      horimetro: medidorTipo && form.horimetro.trim() ? form.horimetro.trim() : undefined,
      abastecidoNaFazenda: origemEstoque,
      fazendaId: origemEstoque && fazendaEstoqueId ? Number(fazendaEstoqueId) : null,
      valorLitro: valorLitroFinal,
      valorTotal: valorTotalFinal,
      responsavel: form.responsavel.trim() || undefined,
      observacoes: form.observacoes.trim() || undefined,
      fornecedor:
        !origemEstoque && nomeFornecedorSelecionado ? nomeFornecedorSelecionado : null,
    };

    if (isEdit) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const medidorLabel =
    medidorTipo === "quilometragem" ? "Quilometragem atual" : "Horímetro atual";
  const medidorSufixo = medidorTipo === "quilometragem" ? "km" : "h";
  const leituraAnteriorCardLabel =
    medidorTipo === "quilometragem"
      ? "Leitura anterior (km)"
      : medidorTipo === "horimetro"
        ? "Leitura anterior (h)"
        : "Leitura anterior";

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  const tituloForm = isEdit ? "Editar Abastecimento" : "Novo Abastecimento";

  if (semFazendaContexto) {
    return (
      <AppLayout>
        <button
          type="button"
          onClick={voltarLista}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span className="text-[13px]">Voltar</span>
        </button>
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-12 text-center">
          <h2 className="text-[16px] font-semibold text-gray-900">Selecione uma fazenda</h2>
          <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
            Escolha a fazenda na lista de abastecimentos antes de registrar um novo abastecimento.
          </p>
          <button
            type="button"
            onClick={voltarLista}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 transition"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Ir para abastecimentos
          </button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltarLista}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-5">
        {/* ── 1. Dados do abastecimento ─────────────────────────────────── */}
        <FormCard variant="page" title={tituloForm}>
            {/* Linha 1 — Máquina | Data (como manutenção: máquina + tipo, depois datas) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <FormLabel required>Máquina</FormLabel>
                <FormNativeSelect
                  variant="light"
                  id="abast-field-maquinaId"
                  value={form.maquinaId}
                  onChange={handleMaquinaChange}
                  placeholder="Selecione a máquina"
                  required
                  options={maquinasOperacionais.map(m => ({ value: String(m.id), label: m.nome }))}
                  invalid={!!erros.maquinaId}
                  aria-describedby={erros.maquinaId ? "abast-err-maquinaId" : undefined}
                />
                <FieldErrorMsg id="abast-err-maquinaId" message={erros.maquinaId} />
              </div>
              <div className="min-w-0">
                <FormLabel required>Data do abastecimento</FormLabel>
                <FormDatePicker
                  id="abast-field-data"
                  value={form.data}
                  onChange={v => set("data", v)}
                  placeholder="Selecione a data"
                  required
                  max={hojeISO}
                  minHeight={34}
                  variant="light"
                  invalid={!!erros.data}
                  aria-describedby={erros.data ? "abast-err-data" : undefined}
                />
                <FieldErrorMsg id="abast-err-data" message={erros.data} />
              </div>
            </div>

            {/* Linha 2 — Combustível | Quantidade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="min-w-0">
                <FormLabel required>Combustível</FormLabel>
                <FormNativeSelect
                  variant="light"
                  id="abast-field-combustivel"
                  value={form.combustivel}
                  onChange={v => handleCombustivelChange(v as Combustivel | "")}
                  placeholder="Selecione o combustível"
                  required
                  options={COMBUSTIVEIS.map(c => ({
                    value: c.value,
                    label: c.label,
                  }))}
                  invalid={!!erros.combustivel}
                  aria-describedby={erros.combustivel ? "abast-err-combustivel" : undefined}
                />
                <FieldErrorMsg id="abast-err-combustivel" message={erros.combustivel} />
              </div>
              <div className="min-w-0">
                <FormLabel required>Quantidade abastecida (L)</FormLabel>
                <FormInput
                  id="abast-field-litros"
                  variant="light"
                  value={form.litros}
                  onChange={v => set("litros", v.replace(/[^\d.,]/g, ""))}
                  placeholder="Ex.: 100"
                  required
                  invalid={!!erros.litros || quantidadeAcimaSaldo}
                  aria-describedby={
                    erros.litros || quantidadeAcimaSaldo ? "abast-err-litros" : undefined
                  }
                />
                {erros.litros ? (
                  <FieldErrorMsg id="abast-err-litros" message={erros.litros} />
                ) : (
                  quantidadeAcimaSaldo &&
                  estoqueAtualLitros != null && (
                    <p id="abast-err-litros" className="text-red-500 text-[12px] mt-1" role="alert">
                      O estoque disponível é de{" "}
                      {formatLitros(estoqueAtualLitros)}. Informe uma quantidade igual ou inferior ao saldo.
                    </p>
                  )
                )}
              </div>
            </div>

            {/* Origem — linha própria para não comprimir quando o medidor ou aviso aparecem */}
            <div>
              <FormLabel required>Origem do combustível</FormLabel>
              <div className="flex items-center min-h-[34px] px-1">
                <RadioGroup
                  value={form.origem}
                  onValueChange={v => handleOrigemChange(v as OrigemCombustivel)}
                  className="!flex flex-row flex-wrap items-center gap-x-5 gap-y-2 sm:flex-nowrap"
                >
                  <label
                    className={cn(
                      "flex items-center gap-2 text-[13px] text-gray-700 whitespace-nowrap cursor-pointer",
                      !permiteAbastecimentoEstoque && "opacity-60",
                    )}
                    onClick={e => {
                      if (permiteAbastecimentoEstoque) return;
                      e.preventDefault();
                      avisoOrigemEstoqueIndisponivel();
                    }}
                  >
                    <RadioGroupItem
                      value="estoque"
                      className={!permiteAbastecimentoEstoque ? "pointer-events-none" : undefined}
                    />
                    Estoque da Fazenda
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[13px] text-gray-700 whitespace-nowrap">
                    <RadioGroupItem value="externo" />
                    Compra externa / Posto
                  </label>
                </RadioGroup>
              </div>
              {combustivelUsoImediatoNaFazenda ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[12px] text-gray-500 leading-relaxed">
                    Nesta fazenda o combustível é de{" "}
                    <span className="font-medium">uso imediato</span> (sem estoque). Use{" "}
                    <span className="font-medium">Compra externa / Posto</span> e informe o valor por
                    litro.
                  </p>
                  {combustivelInsumosCtx?.status === "uso_imediato" ? (
                    <button
                      type="button"
                      onClick={() => irInsumosCadastro(combustivelInsumosCtx.estoqueId)}
                      className={cn(btnAcaoPrimariaCls, "text-[12px] px-3 py-1.5")}
                      style={{ backgroundColor: FD_PRIMARY }}
                    >
                      Ajustar cadastro em Insumos
                    </button>
                  ) : null}
                </div>
              ) : !permiteAbastecimentoEstoque && form.combustivel && fazendaContextoId ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[13px] font-medium text-amber-900 leading-relaxed">
                    Para abastecer do estoque desta fazenda, cadastre{" "}
                    <span className="font-semibold">
                      {getCombustivelLabel(form.combustivel)}
                    </span>{" "}
                    em Insumos e marque <span className="font-semibold">Controlar saldo: Sim</span>{" "}
                    na fazenda.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      irInsumosCadastro(
                        combustivelInsumosCtx?.status === "precisa_vincular"
                          ? combustivelInsumosCtx.estoqueReferenciaId
                          : undefined,
                      )
                    }
                    className={cn("mt-2.5", btnAcaoPrimariaCls)}
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    {combustivelInsumosCtx?.status === "precisa_vincular"
                      ? "Vincular à fazenda"
                      : "Cadastrar em Insumos"}
                  </button>
                </div>
              ) : null}
            </div>

            {semEstoqueNaFazenda ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[13px] font-medium text-amber-900 leading-relaxed">
                  Não há estoque disponível deste combustível na Fazenda selecionada. Registre uma
                  entrada no estoque antes de continuar.
                </p>
                <button
                  type="button"
                  onClick={() => irRegistrarEntrada(produtoCombustivelId)}
                  className={cn("mt-2.5", btnAcaoPrimariaCls)}
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Registrar entrada
                </button>
              </div>
            ) : null}

            {medidorTipo ? (
              <div className="min-w-0 max-w-md">
                <div className="flex items-center justify-between mb-0.5">
                  <FormLabel className="mb-0">{medidorLabel}</FormLabel>
                  {statsHistorico.ultimo && (
                    <span className="text-gray-500 text-[11px]">Últ.: {leituraAnteriorFmt}</span>
                  )}
                </div>
                <div className="relative">
                  <FormInput
                    id="abast-field-horimetro"
                    variant="light"
                    value={form.horimetro}
                    onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                    placeholder="Ex.: 1000"
                    className="pr-10"
                    invalid={leituraInvalida}
                    aria-describedby={leituraInvalida ? "abast-err-horimetro" : undefined}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400 pointer-events-none">
                    {medidorSufixo}
                  </span>
                </div>
                {leituraInvalida && leituraAnteriorNum != null && (
                  <p id="abast-err-horimetro" className="text-red-500 text-[12px] mt-1" role="alert">
                    A leitura informada não pode ser menor que a última leitura registrada:{" "}
                    {formatLeitura(leituraAnteriorNum, medidorTipo)}.
                  </p>
                )}
              </div>
            ) : null}

            {maquinaIdNum && medidorTipo ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[10px] uppercase text-gray-500">{leituraAnteriorCardLabel}</p>
                  <p className="text-[18px] font-bold text-gray-800">{leituraAnteriorFmt}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[10px] uppercase text-gray-500">Último abastecimento</p>
                  <p className="text-[18px] font-bold text-gray-800">{statsHistorico.dataUltimo}</p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[10px] uppercase text-gray-500">Consumo médio</p>
                  <p className="text-[18px] font-bold text-gray-800">{statsHistorico.consumoMedio}</p>
                </div>
              </div>
            ) : null}
        </FormCard>

        <FormCard
          title="Valores e Estoque"
          footer={
            <>
              <button
                type="button"
                onClick={voltarLista}
                disabled={pending}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
            </>
          }
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!origemEstoque ? (
                <div className="min-w-0 sm:col-span-2">
                  <FormLabel>Fornecedor / Posto</FormLabel>
                  <FormNativeSelect
                    variant="light"
                    value={form.fornecedorId}
                    onChange={v => set("fornecedorId", v)}
                    placeholder="Selecione o fornecedor ou posto"
                    options={fornecedorOpcoes}
                  />
                  <button
                    type="button"
                    onClick={irCadastrarFornecedor}
                    className="mt-1.5 text-[11px] font-medium text-[#4ECDC4] hover:underline"
                  >
                    Cadastrar novo fornecedor
                  </button>
                </div>
              ) : null}

              {origemEstoque ? (
                <div className="min-w-0">
                  <FormLabel>Estoque atual</FormLabel>
                  <FormInput
                    variant="light"
                    readOnly
                    value={
                      estoqueAtualLitros != null
                        ? formatLitros(estoqueAtualLitros)
                        : fazendaEstoqueId && form.combustivel
                          ? "0 L"
                          : ""
                    }
                    onChange={() => {}}
                    placeholder={
                      !fazendaEstoqueId
                        ? "Selecione a Fazenda"
                        : !form.combustivel
                          ? "Selecione o combustível"
                          : "0 L"
                    }
                    className="cursor-default bg-gray-50 text-gray-800"
                  />
                </div>
              ) : null}

              <div className="min-w-0">
                {origemEstoque ? (
                  <>
                    <FormLabel>Valor por litro (R$)</FormLabel>
                    <FormInput
                      variant="light"
                      readOnly
                      value={
                        !fazendaEstoqueId || !form.combustivel
                          ? ""
                          : valorLitroEstoque != null
                            ? `R$ ${valorLitroEstoque.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 3,
                              })}`
                            : semEstoqueNaFazenda
                              ? ""
                              : "Custo médio não disponível"
                      }
                      onChange={() => {}}
                      placeholder="Custo médio do estoque"
                      className={cn(
                        "cursor-default bg-gray-50",
                        custoMedioIndisponivel ? "text-amber-800" : "text-gray-800",
                      )}
                    />
                    {custoMedioIndisponivel && (
                      <p className="text-amber-700 text-[12px] mt-1.5">
                        Não é possível salvar sem o custo médio deste combustível no estoque.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <FormLabel required>Valor por litro (R$)</FormLabel>
                    <FormInput
                      id="abast-field-valorLitro"
                      variant="light"
                      value={form.valorLitro}
                      onChange={v => set("valorLitro", formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                      required
                      invalid={!!erros.valorLitro}
                      aria-describedby={erros.valorLitro ? "abast-err-valorLitro" : undefined}
                    />
                    <FieldErrorMsg id="abast-err-valorLitro" message={erros.valorLitro} />
                  </>
                )}
              </div>

              <div className="min-w-0">
                <FormLabel>Valor total (R$)</FormLabel>
                <FormInput
                  variant="light"
                  readOnly
                  value={valorTotalPreview ? `R$ ${valorTotalPreview}` : ""}
                  onChange={() => {}}
                  placeholder="Calculado automaticamente"
                  className="cursor-default bg-gray-50 text-gray-800"
                />
              </div>

              <div className="min-w-0">
                <FormLabel>Responsável pelo abastecimento</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={form.responsavel}
                  onChange={v => set("responsavel", v)}
                  placeholder="Selecione o responsável"
                  options={[
                    ...(user?.name ? [{ value: user.name, label: user.name }] : []),
                    ...fazendas
                      .map(f => f.responsavel)
                      .filter((n): n is string => !!n?.trim())
                      .filter((n, i, arr) => arr.indexOf(n) === i && n !== user?.name)
                      .map(n => ({ value: n, label: n })),
                  ]}
                />
              </div>
            </div>

            {(valorTotalPreview || (origemEstoque && estoqueAtualLitros != null)) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {origemEstoque && estoqueAtualLitros != null ? (
                  <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                    <p className="text-[10px] uppercase text-gray-500">Saldo em estoque</p>
                    <p className="text-[18px] font-bold text-gray-800">{formatLitros(estoqueAtualLitros)}</p>
                  </div>
                ) : null}
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[10px] uppercase text-gray-500">Litros abastecidos</p>
                  <p className="text-[18px] font-bold text-gray-800">
                    {(() => {
                      if (!form.litros.trim()) return "—";
                      const n = parseFloat(form.litros.replace(",", "."));
                      return Number.isFinite(n) && n > 0 ? formatLitros(n) : `${form.litros.replace(".", ",")} L`;
                    })()}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                  <p className="text-[10px] uppercase text-gray-500">Valor total</p>
                  <p className="text-[18px] font-bold text-gray-800">
                    {valorTotalPreview ? `R$ ${valorTotalPreview}` : "—"}
                  </p>
                </div>
              </div>
            )}

            <div>
              <FormLabel>Observações</FormLabel>
              <FormTextarea
                variant="light"
                value={form.observacoes}
                onChange={v => set("observacoes", v)}
                placeholder="Informações adicionais sobre este abastecimento"
                rows={2}
              />
            </div>
        </FormCard>
        </div>
      </form>
    </AppLayout>
  );
}

export { AbastecimentoFormPage };
