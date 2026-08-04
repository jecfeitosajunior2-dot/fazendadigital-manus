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
  FieldBox,
} from "@/components/FormFields";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ConfirmDialog";
import { DeleteActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import {
  isDescricaoServicoValida,
  MSG_DESCRICAO_SERVICO_OBRIGATORIA,
  normalizeDescricaoServico,
} from "@shared/manutencaoDescricao";

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
 * Categorias existentes no cadastro e compatíveis com manutenção.
 * Exclui Farmácia, Nutricionais, Combustíveis (Abastecimentos) e Agrícolas.
 * Não cria categorias novas — usa apenas as do módulo de Insumos.
 */
const CATEGORIAS_MANUTENCAO_PERMITIDAS = [
  "Peças",
  "Lubrificantes",
  "Ferramentas",
  "Epis",
  "Outros Insumos",
] as const;

const CATEGORIAS_TODAS = [...CATEGORIAS_MANUTENCAO_PERMITIDAS];

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

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pecas, setPecas] = useState<PecaItem[]>([]);
  const [tipoExecucao, setTipoExecucao] = useState<TipoExecucao>("interna");
  const [erroDescricao, setErroDescricao] = useState<string | null>(null);

  const [pecaNome, setPecaNome] = useState("");
  const [pecaQtd, setPecaQtd] = useState("1");
  const [pecaValor, setPecaValor] = useState("");
  const [pecaOpen, setPecaOpen] = useState(false);
  const [pecaSearch, setPecaSearch] = useState("");
  const pecaSearchDebounced = useDebounce(pecaSearch, 250);
  /** "" = Todas as categorias */
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [pecaEscolhida, setPecaEscolhida] = useState<{
    id: number;
    nome: string;
    valorUnitario?: string | number | null;
    quantidadeDisponivel?: number;
    unidade?: string | null;
    doEstoque: boolean;
  } | null>(null);
  const confirm = useConfirm();
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerPad, setFooterPad] = useState(120);

  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      // altura real do rodapé + margem de segurança (desktop/mobile)
      setFooterPad(Math.max(h + 28, 112));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollAboveFooter = (node: HTMLElement | null) => {
    if (!node) return;
    node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    requestAnimationFrame(() => {
      const footer = footerRef.current;
      if (!footer) return;
      const fr = footer.getBoundingClientRect();
      const nr = node.getBoundingClientRect();
      const overlap = nr.bottom - (fr.top - 12);
      if (overlap > 0) {
        const main = node.closest("main");
        if (main) main.scrollBy({ top: overlap, behavior: "smooth" });
        else window.scrollBy({ top: overlap, behavior: "smooth" });
      }
    });
  };

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
      valorUnitario: custo,
      quantidadeDisponivel: item.quantidade != null ? parseFloat(String(item.quantidade)) : undefined,
      unidade: item.unidade ?? undefined,
      doEstoque: true,
    });
    setPecaOpen(false);
    setPecaSearch("");
  };

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
        const fid = Number((item as { fazendaId?: number | null }).fazendaId);
        if (!Number.isFinite(fid) || fid !== fazendaMaquina) return false;
        return true;
      })
      .slice()
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
  }, [estoqueItems, maquinaSelecionada?.fazendaId]);

  const categoriasComItens = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of estoqueAtivos) {
      const cat = String(item.categoria || "").trim();
      const allowed = CATEGORIAS_TODAS.find(c => c.toLowerCase() === cat.toLowerCase());
      if (!allowed) continue;
      counts.set(allowed, (counts.get(allowed) ?? 0) + 1);
    }
    return CATEGORIAS_TODAS.filter(c => (counts.get(c) ?? 0) > 0);
  }, [estoqueAtivos]);

  const filteredEstoque = useMemo(() => {
    let list = estoqueAtivos;
    if (categoriaFiltro) {
      list = list.filter(
        item => String(item.categoria || "").toLowerCase() === categoriaFiltro.toLowerCase(),
      );
    }
    const search = pecaSearchDebounced.trim().toLowerCase();
    if (!search) return list;
    return list.filter(item => {
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
  }, [estoqueAtivos, categoriaFiltro, pecaSearchDebounced]);

  const temFiltroAtivo = !!pecaSearch.trim() || !!categoriaFiltro;
  const semCadastroDisponivel = !loadingEstoque && !temFiltroAtivo && estoqueAtivos.length === 0;
  const semResultadoFiltro = !loadingEstoque && temFiltroAtivo && filteredEstoque.length === 0;

  const limparFiltrosPeca = () => {
    setPecaSearch("");
    setCategoriaFiltro("");
  };

  const qtdNum = parseFloat(pecaQtd.replace(",", "."));
  const custoSelecionado = parseCustoMedioClient(pecaEscolhida?.valorUnitario ?? pecaValor);
  const semCustoMedio =
    !!pecaEscolhida?.doEstoque && pecaEscolhida.id != null && custoSelecionado == null;
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
    setCategoriaFiltro("");
    setPecaOpen(false);
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
      const el = document.getElementById(id);
      if (el) scrollAboveFooter(el);
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
        <div className="space-y-5" style={{ paddingBottom: footerPad }}>
        {/* ── 1. Dados da manutenção ───────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100 flex items-center gap-2"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            <span className="material-icons text-[20px]" style={{ color: FD_PRIMARY }}>
              build
            </span>
            {isEdit ? "Editar manutenção" : "Registro de Manutenção"}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div id="manut-field-maquina">
              <FormLabel required>Máquina</FormLabel>
              <FormNativeSelect
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
                value={form.tipo}
                onChange={v => set("tipo", v)}
                placeholder="Selecione o tipo"
                required
                options={TIPOS_MANUTENCAO.map(t => ({ value: t.value, label: t.label }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div id="manut-field-data">
              <FormLabel required>Data da manutenção</FormLabel>
              <FormDatePicker
                value={form.data}
                onChange={v => set("data", v)}
                placeholder="Selecione a data"
                required
              />
            </div>
            <div>
              <FormLabel>Próxima manutenção</FormLabel>
              <FormDatePicker
                value={form.proximaManutencao}
                onChange={v => set("proximaManutencao", v)}
                placeholder="Selecione a data prevista"
              />
            </div>
          </div>

          {medidorTipo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div id="manut-field-horimetro">
                <FormLabel>{medidorLabel}</FormLabel>
                <div className="relative">
                  <FormInput
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

          <div id="manut-field-descricao" style={{ scrollMarginBottom: footerPad }}>
            <FormLabel required>Descrição do serviço</FormLabel>
            <FormTextarea
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
              onFocus={e => scrollAboveFooter(e.currentTarget)}
            />
            {erroDescricao ? (
              <p id="manut-erro-descricao" className="mt-1 text-[11px] text-red-600" role="alert">
                {erroDescricao}
              </p>
            ) : null}
          </div>
        </div>

        {/* ── 2. Custos da manutenção ──────────────────────────────────── */}
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h2 className="text-[14px] font-semibold text-gray-800 mb-5 pb-3 border-b border-gray-100">
            Custos da manutenção
          </h2>

          {/* Produtos e peças utilizados */}
          <div id="manut-section-pecas" className="pb-5" style={{ scrollMarginBottom: footerPad }}>
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">
              Produtos e peças utilizados
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start mb-4">
              <div className="sm:col-span-5">
                <FormLabel>Produto ou peça</FormLabel>
                <div className="relative">
                  <Popover open={pecaOpen} onOpenChange={setPecaOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-[42px] min-h-[42px] rounded-sm border-gray-200 bg-white shadow-none hover:bg-white",
                          pecaNome ? "pr-9" : undefined,
                        )}
                        aria-label="Selecionar produto ou peça"
                      >
                        <span className="truncate text-[13px] text-gray-800">
                          {pecaNome || "Selecione um produto ou peça..."}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[min(100vw-2rem,440px)] p-0 z-50"
                      align="start"
                      onOpenAutoFocus={e => e.preventDefault()}
                      onInteractOutside={e => {
                        const t = e.target as HTMLElement | null;
                        if (t?.closest?.("[data-radix-select-content]")) {
                          e.preventDefault();
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === "Escape") setPecaOpen(false);
                      }}
                    >
                    <Command
                      shouldFilter={false}
                      className="flex flex-col max-h-[min(380px,70vh)] sm:max-h-[min(400px,70vh)] max-sm:max-h-[min(320px,65vh)]"
                    >
                      <div className="shrink-0 border-b border-gray-100 p-2 flex flex-col gap-2">
                        <CommandInput
                          placeholder="Buscar produto ou peça por nome, código ou categoria"
                          value={pecaSearch}
                          onValueChange={setPecaSearch}
                          aria-label="Buscar produto ou peça"
                        />
                        <div
                          onPointerDown={e => e.stopPropagation()}
                          onKeyDown={e => e.stopPropagation()}
                        >
                          <FormNativeSelect
                            value={categoriaFiltro || "__todas__"}
                            onChange={v => setCategoriaFiltro(v === "__todas__" ? "" : v)}
                            placeholder="Todas as categorias"
                            options={[
                              { value: "__todas__", label: "Todas as categorias" },
                              ...categoriasComItens.map(cat => ({ value: cat, label: cat })),
                            ]}
                            compact
                            modal={false}
                          />
                        </div>
                      </div>
                      <CommandList className="flex-1 max-h-[min(280px,50vh)] max-sm:max-h-[200px] overflow-y-auto">
                        <CommandGroup>
                          {loadingEstoque ? (
                            <div className="px-3 py-8 text-center text-[12px] text-gray-400">
                              Carregando...
                            </div>
                          ) : semCadastroDisponivel ? (
                            <div className="px-3 py-8 text-center">
                              <p className="text-[13px] font-medium text-gray-700">
                                Nenhum produto ou peça disponível.
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                Cadastre ou vincule produtos ao estoque da Fazenda antes de registrar
                                o consumo na manutenção.
                              </p>
                            </div>
                          ) : semResultadoFiltro ? (
                            <div className="px-3 py-8 text-center">
                              <p className="text-[13px] font-medium text-gray-700">
                                Nenhum produto ou peça encontrado.
                              </p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                Revise a busca ou selecione outra categoria.
                              </p>
                              <button
                                type="button"
                                onClick={limparFiltrosPeca}
                                className="mt-3 text-[11px] font-semibold text-[#2D5A5A] hover:underline"
                              >
                                Limpar filtros
                              </button>
                            </div>
                          ) : (
                            filteredEstoque.map(item => {
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
                                <CommandItem
                                  key={item.id}
                                  value={`${item.id}-${item.nome}`}
                                  disabled={semEstoque}
                                  onSelect={() => {
                                    if (semEstoque) return;
                                    handleSelectEstoque(item);
                                  }}
                                  className={cn(
                                    "aria-selected:bg-gray-100",
                                    semEstoque && "opacity-50 cursor-not-allowed",
                                  )}
                                >
                                  <div className="flex-1 min-w-0 py-0.5">
                                    <div className="font-medium text-[13px] text-gray-800 truncate">
                                      {item.nome}
                                    </div>
                                    <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                      {item.categoria || "Sem categoria"}
                                      {semEstoque
                                        ? " · Sem estoque"
                                        : qtd != null
                                          ? ` · Estoque: ${qtd.toLocaleString("pt-BR")}${item.unidade ? ` ${item.unidade}` : ""}`
                                          : " · sem controle"}
                                      {custo != null && Number.isFinite(custo)
                                        ? ` · Custo médio: ${brl(custo)}`
                                        : ""}
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                  {!!pecaNome && (
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        limparSelecaoPeca();
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                      style={{ width: 28, height: 28 }}
                      aria-label="Limpar produto ou peça selecionado"
                      title="Limpar seleção"
                    >
                      <span className="material-icons text-[18px] leading-none">close</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <FormLabel>
                  Qtd
                  {pecaEscolhida?.unidade ? ` (${pecaEscolhida.unidade})` : ""}
                </FormLabel>
                <FieldBox className="h-[42px] min-h-[42px]">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pecaQtd}
                    onChange={e => setPecaQtd(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="1"
                    aria-label="Quantidade"
                    className="w-full h-full bg-transparent px-3 text-[13px] text-gray-800 placeholder:text-gray-400 outline-none border-0"
                  />
                </FieldBox>
                {pecaEscolhida?.quantidadeDisponivel != null && (
                  <p
                    className={cn(
                      "mt-1 text-[10px] font-medium",
                      pecaEscolhida.quantidadeDisponivel > 0 ? "text-gray-500" : "text-red-500",
                    )}
                  >
                    Disp.: {pecaEscolhida.quantidadeDisponivel.toLocaleString("pt-BR")}
                    {pecaEscolhida.unidade ? ` ${pecaEscolhida.unidade}` : ""}
                  </p>
                )}
              </div>
              <div className="sm:col-span-3">
                <FormLabel>Valor Unit.</FormLabel>
                <FieldBox className="h-[42px] min-h-[42px]">
                  <input
                    type="text"
                    value={pecaValor}
                    readOnly
                    tabIndex={-1}
                    placeholder="R$ 0,00"
                    aria-label="Valor unitário"
                    aria-readonly="true"
                    className="w-full h-full bg-transparent px-3 text-[13px] text-gray-700 placeholder:text-gray-400 outline-none border-0 cursor-default"
                  />
                </FieldBox>
                {pecaEscolhida?.doEstoque && !semCustoMedio && (
                  <p className="mt-1 text-[10px] text-gray-500">Custo médio atual do estoque</p>
                )}
                {semCustoMedio && (
                  <p className="mt-1 text-[10px] text-red-600 leading-snug">{MSG_SEM_CUSTO_MEDIO}</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <FormLabel className="invisible select-none" aria-hidden>
                  Adicionar
                </FormLabel>
                <button
                  type="button"
                  onClick={adicionarPeca}
                  disabled={!podeAdicionarPeca}
                  className={cn(
                    "w-full h-[42px] min-h-[42px] rounded-sm text-[12px] font-semibold uppercase tracking-wide text-white transition flex items-center justify-center gap-1.5 shrink-0",
                    podeAdicionarPeca
                      ? "hover:brightness-95 active:scale-[0.97]"
                      : "opacity-50 cursor-not-allowed",
                  )}
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  <span className="material-icons text-[16px]">add</span>
                  Adicionar
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-gray-100 rounded-md" style={{ scrollMarginBottom: footerPad }}>
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                      Produto ou peça
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[80px]">
                      Qtd
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">
                      Valor Unit.
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[130px]">
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
                      <td className="px-3 py-2.5 align-middle text-right font-semibold text-gray-800 tabular-nums">
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
          <div className="border-t border-gray-100 pt-5 pb-5">
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Execução do serviço</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <FormLabel>Tipo de execução</FormLabel>
                <FormNativeSelect
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
                      value={form.prestadorNome}
                      onChange={v => set("prestadorNome", v)}
                      placeholder="Ex. Equipe da fazenda"
                    />
                  </div>
                  <div>
                    <FormLabel>Custo da mão de obra (opcional)</FormLabel>
                    <FormInput
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
                      value={form.prestadorNome}
                      onChange={v => set("prestadorNome", v)}
                      placeholder="Ex. Oficina do João"
                    />
                  </div>
                  <div>
                    <FormLabel>Contato</FormLabel>
                    <FormInput
                      value={form.prestadorContato}
                      onChange={v => set("prestadorContato", v)}
                      placeholder="Telefone ou e-mail"
                    />
                  </div>
                  <div>
                    <FormLabel>Valor da mão de obra</FormLabel>
                    <FormInput
                      value={form.valorMaoObra}
                      onChange={v => set("valorMaoObra", formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Resumo de custos */}
          <div className="border-t border-gray-100 pt-5">
            <h3 className="text-[12px] font-semibold text-gray-700 mb-3">Resumo de custos</h3>
            <div className="w-full sm:ml-auto sm:w-[min(100%,380px)] sm:max-w-[40%] space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-6 min-h-[22px] text-gray-600">
                <span>Peças</span>
                <span className="tabular-nums text-right">{brl(totalPecas)}</span>
              </div>
              <div className="flex items-center justify-between gap-6 min-h-[22px] text-gray-600">
                <span>Mão de obra</span>
                <span className="tabular-nums text-right">{brl(valorMaoObraNum)}</span>
              </div>
              <div className="flex items-center justify-between gap-6 min-h-[28px] text-[13px] font-semibold text-gray-900 pt-2 mt-1 border-t border-gray-200">
                <span>Total da manutenção</span>
                <span className="tabular-nums text-right font-bold">{brl(totalGeral)}</span>
              </div>
            </div>
          </div>
        </div>

        </div>

        {/* ── Rodapé sticky (único) ────────────────────────────────────── */}
        <div
          ref={footerRef}
          className="sticky bottom-0 z-30 shrink-0 bg-white border border-gray-200 rounded-md shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
        >
          <div className="px-4 sm:px-5 py-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-[13px] text-gray-700">
              <span className="text-gray-500">Total:</span>{" "}
              <span className="font-semibold tabular-nums text-gray-900">{brl(totalGeral)}</span>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setLocation("/maquinas/manutencao")}
                disabled={pending}
                className="w-full sm:w-auto px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!podeSalvar}
                className="w-full sm:w-auto px-8 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {pending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { ManutencaoFormPage };
