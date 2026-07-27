import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FD_PRIMARY,
  FormLabel,
  FormInput,
  FormNativeSelect,
  FormSelect,
  FieldBox,
} from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import {
  CATEGORIAS_PRODUTO,
  SUBCATEGORIAS,
  UNIDADES_OPCOES,
  FABRICANTES,
  normalizarUnidade,
  siglaUnidade,
  rotuloUnidade,
  parseEmbalagens,
  type EmbalagemProduto,
} from "@/lib/produto-types";

function buildRetornoUrl(retorno: string, produtoId?: number) {
  const url = new URL(retorno, window.location.origin);
  if (produtoId) url.searchParams.set("produtoId", String(produtoId));
  return url.pathname + url.search;
}

const fmtDecimalInput = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  if (n === 0) return "";
  return String(n);
};

const CATEGORIA_SANITARIA = "Farmácia";

/** Produtos veterinários/sanitários em que carência de abate faz sentido. */
function isProdutoSanitario(categoria: string, subcategoria: string): boolean {
  if (categoria === CATEGORIA_SANITARIA) return true;
  if (!subcategoria.trim()) return false;
  const s = subcategoria.toLowerCase();
  return /vacina|verm[ií]fugo|medicamento|antibi|ectocida|antiparasit|endectocida|carrapaticida|horm[oô]nio|antiviral|anti-helm|sanit|veterin/.test(s);
}

function formatRotuloEmbalagem(e: EmbalagemProduto): string {
  const nome = e.nome.trim();
  if (e.volume != null && e.unidade) {
    if (/\d/.test(nome) || /\bde\b/i.test(nome)) return nome;
    const volFmt = Number(e.volume).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    return `${nome} de ${volFmt} ${rotuloUnidade(e.unidade)}`;
  }
  return nome;
}

function chaveEmbalagem(e: EmbalagemProduto): string {
  return `${e.nome.trim().toLowerCase()}|${e.volume ?? ""}|${e.unidade ?? ""}`;
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-gray-200 mb-6">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <h2 className="text-[13px] font-semibold text-gray-800">{title}</h2>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed text-gray-500">{description}</p>
        )}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

type FazendaConfigForm = {
  produzido: "sim" | "nao";
  monitorar: "sim" | "nao";
  quantidadeMinima: string;
  quantidadeMaxima: string;
};

type FormState = {
  fazendaIds: string[];
  configPorFazenda: Record<string, FazendaConfigForm>;
  nome: string;
  categoria: string;
  subcategoria: string;
  unidade: string;
  fabricante: string;
  situacao: "ativo" | "inativo";
  carenciaAbate: string;
};

const emptyFazendaConfig = (): FazendaConfigForm => ({
  produzido: "nao",
  monitorar: "nao",
  quantidadeMinima: "",
  quantidadeMaxima: "",
});

const emptyForm = (): FormState => ({
  fazendaIds: [],
  configPorFazenda: {},
  nome: "",
  categoria: "",
  subcategoria: "",
  unidade: "",
  fabricante: "",
  situacao: "ativo",
  carenciaAbate: "",
});

function SimNaoRadios({
  name,
  value,
  onChange,
  label,
}: {
  name: string;
  value: "sim" | "nao";
  onChange: (v: "sim" | "nao") => void;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {label ? <span className="text-[11px] text-gray-500 whitespace-nowrap">{label}</span> : null}
      <div className="inline-flex items-center gap-2.5">
        {(["sim", "nao"] as const).map(opt => (
          <label key={opt} className="flex items-center gap-1 text-[12px] text-gray-700 cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="accent-[#4ECDC4] border-gray-400 focus:ring-[#4ECDC4]"
              style={{ accentColor: FD_PRIMARY }}
            />
            {opt === "sim" ? "Sim" : "Não"}
          </label>
        ))}
      </div>
    </div>
  );
}

function FormRadioGroup({
  value,
  onChange,
  options,
  required,
  invalid,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <FieldBox required={required} variant="light" invalid={invalid}>
      <RadioGroup
        value={value}
        onValueChange={onChange}
        className="flex flex-wrap gap-4 px-3 py-2.5 min-h-[42px] items-center"
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
      >
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
            <RadioGroupItem id={opt.value === value ? id : undefined} value={opt.value} className="border-gray-400 text-[#4ECDC4]" />
            {opt.label}
          </label>
        ))}
      </RadioGroup>
    </FieldBox>
  );
}

type CampoObrigatorioProduto = "nome" | "categoria" | "unidade" | "fazendas";

const TOAST_ID_OBRIGATORIOS = "produto-obrigatorios";

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

export default function ProductRegistrationPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const searchParams = new URLSearchParams(window.location.search);
  const produtoId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;
  const fazendaIdParam = searchParams.get("fazendaId") ?? "";
  const retornoUrl = searchParams.get("retorno") ? decodeURIComponent(searchParams.get("retorno")!) : null;
  const isEdit = produtoId != null && !isNaN(produtoId);

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: produto, isLoading: loadingProduto } = trpc.estoque.get.useQuery(
    { id: produtoId! },
    { enabled: isEdit }
  );

  const { data: todasMovimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    enabled: isEdit,
  });

  const fazendasBloqueadas = useMemo(() => {
    const set = new Set<string>();
    if (!isEdit || !produto) return set;
    const vinculados = (produto as {
      estoquesVinculados?: { fazendaId: number; estoqueId: number; quantidade: string | null }[];
    }).estoquesVinculados ?? [];
    const movIds = new Set(todasMovimentacoes.map(m => m.estoqueId));
    for (const v of vinculados) {
      const qty = Number(v.quantidade ?? 0);
      if (movIds.has(v.estoqueId) || (!Number.isNaN(qty) && qty !== 0)) {
        set.add(String(v.fazendaId));
      }
    }
    return set;
  }, [isEdit, produto, todasMovimentacoes]);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [embalagensProduto, setEmbalagensProduto] = useState<EmbalagemProduto[]>([]);
  const [novaEmbalagem, setNovaEmbalagem] = useState("");
  const [novaEmbalagemVolume, setNovaEmbalagemVolume] = useState("");
  const [novaEmbalagemUnidade, setNovaEmbalagemUnidade] = useState("");
  const [showNovaEmbalagem, setShowNovaEmbalagem] = useState(false);
  const [embalagemUnidadeKey, setEmbalagemUnidadeKey] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [erros, setErros] = useState<Partial<Record<CampoObrigatorioProduto, string>>>({});

  useEffect(() => {
    if (!isEdit && fazendaIdParam && form.fazendaIds.length === 0) {
      setForm(f => ({
        ...f,
        fazendaIds: [fazendaIdParam],
        configPorFazenda: {
          ...f.configPorFazenda,
          [fazendaIdParam]: f.configPorFazenda[fazendaIdParam] ?? emptyFazendaConfig(),
        },
      }));
    }
  }, [isEdit, fazendaIdParam, form.fazendaIds.length]);

  useEffect(() => {
    if (!isEdit && !fazendaIdParam && fazendas.length === 1 && form.fazendaIds.length === 0) {
      const id = String(fazendas[0]!.id);
      setForm(f => ({
        ...f,
        fazendaIds: [id],
        configPorFazenda: {
          ...f.configPorFazenda,
          [id]: f.configPorFazenda[id] ?? emptyFazendaConfig(),
        },
      }));
    }
  }, [isEdit, fazendaIdParam, fazendas, form.fazendaIds.length]);

  const fazendasOpcoes = useMemo(() => {
    const opts = fazendas.map(f => ({ value: String(f.id), label: f.nome }));
    for (const id of form.fazendaIds) {
      if (id && !opts.some(o => o.value === id)) {
        opts.push({ value: id, label: `Fazenda #${id}` });
      }
    }
    return opts;
  }, [fazendas, form.fazendaIds]);

  const subcategorias = useMemo(() => {
    if (!form.categoria) return form.subcategoria ? [form.subcategoria] : [];
    const base = SUBCATEGORIAS[form.categoria] ?? [];
    if (form.subcategoria && !base.includes(form.subcategoria)) {
      return [...base, form.subcategoria];
    }
    return base;
  }, [form.categoria, form.subcategoria]);

  const fabricantesOpcoes = useMemo(() => {
    const opts = FABRICANTES.map(f => ({ value: f, label: f }));
    const atual = form.fabricante.trim();
    if (atual && !opts.some(o => o.value === atual)) {
      opts.unshift({ value: atual, label: atual });
    }
    return opts;
  }, [form.fabricante]);

  const unidadesOpcoes = useMemo(() => {
    const opts = UNIDADES_OPCOES.map(u => ({
      value: u.sigla,
      label: rotuloUnidade(u.sigla),
    }));
    if (form.unidade && !opts.some(o => o.value === form.unidade)) {
      opts.push({ value: form.unidade as any, label: rotuloUnidade(form.unidade) });
    }
    return opts;
  }, [form.unidade]);

  const categoriasOpcoes = useMemo(() => {
    const opts = CATEGORIAS_PRODUTO.map(c => ({ value: c, label: c }));
    if (form.categoria && !opts.some(o => o.value === form.categoria)) {
      opts.push({ value: form.categoria as any, label: form.categoria as any });
    }
    return opts;
  }, [form.categoria]);

  useEffect(() => {
    if (isEdit && produto && !initialized) {
      const embalagensSalvas = parseEmbalagens(produto.embalagens);

      setForm({
        fazendaIds:
          (produto as { fazendaIds?: number[] }).fazendaIds?.map(String) ??
          (produto.fazendaId ? [String(produto.fazendaId)] : []),
        configPorFazenda: (() => {
          const vinculados = (produto as {
            estoquesVinculados?: {
              fazendaId: number;
              produzidoNaFazenda: boolean;
              monitorarEstoque: boolean;
              quantidadeMinima: string | null;
              quantidadeMaxima: string | null;
            }[];
          }).estoquesVinculados;
          if (vinculados?.length) {
            return Object.fromEntries(
              vinculados.map(v => [
                String(v.fazendaId),
                {
                  produzido: v.produzidoNaFazenda ? "sim" : "nao",
                  monitorar: v.monitorarEstoque ? "sim" : "nao",
                  quantidadeMinima: fmtDecimalInput(v.quantidadeMinima),
                  quantidadeMaxima: fmtDecimalInput(v.quantidadeMaxima),
                } satisfies FazendaConfigForm,
              ])
            );
          }
          const ids =
            (produto as { fazendaIds?: number[] }).fazendaIds ??
            (produto.fazendaId ? [produto.fazendaId] : []);
          const legado: FazendaConfigForm = {
            produzido: produto.produzidoNaFazenda ? "sim" : "nao",
            monitorar: produto.monitorarEstoque ? "sim" : "nao",
            quantidadeMinima: fmtDecimalInput(produto.quantidadeMinima),
            quantidadeMaxima: fmtDecimalInput(produto.quantidadeMaxima),
          };
          return Object.fromEntries(ids.map(id => [String(id), { ...legado }]));
        })(),
        nome: produto.nome || "",
        categoria: produto.categoria || "",
        subcategoria: produto.subcategoria || "",
        unidade: normalizarUnidade(produto.unidade),
        fabricante: produto.fabricante || "",
        situacao: produto.situacao === "inativo" ? "inativo" : "ativo",
        carenciaAbate: produto.carenciaAbateDias != null ? String(produto.carenciaAbateDias) : "",
      });

      if (embalagensSalvas.length) {
        setEmbalagensProduto(embalagensSalvas);
      }
      setInitialized(true);
    }
  }, [isEdit, produto, initialized]);

  const voltarParaOrigem = (novoProdutoId?: number) => {
    if (retornoUrl) {
      setLocation(buildRetornoUrl(retornoUrl, novoProdutoId));
      return;
    }
    setLocation("/insumos/lista-produtos");
  };

  const createMutation = trpc.estoque.create.useMutation({
    onSuccess: async data => {
      await utils.estoque.list.invalidate();
      toast.success("Produto cadastrado!");
      if (retornoUrl && data.id) {
        voltarParaOrigem(data.id);
      } else {
        setLocation("/insumos/lista-produtos");
      }
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.estoque.update.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      if (produtoId) utils.estoque.get.invalidate({ id: produtoId });
      toast.success("Produto atualizado!");
      setLocation("/insumos/lista-produtos");
    },
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending;

  const limparErro = (campo: CampoObrigatorioProduto) => {
    setErros(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === "nome") limparErro("nome");
    if (key === "categoria") limparErro("categoria");
    if (key === "unidade") limparErro("unidade");
    if (key === "fazendaIds") limparErro("fazendas");
  };

  const handleAddEmbalagem = () => {
    const tipo = novaEmbalagem.trim();
    const volume = parseFloat(novaEmbalagemVolume.replace(",", "."));
    const unidade = novaEmbalagemUnidade;
    if (!tipo) { toast.error("Informe o nome da embalagem"); return; }
    if (!novaEmbalagemVolume.trim() || Number.isNaN(volume) || volume <= 0) {
      toast.error("Informe a quantidade por embalagem");
      return;
    }
    if (!unidade) { toast.error("Selecione a unidade da embalagem"); return; }

    const item: EmbalagemProduto = {
      nome: tipo,
      volume,
      unidade: siglaUnidade(unidade),
    };
    const chave = chaveEmbalagem(item);
    if (embalagensProduto.some(e => chaveEmbalagem(e) === chave)) {
      toast.error("Esta embalagem já foi incluída");
      return;
    }
    setEmbalagensProduto(prev => [...prev, item]);
    setNovaEmbalagem("");
    setNovaEmbalagemVolume("");
    setNovaEmbalagemUnidade("");
    setEmbalagemUnidadeKey(k => k + 1);
    toast.success("Embalagem adicionada!");
  };

  const handleRemoveEmbalagem = (chave: string) => {
    setEmbalagensProduto(prev => prev.filter(e => chaveEmbalagem(e) !== chave));
  };

  const podeIncluirEmbalagem =
    novaEmbalagem.trim().length > 0 &&
    novaEmbalagemVolume.trim().length > 0 &&
    !!novaEmbalagemUnidade &&
    !Number.isNaN(parseFloat(novaEmbalagemVolume.replace(",", "."))) &&
    parseFloat(novaEmbalagemVolume.replace(",", ".")) > 0;

  const temEmbalagensProduto = embalagensProduto.length > 0;

  const mostrarInfoSanitaria =
    isProdutoSanitario(form.categoria, form.subcategoria) || !!form.carenciaAbate.trim();

  const buildPayload = () => ({
    fazendaIds: form.fazendaIds.map(id => parseInt(id, 10)).filter(id => !Number.isNaN(id) && id > 0),
    fazendaId: form.fazendaIds[0] ? parseInt(form.fazendaIds[0], 10) : undefined,
    estoquesConfig: form.fazendaIds
      .map(id => parseInt(id, 10))
      .filter(id => !Number.isNaN(id) && id > 0)
      .map(fazendaId => {
        const cfg = form.configPorFazenda[String(fazendaId)] ?? emptyFazendaConfig();
        const monitorar = cfg.monitorar === "sim";
        return {
          fazendaId,
          produzidoNaFazenda: cfg.produzido === "sim",
          monitorarEstoque: monitorar,
          quantidadeMinima: monitorar && cfg.quantidadeMinima ? cfg.quantidadeMinima : null,
          quantidadeMaxima: monitorar && cfg.quantidadeMaxima ? cfg.quantidadeMaxima : null,
        };
      }),
    nome: form.nome.trim(),
    categoria: form.categoria,
    subcategoria: form.subcategoria.trim() || "",
    unidade: siglaUnidade(form.unidade),
    fabricante: form.fabricante || undefined,
    situacao: form.situacao,
    embalagens: embalagensProduto.length
      ? embalagensProduto.map(e => ({
          nome: formatRotuloEmbalagem(e),
          volume: e.volume,
          unidade: e.unidade,
        }))
      : undefined,
    possuiCarencia: mostrarInfoSanitaria && !!form.carenciaAbate.trim(),
    ...(mostrarInfoSanitaria && form.carenciaAbate.trim()
      ? {
          carenciaAbateDias: parseInt(form.carenciaAbate, 10),
          carenciaAbateUnidade: "d" as const,
        }
      : {}),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: Partial<Record<CampoObrigatorioProduto, string>> = {};
    if (!form.nome.trim()) next.nome = "Nome do produto é obrigatório.";
    if (!form.categoria) next.categoria = "Categoria é obrigatória.";
    if (!form.unidade) next.unidade = "Unidade base é obrigatória.";
    if (form.fazendaIds.length === 0) {
      next.fazendas = "Selecione pelo menos uma fazenda para usar este produto.";
    }

    if (Object.keys(next).length > 0) {
      setErros(next);
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      const primeiro: CampoObrigatorioProduto = next.nome
        ? "nome"
        : next.categoria
          ? "categoria"
          : next.unidade
            ? "unidade"
            : "fazendas";
      requestAnimationFrame(() => {
        const el = document.getElementById(`produto-field-${primeiro}`);
        if (el instanceof HTMLElement) {
          el.focus({ preventScroll: true });
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      return;
    }

    setErros({});

    for (const id of form.fazendaIds) {
      const cfg = form.configPorFazenda[id] ?? emptyFazendaConfig();
      if (cfg.monitorar !== "sim") continue;
      if (cfg.quantidadeMinima && cfg.quantidadeMaxima) {
        const min = parseFloat(cfg.quantidadeMinima.replace(",", "."));
        const max = parseFloat(cfg.quantidadeMaxima.replace(",", "."));
        if (!Number.isNaN(min) && !Number.isNaN(max) && max < min) {
          const nomeFazenda = fazendasOpcoes.find(f => f.value === id)?.label ?? `Fazenda #${id}`;
          toast.error(`Em ${nomeFazenda}, a quantidade máxima deve ser maior ou igual à mínima.`);
          return;
        }
      }
    }

    const payload = buildPayload();
    if (isEdit && produtoId) updateMutation.mutate({ id: produtoId, ...payload });
    else createMutation.mutate(payload);
  };

  if (isEdit && loadingProduto) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  if (isEdit && !produto) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-3">
          <p>Produto não encontrado.</p>
          <button
            type="button"
            onClick={() => setLocation("/insumos/lista-produtos")}
            className="text-[12px] text-[#4ECDC4] hover:underline"
          >
            Voltar
          </button>
        </div>
      </AppLayout>
    );
  }

  if (isEdit && !initialized) {
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
        onClick={() => voltarParaOrigem()}
        disabled={isBusy}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group disabled:opacity-50"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-white rounded-md shadow-sm border border-gray-200 p-5 sm:p-6">
          <h1
            className="text-[16px] font-semibold text-gray-800 mb-5 pb-4 border-b border-gray-100"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            {isEdit ? "Editar produto" : "Cadastro de Produto"}
          </h1>
          {/* 1. Dados universais do produto */}
          <FormSection
            title="Dados do produto"
            description="Cadastro único no catálogo da conta. Estes dados valem para todas as fazendas vinculadas."
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Nome do Produto</FormLabel>
                  <FormInput
                    id="produto-field-nome"
                    value={form.nome}
                    onChange={v => set("nome", v)}
                    placeholder="Ex: Sal Mineral Proteinado 30kg"
                    required
                    invalid={!!erros.nome}
                    aria-describedby={erros.nome ? "produto-err-nome" : undefined}
                  />
                  <FieldErrorMsg id="produto-err-nome" message={erros.nome} />
                </div>
                <div>
                  <FormLabel required>Categoria</FormLabel>
                  <FormNativeSelect
                    id="produto-field-categoria"
                    value={form.categoria}
                    onChange={v => {
                      setForm(f => ({ ...f, categoria: v, subcategoria: "" }));
                      limparErro("categoria");
                    }}
                    placeholder="Selecione"
                    options={categoriasOpcoes}
                    required
                    invalid={!!erros.categoria}
                    aria-describedby={erros.categoria ? "produto-err-categoria" : undefined}
                  />
                  <FieldErrorMsg id="produto-err-categoria" message={erros.categoria} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <FormLabel>Subcategoria</FormLabel>
                  <FormSelect
                    value={form.subcategoria}
                    onChange={v => set("subcategoria", v)}
                    placeholder="Opcional"
                    disabled={!form.categoria}
                    displayValue={form.subcategoria || undefined}
                    triggerClassName="h-[42px] py-0"
                  >
                    {subcategorias.map(s => (
                      <SelectItem key={s} value={s} className="text-[13px]">
                        {s}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Unidade Base</FormLabel>
                  <FormNativeSelect
                    id="produto-field-unidade"
                    value={form.unidade}
                    onChange={v => set("unidade", v)}
                    placeholder="Selecione"
                    options={unidadesOpcoes}
                    required
                    invalid={!!erros.unidade}
                    aria-describedby={erros.unidade ? "produto-err-unidade" : undefined}
                  />
                  {erros.unidade ? (
                    <FieldErrorMsg id="produto-err-unidade" message={erros.unidade} />
                  ) : (
                    <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
                      Unidade usada para controlar estoque (kg, litro, dose, saco…)
                    </p>
                  )}
                </div>
                <div>
                  <FormLabel>Fabricante</FormLabel>
                  <FormSelect
                    value={form.fabricante}
                    onChange={v => set("fabricante", v)}
                    placeholder="Selecione"
                    displayValue={form.fabricante || undefined}
                    triggerClassName="h-[42px] py-0"
                  >
                    {fabricantesOpcoes.map(f => (
                      <SelectItem key={f.value} value={f.value} className="text-[13px]">
                        {f.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
                <div>
                  <FormLabel required>Situação no catálogo</FormLabel>
                  <FormRadioGroup
                    value={form.situacao}
                    onChange={v => set("situacao", v as "ativo" | "inativo")}
                    options={[
                      { value: "ativo", label: "Ativo" },
                      { value: "inativo", label: "Inativo" },
                    ]}
                    required
                  />
                </div>
              </div>
            </div>
          </FormSection>

          {/* 2. Fazendas vinculadas — config operacional por fazenda */}
          <FormSection
            title="Fazendas vinculadas ao produto"
            description="Selecione em quais fazendas este produto será usado. Cada fazenda terá estoque e controle próprios."
          >
            <div
              id="produto-field-fazendas"
              tabIndex={-1}
              className={`space-y-2 rounded-md outline-none ${erros.fazendas ? "ring-1 ring-red-500 p-2 -m-2" : ""}`}
              aria-invalid={!!erros.fazendas || undefined}
              aria-describedby={erros.fazendas ? "produto-err-fazendas" : undefined}
            >
              {fazendasOpcoes.map(f => {
                const checked = form.fazendaIds.includes(f.value);
                const cfg = form.configPorFazenda[f.value] ?? emptyFazendaConfig();
                const bloqueada = fazendasBloqueadas.has(f.value);
                const siglaUnidadeBase = form.unidade ? siglaUnidade(form.unidade) : "";
                const unidadeEstoqueLabel = siglaUnidadeBase
                  ? siglaUnidadeBase.charAt(0).toUpperCase() + siglaUnidadeBase.slice(1)
                  : "";
                const unidadeAoLado = unidadeEstoqueLabel ? (
                  <span className="text-[11px] text-gray-600 whitespace-nowrap">{unidadeEstoqueLabel}</span>
                ) : (
                  <span className="text-[10px] text-gray-400 whitespace-nowrap max-w-[148px] leading-tight">
                    Selecione a unidade base
                  </span>
                );
                return (
                  <div
                    key={f.value}
                    className={`rounded-md border px-3 py-2.5 transition-colors ${
                      checked ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/40"
                    }`}
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                      <label className="inline-flex items-center gap-2 text-[13px] font-medium text-gray-800 cursor-pointer shrink-0 min-w-[140px]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked && bloqueada) {
                              toast.error(
                                "Este produto possui movimentações ou estoque nesta fazenda. Não é possível desvincular diretamente. Inative o produto para esta fazenda ou ajuste o estoque antes."
                              );
                              return;
                            }
                            setForm(prev => {
                              if (checked) {
                                const { [f.value]: _removed, ...rest } = prev.configPorFazenda;
                                return {
                                  ...prev,
                                  fazendaIds: prev.fazendaIds.filter(id => id !== f.value),
                                  configPorFazenda: rest,
                                };
                              }
                              return {
                                ...prev,
                                fazendaIds: [...prev.fazendaIds, f.value],
                                configPorFazenda: {
                                  ...prev.configPorFazenda,
                                  [f.value]: prev.configPorFazenda[f.value] ?? emptyFazendaConfig(),
                                },
                              };
                            });
                            limparErro("fazendas");
                          }}
                          className="rounded accent-[#4ECDC4] border-gray-400 focus:ring-[#4ECDC4]"
                          style={{ accentColor: FD_PRIMARY }}
                        />
                        {f.label}
                      </label>

                      {checked && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-2 pl-6 lg:pl-0 flex-1">
                          <SimNaoRadios
                            name={`produzido-${f.value}`}
                            label="Produzido na fazenda?"
                            value={cfg.produzido}
                            onChange={v =>
                              setForm(prev => ({
                                ...prev,
                                configPorFazenda: {
                                  ...prev.configPorFazenda,
                                  [f.value]: { ...cfg, produzido: v },
                                },
                              }))
                            }
                          />
                          <SimNaoRadios
                            name={`monitorar-${f.value}`}
                            label="Monitorar estoque:"
                            value={cfg.monitorar}
                            onChange={v =>
                              setForm(prev => ({
                                ...prev,
                                configPorFazenda: {
                                  ...prev.configPorFazenda,
                                  [f.value]: {
                                    ...cfg,
                                    monitorar: v,
                                  },
                                },
                              }))
                            }
                          />
                          {cfg.monitorar === "sim" && (
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                <span className="whitespace-nowrap">Mínimo</span>
                                <input
                                  type="number"
                                  value={cfg.quantidadeMinima}
                                  onChange={e =>
                                    setForm(prev => ({
                                      ...prev,
                                      configPorFazenda: {
                                        ...prev.configPorFazenda,
                                        [f.value]: { ...cfg, quantidadeMinima: e.target.value },
                                      },
                                    }))
                                  }
                                  placeholder="Ex: 10"
                                  className="h-8 w-[88px] rounded border border-gray-300 bg-white px-2 text-[12px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                                />
                                {unidadeAoLado}
                              </label>
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                <span className="whitespace-nowrap">Máximo</span>
                                <input
                                  type="number"
                                  value={cfg.quantidadeMaxima}
                                  onChange={e =>
                                    setForm(prev => ({
                                      ...prev,
                                      configPorFazenda: {
                                        ...prev.configPorFazenda,
                                        [f.value]: { ...cfg, quantidadeMaxima: e.target.value },
                                      },
                                    }))
                                  }
                                  placeholder="Opcional"
                                  className="h-8 w-[88px] rounded border border-gray-300 bg-white px-2 text-[12px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#4ECDC4]"
                                />
                                {unidadeAoLado}
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {fazendasOpcoes.length === 0 && (
                <span className="text-[12px] text-gray-400">Nenhuma fazenda cadastrada.</span>
              )}
            </div>
            <FieldErrorMsg id="produto-err-fazendas" message={erros.fazendas} />
          </FormSection>

          {/* 3. Informações sanitárias — só para produtos veterinários/sanitários */}
          {mostrarInfoSanitaria && (
            <FormSection
              title="Informações sanitárias"
              description="Preencha quando o produto exigir carência para abate ou consumo. Vale para o produto inteiro."
            >
              <div className="max-w-xs">
                <FormLabel>Carência de abate (dias)</FormLabel>
                <FormInput
                  type="number"
                  value={form.carenciaAbate}
                  onChange={v => set("carenciaAbate", v.replace(/\D/g, ""))}
                  placeholder="Ex: 30"
                />
              </div>
            </FormSection>
          )}

          {/* 4. Tipos de embalagem */}
          <FormSection
            title="Tipos de embalagem"
            description="Cadastre como o produto é comprado ou armazenado. Ex: saco de 30 kg, frasco de 500 ml. Vale para todas as fazendas."
          >
            <div className="flex flex-wrap items-center justify-end gap-3 mb-4">
              <button
                type="button"
                onClick={() => setShowNovaEmbalagem(v => !v)}
                className="px-4 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Nova Embalagem
              </button>
            </div>
            {showNovaEmbalagem && (
              <div className="flex flex-wrap items-end gap-2 mb-4 pb-4 border-b border-gray-100">
                <div className="flex-1 min-w-[180px]">
                  <FormLabel>Nome da embalagem</FormLabel>
                  <FormInput
                    value={novaEmbalagem}
                    onChange={v => setNovaEmbalagem(v)}
                    placeholder="Ex: Saco, Frasco, Caixa, Galão"
                  />
                </div>
                <div className="w-28">
                  <FormLabel>Qtd. por embalagem</FormLabel>
                  <FormInput
                    type="number"
                    value={novaEmbalagemVolume}
                    onChange={v => setNovaEmbalagemVolume(v)}
                    placeholder="Ex: 30"
                  />
                </div>
                <div className="w-36">
                  <FormLabel>Unidade</FormLabel>
                  <FormSelect
                    key={embalagemUnidadeKey}
                    value={novaEmbalagemUnidade}
                    onChange={v => setNovaEmbalagemUnidade(v)}
                    placeholder="Selecione"
                    displayValue={novaEmbalagemUnidade ? rotuloUnidade(novaEmbalagemUnidade) : undefined}
                    triggerClassName="h-[42px] py-0"
                  >
                    {unidadesOpcoes.map(o => (
                      <SelectItem key={o.value} value={o.value} className="text-[13px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </FormSelect>
                </div>
                <button
                  type="button"
                  onClick={handleAddEmbalagem}
                  disabled={!podeIncluirEmbalagem}
                  className="px-4 py-2 rounded text-[11px] font-semibold uppercase text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ backgroundColor: FD_PRIMARY }}
                >
                  Incluir
                </button>
              </div>
            )}
            <div>
              {temEmbalagensProduto ? (
                <div>
                  <FormLabel>Embalagens do produto</FormLabel>
                  <ul className="mt-2 space-y-2">
                    {embalagensProduto.map(e => {
                      const chave = chaveEmbalagem(e);
                      return (
                        <li
                          key={chave}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded border border-gray-200 bg-gray-50/60 text-[13px] text-gray-800"
                        >
                          <span>{formatRotuloEmbalagem(e)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmbalagem(chave)}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors shrink-0"
                            title="Remover embalagem"
                            aria-label="Remover embalagem"
                          >
                            <span className="material-icons text-[18px]">close</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="py-2 text-[13px] text-gray-500 leading-relaxed">
                  <p>Nenhuma embalagem cadastrada para este produto.</p>
                  <p className="mt-1">
                    Use &ldquo;Nova Embalagem&rdquo; para informar como o produto é comprado ou armazenado.
                  </p>
                </div>
              )}
            </div>
          </FormSection>

          {/* Salvar */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => voltarParaOrigem()}
              disabled={isBusy}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isBusy}
              className="w-full sm:w-auto px-8 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}

export { ProductRegistrationPage };
