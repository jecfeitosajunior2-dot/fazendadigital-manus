import { useRef, useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn, formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormTextarea,
  FormDatePicker,
  formControlFlatCls,
} from "@/components/FormFields";
import { useConfirm } from "@/components/ConfirmDialog";
import { DeleteActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import {
  isDescricaoServicoValida,
  MSG_DESCRICAO_SERVICO_OBRIGATORIA,
  normalizeDescricaoServico,
} from "@shared/manutencaoDescricao";
import {
  CATEGORIAS_MANUTENCAO_ESTOQUE,
  produtoControlaSaldo,
} from "@shared/estoqueControle";

const TIPOS_MANUTENCAO = [
  { value: "Preventiva", label: "Preventiva" },
  { value: "Corretiva", label: "Corretiva" },
] as const;

type TipoExecucao = "interna" | "externa";
type MedidorTipo = "horimetro" | "quilometragem";

type PecaItem = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  estoqueId?: number | null;
  unidade?: string | null;
};

type FormState = {
  maquinaId: string;
  tipo: string;
  data: string;
  proximaManutencao: string;
  horimetro: string;
  descricao: string;
  prestadorNome: string;
  prestadorContato: string;
  valorMaoObra: string;
};

const emptyForm = (): FormState => ({
  maquinaId: "",
  tipo: "Preventiva",
  data: new Date().toISOString().slice(0, 10),
  proximaManutencao: "",
  horimetro: "",
  descricao: "",
  prestadorNome: "",
  prestadorContato: "",
  valorMaoObra: "",
});

/**
 * Categorias consumidas na manutenção de máquinas (Peças e Lubrificantes).
 * Exclui Farmácia, Nutricionais, Combustíveis (Abastecimentos), Agrícolas e demais insumos.
 */
const CATEGORIAS_TODAS = [...CATEGORIAS_MANUTENCAO_ESTOQUE];

function toDateInput(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function getSearchParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseCustoMedioClient(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const MSG_SEM_CUSTO_MEDIO =
  "Este produto não possui custo médio registrado. Registre uma entrada de estoque antes de utilizá-lo na manutenção.";

const MANUTENCAO_DRAFT_KEY = "fd:manutencao-form-draft";

type PecaEscolhidaState = {
  id: number;
  nome: string;
  categoria?: string | null;
  valorUnitario?: string | number | null;
  quantidadeDisponivel?: number;
  unidade?: string | null;
  doEstoque: boolean;
};

type ManutencaoDraft = {
  form: FormState;
  pecas: PecaItem[];
  tipoExecucao: TipoExecucao;
  initializedForId: number | null;
  pecaEscolhida: PecaEscolhidaState | null;
  pecaNome: string;
  pecaQtd: string;
  pecaValor: string;
  pecaSearch: string;
};

const btnAcaoBaseCls =
  "inline-flex items-center justify-center h-[30px] px-3 rounded text-[11px] font-semibold transition shrink-0";

const btnAcaoPrimariaCls = cn(btnAcaoBaseCls, "text-white hover:brightness-95 active:scale-[0.97]");

const btnAcaoSecundariaCls = cn(
  btnAcaoBaseCls,
  "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400",
);

function AcoesEstoqueVazioManutencao({
  onCadastrar,
  onEntrada,
}: {
  onCadastrar: () => void;
  onEntrada: () => void;
}) {
  return (
    <>
      <p className="text-[11px] text-gray-700 leading-relaxed">
        Nenhuma peça ou lubrificante nesta fazenda. Cadastre o produto ou registre uma entrada no
        estoque.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCadastrar}
          className={btnAcaoPrimariaCls}
          style={{ backgroundColor: FD_PRIMARY }}
        >
          Cadastrar produto
        </button>
        <button type="button" onClick={onEntrada} className={btnAcaoSecundariaCls}>
          Registrar entrada
        </button>
      </div>
    </>
  );
}


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

function inferTipoExecucao(opts: {
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  valorMaoObra?: string | number | null;
}): TipoExecucao {
  const contato = String(opts.prestadorContato || "").trim();
  const nome = String(opts.prestadorNome || "").trim();
  const mo = opts.valorMaoObra != null ? parseFloat(String(opts.valorMaoObra)) : 0;
  if (contato) return "externa";
  if (nome && Number.isFinite(mo) && mo > 0) return "externa";
  if (!nome && Number.isFinite(mo) && mo > 0) return "externa";
  return "interna";
}

export default function ManutencaoFormPage() {
  const [, setLocation] = useLocation();
  const editId = Number(getSearchParam("id") || 0);
  const isEdit = editId > 0;
  const fazendaIdParam = getSearchParam("fazendaId");
  const initializedForId = useRef<number | null>(null);
  const pecaPickerRef = useRef<HTMLDivElement>(null);
  const draftRestoredRef = useRef(false);
  const produtoRetornoIdRef = useRef<number | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pecas, setPecas] = useState<PecaItem[]>([]);
  const [tipoExecucao, setTipoExecucao] = useState<TipoExecucao>("interna");
  const [erroDescricao, setErroDescricao] = useState<string | null>(null);

  const [pecaNome, setPecaNome] = useState("");
  const [pecaQtd, setPecaQtd] = useState("1");
  const [pecaValor, setPecaValor] = useState("");
  const [listaPecaAberta, setListaPecaAberta] = useState(false);
  const [pecaSearch, setPecaSearch] = useState("");
  const pecaSearchDebounced = useDebounce(pecaSearch, 250);
  const [pecaEscolhida, setPecaEscolhida] = useState<PecaEscolhidaState | null>(null);
  const confirm = useConfirm();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const { data: maquinas = [] } = trpc.maquinas.list.useQuery();
  const maquinasOperacionais = useMemo(() => {
    const ativas = maquinas.filter(m => {
      if ((m as { dataDesativacao?: unknown }).dataDesativacao) return false;
      if (String(m.status || "").toLowerCase() === "inativo") return false;
      if (!isEdit && fazendaIdParam && String(m.fazendaId) !== fazendaIdParam) return false;
      return true;
    });
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
  }, [maquinas, isEdit, form.maquinaId, fazendaIdParam]);

  const maquinaSelecionada = useMemo(
    () => maquinas.find(m => String(m.id) === form.maquinaId) ?? null,
    [maquinas, form.maquinaId],
  );

  const medidorTipo = getMedidorTipo(maquinaSelecionada);
  const medidorLabel =
    medidorTipo === "quilometragem"
      ? "Quilometragem atual"
      : medidorTipo === "horimetro"
        ? "Leitura do horímetro"
        : "Leitura do medidor";
  const medidorSufixo = medidorTipo === "quilometragem" ? "km" : medidorTipo === "horimetro" ? "h" : "";
  const ultimaLeituraMaquina = useMemo(() => {
    const raw = maquinaSelecionada?.horimetro;
    if (raw == null || String(raw).trim() === "") return null;
    const n = parseFloat(String(raw).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [maquinaSelecionada]);

  const mostrarProximaManutencao = true;

  const { data: registro, isLoading } = trpc.manutencoes.get.useQuery(
    { id: editId },
    { enabled: isEdit },
  );
  /** Sempre carrega todas as categorias permitidas; o filtro é só no cliente. */
  const { data: estoqueItems = [], isLoading: loadingEstoque } = trpc.estoque.listByCategories.useQuery({
    categorias: [...CATEGORIAS_TODAS],
  });
  const utils = trpc.useUtils();

  const createMutation = trpc.manutencoes.create.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(MANUTENCAO_DRAFT_KEY);
      utils.manutencoes.list.invalidate();
      utils.estoque.listByCategories.invalidate();
      utils.estoque.list.invalidate();
      toast.success("Manutenção registrada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.manutencoes.update.useMutation({
    onSuccess: () => {
      sessionStorage.removeItem(MANUTENCAO_DRAFT_KEY);
      utils.manutencoes.list.invalidate();
      if (editId != null) utils.manutencoes.get.invalidate({ id: editId });
      utils.estoque.listByCategories.invalidate();
      utils.estoque.list.invalidate();
      toast.success("Manutenção atualizada!");
      setLocation("/maquinas/manutencao");
    },
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novoProdutoId = params.get("produtoId");
    const raw = sessionStorage.getItem(MANUTENCAO_DRAFT_KEY);

    if (raw) {
      try {
        const draft = JSON.parse(raw) as ManutencaoDraft;
        setForm(draft.form);
        setPecas(draft.pecas);
        setTipoExecucao(draft.tipoExecucao);
        setPecaEscolhida(draft.pecaEscolhida ?? null);
        setPecaNome(draft.pecaNome ?? "");
        setPecaQtd(draft.pecaQtd ?? "1");
        setPecaValor(draft.pecaValor ?? "");
        setPecaSearch(draft.pecaSearch ?? "");
        initializedForId.current = draft.initializedForId;
        draftRestoredRef.current = true;
      } catch {
        /* rascunho inválido */
      }
      sessionStorage.removeItem(MANUTENCAO_DRAFT_KEY);
    }

    if (novoProdutoId) {
      const id = parseInt(novoProdutoId, 10);
      if (!Number.isNaN(id) && id > 0) produtoRetornoIdRef.current = id;
      params.delete("produtoId");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!isEdit || !registro) return;
    if (initializedForId.current === registro.id) return;
    setForm({
      maquinaId: String(registro.maquinaId),
      tipo: registro.tipo ?? "Preventiva",
      data: toDateInput(registro.data),
      proximaManutencao: toDateInput(registro.proximaManutencao),
      horimetro: registro.horimetro ?? "",
      descricao: registro.descricao ?? "",
      prestadorNome: registro.prestadorNome ?? "",
      prestadorContato: registro.prestadorContato ?? "",
      valorMaoObra: registro.valorMaoObra
        ? formatCurrencyBrl(String(Math.round(parseFloat(String(registro.valorMaoObra)) * 100)))
        : "",
    });
    setTipoExecucao(
      inferTipoExecucao({
        prestadorNome: registro.prestadorNome,
        prestadorContato: registro.prestadorContato,
        valorMaoObra: registro.valorMaoObra,
      }),
    );
    setPecas(
      (registro.pecas ?? []).map(p => ({
        nome: p.nome,
        quantidade: parseFloat(String(p.quantidade)) || 0,
        valorUnitario: parseFloat(String(p.valorUnitario)) || 0,
        estoqueId: p.estoqueId,
      })),
    );
    initializedForId.current = registro.id;
  }, [isEdit, registro]);

  const totalPecas = useMemo(
    () => pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0),
    [pecas],
  );

  const valorMaoObraNum = useMemo(() => {
    const v = parseCurrencyBrl(form.valorMaoObra);
    return v ? parseFloat(v) : 0;
  }, [form.valorMaoObra]);

  const totalGeral = totalPecas + valorMaoObraNum;

  const handleSelectEstoque = (item: (typeof estoqueItems)[0]) => {
    const custo = parseCustoMedioClient(item.valorUnitario);
    setPecaNome(item.nome);
    setPecaValor(
      custo != null
        ? formatCurrencyBrl(String(Math.round(custo * 100)))
        : "",
    );
    setPecaEscolhida({
      id: item.id,
      nome: item.nome,
      categoria: item.categoria ?? null,
      valorUnitario: custo,
      quantidadeDisponivel: item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined,
      unidade: item.unidade ?? undefined,
      doEstoque: true,
    });
    setListaPecaAberta(false);
    setPecaSearch("");
  };

  useEffect(() => {
    if (!listaPecaAberta) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!pecaPickerRef.current?.contains(e.target as Node)) {
        setListaPecaAberta(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [listaPecaAberta]);

  const retornoAtual = () => window.location.pathname + window.location.search;

  const persistirRascunho = () => {
    const draft: ManutencaoDraft = {
      form,
      pecas,
      tipoExecucao,
      initializedForId: initializedForId.current,
      pecaEscolhida,
      pecaNome,
      pecaQtd,
      pecaValor,
      pecaSearch,
    };
    sessionStorage.setItem(MANUTENCAO_DRAFT_KEY, JSON.stringify(draft));
  };

  const irCadastrarProduto = (nomeSugerido?: string) => {
    persistirRascunho();
    const qs = new URLSearchParams();
    const fazendaId = maquinaSelecionada?.fazendaId;
    if (fazendaId != null) qs.set("fazendaId", String(fazendaId));
    const nome = (nomeSugerido ?? pecaSearch).trim();
    if (nome) qs.set("nome", nome);
    qs.set("retorno", retornoAtual());
    setLocation(`/insumos/cadastro?${qs.toString()}`);
  };

  const irRegistrarEntrada = (estoqueId?: number) => {
    persistirRascunho();
    const qs = new URLSearchParams();
    const fazendaId = maquinaSelecionada?.fazendaId;
    if (fazendaId != null) qs.set("fazendaId", String(fazendaId));
    qs.set("retorno", retornoAtual());
    if (estoqueId != null && estoqueId > 0) qs.set("produtoId", String(estoqueId));
    setLocation(`/insumos/nova-movimentacao?${qs.toString()}`);
  };

  useEffect(() => {
    if (!pecaEscolhida?.id || loadingEstoque) return;
    const item = estoqueItems.find(i => i.id === pecaEscolhida.id);
    if (!item) return;
    const custo = parseCustoMedioClient(item.valorUnitario);
    const qtd = item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined;
    const qtdOk = qtd != null && Number.isFinite(qtd) ? qtd : undefined;
    setPecaEscolhida(prev => {
      if (!prev || prev.id !== item.id) return prev;
      if (
        prev.quantidadeDisponivel === qtdOk &&
        prev.valorUnitario === custo &&
        prev.nome === item.nome
      ) {
        return prev;
      }
      return {
        ...prev,
        nome: item.nome,
        categoria: item.categoria ?? null,
        quantidadeDisponivel: qtdOk,
        valorUnitario: custo,
        unidade: item.unidade ?? undefined,
      };
    });
    if (custo != null) {
      setPecaValor(formatCurrencyBrl(String(Math.round(custo * 100))));
    }
  }, [estoqueItems, loadingEstoque, pecaEscolhida?.id]);

  useEffect(() => {
    const id = produtoRetornoIdRef.current;
    if (id == null || loadingEstoque) return;
    const item = estoqueItems.find(i => i.id === id);
    if (!item) return;
    handleSelectEstoque(item);
    produtoRetornoIdRef.current = null;
    toast.success("Produto selecionado. Confira a quantidade e adicione à manutenção.");
  }, [estoqueItems, loadingEstoque]);

  const estoqueAtivos = useMemo(() => {
    const fazendaMaquina =
      maquinaSelecionada?.fazendaId != null ? Number(maquinaSelecionada.fazendaId) : null;
    if (fazendaMaquina == null || !Number.isFinite(fazendaMaquina)) return [];
    return estoqueItems
      .filter(item => {
        const sit = String((item as { situacao?: string | null }).situacao || "ativo").toLowerCase();
        if (sit === "inativo") return false;
        const cat = String(item.categoria || "").trim();
        if (!cat) return false;
        if (!CATEGORIAS_TODAS.some(c => c.toLowerCase() === cat.toLowerCase())) return false;
        if (!produtoControlaSaldo((item as { controlarSaldo?: boolean | null }).controlarSaldo)) {
          return false;
        }
        const fid = Number((item as { fazendaId?: number | null }).fazendaId);
        if (!Number.isFinite(fid) || fid !== fazendaMaquina) return false;
        return true;
      })
      .slice()
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  }, [estoqueItems, maquinaSelecionada?.fazendaId]);

  const produtosParaLista = useMemo(() => {
    const search = pecaSearchDebounced.trim().toLowerCase();
    let list = estoqueAtivos;
    if (search) {
      list = estoqueAtivos.filter(item => {
        const nome = item.nome?.toLowerCase() ?? "";
        const cat = item.categoria?.toLowerCase() ?? "";
        const sub = item.subcategoria?.toLowerCase() ?? "";
        const fab = item.fabricante?.toLowerCase() ?? "";
        const codigo = String(
          (item as { identificadorUnico?: string | null }).identificadorUnico || "",
        ).toLowerCase();
        const obs = String((item as { observacoes?: string | null }).observacoes || "").toLowerCase();
        return (
          nome.includes(search) ||
          cat.includes(search) ||
          sub.includes(search) ||
          fab.includes(search) ||
          codigo.includes(search) ||
          obs.includes(search)
        );
      });
    } else {
      list = estoqueAtivos.slice(0, 40);
    }
    return list;
  }, [estoqueAtivos, pecaSearchDebounced]);

  const temBuscaPeca = !!pecaSearch.trim();
  const maquinaSelecionadaOk = !!form.maquinaId;
  const semEstoqueNaFazenda =
    maquinaSelecionadaOk && !loadingEstoque && !temBuscaPeca && estoqueAtivos.length === 0;
  const semResultadoBusca =
    maquinaSelecionadaOk && !loadingEstoque && temBuscaPeca && produtosParaLista.length === 0;

  const limparBuscaPeca = () => {
    setPecaSearch("");
  };

  const qtdNum = parseFloat(pecaQtd.replace(",", "."));
  const custoSelecionado = parseCustoMedioClient(pecaEscolhida?.valorUnitario ?? pecaValor);
  const semCustoMedio =
    !!pecaEscolhida?.doEstoque && pecaEscolhida.id != null && custoSelecionado == null;
  const pecaSemSaldo =
    pecaEscolhida?.quantidadeDisponivel != null && pecaEscolhida.quantidadeDisponivel <= 0;
  const pecaPrecisaEntrada = !!pecaEscolhida && (semCustoMedio || pecaSemSaldo);
  const podeAdicionarPeca =
    !!pecaNome.trim() &&
    !!pecaEscolhida?.id &&
    !Number.isNaN(qtdNum) &&
    qtdNum > 0 &&
    custoSelecionado != null &&
    !(
      pecaEscolhida.quantidadeDisponivel != null &&
      pecas
        .filter(p => p.estoqueId === pecaEscolhida.id)
        .reduce((s, p) => s + p.quantidade, 0) +
        qtdNum >
        pecaEscolhida.quantidadeDisponivel
    );

  const adicionarPeca = () => {
    const nome = pecaNome.trim();
    const qtd = parseFloat(pecaQtd.replace(",", "."));
    if (!nome || !pecaEscolhida?.id) {
      return toast.error("Selecione um produto ou peça do estoque.");
    }
    if (Number.isNaN(qtd) || qtd <= 0) return toast.error("Informe uma quantidade válida.");

    const custo = parseCustoMedioClient(pecaEscolhida.valorUnitario);
    if (custo == null) {
      return toast.error(MSG_SEM_CUSTO_MEDIO);
    }

    if (pecaEscolhida.quantidadeDisponivel != null) {
      const disponivel = pecaEscolhida.quantidadeDisponivel;
      const jaAdicionado = pecas
        .filter(p => p.estoqueId === pecaEscolhida.id)
        .reduce((s, p) => s + p.quantidade, 0);
      const unidade = pecaEscolhida.unidade ? ` ${pecaEscolhida.unidade}` : "";
      if (jaAdicionado + qtd > disponivel) {
        const restante = Math.max(disponivel - jaAdicionado, 0);
        return toast.error(
          `Estoque insuficiente para "${nome}". Disponível: ${disponivel.toLocaleString("pt-BR")}${unidade}` +
            (jaAdicionado > 0
              ? ` (já adicionado: ${jaAdicionado.toLocaleString("pt-BR")}${unidade}, resta ${restante.toLocaleString("pt-BR")}${unidade})`
              : "") +
            `.`,
        );
      }
    }

    setPecas(prev => [
      ...prev,
      {
        nome,
        quantidade: qtd,
        valorUnitario: custo,
        estoqueId: pecaEscolhida.id,
        unidade: pecaEscolhida.unidade,
      },
    ]);
    limparSelecaoPeca();
  };

  const limparSelecaoPeca = () => {
    setPecaNome("");
    setPecaQtd("1");
    setPecaValor("");
    setPecaEscolhida(null);
    setPecaSearch("");
    setListaPecaAberta(false);
  };

  const alterarSelecaoPeca = () => {
    setPecaNome("");
    setPecaQtd("1");
    setPecaValor("");
    setPecaEscolhida(null);
    setPecaSearch("");
    setListaPecaAberta(true);
  };

  const removerPeca = async (index: number) => {
    const peca = pecas[index];
    const nome = (peca?.nome ?? "").trim() || "este produto ou peça";
    const ok = await confirm({
      title: "Remover produto ou peça",
      description: `Tem certeza de que deseja remover "${nome}" desta manutenção?`,
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) setPecas(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scrollToId = (id: string) => {
      document.getElementById(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    if (!form.maquinaId) {
      scrollToId("manut-field-maquina");
      return toast.error("Selecione a máquina.");
    }
    if (!form.tipo) {
      scrollToId("manut-field-tipo");
      return toast.error("Selecione o tipo de manutenção.");
    }
    if (!form.data) {
      scrollToId("manut-field-data");
      return toast.error("Informe a data da manutenção.");
    }

    const descricaoNorm = normalizeDescricaoServico(form.descricao);
    if (!isDescricaoServicoValida(descricaoNorm)) {
      setErroDescricao(MSG_DESCRICAO_SERVICO_OBRIGATORIA);
      scrollToId("manut-field-descricao");
      return;
    }
    setErroDescricao(null);

    if (medidorTipo && form.horimetro.trim() && ultimaLeituraMaquina != null) {
      const leitura = parseFloat(form.horimetro.replace(",", "."));
      if (!Number.isNaN(leitura) && leitura < ultimaLeituraMaquina) {
        scrollToId("manut-field-horimetro");
        return toast.error(
          `A leitura não pode ser inferior à última leitura da máquina (${ultimaLeituraMaquina.toLocaleString("pt-BR")} ${medidorSufixo}).`,
        );
      }
    }

    const prestadorNome = form.prestadorNome.trim() || undefined;
    const prestadorContato =
      tipoExecucao === "externa" ? form.prestadorContato.trim() || undefined : undefined;

    const payload = {
      maquinaId: Number(form.maquinaId),
      tipo: form.tipo,
      data: form.data,
      proximaManutencao: mostrarProximaManutencao
        ? form.proximaManutencao || undefined
        : undefined,
      horimetro: medidorTipo && form.horimetro.trim() ? form.horimetro.trim() : undefined,
      descricao: descricaoNorm,
      prestadorNome,
      prestadorContato,
      valorMaoObra: valorMaoObraNum,
      pecas: pecas.map(p => ({
        nome: p.nome,
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        estoqueId: p.estoqueId,
      })),
    };

    if (isEdit) updateMutation.mutate({ id: editId, ...payload });
    else createMutation.mutate(payload);
  };

  const pending = createMutation.isPending || updateMutation.isPending;
  const podeSalvar =
    !!form.maquinaId &&
    !!form.tipo &&
    !!form.data &&
    isDescricaoServicoValida(form.descricao) &&
    !pending;

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() =>
          setLocation(
            fazendaIdParam
              ? `/maquinas/manutencao?fazendaId=${encodeURIComponent(fazendaIdParam)}`
              : "/maquinas/manutencao",
          )
        }
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        onKeyDown={e => {
          // Enter em input dispara submit; textarea (multiline) não deve salvar.
          if (e.key !== "Enter") return;
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === "TEXTAREA") e.stopPropagation();
        }}
      >
        <div className="space-y-5">
        {/* ── 1. Dados da manutenção ───────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h1
              className="text-[20px] font-semibold text-gray-900"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {isEdit ? "Editar manutenção" : "Registro de Manutenção"}
            </h1>
          </div>

          <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="manut-field-maquina">
              <FormLabel required>Máquina</FormLabel>
              <FormNativeSelect
                variant="light"
                value={form.maquinaId}
                onChange={v => {
                  const anterior = maquinas.find(m => String(m.id) === form.maquinaId);
                  const proxima = maquinas.find(m => String(m.id) === v);
                  set("maquinaId", v);
                  set("horimetro", "");
                  limparSelecaoPeca();
                  if (
                    Number(anterior?.fazendaId) !== Number(proxima?.fazendaId) ||
                    !form.maquinaId
                  ) {
                    setPecas([]);
                  }
                }}
                placeholder="Selecione a Máquina"
                required
                options={maquinasOperacionais.map(m => ({ value: String(m.id), label: m.nome }))}
              />
            </div>
            <div id="manut-field-tipo">
              <FormLabel required>Tipo de manutenção</FormLabel>
              <FormNativeSelect
                variant="light"
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                options={TIPOS_MANUTENCAO.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div id="manut-field-data">
              <FormLabel required>Data da manutenção</FormLabel>
              <FormDatePicker
                variant="light"
                minHeight={34}
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data"
                required
              />
            </div>
            <div>
              <FormLabel>Próxima manutenção</FormLabel>
              <FormDatePicker
                variant="light"
                minHeight={34}
                value={form.proximaManutencao}
                onChange={v => set("proximaManutencao", v)}
                placeholder="Selecione a data prevista"
              />
            </div>
          </div>

          {medidorTipo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div id="manut-field-horimetro">
                <FormLabel>{medidorLabel}</FormLabel>
                <div className="relative">
                  <FormInput
                    variant="light"
                    value={form.horimetro}
                    onChange={v => set("horimetro", v.replace(/[^\d.,]/g, ""))}
                    placeholder={medidorTipo === "quilometragem" ? "Ex. 21000" : "Ex. 1250"}
                  />
                  {medidorSufixo && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-500">
                      {medidorSufixo}
                    </span>
                  )}
                </div>
                {ultimaLeituraMaquina != null && (
                  <p className="mt-1 text-[10px] text-gray-500">
                    Última leitura:{" "}
                    {ultimaLeituraMaquina.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    {medidorSufixo}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div id="manut-field-descricao">
            <FormLabel required>Descrição do serviço</FormLabel>
            <FormTextarea
              variant="light"
              value={form.descricao}
              onChange={v => {
                set("descricao", v);
                if (erroDescricao) setErroDescricao(null);
              }}
              placeholder="Ex.: troca de óleo, substituição de correia e limpeza dos bicos"
              rows={3}
              required
              invalid={!!erroDescricao}
              aria-describedby={erroDescricao ? "manut-erro-descricao" : undefined}
            />
            {erroDescricao ? (
              <p id="manut-erro-descricao" className="mt-1 text-[11px] text-red-600" role="alert">
                {erroDescricao}
              </p>
            ) : null}
          </div>
          </div>
        </div>

        {/* ── 2. Custos da manutenção ──────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Custos da manutenção</h2>
          </div>

          <div className="p-5 space-y-5">
          {/* Produtos e peças utilizados */}
          <div id="manut-section-pecas">
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">
              Produtos e peças utilizados
            </h3>

            <div className="grid grid-cols-12 gap-3 items-start mb-4">
              <div className="col-span-12 sm:col-span-5">
                <FormLabel>Produto ou peça</FormLabel>
                {pecaEscolhida ? (
                  <div
                    className={cn(
                      formControlFlatCls,
                      "bg-gray-50 px-3 flex items-center gap-2 min-h-[34px] h-[34px]",
                    )}
                  >
                    <div className="min-w-0 flex-1 truncate text-[13px] text-gray-800">
                      <span className="font-semibold text-gray-900">{pecaEscolhida.nome}</span>
                      <span className="text-gray-500 font-normal">
                        {" · "}
                        {pecaEscolhida.categoria || "Peças"}
                        {pecaEscolhida.unidade ? ` · ${pecaEscolhida.unidade}` : ""}
                        {pecaEscolhida.quantidadeDisponivel != null
                          ? ` · saldo ${pecaEscolhida.quantidadeDisponivel.toLocaleString("pt-BR")}`
                          : ""}
                        {custoSelecionado != null ? ` · ${brl(custoSelecionado)}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-gray-600 underline shrink-0"
                      onClick={alterarSelecaoPeca}
                    >
                      Alterar
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={pecaPickerRef}>
                    <input
                      type="search"
                      value={pecaSearch}
                      disabled={!maquinaSelecionadaOk}
                      onChange={e => {
                        setPecaSearch(e.target.value);
                        setListaPecaAberta(true);
                      }}
                      onFocus={() => {
                        if (maquinaSelecionadaOk) setListaPecaAberta(true);
                      }}
                      placeholder={
                        maquinaSelecionadaOk
                          ? "Buscar peça ou lubrificante…"
                          : "Selecione a máquina primeiro"
                      }
                      autoComplete="off"
                      aria-label="Buscar peça ou lubrificante"
                      className={cn(
                        formControlFlatCls,
                        "bg-white outline-none placeholder:text-gray-400 w-full",
                        !maquinaSelecionadaOk && "cursor-not-allowed opacity-60",
                      )}
                    />
                    {!maquinaSelecionadaOk ? (
                      <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                        Selecione a máquina para listar peças e lubrificantes do estoque.
                      </p>
                    ) : null}
                    {maquinaSelecionadaOk &&
                    pecaSearch.trim() &&
                    !pecaEscolhida &&
                    !semResultadoBusca &&
                    produtosParaLista.length > 0 ? (
                      <p className="mt-1 text-[11px] text-amber-700 leading-snug">
                        Selecione o item na lista para vincular ao estoque e calcular o custo.
                      </p>
                    ) : null}
                    {semResultadoBusca && !pecaEscolhida ? (
                      <div className="mt-2 rounded border border-amber-100 bg-amber-50 px-3 py-2.5">
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          Nenhum item encontrado para &ldquo;{pecaSearch.trim()}&rdquo;. Cadastre o
                          produto como peça ou lubrificante estocável.
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => irCadastrarProduto(pecaSearch.trim())}
                            className={btnAcaoPrimariaCls}
                            style={{ backgroundColor: FD_PRIMARY }}
                          >
                            Cadastrar produto
                          </button>
                          <button type="button" onClick={limparBuscaPeca} className={btnAcaoSecundariaCls}>
                            Limpar busca
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {semEstoqueNaFazenda && !pecaEscolhida ? (
                      <div className="mt-2 rounded border border-amber-100 bg-amber-50 px-3 py-2.5">
                        <AcoesEstoqueVazioManutencao
                          onCadastrar={() => irCadastrarProduto()}
                          onEntrada={() => irRegistrarEntrada()}
                        />
                      </div>
                    ) : null}
                    {listaPecaAberta && maquinaSelecionadaOk && !semEstoqueNaFazenda ? (
                      <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
                        {loadingEstoque ? (
                          <li className="px-3 py-2.5 text-[11px] text-gray-400">Carregando…</li>
                        ) : semResultadoBusca ? (
                          <li className="px-3 py-2.5 text-[11px] text-gray-400 text-center">
                            Veja as opções abaixo do campo de busca.
                          </li>
                        ) : (
                          produtosParaLista.map(item => {
                            const qtd =
                              item.quantidade != null
                                ? parseFloat(String(item.quantidade))
                                : null;
                            const semEstoque = qtd != null && Number.isFinite(qtd) && qtd <= 0;
                            const custo =
                              item.valorUnitario != null
                                ? parseFloat(String(item.valorUnitario))
                                : null;
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  disabled={semEstoque}
                                  onClick={() => {
                                    if (semEstoque) return;
                                    handleSelectEstoque(item);
                                  }}
                                  className={cn(
                                    "w-full text-left px-3 py-2.5 transition",
                                    semEstoque
                                      ? "opacity-50 cursor-not-allowed"
                                      : "hover:bg-[#4ECDC4]/[0.08]",
                                  )}
                                >
                                  <div className="text-[13px] font-semibold text-gray-900 truncate">
                                    {item.nome}
                                  </div>
                                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                                    {item.categoria || "Sem categoria"}
                                    {semEstoque
                                      ? " · Sem estoque"
                                      : qtd != null
                                        ? ` · Estoque: ${qtd.toLocaleString("pt-BR")}${item.unidade ? ` ${item.unidade}` : ""}`
                                        : ""}
                                    {custo != null && Number.isFinite(custo)
                                      ? ` · Custo médio: ${brl(custo)}`
                                      : ""}
                                  </div>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="col-span-4 sm:col-span-2">
                <FormLabel>
                  Qtd
                  {pecaEscolhida?.unidade ? ` (${pecaEscolhida.unidade})` : ""}
                </FormLabel>
                <FormInput
                  variant="light"
                  value={pecaQtd}
                  onChange={v => setPecaQtd(v.replace(/[^\d.,]/g, ""))}
                  placeholder="1"
                  inputMode="decimal"
                />
              </div>
              <div className="col-span-5 sm:col-span-3">
                <FormLabel>Valor Unit.</FormLabel>
                <FormInput
                  variant="light"
                  value={pecaValor}
                  readOnly
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <FormLabel className="sr-only">Adicionar</FormLabel>
                <button
                  type="button"
                  onClick={adicionarPeca}
                  disabled={!podeAdicionarPeca}
                  className={cn(
                    "w-full h-[34px] px-2 sm:px-3 rounded text-[11px] font-semibold text-white transition flex items-center justify-center shrink-0",
                    podeAdicionarPeca
                      ? "hover:brightness-95 active:scale-[0.97]"
                      : "opacity-50 cursor-not-allowed",
                  )}
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Adicionar
                </button>
              </div>
            </div>

            {pecaEscolhida &&
            (pecaEscolhida.quantidadeDisponivel != null ||
              (pecaEscolhida.doEstoque && !semCustoMedio)) ? (
              <div className="grid grid-cols-12 gap-x-3 gap-y-1 -mt-2 mb-4">
                <div className="hidden sm:block sm:col-span-5" aria-hidden />
                {pecaEscolhida.quantidadeDisponivel != null ? (
                  <div className="col-span-4 sm:col-span-2">
                    <p
                      className={cn(
                        "text-[10px] font-medium",
                        pecaEscolhida.quantidadeDisponivel > 0 ? "text-gray-500" : "text-red-500",
                      )}
                    >
                      Disp.: {pecaEscolhida.quantidadeDisponivel.toLocaleString("pt-BR")}
                      {pecaEscolhida.unidade ? ` ${pecaEscolhida.unidade}` : ""}
                    </p>
                  </div>
                ) : (
                  <div className="hidden sm:block sm:col-span-2" aria-hidden />
                )}
                {pecaEscolhida.doEstoque && !semCustoMedio ? (
                  <div className="col-span-5 sm:col-span-3">
                    <p className="text-[10px] text-gray-500">Custo médio atual do estoque</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {pecaPrecisaEntrada ? (
              <div className="mb-4 rounded border border-amber-100 bg-amber-50 px-3 py-2.5">
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  {semCustoMedio && pecaSemSaldo
                    ? "Este produto está sem saldo e sem custo médio. Registre uma entrada no estoque antes de usá-lo na manutenção."
                    : semCustoMedio
                      ? "Este produto ainda não possui custo médio. Registre uma entrada com valor antes de usá-lo na manutenção."
                      : "Saldo zerado. Registre uma entrada no estoque antes de consumir na manutenção."}
                </p>
                <button
                  type="button"
                  onClick={() => irRegistrarEntrada(pecaEscolhida!.id)}
                  className={cn("mt-2.5", btnAcaoPrimariaCls)}
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Registrar entrada
                </button>
              </div>
            ) : null}

            <div className="overflow-x-auto border border-gray-100 rounded overflow-hidden">
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Produto ou peça
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[80px]">
                      Qtd
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">
                      Valor Unit.
                    </th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">
                      Total
                    </th>
                    <th className="px-2 py-2.5 w-[48px]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pecas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-[12px]">
                        Nenhum produto ou peça adicionado.
                      </td>
                    </tr>
                  )}
                  {pecas.map((p, i) => (
                    <tr key={`${p.nome}-${i}`} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2.5 align-middle text-gray-800">{p.nome}</td>
                      <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                        {p.quantidade.toLocaleString("pt-BR")}
                        {p.unidade ? ` ${p.unidade}` : ""}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right text-gray-600 tabular-nums">
                        {brl(p.valorUnitario)}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-center font-semibold text-gray-800 tabular-nums">
                        {brl(p.quantidade * p.valorUnitario)}
                      </td>
                      <td className="px-2 py-2.5 align-middle text-center">
                        <TableIconButton
                          label="Remover produto ou peça"
                          tone="danger"
                          compact
                          onClick={() => void removerPeca(i)}
                        >
                          <DeleteActionIcon size={16} />
                        </TableIconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Execução do serviço */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Execução do serviço</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <FormLabel>Tipo de execução</FormLabel>
                <FormNativeSelect
                  variant="light"
                  value={tipoExecucao}
                  onChange={v => {
                    const next = v as TipoExecucao;
                    setTipoExecucao(next);
                    if (next === "interna") {
                      set("prestadorContato", "");
                    }
                  }}
                  options={[
                    { value: "interna", label: "Interna" },
                    { value: "externa", label: "Prestador externo" },
                  ]}
                />
              </div>
              {tipoExecucao === "interna" ? (
                <>
                  <div className="sm:col-span-1 lg:col-span-2">
                    <FormLabel>Responsável interno</FormLabel>
                    <FormInput
                      variant="light"
                      value={form.prestadorNome}
                      onChange={v => set("prestadorNome", v)}
                      placeholder="Ex. Equipe da fazenda"
                    />
                  </div>
                  <div>
                    <FormLabel>Custo da mão de obra (opcional)</FormLabel>
                    <FormInput
                      variant="light"
                      value={form.valorMaoObra}
                      onChange={v => set("valorMaoObra", formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <FormLabel>Prestador ou oficina</FormLabel>
                    <FormInput
                      variant="light"
                      value={form.prestadorNome}
                      onChange={v => set("prestadorNome", v)}
                      placeholder="Ex. Oficina do João"
                    />
                  </div>
                  <div>
                    <FormLabel>Contato</FormLabel>
                    <FormInput
                      variant="light"
                      value={form.prestadorContato}
                      onChange={v => set("prestadorContato", v)}
                      placeholder="Telefone ou e-mail"
                    />
                  </div>
                  <div>
                    <FormLabel>Valor da mão de obra</FormLabel>
                    <FormInput
                      variant="light"
                      value={form.valorMaoObra}
                      onChange={v => set("valorMaoObra", formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Peças</p>
              <p className="text-[18px] font-bold text-gray-800 tabular-nums">{brl(totalPecas)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
              <p className="text-[10px] uppercase text-gray-500">Mão de obra</p>
              <p className="text-[18px] font-bold text-gray-800 tabular-nums">{brl(valorMaoObraNum)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 col-span-2 sm:col-span-1">
              <p className="text-[10px] uppercase text-gray-500">Total da manutenção</p>
              <p className="text-[18px] font-bold text-gray-800 tabular-nums">{brl(totalGeral)}</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() =>
                setLocation(
                  fazendaIdParam
                    ? `/maquinas/manutencao?fazendaId=${encodeURIComponent(fazendaIdParam)}`
                    : "/maquinas/manutencao",
                )
              }
              disabled={pending}
              className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!podeSalvar}
              className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
          </div>
        </div>

        </div>
      </form>
    </AppLayout>
  );
}

export { ManutencaoFormPage };
