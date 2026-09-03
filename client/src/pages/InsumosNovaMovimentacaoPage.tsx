import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { DeleteActionIcon, EditActionIcon, TableIconButton } from "@/components/icons/FarmActionIcons";
import { FD_PRIMARY, FieldBox, FormDatePicker, FormInput, FormLabel, FormNativeSelect, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatCurrencyBrl, parseCurrencyBrl } from "@/lib/utils";
import {
  TIPOS_MOVIMENTACAO,
  sinalDoTipo,
  normalizarUnidade,
  nomeUnidadeExibicao,
  rotuloUnidade,
  converterUnidade,
  formatQuantidadeMov,
  formatDataBr,
  toDateInput,
  parseEmbalagens,
  extrairVolumeEmbalagem,
  type EmbalagemProduto,
} from "@/lib/produto-types";
import { isProdutoCombustivel } from "@/lib/combustivel-estoque";

// ─── Estilos compartilhados ─────────────────────────────────────────────────
const inputCls =
  "w-full border border-gray-300 rounded px-3 py-2 text-[13px] text-gray-800 bg-white placeholder-gray-400 focus:outline-none focus:border-[#4ECDC4] focus:ring-1 focus:ring-[#4ECDC4]";
const labelCls = "block text-[12px] font-medium text-gray-600 mb-1";
const sectionTitleCls = "text-[12px] font-semibold text-gray-600 uppercase tracking-wide";
const sectionCardCls = "border border-gray-200 rounded-lg p-4";

const EMB_PREFIX = "emb:";
const FAZENDA_HELPER =
  "Fazenda definida na tela de Movimentações. Para outra fazenda, volte e selecione-a lá.";

function isEmbalagemUnidade(value: string): boolean {
  return value.startsWith(EMB_PREFIX);
}

function embalagemNomeFromValue(value: string): string {
  return value.slice(EMB_PREFIX.length);
}

function embalagemValueFromNome(nome: string): string {
  return `${EMB_PREFIX}${nome}`;
}

function parseEmbalagensProduto(raw: unknown): EmbalagemProduto[] {
  if (Array.isArray(raw)) return parseEmbalagens(JSON.stringify(raw));
  if (typeof raw === "string") return parseEmbalagens(raw);
  return [];
}

function rotuloUnidadeMovimentacao(value: string): string {
  if (!value) return "—";
  if (isEmbalagemUnidade(value)) return embalagemNomeFromValue(value);
  return nomeUnidadeExibicao(value) || rotuloUnidade(value) || value;
}

/** Converte quantidade da unidade/embalagem escolhida para a unidade-base do estoque. */
function quantidadeNaUnidadeBase(
  qtd: number,
  unidadeMov: string,
  prod: { unidade?: string | null; embalagens?: unknown }
): number | null {
  const base = normalizarUnidade(prod.unidade);
  if (!unidadeMov || !Number.isFinite(qtd)) return null;

  if (!isEmbalagemUnidade(unidadeMov)) {
    if (!base) return qtd;
    if (normalizarUnidade(unidadeMov) === base) return qtd;
    return converterUnidade(qtd, unidadeMov, base);
  }

  const nome = embalagemNomeFromValue(unidadeMov);
  const emb = parseEmbalagensProduto(prod.embalagens).find(e => e.nome === nome);
  const extracted = extrairVolumeEmbalagem(nome);
  const volume = emb?.volume ?? extracted.volume;
  const unEmb = normalizarUnidade(emb?.unidade ?? extracted.unidade ?? base);
  if (volume == null || volume <= 0) return null;
  const totalNaUnEmb = qtd * volume;
  if (!base || unEmb === base) return totalNaUnEmb;
  return converterUnidade(totalNaUnEmb, unEmb, base);
}

function opcoesUnidadeDoProduto(prod: {
  unidade?: string | null;
  embalagens?: unknown;
} | null | undefined): { value: string; label: string }[] {
  if (!prod) return [];
  const base = normalizarUnidade(prod.unidade);
  const opts: { value: string; label: string }[] = [];
  if (base) {
    opts.push({ value: base, label: rotuloUnidade(base) });
  }
  for (const emb of parseEmbalagensProduto(prod.embalagens)) {
    const nome = emb.nome?.trim();
    if (!nome) continue;
    opts.push({ value: embalagemValueFromNome(nome), label: nome });
  }
  return opts;
}

function UnidadeMovSelect({
  value,
  onChange,
  required,
  disabled,
  options,
  id,
  invalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  options: { value: string; label: string }[];
  id?: string;
  invalid?: boolean;
  "aria-describedby"?: string;
}) {
  const display = options.find(o => o.value === value)?.label;
  return (
    <FormSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder={disabled ? "Selecione o produto primeiro" : "Selecione a unidade"}
      required={required}
      disabled={disabled}
      variant="light"
      displayValue={display}
      triggerClassName="h-[38px] py-0 bg-white"
      invalid={invalid}
      aria-describedby={ariaDescribedBy}
    >
      {options.map(o => (
        <SelectItem key={o.value} value={o.value} className="text-[13px]">
          {o.label}
        </SelectItem>
      ))}
    </FormSelect>
  );
}

function FazendaReadonlyField({
  label,
  nome,
  invalid,
  errorMessage,
  id,
}: {
  label: string;
  nome: string;
  invalid?: boolean;
  errorMessage?: string;
  id?: string;
}) {
  return (
    <div id={id} tabIndex={-1} className="outline-none">
      <FormLabel required>{label}</FormLabel>
      <FieldBox variant="light" className="bg-gray-50" required invalid={invalid}>
        <div className="w-full min-h-[42px] px-3 py-2.5 text-[13px] text-gray-800">
          {nome || "—"}
        </div>
      </FieldBox>
      {errorMessage ? (
        <p className="mt-1 text-[11px] text-red-600" role="alert">{errorMessage}</p>
      ) : (
        <p className="text-[11px] text-gray-500 mt-1">{FAZENDA_HELPER}</p>
      )}
    </div>
  );
}

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

const TOAST_ID_OBRIGATORIOS = "nova-mov-obrigatorios";
type CampoErroMov =
  | "tipoMov"
  | "fazenda"
  | "fazendaDestino"
  | "data"
  | "itens"
  | "produto"
  | "unidade"
  | "quantidade";

const fmtMoeda = (v: string) => {
  if (!v.trim()) return "R$ 0,00";
  const parsed = parseCurrencyBrl(v);
  if (parsed) {
    return formatCurrencyBrl(String(Math.round(parseFloat(parsed) * 100)));
  }
  const n = parseFloat(v.replace(",", "."));
  if (isNaN(n)) return "R$ 0,00";
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function toCurrencyField(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") {
    if (isNaN(value) || value <= 0) return "";
    return formatCurrencyBrl(String(Math.round(value * 100)));
  }
  const str = String(value).trim();
  // Valor decimal do banco ("28.155...", "50.00") — ponto é decimal, não milhar.
  // parseCurrencyBrl remove os pontos e explode o número.
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const n = parseFloat(str);
    if (isNaN(n) || n <= 0) return "";
    return formatCurrencyBrl(String(Math.round(n * 100)));
  }
  const parsed = parseCurrencyBrl(str);
  if (parsed) {
    const n = parseFloat(parsed);
    if (!isNaN(n) && n > 0) return formatCurrencyBrl(String(Math.round(n * 100)));
  }
  const n = parseFloat(str.replace(/\./g, "").replace(",", "."));
  if (isNaN(n) || n <= 0) return "";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

type Operacao = "Entrada" | "Saída" | "Ajuste" | "Transferência";

const OPERACOES: Operacao[] = ["Entrada", "Saída", "Transferência", "Ajuste"];

function normalizarTipoMov(tipo: string | null | undefined): string {
  if (!tipo) return "Compra";
  const norm = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (norm === "entrada") return "Compra";
  if (norm === "saida") return "Consumo interno";
  if (TIPOS_MOVIMENTACAO.some(t => t.value === tipo)) return tipo;
  return sinalDoTipo(tipo) === "entrada" ? "Compra" : "Consumo interno";
}

function operacaoDoTipo(tipo: string | null | undefined): Operacao {
  const t = normalizarTipoMov(tipo);
  const norm = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (norm.includes("transfer")) return "Transferência";
  if (norm.includes("ajuste")) return "Ajuste";
  return sinalDoTipo(t) === "entrada" ? "Entrada" : "Saída";
}

function tiposPorOperacao(op: Operacao) {
  switch (op) {
    case "Entrada":
      return TIPOS_MOVIMENTACAO.filter(t => t.sinal === "entrada" && !t.value.includes("Ajuste"));
    case "Saída":
      return TIPOS_MOVIMENTACAO.filter(
        t => t.sinal === "saida" && !t.value.includes("Ajuste") && t.value !== "Transferência"
      );
    case "Ajuste":
      return TIPOS_MOVIMENTACAO.filter(t => t.value.includes("Ajuste"));
    case "Transferência":
      return TIPOS_MOVIMENTACAO.filter(t => t.value === "Transferência");
  }
}

function labelDataPorOperacao(op: Operacao): string {
  switch (op) {
    case "Entrada":
      return "Data de Entrada";
    case "Saída":
      return "Data de Saída";
    case "Ajuste":
      return "Data do Ajuste";
    case "Transferência":
      return "Data da Transferência";
  }
}

type FormSnapshot = {
  operacao: Operacao;
  tipoMov: string;
  fazendaId: string;
  fazendaDestinoId: string;
  fornecedorId: string;
  destinoUso: string;
  prodEstoqueId: string;
  prodUnidade: string;
  prodQuantidade: string;
  dataMovimentacao: string;
  prodValorUnitario: string;
  prodDataValidade: string;
};

function snapshotFromForm(f: FormSnapshot): FormSnapshot {
  return { ...f };
}

function temAlteracaoCritica(atual: FormSnapshot, inicial: FormSnapshot): boolean {
  return (
    atual.operacao !== inicial.operacao ||
    atual.tipoMov !== inicial.tipoMov ||
    atual.fazendaId !== inicial.fazendaId ||
    atual.fazendaDestinoId !== inicial.fazendaDestinoId ||
    atual.fornecedorId !== inicial.fornecedorId ||
    atual.destinoUso !== inicial.destinoUso ||
    atual.prodEstoqueId !== inicial.prodEstoqueId ||
    atual.prodUnidade !== inicial.prodUnidade ||
    atual.prodQuantidade !== inicial.prodQuantidade ||
    atual.dataMovimentacao !== inicial.dataMovimentacao ||
    atual.prodValorUnitario !== inicial.prodValorUnitario ||
    atual.prodDataValidade !== inicial.prodDataValidade
  );
}

// ─── Tipo local de produto adicionado ───────────────────────────────────────
type ProdutoLinha = {
  localId: string;
  estoqueId: string;
  unidadeMov: string;
  dataValidade: string;
  valorUnitario: string;
  quantidade: string;
  /** Movimentação já salva (itens extras da mesma nota). */
  movimentacaoId?: number;
};

function movimentacaoToLinha(m: {
  id: number;
  estoqueId: number;
  quantidade: string | number;
  valor?: string | number | null;
  frete?: string | number | null;
  dataValidade?: string | Date | null;
  unidade?: string | null;
}): ProdutoLinha {
  const baseUnit = normalizarUnidade(m.unidade);
  const qtdBase = Math.abs(Number(m.quantidade));
  const valorTotal = m.valor != null ? Number(m.valor) : null;
  const freteLinha = m.frete != null ? Number(m.frete) : 0;
  // `valor` pode incluir frete rateado; o unitário exibido é só o produto.
  const valorProduto =
    valorTotal != null && Number.isFinite(valorTotal)
      ? freteLinha > 0 && freteLinha < Math.abs(valorTotal)
        ? valorTotal - freteLinha
        : valorTotal
      : null;
  const unitario =
    valorProduto != null && qtdBase > 0 ? valorProduto / qtdBase : valorProduto;
  return {
    localId: `mov-${m.id}`,
    estoqueId: String(m.estoqueId),
    unidadeMov: baseUnit,
    dataValidade: toDateInput(m.dataValidade),
    valorUnitario: toCurrencyField(unitario),
    quantidade: String(qtdBase),
    movimentacaoId: m.id,
  };
}

function isMesmaNota(
  atual: {
    id: number;
    grupoId?: string | null;
    fazendaId?: number | null;
    dataMovimentacao?: string | Date | null;
    fornecedor?: string | null;
    notaFiscal?: string | null;
    tipo?: string | null;
  },
  outra: typeof atual
): boolean {
  if (atual.id === outra.id) return false;
  const gA = atual.grupoId?.trim();
  const gB = outra.grupoId?.trim();
  if (gA || gB) return Boolean(gA && gB && gA === gB);
  if ((atual.fazendaId ?? null) !== (outra.fazendaId ?? null)) return false;
  if (toDateInput(atual.dataMovimentacao) !== toDateInput(outra.dataMovimentacao)) return false;
  if ((atual.fornecedor ?? "").trim().toLowerCase() !== (outra.fornecedor ?? "").trim().toLowerCase()) {
    return false;
  }
  if ((atual.notaFiscal ?? "").trim() !== (outra.notaFiscal ?? "").trim()) return false;
  return normalizarTipoMov(atual.tipo) === normalizarTipoMov(outra.tipo);
}

function valorTotalLinha(p: ProdutoLinha): number | null {
  const qtd = Math.abs(parseFloat(p.quantidade.replace(",", ".")));
  const vuStr = parseCurrencyBrl(p.valorUnitario);
  if (!vuStr || isNaN(qtd)) return null;
  const vu = parseFloat(vuStr);
  if (isNaN(vu)) return null;
  return vu * qtd;
}

function formatValorTotalLinha(p: ProdutoLinha): string {
  const total = valorTotalLinha(p);
  if (total == null) return "—";
  return formatCurrencyBrl(String(Math.round(total * 100)));
}

/** Mescla alterações pendentes do mini-formulário com a lista da nota. */
function mesclarLinhasComPendente(produtos: ProdutoLinha[], pendente: ProdutoLinha | null): ProdutoLinha[] {
  if (!pendente) return [...produtos];
  const idx = produtos.findIndex(p => p.localId === pendente.localId);
  if (idx >= 0) {
    const linhas = [...produtos];
    linhas[idx] = pendente;
    return linhas;
  }
  return [...produtos, pendente];
}

const INSUMOS_MOV_DRAFT_KEY = "fd_insumos_mov_draft";

type InsumosMovDraft = {
  operacao: Operacao;
  tipoMov: string;
  fazendaId: string;
  fazendaDestinoId: string;
  destinoUso: string;
  fornecedorId: string;
  fornecedorLegado: string;
  notaFiscal: string;
  dataMovimentacao: string;
  frete: string;
  fiscalExpanded: boolean;
  prodEstoqueId: string;
  prodUnidade: string;
  prodDataValidade: string;
  prodValorUnitario: string;
  prodQuantidade: string;
  produtos: ProdutoLinha[];
  initialized: boolean;
  initialSnapshot: FormSnapshot | null;
};

// ─── Componente ─────────────────────────────────────────────────────────────
export default function InsumosNovaMovimentacaoPage() {
  const [, setLocation] = useLocation();
  const confirm = useConfirm();
  const searchParams = new URLSearchParams(window.location.search);
  const movId = searchParams.get("id") ? parseInt(searchParams.get("id")!, 10) : null;
  const isEdit = movId != null && !isNaN(movId);
  const fazendaIdQuery = searchParams.get("fazendaId")?.trim() || "";

  // Campos globais da movimentação
  const [operacao, setOperacao] = useState<Operacao>("Entrada");
  const [tipoMov, setTipoMov] = useState("Compra");
  const [fazendaId, setFazendaId] = useState(fazendaIdQuery);
  const [fazendaDestinoId, setFazendaDestinoId] = useState("");
  const [destinoUso, setDestinoUso] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedorLegado, setFornecedorLegado] = useState("");
  const [notaFiscal, setNotaFiscal] = useState("");
  const [dataMovimentacao, setDataMovimentacao] = useState(() => new Date().toISOString().slice(0, 10));
  const [frete, setFrete] = useState("");
  const [fiscalExpanded, setFiscalExpanded] = useState(false);

  // Mini-formulário de produto (linha sendo preenchida)
  const [prodEstoqueId, setProdEstoqueId] = useState("");
  const [prodUnidade, setProdUnidade] = useState("");
  const [prodDataValidade, setProdDataValidade] = useState("");
  const [prodValorUnitario, setProdValorUnitario] = useState("");
  const [prodQuantidade, setProdQuantidade] = useState("");

  // Lista de produtos da nota (fonte da verdade)
  const [produtos, setProdutos] = useState<ProdutoLinha[]>([]);
  const [editandoLinhaId, setEditandoLinhaId] = useState<string | null>(null);
  const [movimentacoesRemovidas, setMovimentacoesRemovidas] = useState<number[]>([]);
  const [erros, setErros] = useState<Partial<Record<CampoErroMov, string>>>({});
  const siblingsLoadedRef = useRef(false);
  const initialProdutosRef = useRef<string>("[]");

  // Inicialização no modo edição
  const [initialized, setInitialized] = useState(false);
  const initialSnapshotRef = useRef<FormSnapshot | null>(null);
  const draftRestoredRef = useRef(false);

  // Restaura rascunho ao voltar do cadastro de fornecedor ou produto
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const novoFornecedorId = params.get("fornecedorId");
    const novoProdutoId = params.get("produtoId");
    const raw = sessionStorage.getItem(INSUMOS_MOV_DRAFT_KEY);

    if (raw) {
      try {
        const draft = JSON.parse(raw) as InsumosMovDraft;
        setOperacao(draft.operacao);
        setTipoMov(draft.tipoMov);
        setFazendaId(draft.fazendaId);
        setFazendaDestinoId(draft.fazendaDestinoId);
        setDestinoUso(draft.destinoUso);
        setFornecedorId(draft.fornecedorId);
        setFornecedorLegado(draft.fornecedorLegado);
        setNotaFiscal(draft.notaFiscal);
        setDataMovimentacao(draft.dataMovimentacao);
        setFrete(draft.frete);
        setFiscalExpanded(draft.fiscalExpanded);
        setProdEstoqueId(draft.prodEstoqueId);
        setProdUnidade(draft.prodUnidade);
        setProdDataValidade(draft.prodDataValidade);
        setProdValorUnitario(toCurrencyField(draft.prodValorUnitario));
        setProdQuantidade(draft.prodQuantidade);
        setProdutos(draft.produtos);
        initialSnapshotRef.current = draft.initialSnapshot;
        setInitialized(draft.initialized);
        draftRestoredRef.current = true;
      } catch {
        /* rascunho inválido */
      }
      sessionStorage.removeItem(INSUMOS_MOV_DRAFT_KEY);
    }

    if (novoFornecedorId) {
      setFornecedorId(novoFornecedorId);
      params.delete("fornecedorId");
    }

    if (novoProdutoId) {
      setProdEstoqueId(novoProdutoId);
      setProdUnidade("");
      params.delete("produtoId");
    }

    if (novoFornecedorId || novoProdutoId) {
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: estoqueList = [] } = trpc.estoque.list.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const { data: fornecedores = [] } = trpc.pessoas.list.useQuery({ tipo: "fornecedor" });
  const { data: movimentacao, isLoading: loadingMov, isError } = trpc.estoque.getMovimentacao.useQuery(
    { id: movId! },
    { enabled: isEdit }
  );
  const { data: todasMovimentacoes = [] } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    enabled: isEdit,
  });

  const utils = trpc.useUtils();

  // Sincroniza unidade ao retornar com produto recém-cadastrado
  useEffect(() => {
    if (!prodEstoqueId || prodUnidade || !estoqueList.length) return;
    const prod = estoqueList.find(p => String(p.id) === prodEstoqueId);
    if (prod) setProdUnidade(normalizarUnidade(prod.unidade));
  }, [estoqueList, prodEstoqueId, prodUnidade]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const tiposFiltrados = useMemo(() => tiposPorOperacao(operacao), [operacao]);

  const isEntrada = operacao === "Entrada";
  const isSaida = operacao === "Saída";
  const isAjuste = operacao === "Ajuste";
  const isTransferencia = operacao === "Transferência";

  const fornecedorOpcoes = useMemo(
    () => fornecedores.map(f => ({ value: String(f.id), label: f.nome })),
    [fornecedores]
  );

  const fazendaOpcoes = useMemo(
    () => fazendas.map(f => ({ value: String(f.id), label: f.nome })),
    [fazendas]
  );

  const produtoOpcoes = useMemo(() => {
    if (!fazendaId) return [];
    return estoqueList
      .filter(p => {
        if (String(p.fazendaId ?? "") !== fazendaId) return false;
        // Ativo na fazenda (status operacional do estoque)
        if (p.situacao === "inativo") return false;
        return true;
      })
      .map(p => ({ value: String(p.id), label: p.nome }));
  }, [estoqueList, fazendaId]);

  // Se a fazenda mudar e o produto selecionado não pertencer a ela, limpa o formulário de item
  useEffect(() => {
    if (!fazendaId || !prodEstoqueId) return;
    const ok = estoqueList.some(
      p => String(p.id) === prodEstoqueId && String(p.fazendaId ?? "") === fazendaId
    );
    if (!ok) {
      setProdEstoqueId("");
      setProdUnidade("");
    }
  }, [fazendaId, prodEstoqueId, estoqueList]);

  const operacaoOpcoes = useMemo(
    () => OPERACOES.map(op => ({ value: op, label: op })),
    []
  );

  const tipoMovOpcoes = useMemo(
    () => tiposFiltrados.map(t => ({ value: t.value, label: t.value })),
    [tiposFiltrados]
  );

  const nomeFornecedorSelecionado = useMemo(() => {
    const p = fornecedores.find(f => String(f.id) === fornecedorId);
    return p?.nome ?? "";
  }, [fornecedores, fornecedorId]);

  const exibirBlocoFiscal = isEntrada;
  const temDadosFiscaisLegados = !!(fornecedorLegado.trim() || notaFiscal.trim() || frete.trim());
  const exibirFiscalSecundario = !isEntrada && temDadosFiscaisLegados;

  const exibirValorValidade = isEntrada || isAjuste;
  const labelData = labelDataPorOperacao(operacao);

  const formSnapshotAtual = useMemo<FormSnapshot>(
    () => ({
      operacao,
      tipoMov,
      fazendaId,
      fazendaDestinoId,
      fornecedorId,
      destinoUso,
      prodEstoqueId,
      prodUnidade,
      prodQuantidade,
      dataMovimentacao,
      prodValorUnitario,
      prodDataValidade,
    }),
    [
      operacao,
      tipoMov,
      fazendaId,
      fazendaDestinoId,
      fornecedorId,
      destinoUso,
      prodEstoqueId,
      prodUnidade,
      prodQuantidade,
      dataMovimentacao,
      prodValorUnitario,
      prodDataValidade,
    ]
  );

  const produtoSelecionado = useMemo(
    () => estoqueList.find(p => String(p.id) === prodEstoqueId),
    [estoqueList, prodEstoqueId]
  );
  const unidadeBaseSelecionada = normalizarUnidade(produtoSelecionado?.unidade);
  const unidadeMovOpcoes = useMemo(
    () => opcoesUnidadeDoProduto(produtoSelecionado),
    [produtoSelecionado]
  );

  const fazendaNomeSelecionada = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId)?.nome ?? "",
    [fazendas, fazendaId]
  );

  /** Preview da conversão lançamento → unidade base, exibido sob a quantidade. */
  const previewConversao = useMemo(() => {
    const qtd = parseFloat(prodQuantidade.replace(",", "."));
    if (!prodEstoqueId || !produtoSelecionado || isNaN(qtd) || qtd <= 0 || !prodUnidade) {
      return null;
    }
    if (!isEmbalagemUnidade(prodUnidade) && normalizarUnidade(prodUnidade) === unidadeBaseSelecionada) {
      return null;
    }
    const convertida = quantidadeNaUnidadeBase(Math.abs(qtd), prodUnidade, produtoSelecionado);
    if (convertida == null) {
      return {
        erro: isEmbalagemUnidade(prodUnidade)
          ? `Não foi possível converter a embalagem "${rotuloUnidadeMovimentacao(prodUnidade)}" para a unidade-base do estoque.`
          : `Unidade ${rotuloUnidadeMovimentacao(prodUnidade)} é incompatível com a unidade base ${rotuloUnidade(
              unidadeBaseSelecionada
            )} do produto.`,
      };
    }
    if (!unidadeBaseSelecionada) return null;
    if (!isEmbalagemUnidade(prodUnidade) && normalizarUnidade(prodUnidade) === unidadeBaseSelecionada) {
      return null;
    }
    return {
      texto: `${formatQuantidadeMov(Math.abs(qtd))} ${rotuloUnidadeMovimentacao(prodUnidade)} = ${formatQuantidadeMov(
        convertida
      )} ${nomeUnidadeExibicao(unidadeBaseSelecionada)} (unidade base do estoque).`,
    };
  }, [prodEstoqueId, prodQuantidade, prodUnidade, produtoSelecionado, unidadeBaseSelecionada]);

  // ── Inicializar edição ────────────────────────────────────────────────────
  useEffect(() => {
    if (draftRestoredRef.current || !isEdit || !movimentacao || initialized) return;

    const status = String((movimentacao as { status?: string | null }).status || "ativa").toLowerCase();
    if (status === "estornada" || status === "estorno") {
      toast.error("Movimentação estornada não pode ser editada.");
      setLocation("/insumos/movimentacao");
      return;
    }

    const abastId = (movimentacao as { abastecimentoId?: number | null }).abastecimentoId;
    if (abastId != null) {
      toast.error(
        "Esta movimentação foi gerada automaticamente por um abastecimento. Edite o abastecimento de origem para atualizar as informações.",
      );
      setLocation(`/maquinas/abastecimento/cadastro?id=${abastId}`);
      return;
    }

    const tipoNorm = normalizarTipoMov(movimentacao.tipo ?? undefined);
    const op = operacaoDoTipo(movimentacao.tipo ?? undefined);
    setOperacao(op);
    setTipoMov(tipoNorm);
    if (movimentacao.fazendaId) {
      setFazendaId(String(movimentacao.fazendaId));
    }
    const fornecedorNome = movimentacao.fornecedor?.trim() ?? "";
    const fornecedorMatch = fornecedores.find(
      f => f.nome.trim().toLowerCase() === fornecedorNome.toLowerCase()
    );
    setFornecedorId(fornecedorMatch ? String(fornecedorMatch.id) : "");
    setFornecedorLegado(!fornecedorMatch && fornecedorNome ? fornecedorNome : "");
    setNotaFiscal(movimentacao.notaFiscal ?? "");
    setDataMovimentacao(toDateInput(movimentacao.dataMovimentacao));
    // Frete da nota = soma dos rateios; ajustado de novo ao carregar os irmãos.
    setFrete(toCurrencyField(movimentacao.frete));

    const destStr = movimentacao.destino?.trim() ?? "";
    if (op === "Transferência" && destStr) {
      const fazDest = fazendas.find(f => f.nome === destStr);
      if (fazDest) setFazendaDestinoId(String(fazDest.id));
    } else if (op === "Saída") {
      setDestinoUso(destStr);
    }

    const linhaInicial = movimentacaoToLinha(movimentacao);
    setProdutos([linhaInicial]);
    initialProdutosRef.current = JSON.stringify([linhaInicial]);
    setProdEstoqueId("");
    setProdUnidade("");
    setProdDataValidade("");
    setProdValorUnitario("");
    setProdQuantidade("");
    setEditandoLinhaId(null);

    initialSnapshotRef.current = snapshotFromForm({
      operacao: op,
      tipoMov: tipoNorm,
      fazendaId: movimentacao.fazendaId ? String(movimentacao.fazendaId) : "",
      fazendaDestinoId:
        op === "Transferência" && destStr
          ? String(fazendas.find(f => f.nome === destStr)?.id ?? "")
          : "",
      fornecedorId: fornecedorMatch ? String(fornecedorMatch.id) : "",
      destinoUso: op === "Saída" ? destStr : "",
      prodEstoqueId: "",
      prodUnidade: "",
      prodQuantidade: "",
      dataMovimentacao: toDateInput(movimentacao.dataMovimentacao),
      prodValorUnitario: "",
      prodDataValidade: "",
    });

    setInitialized(true);
  }, [isEdit, movimentacao, initialized, fazendas, fornecedores]);

  // Carrega outros produtos da mesma nota (movimentações irmãs)
  useEffect(() => {
    if (draftRestoredRef.current || !isEdit || !movimentacao || !initialized || siblingsLoadedRef.current) {
      return;
    }
    if (!todasMovimentacoes.length) return;

    const doGrupo = todasMovimentacoes.filter(
      m => m.id === movimentacao.id || isMesmaNota(movimentacao, m),
    );
    const irmaos = doGrupo
      .filter(m => m.id !== movimentacao.id)
      .map(m => movimentacaoToLinha(m));

    // Frete no card é o total da nota (soma dos rateios por item).
    const freteTotalNota = doGrupo.reduce((s, m) => {
      const f = Number(m.frete ?? 0);
      return s + (Number.isFinite(f) ? f : 0);
    }, 0);
    if (freteTotalNota > 0) {
      setFrete(toCurrencyField(freteTotalNota));
    }

    if (irmaos.length) {
      setProdutos(prev => {
        const ids = new Set(prev.map(p => p.estoqueId));
        const novos = irmaos.filter(i => !ids.has(i.estoqueId));
        const merged = novos.length ? [...prev, ...novos] : prev;
        initialProdutosRef.current = JSON.stringify(merged);
        return merged;
      });
    }
    siblingsLoadedRef.current = true;
  }, [isEdit, movimentacao, initialized, todasMovimentacoes]);

  // Vincula fornecedor quando a lista carrega após a movimentação
  useEffect(() => {
    if (!isEdit || !movimentacao || !fornecedores.length || fornecedorId) return;
    const fornecedorNome = movimentacao.fornecedor?.trim() ?? "";
    if (!fornecedorNome) return;
    const match = fornecedores.find(f => f.nome.trim().toLowerCase() === fornecedorNome.toLowerCase());
    if (match) {
      setFornecedorId(String(match.id));
      setFornecedorLegado("");
    } else if (!fornecedorLegado) {
      setFornecedorLegado(fornecedorNome);
    }
  }, [isEdit, movimentacao, fornecedores, fornecedorId, fornecedorLegado]);

  // ── Auto-preencher unidade ao selecionar produto ──────────────────────────
  const onProdutoChange = (id: string) => {
    setProdEstoqueId(id);
    const prod = estoqueList.find(p => String(p.id) === id);
    setProdUnidade(prod ? normalizarUnidade(prod.unidade) : "");
    limparErro("produto");
    limparErro("itens");
    limparErro("unidade");
  };

  // ── Ao mudar operação, reajustar motivo/tipo se necessário ────────────────
  const onOperacaoChange = (op: Operacao) => {
    setOperacao(op);
    const tipos = tiposPorOperacao(op);
    if (!tipos.find(t => t.value === tipoMov)) {
      setTipoMov(tipos[0]?.value ?? "");
    }
    if (op === "Transferência") {
      setTipoMov("Transferência");
    }
  };

  const persistirRascunho = () => {
    const draft: InsumosMovDraft = {
      operacao,
      tipoMov,
      fazendaId,
      fazendaDestinoId,
      destinoUso,
      fornecedorId,
      fornecedorLegado,
      notaFiscal,
      dataMovimentacao,
      frete,
      fiscalExpanded,
      prodEstoqueId,
      prodUnidade,
      prodDataValidade,
      prodValorUnitario,
      prodQuantidade,
      produtos,
      initialized,
      initialSnapshot: initialSnapshotRef.current,
    };
    sessionStorage.setItem(INSUMOS_MOV_DRAFT_KEY, JSON.stringify(draft));
  };

  const irCadastrarFornecedor = () => {
    persistirRascunho();
    const retorno = window.location.pathname + window.location.search;
    setLocation(`/financeiro/pessoas?novo=fornecedor&retorno=${encodeURIComponent(retorno)}`);
  };

  const irCadastrarProduto = () => {
    persistirRascunho();
    const retorno = window.location.pathname + window.location.search;
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("retorno", retorno);
    setLocation(`/insumos/cadastro?${qs.toString()}`);
  };

  const resolverDestinoPayload = (): string | undefined => {
    if (isTransferencia && fazendaDestinoId) {
      const faz = fazendas.find(f => String(f.id) === fazendaDestinoId);
      return faz?.nome?.trim() || undefined;
    }
    if (isSaida && destinoUso.trim()) return destinoUso.trim();
    return undefined;
  };

  // ── Validação de uma linha (mini-form ou da lista) ────────────────────────
  const validarLinha = (p: ProdutoLinha): string | null => {
    const prod = estoqueList.find(e => String(e.id) === p.estoqueId);
    if (!prod) return "Produto não encontrado.";
    if (String(prod.fazendaId ?? "") !== fazendaId) {
      return `${prod.nome} não pertence à fazenda desta movimentação.`;
    }
    if (prod.situacao === "inativo") {
      return `${prod.nome} está inativo nesta fazenda.`;
    }
    if (!p.unidadeMov) return `Selecione a unidade de movimentação de ${prod.nome}.`;
    const qtd = parseFloat(p.quantidade.replace(",", "."));
    if (isNaN(qtd) || qtd <= 0) return `Informe a quantidade de ${prod.nome} (maior que zero).`;
    const opcoes = opcoesUnidadeDoProduto(prod);
    if (!opcoes.some(o => o.value === p.unidadeMov)) {
      return `Unidade inválida para ${prod.nome}.`;
    }
    if (quantidadeNaUnidadeBase(qtd, p.unidadeMov, prod) == null) {
      return `Não foi possível converter a quantidade de ${prod.nome} para a unidade-base do estoque.`;
    }
    return null;
  };

  const limparMiniForm = () => {
    setProdEstoqueId("");
    setProdUnidade("");
    setProdDataValidade("");
    setProdValorUnitario("");
    setProdQuantidade("");
    setEditandoLinhaId(null);
  };

  const carregarLinhaNoForm = (p: ProdutoLinha) => {
    setProdEstoqueId(p.estoqueId);
    setProdUnidade(p.unidadeMov);
    setProdDataValidade(p.dataValidade);
    setProdValorUnitario(p.valorUnitario);
    setProdQuantidade(p.quantidade);
    setEditandoLinhaId(p.localId);
  };

  const incluirProduto = () => {
    if (!prodEstoqueId) {
      toast.error("Selecione o produto.");
      return;
    }
    if (!prodUnidade) {
      toast.error("Selecione a unidade de movimentação.");
      return;
    }
    const qtdCheck = parseFloat(prodQuantidade.replace(",", "."));
    if (!prodQuantidade.trim() || isNaN(qtdCheck) || qtdCheck <= 0) {
      toast.error("Informe uma quantidade válida e maior que zero.");
      return;
    }
    const dup = produtos.find(p => p.estoqueId === prodEstoqueId && p.localId !== editandoLinhaId);
    if (dup) {
      toast.error("Este produto já foi incluído na nota.");
      return;
    }
    const existente = editandoLinhaId ? produtos.find(p => p.localId === editandoLinhaId) : null;
    const linha: ProdutoLinha = {
      localId: editandoLinhaId ?? String(Date.now()),
      estoqueId: prodEstoqueId,
      unidadeMov: prodUnidade,
      dataValidade: prodDataValidade,
      valorUnitario: prodValorUnitario,
      quantidade: prodQuantidade,
      movimentacaoId: existente?.movimentacaoId,
    };
    const erro = validarLinha(linha);
    if (erro) {
      toast.error(erro);
      return;
    }
    setProdutos(prev =>
      editandoLinhaId ? prev.map(p => (p.localId === editandoLinhaId ? linha : p)) : [...prev, linha]
    );
    limparErro("itens");
    limparErro("produto");
    limparErro("unidade");
    limparErro("quantidade");
    limparMiniForm();
  };

  const removerProduto = async (localId: string) => {
    const linha = produtos.find(p => p.localId === localId);
    if (!linha) return;

    const prod = estoqueList.find(e => String(e.id) === linha.estoqueId);
    const nome = prod?.nome ?? "este produto";
    const qtdLinha = Math.abs(parseFloat(String(linha.quantidade).replace(",", ".")) || 0);
    const saldoAtual = Number(prod?.quantidade ?? 0);
    const isEntrada = sinalDoTipo(tipoMov) === "entrada";

    // Pré-checagem: remover item de compra exige retirar do estoque.
    if (linha.movimentacaoId && isEntrada && qtdLinha > 0 && saldoAtual < qtdLinha) {
      toast.error(
        `Não é possível remover "${nome}": estoque insuficiente para reverter a entrada (necessário ${qtdLinha}, saldo ${saldoAtual}). Use Estornar na listagem ou ajuste o estoque antes.`,
      );
      return;
    }

    const ok = await confirm({
      title: "Remover item da nota",
      description: linha.movimentacaoId
        ? isEntrada
          ? `Remover "${nome}" vai excluir essa linha do histórico e baixar ${qtdLinha} do estoque ao salvar. Para desfazer a nota inteira com auditoria, use Estornar na listagem.`
          : `Remover "${nome}" vai excluir essa linha do histórico e devolver a quantidade ao estoque ao salvar. Para desfazer a nota inteira com auditoria, use Estornar na listagem.`
        : `Tem certeza que deseja remover "${nome}" desta nota? O item será retirado da lista.`,
      confirmText: "Remover item",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    if (linha.movimentacaoId) {
      setMovimentacoesRemovidas(prev =>
        prev.includes(linha.movimentacaoId!) ? prev : [...prev, linha.movimentacaoId!]
      );
    }
    if (editandoLinhaId === localId) limparMiniForm();
    setProdutos(prev => prev.filter(p => p.localId !== localId));
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = trpc.estoque.createMovimentacao.useMutation({
    onError: e => toast.error(e.message),
  });
  const updateMutation = trpc.estoque.updateMovimentacao.useMutation({
    onError: e => toast.error(e.message),
  });
  const deleteMutation = trpc.estoque.deleteMovimentacao.useMutation({
    onError: e => toast.error(e.message),
  });

  const isBusy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  /** Garante que o resumo de movimentações reflita edições antes de sair da tela. */
  const sincronizarResumoMovimentacoes = async (idsAfetados: number[] = []) => {
    const ids = [...new Set(idsAfetados)];
    await Promise.all([
      utils.estoque.listMovimentacoes.invalidate(),
      utils.estoque.list.invalidate(),
      utils.estoque.resumo.invalidate(),
      ...ids.map(id => utils.estoque.getMovimentacao.invalidate({ id })),
    ]);
    await utils.estoque.listMovimentacoes.refetch();
  };

  /** Monta uma linha a partir do mini-formulário, se houver dados pendentes. */
  const linhaPendente = (): ProdutoLinha | null => {
    if (!prodEstoqueId || !prodQuantidade.trim()) return null;
    const existente = editandoLinhaId ? produtos.find(p => p.localId === editandoLinhaId) : null;
    return {
      localId: editandoLinhaId ?? "pendente",
      estoqueId: prodEstoqueId,
      unidadeMov: prodUnidade,
      dataValidade: prodDataValidade,
      valorUnitario: prodValorUnitario,
      quantidade: prodQuantidade,
      movimentacaoId: existente?.movimentacaoId,
    };
  };

  const formPendenteIncompleto =
    !!(prodEstoqueId || prodQuantidade.trim() || prodUnidade || prodDataValidade || prodValorUnitario.trim()) &&
    !linhaPendente();

  const coletarLinhasParaSalvar = (): ProdutoLinha[] =>
    mesclarLinhasComPendente(produtos, linhaPendente());

  const totalValorNota = useMemo(() => {
    let sum = 0;
    let temValor = false;
    for (const p of mesclarLinhasComPendente(produtos, linhaPendente())) {
      const total = valorTotalLinha(p);
      if (total != null) {
        sum += total;
        temValor = true;
      }
    }
    return temValor ? sum : null;
  }, [produtos, prodEstoqueId, prodQuantidade, prodValorUnitario, prodUnidade, prodDataValidade, editandoLinhaId]);

  const freteNumero = useMemo(() => {
    const parsed = parseCurrencyBrl(frete);
    if (!parsed) return 0;
    const n = parseFloat(parsed);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [frete]);

  const totalNotaComFrete = useMemo(() => {
    if (totalValorNota == null) return null;
    return totalValorNota + freteNumero;
  }, [totalValorNota, freteNumero]);

  const produtosAlterados =
    JSON.stringify(mesclarLinhasComPendente(produtos, linhaPendente())) !== initialProdutosRef.current ||
    movimentacoesRemovidas.length > 0;

  /** Converte uma linha para o payload do servidor (quantidade na unidade base). */
  const prepararPayload = (
    p: ProdutoLinha,
    sinal: "entrada" | "saida",
    rateio?: { subtotal: number; freteTotal: number },
    grupoId?: string
  ) => {
    const prod = estoqueList.find(e => String(e.id) === p.estoqueId)!;
    const baseUnit = normalizarUnidade(prod.unidade);
    const qtd = Math.abs(parseFloat(p.quantidade.replace(",", ".")));
    const convertida = quantidadeNaUnidadeBase(qtd, p.unidadeMov, prod);
    if (convertida == null) {
      throw new Error(`Não foi possível converter a quantidade de ${prod.nome}.`);
    }
    const qtdFinal = sinal === "saida" ? -convertida : convertida;
    const vuStr = parseCurrencyBrl(p.valorUnitario);
    const vu = vuStr ? parseFloat(vuStr) : NaN;
    const valorLinha = !isNaN(vu) ? vu * qtd : 0;
    let freteShare = 0;
    if (
      isEntrada &&
      rateio &&
      rateio.freteTotal > 0 &&
      rateio.subtotal > 0 &&
      valorLinha > 0
    ) {
      freteShare = rateio.freteTotal * (valorLinha / rateio.subtotal);
    }
    const valorComFrete = valorLinha + freteShare;
    return {
      estoqueId: Number(p.estoqueId),
      fazendaId: Number(fazendaId),
      grupoId,
      tipo: tipoMov,
      dataMovimentacao: dataMovimentacao,
      quantidade: String(qtdFinal),
      dataValidade: exibirValorValidade && p.dataValidade ? p.dataValidade : undefined,
      destino: resolverDestinoPayload(),
      fornecedor: isEntrada && nomeFornecedorSelecionado ? nomeFornecedorSelecionado : undefined,
      notaFiscal: isEntrada && notaFiscal.trim() ? notaFiscal.trim() : undefined,
      frete: isEntrada && freteShare > 0 ? String(freteShare) : undefined,
      valor: isEntrada && valorComFrete > 0 ? String(valorComFrete) : undefined,
      modo: "direto" as const,
      sinal,
      unidadeLancamento: baseUnit || undefined,
    };
  };

  const executarSalvar = async () => {
    const sinal = sinalDoTipo(tipoMov);
    const linhas = coletarLinhasParaSalvar();

    if (linhas.length === 0) {
      toast.error("A movimentação precisa ter pelo menos um item.");
      return;
    }

    let subtotal = 0;
    for (const p of linhas) {
      const t = valorTotalLinha(p);
      if (t != null) subtotal += t;
    }
    const rateio = { subtotal, freteTotal: isEntrada ? freteNumero : 0 };
    const grupoIdExistente =
      isEdit && movimentacao && (movimentacao as { grupoId?: string | null }).grupoId
        ? String((movimentacao as { grupoId?: string | null }).grupoId)
        : undefined;
    const grupoId =
      grupoIdExistente ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 32)
        : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

    if (isEdit && movId) {
      try {
        for (const idRem of movimentacoesRemovidas) {
          await deleteMutation.mutateAsync({ id: idRem });
        }
        for (const p of linhas) {
          if (p.movimentacaoId) {
            await updateMutation.mutateAsync({ id: p.movimentacaoId, ...prepararPayload(p, sinal, rateio, grupoId) });
          } else {
            await createMutation.mutateAsync(prepararPayload(p, sinal, rateio, grupoId));
          }
        }
        const novos = linhas.filter(p => !p.movimentacaoId).length;
        toast.success(
          novos > 0 || movimentacoesRemovidas.length > 0
            ? `Compra atualizada${novos > 0 ? ` e ${novos} produto(s) adicionado(s)` : ""}!`
            : "Movimentação atualizada!"
        );
        const idsAfetados = [
          movId,
          ...movimentacoesRemovidas,
          ...linhas.map(p => p.movimentacaoId).filter((id): id is number => id != null),
        ];
        await sincronizarResumoMovimentacoes(idsAfetados);
        setLocation("/insumos/movimentacao");
      } catch {
        /* erros tratados em onError */
      }
      return;
    }

    try {
      for (const p of linhas) {
        await createMutation.mutateAsync(prepararPayload(p, sinal, rateio, grupoId));
      }
      toast.success(
        linhas.length > 1 ? `${linhas.length} movimentações registradas!` : "Movimentação registrada!"
      );
      await sincronizarResumoMovimentacoes();
      setLocation("/insumos/movimentacao");
    } catch {
      /* erros tratados em onError */
    }
  };

  // ── Salvar ────────────────────────────────────────────────────────────────
  const limparErro = (campo: CampoErroMov) => {
    setErros(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const focarCampoErro = (campo: CampoErroMov) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`mov-field-${campo}`);
      if (el instanceof HTMLElement) {
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  const salvar = async () => {
    const next: Partial<Record<CampoErroMov, string>> = {};

    if (!tipoMov) next.tipoMov = "Selecione o motivo / tipo da operação.";
    if (!fazendaId || !Number(fazendaId)) {
      next.fazenda = "Selecione uma fazenda na tela de Movimentações antes de registrar.";
    }
    if (isTransferencia && !fazendaDestinoId) {
      next.fazendaDestino = "Selecione o estoque destino da transferência.";
    }
    if (!dataMovimentacao.trim()) next.data = "Informe a data da movimentação.";

    if (formPendenteIncompleto) {
      if (!prodEstoqueId) next.produto = "Selecione o produto.";
      if (!prodUnidade) next.unidade = "Selecione a unidade de movimentação.";
      if (!prodQuantidade.trim()) next.quantidade = "Informe a quantidade.";
    }

    const linhas = coletarLinhasParaSalvar();
    if (linhas.length === 0 && !formPendenteIncompleto) {
      next.itens = "Inclua pelo menos um item na movimentação.";
      next.produto = "Inclua pelo menos um item na movimentação.";
    }

    if (Object.keys(next).length > 0) {
      setErros(next);
      toast.error("Preencha os campos obrigatórios destacados.", { id: TOAST_ID_OBRIGATORIOS });
      const ordem: CampoErroMov[] = [
        "tipoMov",
        "fazenda",
        "fazendaDestino",
        "data",
        "produto",
        "unidade",
        "quantidade",
        "itens",
      ];
      const primeiro = ordem.find(c => next[c]);
      if (primeiro) focarCampoErro(primeiro === "itens" ? "produto" : primeiro);
      return;
    }

    setErros({});

    const idsVistos = new Set<string>();
    for (const p of linhas) {
      if (idsVistos.has(p.estoqueId)) {
        toast.error("Há produtos duplicados na nota.");
        return;
      }
      idsVistos.add(p.estoqueId);
      const erro = validarLinha(p);
      if (erro) {
        toast.error(erro);
        return;
      }
    }

    if (
      isEdit &&
      ((initialSnapshotRef.current && temAlteracaoCritica(formSnapshotAtual, initialSnapshotRef.current)) ||
        produtosAlterados)
    ) {
      const ok = await confirm({
        title: "Confirmar alteração",
        description:
          "Essa alteração pode recalcular o estoque e os indicadores deste produto. Deseja salvar mesmo assim?",
        confirmText: "Salvar alteração",
        cancelText: "Cancelar",
        variant: "success",
      });
      if (!ok) return;
    }

    await executarSalvar();
  };

  // ── Loading / erro ao carregar movimentação ───────────────────────────────
  if (isEdit && loadingMov) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Carregando...</div>
      </AppLayout>
    );
  }

  if (isEdit && (isError || !movimentacao)) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-3">
          <p className="text-gray-600 text-sm">Movimentação não encontrada ou indisponível.</p>
          <button
            type="button"
            onClick={() => setLocation("/insumos/visao-geral")}
            className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 transition-opacity hover:opacity-90"
            style={{ backgroundColor: FD_PRIMARY }}
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="fixed inset-0 bg-black/40 z-[60]" />

      <div className="fixed inset-0 z-[70] overflow-y-auto flex items-start justify-center py-8 px-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl">
          {/* ── Cabeçalho ── */}
          <div className="px-6 py-4 border-b border-gray-200">
            <button
              type="button"
              onClick={() => {
                const fid = fazendaId || fazendaIdQuery;
                setLocation(
                  fid
                    ? `/insumos/movimentacao?fazendaId=${encodeURIComponent(fid)}`
                    : "/insumos/movimentacao",
                );
              }}
              className="mb-3 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
            >
              <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span className="text-[13px]">Voltar</span>
            </button>
            <h2 className="text-[18px] font-semibold text-gray-900">
              {isEdit ? "Editar Movimentação" : "Nova Movimentação"}
            </h2>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* ── 1. Dados da movimentação ── */}
            <div className={`${sectionCardCls} space-y-4`}>
              <p className={sectionTitleCls + " mb-0"}>Dados da movimentação</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Operação</FormLabel>
                  <FormNativeSelect
                    value={operacao}
                    onChange={v => onOperacaoChange(v as Operacao)}
                    placeholder="Selecione a operação"
                    options={operacaoOpcoes}
                    variant="light"
                    required
                  />
                </div>
                <div>
                  <FormLabel required>Motivo / Tipo</FormLabel>
                  <FormNativeSelect
                    id="mov-field-tipoMov"
                    value={tipoMov}
                    onChange={v => {
                      setTipoMov(v);
                      limparErro("tipoMov");
                    }}
                    placeholder="Selecione o motivo / tipo"
                    options={tipoMovOpcoes}
                    disabled={isTransferencia}
                    variant="light"
                    required
                    invalid={!!erros.tipoMov}
                    aria-describedby={erros.tipoMov ? "mov-err-tipoMov" : undefined}
                  />
                  <FieldErrorMsg id="mov-err-tipoMov" message={erros.tipoMov} />
                </div>
              </div>

              {isEntrada && (
                <FazendaReadonlyField
                  id="mov-field-fazenda"
                  label="Estoque Destino"
                  nome={fazendaNomeSelecionada}
                  invalid={!!erros.fazenda}
                  errorMessage={erros.fazenda}
                />
              )}

              {isSaida && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FazendaReadonlyField
                    id="mov-field-fazenda"
                    label="Estoque Origem"
                    nome={fazendaNomeSelecionada}
                    invalid={!!erros.fazenda}
                    errorMessage={erros.fazenda}
                  />
                  <div>
                    <label className={labelCls}>Destino / Uso</label>
                    <input
                      value={destinoUso}
                      onChange={e => setDestinoUso(e.target.value)}
                      placeholder="Ex.: Manejo, trator, lote..."
                      className={inputCls}
                    />
                  </div>
                </div>
              )}

              {isAjuste && (
                <FazendaReadonlyField
                  id="mov-field-fazenda"
                  label="Estoque"
                  nome={fazendaNomeSelecionada}
                  invalid={!!erros.fazenda}
                  errorMessage={erros.fazenda}
                />
              )}

              {isTransferencia && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FazendaReadonlyField
                    id="mov-field-fazenda"
                    label="Estoque Origem"
                    nome={fazendaNomeSelecionada}
                    invalid={!!erros.fazenda}
                    errorMessage={erros.fazenda}
                  />
                  <div>
                    <FormLabel required>Estoque Destino</FormLabel>
                    <FormNativeSelect
                      id="mov-field-fazendaDestino"
                      value={fazendaDestinoId}
                      onChange={v => {
                        setFazendaDestinoId(v);
                        limparErro("fazendaDestino");
                      }}
                      placeholder="Selecione o estoque destino"
                      options={fazendaOpcoes}
                      variant="light"
                      required
                      invalid={!!erros.fazendaDestino}
                      aria-describedby={erros.fazendaDestino ? "mov-err-fazendaDestino" : undefined}
                    />
                    <FieldErrorMsg id="mov-err-fazendaDestino" message={erros.fazendaDestino} />
                  </div>
                </div>
              )}

              {!isEntrada && (
                <div className="max-w-sm">
                  <FormLabel required>{labelData}</FormLabel>
                  <FormDatePicker
                    id="mov-field-data"
                    value={dataMovimentacao}
                    onChange={v => {
                      setDataMovimentacao(v);
                      limparErro("data");
                    }}
                    placeholder="dd/mm/aaaa"
                    required
                    invalid={!!erros.data}
                    aria-describedby={erros.data ? "mov-err-data" : undefined}
                  />
                  <FieldErrorMsg id="mov-err-data" message={erros.data} />
                </div>
              )}
            </div>

            {/* ── 2. Dados Nota Fiscal (entrada) ── */}
            {exibirBlocoFiscal && (
              <div className={`${sectionCardCls} space-y-3`}>
                <p className={sectionTitleCls + " mb-0"}>Dados nota fiscal</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FormLabel>Fornecedor</FormLabel>
                    <FormNativeSelect
                      value={fornecedorId}
                      onChange={setFornecedorId}
                      placeholder="Selecione o fornecedor"
                      options={fornecedorOpcoes}
                      variant="light"
                    />
                    <button
                      type="button"
                      onClick={irCadastrarFornecedor}
                      className="mt-1.5 text-[11px] font-medium text-[#4ECDC4] hover:underline"
                    >
                      Cadastrar novo fornecedor
                    </button>
                  </div>
                  <div>
                    <label className={labelCls}>Número da NF</label>
                    <input
                      value={notaFiscal}
                      onChange={e => setNotaFiscal(e.target.value)}
                      placeholder="Ex. 323.567"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <FormLabel required>{labelData}</FormLabel>
                    <FormDatePicker
                      id="mov-field-data"
                      value={dataMovimentacao}
                      onChange={v => {
                        setDataMovimentacao(v);
                        limparErro("data");
                      }}
                      placeholder="dd/mm/aaaa"
                      required
                      invalid={!!erros.data}
                      aria-describedby={erros.data ? "mov-err-data" : undefined}
                    />
                    <FieldErrorMsg id="mov-err-data" message={erros.data} />
                  </div>
                  <div>
                    <label className={labelCls}>Frete</label>
                    <input
                      value={frete}
                      onChange={e => setFrete(formatCurrencyBrl(e.target.value))}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Dados fiscais legados (saída/ajuste/transferência com NF antiga) ── */}
            {exibirFiscalSecundario && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setFiscalExpanded(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className={sectionTitleCls + " mb-0"}>Dados fiscais (registro anterior)</span>
                  <span className="material-icons text-gray-400 text-[20px]">
                    {fiscalExpanded ? "expand_less" : "expand_more"}
                  </span>
                </button>
                {fiscalExpanded && (
                  <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-gray-200">
                    <div>
                      <label className={labelCls}>Fornecedor</label>
                      <p className="text-[13px] text-gray-800">{fornecedorLegado.trim() || "—"}</p>
                    </div>
                    <div>
                      <label className={labelCls}>Número da NF</label>
                      <p className="text-[13px] text-gray-800">{notaFiscal.trim() || "—"}</p>
                    </div>
                    <div>
                      <label className={labelCls}>Frete</label>
                      <p className="text-[13px] text-gray-800">{frete.trim() ? fmtMoeda(frete) : "—"}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── 3. Itens da movimentação (formulário) ── */}
            <div
              className={`${sectionCardCls} space-y-3 ${
                erros.itens ? "ring-1 ring-red-500" : ""
              }`}
            >
              <p className={sectionTitleCls + " mb-0"}>Itens da movimentação</p>
              {erros.itens && (
                <p className="text-[11px] text-red-600" role="alert">{erros.itens}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FormLabel required>Produto</FormLabel>
                  <FormNativeSelect
                    id="mov-field-produto"
                    value={prodEstoqueId}
                    onChange={v => {
                      onProdutoChange(v);
                      limparErro("produto");
                      limparErro("itens");
                    }}
                    placeholder={fazendaId ? "Selecione o produto" : "Selecione o estoque primeiro"}
                    options={produtoOpcoes}
                    variant="light"
                    required
                    disabled={!fazendaId}
                    invalid={!!erros.produto}
                    aria-describedby={erros.produto ? "mov-err-produto" : undefined}
                  />
                  <FieldErrorMsg id="mov-err-produto" message={erros.produto} />
                  {fazendaId && produtoOpcoes.length === 0 && !erros.produto && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      Nenhum produto vinculado a este estoque. Cadastre ou vincule o produto a esta fazenda.
                    </p>
                  )}
                  {isSaida && produtoSelecionado && isProdutoCombustivel(produtoSelecionado) && (
                    <p className="mt-1.5 text-[11px] text-gray-500 leading-snug">
                      Para abastecimento de máquinas cadastradas, utilize a tela{" "}
                      <button
                        type="button"
                        onClick={() => setLocation("/maquinas/abastecimento")}
                        className="text-[#4ECDC4] font-medium hover:underline"
                      >
                        Abastecimentos
                      </button>
                      . A saída de estoque será gerada automaticamente.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={irCadastrarProduto}
                    className="mt-1.5 text-[11px] font-medium text-[#4ECDC4] hover:underline"
                  >
                    Cadastrar novo produto
                  </button>
                </div>
                <div>
                  <FormLabel required>Unidade de movimentação</FormLabel>
                  <UnidadeMovSelect
                    id="mov-field-unidade"
                    value={prodUnidade}
                    onChange={v => {
                      setProdUnidade(v);
                      limparErro("unidade");
                    }}
                    required
                    disabled={!prodEstoqueId}
                    options={unidadeMovOpcoes}
                    invalid={!!erros.unidade}
                    aria-describedby={erros.unidade ? "mov-err-unidade" : undefined}
                  />
                  <FieldErrorMsg id="mov-err-unidade" message={erros.unidade} />
                  {unidadeBaseSelecionada && prodEstoqueId && !erros.unidade && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Unidade base do produto:{" "}
                      <span className="font-medium">{rotuloUnidade(unidadeBaseSelecionada)}</span>
                    </p>
                  )}
                </div>
              </div>
              <div
                className={`grid grid-cols-1 gap-4 ${
                  exibirValorValidade && isEntrada
                    ? "sm:grid-cols-3"
                    : exibirValorValidade || isEntrada
                      ? "sm:grid-cols-2"
                      : "sm:grid-cols-1 max-w-xs"
                }`}
              >
                <div>
                  <FormLabel required>Quantidade</FormLabel>
                  <FormInput
                    id="mov-field-quantidade"
                    value={prodQuantidade}
                    onChange={v => {
                      setProdQuantidade(v);
                      limparErro("quantidade");
                      limparErro("itens");
                    }}
                    placeholder="Quantidade de produtos"
                    inputMode="decimal"
                    variant="light"
                    required
                    invalid={!!erros.quantidade}
                    aria-describedby={erros.quantidade ? "mov-err-quantidade" : undefined}
                  />
                  <FieldErrorMsg id="mov-err-quantidade" message={erros.quantidade} />
                </div>
                {isEntrada && (
                  <div>
                    <label className={labelCls}>Valor Unitário</label>
                    <input
                      value={prodValorUnitario}
                      onChange={e => setProdValorUnitario(formatCurrencyBrl(e.target.value))}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      className={inputCls}
                    />
                  </div>
                )}
                {exibirValorValidade && (
                  <div>
                    <FormLabel>Data de Validade</FormLabel>
                    <FormDatePicker
                      value={prodDataValidade}
                      onChange={setProdDataValidade}
                      placeholder="dd/mm/aaaa"
                    />
                  </div>
                )}
              </div>

              {previewConversao?.texto && (
                <div
                  className="px-3 py-2 rounded border text-[12px] text-gray-700"
                  style={{ borderColor: "#4ECDC4", backgroundColor: "#4ECDC418" }}
                >
                  {previewConversao.texto}
                </div>
              )}
              {previewConversao?.erro && (
                <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[12px] text-red-600">
                  {previewConversao.erro}
                </div>
              )}

              <button
                type="button"
                onClick={incluirProduto}
                className="w-full h-9 text-[11px] font-medium border border-gray-400 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                {editandoLinhaId ? "Atualizar item" : "+ Adicionar item"}
              </button>
              {editandoLinhaId ? (
                <p className="text-[11px] text-gray-500">
                  Editando item da lista — clique em Atualizar ou{" "}
                  <button type="button" onClick={limparMiniForm} className="text-[#4ECDC4] hover:underline">
                    cancelar edição
                  </button>
                  .
                </p>
              ) : (
                <p className="text-[11px] text-gray-500">
                  Inclua os itens da movimentação abaixo. Ao salvar, todos os itens serão registrados.
                </p>
              )}
            </div>

            {/* ── 4. Resumo dos itens ── */}
            {produtos.length > 0 && (
              <div className={`${sectionCardCls} !p-0 overflow-hidden`}>
                <table className="w-full table-fixed text-[12px] border-collapse">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[12%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Produto
                      </th>
                      <th className="px-4 py-3.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Qtd
                      </th>
                      <th className="px-4 py-3.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Unidade
                      </th>
                      <th className="px-4 py-3.5 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Valor Un.
                      </th>
                      <th className="px-4 py-3.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Total
                      </th>
                      <th className="px-4 py-3.5 text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {produtos.map(p => {
                      const prod = estoqueList.find(e => String(e.id) === p.estoqueId);
                      const editando = editandoLinhaId === p.localId;
                      return (
                        <tr
                          key={p.localId}
                          className={`border-b border-gray-100 last:border-0 ${
                            editando ? "bg-[#4ECDC4]/10" : "bg-white"
                          }`}
                        >
                          <td className="px-4 py-3.5 align-middle text-center">
                            <div className="font-medium text-gray-900 truncate" title={prod?.nome ?? undefined}>
                              {prod?.nome ?? "—"}
                            </div>
                            {p.dataValidade ? (
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                Validade: {formatDataBr(p.dataValidade)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 text-gray-700 tabular-nums text-center align-middle">
                            {p.quantidade}
                          </td>
                          <td className="px-4 py-3.5 text-gray-700 text-left align-middle">
                            {rotuloUnidadeMovimentacao(p.unidadeMov)}
                          </td>
                          <td className="px-4 py-3.5 text-gray-700 tabular-nums text-right align-middle">
                            {fmtMoeda(p.valorUnitario)}
                          </td>
                          <td className="px-4 py-3.5 text-gray-900 tabular-nums font-semibold text-center align-middle">
                            {formatValorTotalLinha(p)}
                          </td>
                          <td className="px-4 py-3.5 text-center align-middle">
                            <div className="inline-flex items-center justify-center gap-1">
                              <TableIconButton
                                label="Editar item"
                                tone="neutral"
                                compact
                                onClick={() => carregarLinhaNoForm(p)}
                              >
                                <EditActionIcon size={16} />
                              </TableIconButton>
                              <TableIconButton
                                label="Remover item"
                                tone="danger"
                                compact
                                onClick={() => void removerProduto(p.localId)}
                              >
                                <DeleteActionIcon size={16} />
                              </TableIconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totalValorNota != null && (
                    <tfoot>
                      {isEntrada && freteNumero > 0 ? (
                        <>
                          <tr className="bg-gray-50 border-t border-gray-200">
                            <td
                              colSpan={4}
                              className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide align-middle"
                            >
                              Subtotal dos itens
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 tabular-nums font-semibold text-center align-middle">
                              {formatCurrencyBrl(String(Math.round(totalValorNota * 100)))}
                            </td>
                            <td className="px-4 py-2.5" />
                          </tr>
                          <tr className="bg-gray-50">
                            <td
                              colSpan={4}
                              className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide align-middle"
                            >
                              Frete
                            </td>
                            <td className="px-4 py-2.5 text-gray-900 tabular-nums font-semibold text-center align-middle">
                              {formatCurrencyBrl(String(Math.round(freteNumero * 100)))}
                            </td>
                            <td className="px-4 py-2.5" />
                          </tr>
                          <tr className="bg-gray-50 border-t border-gray-200">
                            <td
                              colSpan={4}
                              className="px-4 py-3.5 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide align-middle"
                            >
                              Total da nota
                            </td>
                            <td className="px-4 py-3.5 text-gray-900 tabular-nums font-semibold text-center align-middle">
                              {formatCurrencyBrl(
                                String(Math.round((totalNotaComFrete ?? totalValorNota) * 100))
                              )}
                            </td>
                            <td className="px-4 py-3.5" />
                          </tr>
                        </>
                      ) : (
                        <tr className="bg-gray-50 border-t border-gray-200">
                          <td
                            colSpan={4}
                            className="px-4 py-3.5 text-right text-[10px] font-semibold text-gray-600 uppercase tracking-wide align-middle"
                          >
                            Total da nota
                          </td>
                          <td className="px-4 py-3.5 text-gray-900 tabular-nums font-semibold text-center align-middle">
                            {formatCurrencyBrl(String(Math.round(totalValorNota * 100)))}
                          </td>
                          <td className="px-4 py-3.5" />
                        </tr>
                      )}
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

          {/* ── Rodapé ── */}
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                const fid = fazendaId || fazendaIdQuery;
                setLocation(
                  fid
                    ? `/insumos/movimentacao?fazendaId=${encodeURIComponent(fid)}`
                    : "/insumos/movimentacao",
                );
              }}
              disabled={isBusy}
              className="w-full sm:w-auto px-6 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={isBusy}
              className="w-full sm:w-auto px-8 py-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-900 disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
