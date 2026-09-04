import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import {
  SectionCard,
  EmptyState,
  KpiCard,
  TEAL,
  NAVY,
  GREEN,
  RED,
  GOLD,
} from "@/components/dashboard/DashboardUI";
import {
  InsumosAlertasCentral,
  type AlertaCentralGrupo,
} from "@/components/insumos/InsumosAlertasCentral";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import ListExportButtons from "@/components/ListExportButtons";
import { TableIconButton, ViewActionIcon } from "@/components/icons/FarmActionIcons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { FormLabel, FormDatePicker } from "@/components/FormFields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listaProdutosComRetornoVisaoGeral, movimentacaoComRetornoVisaoGeral } from "@/lib/insumosRoutes";
import {
  agruparMovimentacoes,
  formatDataResumo,
  formatItensLabel,
  formatValorResumo,
  type MovimentacaoItemRaw,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";
import {
  brl,
  brlCompact,
  num,
  diasAte,
  inicioPeriodo,
  parseData,
  dataBr,
  bucketsFluxoIntervalo,
  chaveFluxoIntervalo,
  movimentoNoIntervalo,
  periodoPadrao90Dias,
  isoHoje,
  CHART_COLORS,
} from "@/lib/dashboard-utils";
import {
  buildPrecoMedioImplicit,
  buildValorUnitMap,
  compraTemValorGravado,
  valorCompraMov,
} from "@/lib/movimentacao-valor";
import { nomeUnidadeExibicao, produtoControlaSaldo, siglaUnidade, sinalDoTipo } from "@/lib/produto-types";

const COBERTURA_CRITICA_DIAS = 15;
const PARADO_DIAS = 90;

const TAB_TRIGGER_CLASS =
  "rounded-md border border-transparent px-2 py-2 text-[12px] font-medium text-gray-500 transition-all data-[state=active]:bg-white data-[state=active]:text-[#2D5A5A] data-[state=active]:shadow-sm data-[state=active]:border-[#4ECDC4]/35";

const OVERVIEW_MODAL_TH =
  "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap";
const OVERVIEW_MODAL_TH_WRAP =
  "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide leading-snug whitespace-normal align-middle";
const PARADOS_MODAL_TD = "px-3 py-2.5 align-middle whitespace-nowrap";

/** Saldo na coluna própria (unidade separada): inteiro sem decimal, quebrado com 2 casas. */
function formatSaldoParado(qtd: number): string {
  const abs = Math.abs(qtd);
  const isWhole = abs % 1 === 0;
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  });
  return qtd < 0 ? `-${formatted}` : formatted;
}

const numVal = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

const isMovAtiva = (status: string | null | undefined) => {
  const s = String(status || "ativa").toLowerCase();
  return s !== "estornada" && s !== "estorno";
};

const isCompra = (tipo: string | null | undefined) =>
  String(tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") === "compra";

const isConsumo = (tipo: string | null | undefined) => {
  const n = String(tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return n.includes("consumo") || n.includes("uso interno");
};

/** Transferência entre fazendas — não entra no fluxo financeiro do gráfico. */
const isTransferencia = (tipo: string | null | undefined) =>
  String(tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes("transfer");

function pluralUnidade(unidade: string | null | undefined, _qtd: number): string {
  return siglaUnidade(unidade) || (nomeUnidadeExibicao(unidade) || "un").toLowerCase();
}

function formatSaldoMinimo(
  atual: number,
  minimo: number,
  unidade: string | null | undefined,
): string {
  return `Atual: ${num(atual)} ${pluralUnidade(unidade, atual)} | Mínimo: ${num(minimo)} ${pluralUnidade(unidade, minimo)}`;
}

function subAbaixoMinimo(qtd: number): string {
  if (qtd <= 0) return "Nenhuma reposição pendente";
  if (qtd === 1) return "1 produto para repor";
  return `${qtd} produtos para repor`;
}

function subAcimaMaximo(qtd: number): string {
  if (qtd <= 0) return "Nenhum excedente de estoque";
  if (qtd === 1) return "1 produto acima do máximo";
  return `${qtd} produtos acima do máximo`;
}

/** Apoio visual do card Compras no período — fatia estocável vs consumo direto. */
function ComprasPeriodoSub({
  comprado,
  comprasEstocaveis,
  comprasSemEstoque,
  compradoEstimado,
  comprasSemValor,
}: {
  comprado: number;
  comprasEstocaveis: number;
  comprasSemEstoque: number;
  compradoEstimado: number;
  comprasSemValor: number;
}) {
  if (!(comprado > 0)) {
    return <span>Nenhuma compra no período</span>;
  }
  const pctEst = (comprasEstocaveis / comprado) * 100;
  const pctDir = (comprasSemEstoque / comprado) * 100;
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 rounded-full overflow-hidden bg-gray-100 flex">
        {comprasEstocaveis > 0 ? (
          <div className="h-full transition-all" style={{ width: `${pctEst}%`, backgroundColor: GREEN }} />
        ) : null}
        {comprasSemEstoque > 0 ? (
          <div className="h-full transition-all" style={{ width: `${pctDir}%`, backgroundColor: "#6366F1" }} />
        ) : null}
      </div>
      <span className="block text-[10px] leading-snug text-gray-500">
        Estocáveis {brl(comprasEstocaveis)} · Uso imediato {brl(comprasSemEstoque)}
      </span>
      {comprasSemEstoque > 0 ? (
        <span className="block text-[10px] leading-snug text-gray-400">
          Uso imediato não entra no valor em estoque acima
        </span>
      ) : null}
      {compradoEstimado > 0 ? (
        <span className="block text-[10px] leading-snug text-amber-700">
          Inclui {brl(compradoEstimado)} estimado
          {comprasSemValor === 1
            ? " (1 compra sem valor informado)"
            : ` (${comprasSemValor} compras sem valor informado)`}
        </span>
      ) : null}
    </div>
  );
}

/** Faixa de seção — posição atual vs período filtrado. */
function OverviewSectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2.5 mt-1 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 shrink-0">
        {title}
      </h3>
      <div className="h-px flex-1 bg-gray-100" aria-hidden />
      {hint ? <span className="text-[10px] text-gray-400 tabular-nums shrink-0">{hint}</span> : null}
    </div>
  );
}

/** Bloco visual — separa estoque (hoje) de movimentações (período). */
function OverviewBlock({
  title,
  hint,
  tone,
  headerExtra,
  children,
}: {
  title: string;
  hint?: string;
  tone: "estoque" | "periodo";
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  const shell =
    tone === "estoque"
      ? "border-gray-200 bg-white"
      : "border-teal-100 bg-teal-50/20";
  return (
    <section className={cn("rounded-lg border shadow-sm p-4 space-y-3", shell)}>
      <div className="space-y-3">
        <OverviewSectionHeading title={title} hint={hint} />
        {headerExtra}
      </div>
      {children}
    </section>
  );
}

type ProdutoParadoRow = {
  id: number;
  nome: string;
  saldo: number;
  unidade: string;
  custoMedio: number;
  valor: number;
  ultimaMov: Date | null;
  diasSemMov: number;
};

type ProdutoEstoqueRow = {
  id: number;
  nome: string;
  categoria: string;
  saldo: number;
  unidade: string;
  custoMedio: number;
  valor: number;
};

type Props = {
  fazendaId: string;
  onChangeFazenda: (id: string) => void;
  fazendas: { id: number; nome: string }[];
};

export default function InsumosVisaoGeralDashboard({
  fazendaId,
  onChangeFazenda,
  fazendas,
}: Props) {
  const [, setLocation] = useLocation();
  const hojeIso = isoHoje();
  const [periodoIni, setPeriodoIni] = useState(() => periodoPadrao90Dias().inicio);
  const [periodoFim, setPeriodoFim] = useState(() => periodoPadrao90Dias().fim);
  const [modalParadosOpen, setModalParadosOpen] = useState(false);
  const [modalAbaixoOpen, setModalAbaixoOpen] = useState(false);
  const [modalAcimaOpen, setModalAcimaOpen] = useState(false);
  const [modalEstoqueOpen, setModalEstoqueOpen] = useState(false);
  const [modalComprasOpen, setModalComprasOpen] = useState(false);
  const [modalFornecedorOpen, setModalFornecedorOpen] = useState(false);
  const [fornecedorModal, setFornecedorModal] = useState<{
    nome: string;
    isOutros?: boolean;
  } | null>(null);
  const [highlightAlerta, setHighlightAlerta] = useState<string | null>(null);
  const [grupoExpandidoId, setGrupoExpandidoId] = useState<string | null>(null);
  const [abaVisao, setAbaVisao] = useState<"analise" | "rankings">("analise");
  const [categoriaHover, setCategoriaHover] = useState<{
    name: string;
    value: number;
    pct: number;
    color: string;
    isOutras?: boolean;
  } | null>(null);

  const mudarPeriodoIni = (value: string) => {
    setPeriodoIni(value);
    if (value && periodoFim && value > periodoFim) setPeriodoFim(value);
  };

  const mudarPeriodoFim = (value: string) => {
    const capped = value && value > hojeIso ? hojeIso : value;
    setPeriodoFim(capped);
    if (capped && periodoIni && capped < periodoIni) setPeriodoIni(capped);
  };

  const { data: produtosAll = [] } = trpc.estoque.list.useQuery();
  const { data: movsAll = [] } = trpc.estoque.listMovimentacoes.useQuery(undefined, {
    refetchOnMount: "always",
  });

  const fazendaSelecionada = Boolean(fazendaId);
  const fazendaNome = useMemo(
    () => fazendas.find(f => String(f.id) === fazendaId)?.nome,
    [fazendas, fazendaId],
  );

  const produtos = useMemo(() => {
    if (!fazendaId) return [];
    return produtosAll.filter(p => String(p.fazendaId ?? "") === fazendaId);
  }, [produtosAll, fazendaId]);

  const movs = useMemo(() => {
    if (!fazendaId) return [];
    return movsAll.filter(
      m => String(m.fazendaId ?? m.produtoFazendaId ?? "") === fazendaId,
    );
  }, [movsAll, fazendaId]);

  const produtoIds = useMemo(() => new Set(produtos.map(p => p.id)), [produtos]);

  const controlaSaldoPorId = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const p of produtos) {
      m.set(p.id, produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo));
    }
    return m;
  }, [produtos]);

  // Mapa de valor unitário por produto (custo médio vigente).
  const valorUnitMap = useMemo(() => buildValorUnitMap(produtos), [produtos]);

  // Preço médio implícito das entradas ativas (fallback).
  const precoMedioImplicit = useMemo(() => buildPrecoMedioImplicit(movs), [movs]);

  const precoEfetivo = (produtoId: number, valorUnitario: unknown) =>
    numVal(valorUnitario) || (precoMedioImplicit.get(produtoId) ?? 0);

  const isSaida = (mv: { tipo: string | null; quantidade: string | number }) =>
    mv.tipo ? sinalDoTipo(mv.tipo) === "saida" : numVal(mv.quantidade) < 0;

  const valorMovimentacao = (mv: {
    estoqueId: number;
    quantidade: string | number;
    valor?: string | number | null;
  }) => {
    const qtd = Math.abs(numVal(mv.quantidade));
    return numVal(mv.valor) || qtd * (valorUnitMap.get(mv.estoqueId) ?? precoMedioImplicit.get(mv.estoqueId) ?? 0);
  };

  // ── Estoque atual ──────────────────────────────────────────────────────────
  const estoque = useMemo(() => {
    const ativos = produtos.filter(p => p.situacao !== "inativo");
    // Produtos estocáveis com saldo > 0 (capital imobilizado)
    const comValor = produtos.filter(
      p =>
        produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo) &&
        numVal(p.quantidade) > 0,
    );

    const valorTotal = comValor.reduce(
      (s, p) => s + numVal(p.quantidade) * precoEfetivo(p.id, p.valorUnitario),
      0,
    );

    const itensEmEstoque: ProdutoEstoqueRow[] = comValor
      .map(p => {
        const saldo = numVal(p.quantidade);
        const custoMedio = precoEfetivo(p.id, p.valorUnitario);
        return {
          id: p.id,
          nome: p.nome,
          categoria: p.categoria?.trim() || "Sem categoria",
          saldo,
          unidade: siglaUnidade(p.unidade) || "—",
          custoMedio,
          valor: saldo * custoMedio,
        };
      })
      .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"));

    const categorias = new Map<string, number>();
    comValor.forEach(p => {
      const cat = p.categoria?.trim() || "Sem categoria";
      categorias.set(
        cat,
        (categorias.get(cat) ?? 0) + numVal(p.quantidade) * precoEfetivo(p.id, p.valorUnitario),
      );
    });
    const porCategoria = [...categorias.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);

    const topProdutos = comValor
      .map(p => ({
        id: p.id,
        nome: p.nome,
        valor: numVal(p.quantidade) * precoEfetivo(p.id, p.valorUnitario),
      }))
      .filter(p => p.valor > 0)
      .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 5)
      .map(p => ({
        ...p,
        pct: valorTotal > 0 ? (p.valor / valorTotal) * 100 : 0,
      }));

    const abaixoMin = ativos.filter(
      p =>
        produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo) &&
        p.monitorarEstoque &&
        numVal(p.quantidadeMinima) > 0 &&
        numVal(p.quantidade) <= numVal(p.quantidadeMinima),
    );
    const acimaMax = ativos.filter(
      p =>
        produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo) &&
        p.monitorarEstoque &&
        numVal(p.quantidadeMaxima) > 0 &&
        numVal(p.quantidade) > numVal(p.quantidadeMaxima),
    );

    return {
      ativos,
      valorTotal,
      porCategoria,
      topProdutos,
      itensEmEstoque,
      abaixoMin,
      acimaMax,
    };
  }, [produtos, precoMedioImplicit]);

  // ── Fluxo no período (R$) — estocáveis, uso imediato e saídas ─────────────
  const fluxo = useMemo(() => {
    const movsPeriodo = movs.filter(mv => {
      if (!isMovAtiva(mv.status)) return false;
      if (isTransferencia(mv.tipo)) return false;
      return movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim);
    });
    const buckets = bucketsFluxoIntervalo(periodoIni, periodoFim).map(b => ({
      ...b,
      entradaEstocavel: 0,
      entradaSemEstoque: 0,
    }));
    const idx = new Map(buckets.map((b, i) => [b.chave, i]));
    for (const mv of movsPeriodo) {
      const k = chaveFluxoIntervalo(periodoIni, periodoFim, mv.dataMovimentacao);
      if (k == null || !idx.has(k)) continue;
      const b = buckets[idx.get(k)!]!;
      const valorMov = valorMovimentacao(mv);
      if (!(valorMov > 0)) continue;
      if (isSaida(mv)) {
        b.saida += valorMov;
      } else {
        const controla = controlaSaldoPorId.get(mv.estoqueId) ?? true;
        if (controla) b.entradaEstocavel += valorMov;
        else b.entradaSemEstoque += valorMov;
        b.entrada += valorMov;
      }
    }
    // Números finitos — tooltip/eixo sempre coerentes com as barras.
    return buckets.map(b => ({
      ...b,
      entrada: Number.isFinite(b.entrada) ? b.entrada : 0,
      entradaEstocavel: Number.isFinite(b.entradaEstocavel) ? b.entradaEstocavel : 0,
      entradaSemEstoque: Number.isFinite(b.entradaSemEstoque) ? b.entradaSemEstoque : 0,
      saida: Number.isFinite(b.saida) ? b.saida : 0,
    }));
  }, [movs, valorUnitMap, precoMedioImplicit, periodoIni, periodoFim, controlaSaldoPorId]);

  // ── Totais do período (fluxo) ──────────────────────────────────────────────
  const periodoTotais = useMemo(() => {
    let comprado = 0;
    let compradoLancado = 0;
    let compradoEstimado = 0;
    let comprasSemValor = 0;
    let comprasSemEstoque = 0;
    let comprasSemFornecedor = 0;
    let consumido = 0;
    let entradasFluxo = 0;
    let entradasLancadas = 0;
    let entradasEstimadas = 0;
    let saidasFluxo = 0;
    let saidasLancadas = 0;
    let saidasEstimadas = 0;
    let movsFluxoSemValor = 0;
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (isTransferencia(mv.tipo)) continue;
      if (!movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim)) continue;
      const valorMov = valorMovimentacao(mv);
      const gravado = compraTemValorGravado(mv);
      if (isSaida(mv)) {
        if (valorMov > 0) {
          saidasFluxo += valorMov;
          if (gravado) saidasLancadas += valorMov;
          else {
            saidasEstimadas += valorMov;
            movsFluxoSemValor += 1;
          }
        }
      } else if (valorMov > 0) {
        entradasFluxo += valorMov;
        if (gravado) entradasLancadas += valorMov;
        else {
          entradasEstimadas += valorMov;
          movsFluxoSemValor += 1;
        }
      }
      if (isConsumo(mv.tipo)) consumido += valorMov;
      else if (isCompra(mv.tipo)) {
        const valorCompra = valorCompraMov(mv, valorUnitMap, precoMedioImplicit);
        if (valorCompra > 0) {
          comprado += valorCompra;
          if (compraTemValorGravado(mv)) {
            compradoLancado += valorCompra;
          } else {
            compradoEstimado += valorCompra;
            comprasSemValor += 1;
          }
          if (!controlaSaldoPorId.get(mv.estoqueId)) comprasSemEstoque += valorCompra;
          if (!(mv as { fornecedor?: string | null }).fornecedor?.trim()) {
            comprasSemFornecedor += valorCompra;
          }
        }
      }
    }
    return {
      comprado,
      compradoLancado,
      compradoEstimado,
      comprasSemValor,
      comprasSemEstoque,
      comprasEstocaveis: comprado - comprasSemEstoque,
      comprasSemFornecedor,
      consumido,
      entradasFluxo,
      entradasLancadas,
      entradasEstimadas,
      saidasFluxo,
      saidasLancadas,
      saidasEstimadas,
      fluxoEstimado: entradasEstimadas + saidasEstimadas,
      movsFluxoSemValor,
      resultadoPeriodo: entradasFluxo - saidasFluxo,
    };
  }, [movs, valorUnitMap, precoMedioImplicit, periodoIni, periodoFim, controlaSaldoPorId]);

  /** Todas as compras do período (para modal do card Compras no período). */
  const comprasPeriodoLista = useMemo(() => {
    type Row = {
      id: number;
      nome: string;
      data: string;
      valor: number;
      estimado: boolean;
      fornecedor: string | null;
      estocavel: boolean;
    };
    const rows: Row[] = [];
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (!isCompra(mv.tipo)) continue;
      if (!movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim)) continue;
      const valor = valorCompraMov(mv, valorUnitMap, precoMedioImplicit);
      if (!(valor > 0)) continue;
      const prod = produtos.find(p => p.id === mv.estoqueId);
      rows.push({
        id: mv.id,
        nome: prod?.nome ?? `Produto #${mv.estoqueId}`,
        data: String(mv.dataMovimentacao ?? "").slice(0, 10),
        valor,
        estimado: !compraTemValorGravado(mv),
        fornecedor: (mv as { fornecedor?: string | null }).fornecedor?.trim() || null,
        estocavel: controlaSaldoPorId.get(mv.estoqueId) ?? true,
      });
    }
    return rows.sort(
      (a, b) => b.data.localeCompare(a.data) || b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [movs, produtos, periodoIni, periodoFim, controlaSaldoPorId, valorUnitMap, precoMedioImplicit]);

  /** Top produtos por gasto em uso imediato no período (agrupado por produto). */
  const topUsoImediatoProdutos = useMemo(() => {
    type Acc = {
      produtoId: number;
      nome: string;
      valor: number;
      qtd: number;
      fornecedores: Set<string>;
    };
    const map = new Map<number, Acc>();
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (!isCompra(mv.tipo)) continue;
      if (!movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim)) continue;
      if (controlaSaldoPorId.get(mv.estoqueId)) continue;
      const valor = valorCompraMov(mv, valorUnitMap, precoMedioImplicit);
      if (!(valor > 0)) continue;
      const prod = produtos.find(p => p.id === mv.estoqueId);
      const nome = prod?.nome ?? `Produto #${mv.estoqueId}`;
      const fornecedor = (mv as { fornecedor?: string | null }).fornecedor?.trim() || "";
      const cur = map.get(mv.estoqueId);
      if (cur) {
        cur.valor += valor;
        cur.qtd += 1;
        if (fornecedor) cur.fornecedores.add(fornecedor);
      } else {
        map.set(mv.estoqueId, {
          produtoId: mv.estoqueId,
          nome,
          valor,
          qtd: 1,
          fornecedores: fornecedor ? new Set([fornecedor]) : new Set(),
        });
      }
    }
    return [...map.values()]
      .map(row => ({
        ...row,
        fornecedorLabel:
          row.fornecedores.size === 0
            ? "Sem fornecedor"
            : row.fornecedores.size === 1
              ? [...row.fornecedores][0]!
              : "Vários fornecedores",
      }))
      .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 5);
  }, [movs, produtos, periodoIni, periodoFim, controlaSaldoPorId, valorUnitMap, precoMedioImplicit]);

  // ── Inteligência por produto ───────────────────────────────────────────────
  const porProduto = useMemo(() => {
    const ultimaMov = new Map<number, Date>();
    const saida90 = new Map<number, number>();
    const limite90 = inicioPeriodo("90d");
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      const d = parseData(mv.dataMovimentacao);
      if (d) {
        const atual = ultimaMov.get(mv.estoqueId);
        if (!atual || d > atual) ultimaMov.set(mv.estoqueId, d);
      }
      if (isSaida(mv) && d && (!limite90 || d >= limite90)) {
        saida90.set(mv.estoqueId, (saida90.get(mv.estoqueId) ?? 0) + Math.abs(numVal(mv.quantidade)));
      }
    }
    return { ultimaMov, saida90 };
  }, [movs]);

  // ── Capital sem movimentação (fixo 90 dias) ───────────────────────────────
  const capitalParado = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const itens: ProdutoParadoRow[] = [];

    for (const p of produtos) {
      if (!produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo)) continue;
      const saldo = numVal(p.quantidade);
      if (!(saldo > 0)) continue;
      // ativos + inativos com saldo
      const ult = porProduto.ultimaMov.get(p.id) ?? null;
      let diasSemMov: number;
      if (!ult) {
        diasSemMov = Number.POSITIVE_INFINITY;
      } else {
        const alvo = new Date(ult);
        alvo.setHours(0, 0, 0, 0);
        diasSemMov = Math.max(0, Math.round((hoje.getTime() - alvo.getTime()) / 86_400_000));
      }
      if (diasSemMov < PARADO_DIAS) continue;

      const custoMedio = precoEfetivo(p.id, p.valorUnitario);
      itens.push({
        id: p.id,
        nome: p.nome,
        saldo,
        unidade: siglaUnidade(p.unidade) || "—",
        custoMedio,
        valor: saldo * custoMedio,
        ultimaMov: ult,
        diasSemMov: Number.isFinite(diasSemMov) ? diasSemMov : Number.MAX_SAFE_INTEGER,
      });
    }

    itens.sort((a, b) => {
      if (b.valor !== a.valor) return b.valor - a.valor;
      if (b.diasSemMov !== a.diasSemMov) return b.diasSemMov - a.diasSemMov;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
    const valorTotal = itens.reduce((s, i) => s + i.valor, 0);
    return { itens, valorTotal };
  }, [produtos, porProduto, precoMedioImplicit]);

  const PARADOS_EXPORT_HEADERS = [
    "Produto",
    "Saldo atual",
    "Unidade",
    "Custo médio",
    "Valor imobilizado",
    "Última movimentação",
    "Dias sem movimentação",
  ] as const;

  const paradosExportTitle = fazendaNome
    ? `${fazendaNome} — Capital sem movimentação`
    : "Capital sem movimentação";

  const paradosExportRows = useMemo(() => {
    const detail = capitalParado.itens.map(row => [
      row.nome,
      formatSaldoParado(row.saldo),
      row.unidade,
      row.custoMedio > 0 ? row.custoMedio : "",
      row.valor > 0 ? row.valor : "",
      row.ultimaMov ? dataBr(row.ultimaMov) : "Sem registro",
      row.ultimaMov ? row.diasSemMov : "90+",
    ]);
    if (detail.length === 0) return detail;
    return [
      ...detail,
      [
        "Total valor imobilizado",
        "",
        "",
        "",
        capitalParado.valorTotal > 0 ? capitalParado.valorTotal : "",
        "",
        "",
      ],
    ];
  }, [capitalParado]);

  const ESTOQUE_EXPORT_HEADERS = [
    "Produto",
    "Categoria",
    "Saldo atual",
    "Unidade",
    "Custo médio",
    "Valor em estoque",
  ] as const;

  const estoqueExportTitle = fazendaNome
    ? `${fazendaNome} — Valor em estoque`
    : "Valor em estoque";

  const estoqueExportRows = useMemo(() => {
    const detail = estoque.itensEmEstoque.map(row => [
      row.nome,
      row.categoria,
      formatSaldoParado(row.saldo),
      row.unidade,
      row.custoMedio > 0 ? row.custoMedio : "",
      row.valor > 0 ? row.valor : "",
    ]);
    if (detail.length === 0) return detail;
    return [
      ...detail,
      [
        "Total valor em estoque",
        "",
        "",
        "",
        "",
        estoque.valorTotal > 0 ? estoque.valorTotal : "",
      ],
    ];
  }, [estoque]);

  // ── Alertas (Central operacional) ──────────────────────────────────────────
  const alertas = useMemo(() => {
    // 1) Vencidos — validade < hoje, saldo > 0 (movimentações ativas)
    const vencidos: {
      id: string;
      produtoId: number;
      titulo: string;
      detalhe: string;
      dias: number;
      valorRisco: number;
    }[] = [];
    // 4) Vencendo em 30 dias — 0 <= dias <= 30
    const vencendo: typeof vencidos = [];
    const vistosVal = new Set<string>();

    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (!produtoIds.has(mv.estoqueId)) continue;
      const prod = produtos.find(p => p.id === mv.estoqueId);
      if (!prod) continue;
      if (!produtoControlaSaldo((prod as { controlarSaldo?: boolean | null }).controlarSaldo)) continue;
      const saldo = numVal(prod.quantidade);
      if (!(saldo > 0)) continue;
      const dias = diasAte(mv.dataValidade);
      if (dias == null || dias > 30) continue;
      const chave = `${mv.estoqueId}|${mv.dataValidade}`;
      if (vistosVal.has(chave)) continue;
      vistosVal.add(chave);

      const un = pluralUnidade(prod.unidade, saldo);
      const custo = precoEfetivo(prod.id, prod.valorUnitario);
      const valorRisco = saldo * custo;
      const lote =
        (mv as { notaFiscal?: string | null }).notaFiscal?.trim() ||
        (mv as { manejo?: string | null }).manejo?.trim() ||
        "";
      const titulo = lote ? `${prod.nome} · ${lote}` : prod.nome;
      const vencStr = dataBr(mv.dataValidade);
      const detalhe =
        dias < 0
          ? [
              `Saldo: ${num(saldo, 2)} ${un}`,
              `Vencimento: ${vencStr}`,
              `${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} vencido`,
              valorRisco > 0 ? `Risco: ${brl(valorRisco)}` : null,
            ]
              .filter(Boolean)
              .join(" | ")
          : [
              `Saldo: ${num(saldo, 2)} ${un}`,
              `Vencimento: ${vencStr}`,
              dias === 0 ? "Vence hoje" : `${dias} ${dias === 1 ? "dia restante" : "dias restantes"}`,
              valorRisco > 0 ? `Risco: ${brl(valorRisco)}` : null,
            ]
              .filter(Boolean)
              .join(" | ");

      const row = {
        id: chave,
        produtoId: prod.id,
        titulo,
        detalhe,
        dias,
        valorRisco,
      };
      if (dias < 0) vencidos.push(row);
      else vencendo.push(row);
    }
    vencidos.sort((a, b) => a.dias - b.dias); // mais vencido primeiro (mais negativo)
    vencendo.sort((a, b) => a.dias - b.dias);

    // 2) Cobertura crítica ≤ 15 dias (só com histórico de saída em 90d)
    const cobertura: {
      id: string;
      produtoId: number;
      titulo: string;
      detalhe: string;
      dias: number;
    }[] = [];
    for (const p of estoque.ativos) {
      if (!produtoControlaSaldo((p as { controlarSaldo?: boolean | null }).controlarSaldo)) continue;
      const qAtual = numVal(p.quantidade);
      if (qAtual <= 0) continue;
      const consumo90 = porProduto.saida90.get(p.id) ?? 0;
      if (!(consumo90 > 0)) continue; // sem histórico confiável → não inventar
      const consumoDiario = consumo90 / 90;
      const dias = Math.floor(qAtual / consumoDiario);
      if (dias > COBERTURA_CRITICA_DIAS) continue;
      const un = pluralUnidade(p.unidade, qAtual);
      cobertura.push({
        id: `cob-${p.id}`,
        produtoId: p.id,
        titulo: p.nome,
        detalhe: [
          `Saldo atual: ${num(qAtual, 2)} ${un}`,
          `Consumo médio: ${num(consumoDiario, 2)} ${pluralUnidade(p.unidade, consumoDiario)}/dia`,
          dias <= 0 ? "Cobertura estimada: esgotado" : `Cobertura estimada: ${dias} dias`,
        ].join(" | "),
        dias,
      });
    }
    cobertura.sort((a, b) => a.dias - b.dias);

    // 3) Abaixo do mínimo
    const baixo = estoque.abaixoMin
      .map(p => {
        const atual = numVal(p.quantidade);
        const minimo = numVal(p.quantidadeMinima);
        const falta = Math.max(0, minimo - atual);
        const unA = pluralUnidade(p.unidade, atual);
        const unM = pluralUnidade(p.unidade, minimo);
        const unF = pluralUnidade(p.unidade, falta);
        return {
          id: `min-${p.id}`,
          produtoId: p.id,
          titulo: p.nome,
          detalhe: `Atual: ${num(atual, 2)} ${unA} | Mínimo: ${num(minimo, 2)} ${unM} | Faltam: ${num(falta, 2)} ${unF}`,
          falta,
        };
      })
      .sort((a, b) => b.falta - a.falta);

    // 5) Acima do máximo
    const excesso = estoque.acimaMax
      .map(p => {
        const atual = numVal(p.quantidade);
        const maximo = numVal(p.quantidadeMaxima);
        const excedente = Math.max(0, atual - maximo);
        const custo = precoEfetivo(p.id, p.valorUnitario);
        const valorExc = excedente * custo;
        const unA = pluralUnidade(p.unidade, atual);
        const unM = pluralUnidade(p.unidade, maximo);
        const unE = pluralUnidade(p.unidade, excedente);
        return {
          id: `max-${p.id}`,
          produtoId: p.id,
          titulo: p.nome,
          detalhe: [
            `Atual: ${num(atual, 2)} ${unA}`,
            `Máximo: ${num(maximo, 2)} ${unM}`,
            `Excedente: ${num(excedente, 2)} ${unE}`,
            valorExc > 0 ? `Valor excedente: ${brl(valorExc)}` : null,
          ]
            .filter(Boolean)
            .join(" | "),
          excedente,
        };
      })
      .sort((a, b) => b.excedente - a.excedente);

    // 6) Capital sem movimentação — alinhado ao modal (inclui inativos com saldo)
    const parados = capitalParado.itens
      .filter(r => r.valor > 0)
      .map(r => ({
        id: `par-${r.id}`,
        produtoId: r.id,
        titulo: r.nome,
        detalhe: [
          `Saldo: ${num(r.saldo, 2)} ${r.unidade}`,
          `Custo médio: ${brl(r.custoMedio)}`,
          `Valor imobilizado: ${brl(r.valor)}`,
          `Última movimentação: ${r.ultimaMov ? dataBr(r.ultimaMov) : "Sem registro"}`,
          `Dias sem movimentação: ${
            r.ultimaMov ? r.diasSemMov : "90+"
          }`,
        ].join(" | "),
        valor: r.valor,
        diasSemMov: r.diasSemMov,
      }))
      .sort((a, b) => b.valor - a.valor || b.diasSemMov - a.diasSemMov);

    const validadeCard = [...vencidos, ...vencendo];
    const produtosRisco = new Set<number>();
    let valorRiscoValidade = 0;
    for (const row of validadeCard) {
      if (produtosRisco.has(row.produtoId)) continue;
      produtosRisco.add(row.produtoId);
      valorRiscoValidade += row.valorRisco;
    }
    const total =
      vencidos.length +
      cobertura.length +
      baixo.length +
      vencendo.length +
      excesso.length +
      parados.length;

    return {
      vencidos,
      cobertura,
      baixo,
      vencendo,
      excesso,
      parados,
      /** Mantido para o card superior (vencidos + próximos 30 dias). */
      validade: validadeCard,
      total,
      temVencido: vencidos.length > 0,
      valorRiscoValidade,
    };
  }, [estoque, porProduto, movs, produtos, produtoIds, precoMedioImplicit, capitalParado]);

  // ── Compras por fornecedor (compras ativas no período) ─────────────────────
  const fornecedores = useMemo(() => {
    const map = new Map<string, number>();
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (!isCompra(mv.tipo)) continue;
      if (!movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim)) continue;
      const nome = mv.fornecedor?.trim();
      if (!nome) continue;
      const total = valorCompraMov(mv, valorUnitMap, precoMedioImplicit);
      if (!(total > 0)) continue;
      map.set(nome, (map.get(nome) ?? 0) + total);
    }
    const sorted = [...map.entries()]
      .map(([name, value]) => ({ name, value, isOutros: false as boolean }))
      .filter(f => f.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, f) => s + f.value, 0);
    const MAX = 5;
    const slices =
      sorted.length <= MAX
        ? sorted
        : [
            ...sorted.slice(0, MAX),
            {
              name: "Outros",
              value: sorted.slice(MAX).reduce((s, f) => s + f.value, 0),
              isOutros: true,
            },
          ];
    return slices.map(f => ({
      ...f,
      pct: total > 0 ? (f.value / total) * 100 : 0,
    }));
  }, [movs, valorUnitMap, precoMedioImplicit, periodoIni, periodoFim]);

  const listaPath = listaProdutosComRetornoVisaoGeral(
    fazendaId
      ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}`
      : "/insumos/lista-produtos",
    fazendaId,
    "cobertura",
  );
  const listaAbaixoMinimoPath = listaProdutosComRetornoVisaoGeral(
    fazendaId
      ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}&status=ativo&alerta=abaixo_minimo`
      : "/insumos/lista-produtos?status=ativo&alerta=abaixo_minimo",
    fazendaId,
    "abaixo_minimo",
  );
  const listaAcimaMaximoPath = listaProdutosComRetornoVisaoGeral(
    fazendaId
      ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}&status=ativo&alerta=acima_maximo`
      : "/insumos/lista-produtos?status=ativo&alerta=acima_maximo",
    fazendaId,
    "acima_maximo",
  );
  const movPath = movimentacaoComRetornoVisaoGeral(
    fazendaId
      ? `/insumos/movimentacao?fazendaId=${encodeURIComponent(fazendaId)}`
      : "/insumos/movimentacao",
    fazendaId,
  );

  const topFornecedorNomes = useMemo(
    () => new Set(fornecedores.filter(f => !f.isOutros).map(f => f.name)),
    [fornecedores],
  );

  const comprasFornecedorModal = useMemo(() => {
    if (!fornecedorModal || !fazendaId) return [] as MovimentacaoResumo[];
    const resumos = agruparMovimentacoes(movs as MovimentacaoItemRaw[]);
    return resumos
      .filter(r => {
        if (r.status === "estornada") return false;
        const tipo = r.tipo
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!tipo.includes("compra")) return false;
        if (!movimentoNoIntervalo(r.dataMovimentacao, periodoIni, periodoFim)) return false;
        const ref = r.origemDestino.trim();
        if (!ref || ref === "—") return false;
        if (fornecedorModal.isOutros) return !topFornecedorNomes.has(ref);
        return ref.localeCompare(fornecedorModal.nome, "pt-BR", { sensitivity: "accent" }) === 0;
      })
      .sort(
        (a, b) =>
          b.dataMovimentacao.localeCompare(a.dataMovimentacao) ||
          (b.valorTotal ?? 0) - (a.valorTotal ?? 0),
      );
  }, [fornecedorModal, fazendaId, movs, periodoIni, periodoFim, topFornecedorNomes]);

  const abrirModalFornecedor = (nome: string, isOutros?: boolean) => {
    setFornecedorModal({ nome, isOutros });
    setModalFornecedorOpen(true);
  };

  const abrirMovimentacaoCompra = (resumo: MovimentacaoResumo) => {
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("tipo", "Compra");
    const ref = resumo.origemDestino.trim();
    if (ref && ref !== "—") qs.set("fornecedor", ref);
    const data = resumo.dataMovimentacao.slice(0, 10);
    if (data) {
      qs.set("periodoIni", data);
      qs.set("periodoFim", data);
    }
    qs.set("grupoId", resumo.movimentacaoId);
    setModalFornecedorOpen(false);
    setLocation(
      movimentacaoComRetornoVisaoGeral(
        `/insumos/movimentacao?${qs.toString()}`,
        fazendaId,
        "compras_fornecedor",
      ),
    );
  };

  const abrirComprasFornecedor = (nome: string, isOutros?: boolean) => {
    abrirModalFornecedor(nome, isOutros);
  };

  const abrirTodasComprasFornecedor = () => {
    if (!fornecedorModal) return;
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("tipo", "Compra");
    if (!fornecedorModal.isOutros) qs.set("fornecedor", fornecedorModal.nome);
    if (periodoIni) qs.set("periodoIni", periodoIni);
    if (periodoFim) qs.set("periodoFim", periodoFim);
    setModalFornecedorOpen(false);
    setLocation(
      movimentacaoComRetornoVisaoGeral(
        `/insumos/movimentacao?${qs.toString()}`,
        fazendaId,
        "compras_fornecedor",
      ),
    );
  };

  const abrirProdutoNaLista = (
    nome: string,
    grupo?: string,
    controle?: "estocavel" | "consumo_direto",
  ) => {
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("status", "todos");
    qs.set("busca", nome);
    if (controle) qs.set("controle", controle);
    setLocation(listaProdutosComRetornoVisaoGeral(`/insumos/lista-produtos?${qs.toString()}`, fazendaId, grupo));
  };

  const irParaGrupo = (grupoId: string) => {
    setGrupoExpandidoId(grupoId);
    setHighlightAlerta(grupoId);
    requestAnimationFrame(() => {
      document.getElementById(`alerta-grupo-${grupoId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    window.setTimeout(() => setHighlightAlerta(null), 2200);
  };

  const gruposAlertas: AlertaCentralGrupo[] = useMemo(
    () => [
      {
        id: "vencidos",
        titulo: "Vencidos",
        icon: "event_busy",
        severidade: "critico",
        onVerTodos: () => setLocation(movPath),
        itens: alertas.vencidos.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () => setLocation(movPath),
        })),
      },
      {
        id: "cobertura",
        titulo: "Vai acabar em até 15 dias",
        icon: "hourglass_bottom",
        severidade: "critico",
        onVerTodos: () => setLocation(listaPath),
        itens: alertas.cobertura.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () =>
            setLocation(
              `${listaPath}${listaPath.includes("?") ? "&" : "?"}busca=${encodeURIComponent(i.titulo)}`,
            ),
        })),
      },
      {
        id: "abaixo_minimo",
        titulo: "Abaixo do estoque mínimo",
        icon: "production_quantity_limits",
        severidade: "critico",
        onVerTodos: () => setLocation(listaAbaixoMinimoPath),
        itens: alertas.baixo.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () => setLocation(listaAbaixoMinimoPath),
        })),
      },
      {
        id: "vencendo",
        titulo: "Vencendo em 30 dias",
        icon: "event",
        severidade: "alerta",
        onVerTodos: () => setLocation(movPath),
        itens: alertas.vencendo.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () => setLocation(movPath),
        })),
      },
      {
        id: "acima_maximo",
        titulo: "Acima do estoque máximo",
        icon: "inventory",
        severidade: "alerta",
        onVerTodos: () => setLocation(listaAcimaMaximoPath),
        itens: alertas.excesso.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () => setLocation(listaAcimaMaximoPath),
        })),
      },
      {
        id: "capital_parado",
        titulo: "Capital sem movimentação",
        icon: "hourglass_empty",
        severidade: "info",
        onVerTodos: () => setModalParadosOpen(true),
        itens: alertas.parados.map(i => ({
          id: i.id,
          titulo: i.titulo,
          detalhe: i.detalhe,
          onClick: () => setModalParadosOpen(true),
        })),
      },
    ],
    [
      alertas,
      listaPath,
      listaAbaixoMinimoPath,
      listaAcimaMaximoPath,
      movPath,
      setLocation,
    ],
  );

  const totalAlertas = useMemo(
    () => gruposAlertas.reduce((s, g) => s + g.itens.length, 0),
    [gruposAlertas],
  );

  const subValidade =
    alertas.validade.length === 0
      ? "Nenhum vencido ou vencendo em 30 dias"
      : `${brlCompact(alertas.valorRiscoValidade)} em produtos vencidos ou vencendo`;

  /** Verde = ok; âmbar = alerta; vermelho = vencido ou ≤ 7 dias. */
  const corValidade = (() => {
    if (alertas.validade.length === 0) return GREEN;
    const minDias = Math.min(...alertas.validade.map(v => v.dias));
    if (minDias < 0 || minDias <= 7) return RED;
    return "#F59E0B"; // âmbar/laranja — alerta
  })();

  /** Top 5 categorias + Outras, com participação % (já ordenado por valor). */
  const categoriaChart = useMemo(() => {
    const base = estoque.porCategoria;
    const total = estoque.valorTotal;
    const MAX = 5;
    const slices =
      base.length <= MAX
        ? base.map(c => ({ ...c, isOutras: false as boolean }))
        : [
            ...base.slice(0, MAX).map(c => ({ ...c, isOutras: false as boolean })),
            {
              name: "Outras",
              value: base.slice(MAX).reduce((s, c) => s + c.value, 0),
              isOutras: true,
            },
          ];
    return slices
      .filter(c => c.value > 0)
      .map(c => ({
        ...c,
        pct: total > 0 ? (c.value / total) * 100 : 0,
      }));
  }, [estoque.porCategoria, estoque.valorTotal]);

  const abrirCategoriaNaLista = (nome: string, isOutras?: boolean) => {
    if (isOutras) return;
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("categoria", nome);
    qs.set("status", "todos");
    setLocation(listaProdutosComRetornoVisaoGeral(`/insumos/lista-produtos?${qs.toString()}`, fazendaId));
  };

  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
    const grupo = params.get("grupo");
    if (!grupo) return;
    setGrupoExpandidoId(grupo);
    setHighlightAlerta(grupo);
    requestAnimationFrame(() => {
      document.getElementById(`alerta-grupo-${grupo}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    const t = window.setTimeout(() => setHighlightAlerta(null), 2200);
    return () => clearTimeout(t);
  }, [searchString]);

  return (
    <div className="space-y-4 mb-5">
      {/* ── Cabeçalho ── */}
      <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
        Visão Geral de Insumos
      </h1>

      {/* Fazenda — mesma largura de antes (1 coluna da grid de 3) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div className="min-w-0">
          <FormLabel>Fazenda</FormLabel>
          <FazendaOverviewSelect
            value={fazendaId}
            onChange={onChangeFazenda}
            fazendas={fazendas}
            emptyLabel="Selecione uma fazenda"
            showEmptyOption={fazendas.length > 1}
            className="w-full min-w-0"
          />
        </div>
      </div>

      {!fazendaSelecionada ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm px-6 py-12 sm:py-14 text-center">
          <img
            src="/assets/icon-insumo-saco-green.png"
            alt="Insumos"
            width={48}
            height={48}
            className="mx-auto mb-3"
            style={{
              objectFit: "contain",
              /* Tom cinza-azulado padrão dos estados vazios de insumos */
              filter:
                "brightness(0) saturate(100%) invert(84%) sepia(8%) saturate(420%) hue-rotate(169deg) brightness(92%) contrast(88%)",
            }}
          />
          <h2 className="text-[16px] font-semibold text-gray-900">Selecione uma fazenda</h2>
          <p className="text-[13px] text-gray-600 mt-2 max-w-md mx-auto">
            Escolha uma fazenda para visualizar os indicadores e movimentações de insumos.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
          <OverviewBlock title="Estoque hoje" hint="Posição atual · não depende do período" tone="estoque">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                size="compact"
                label="Valor em estoque"
                value={brl(estoque.valorTotal)}
                sub={
                  estoque.itensEmEstoque.length > 0
                    ? `${estoque.itensEmEstoque.length} produto${estoque.itensEmEstoque.length === 1 ? "" : "s"} com saldo`
                    : "Nenhum produto com saldo"
                }
                icon="savings"
                color={GOLD}
                valueColor={GOLD}
                tooltip="Soma em R$ dos produtos que ficam no estoque (com saldo hoje). Compras de uso imediato não entram aqui."
                onClick={() => setModalEstoqueOpen(true)}
              />
              <KpiCard
                size="compact"
                label="Abaixo do mínimo"
                value={num(estoque.abaixoMin.length)}
                sub={subAbaixoMinimo(estoque.abaixoMin.length)}
                icon="production_quantity_limits"
                color={estoque.abaixoMin.length > 0 ? RED : GREEN}
                valueColor={estoque.abaixoMin.length > 0 ? RED : GREEN}
                tooltip="Produtos estocáveis monitorados no mínimo ou abaixo"
                onClick={
                  estoque.abaixoMin.length > 0 ? () => irParaGrupo("abaixo_minimo") : undefined
                }
              />
              <KpiCard
                size="compact"
                label="Acima do máximo"
                value={num(estoque.acimaMax.length)}
                sub={subAcimaMaximo(estoque.acimaMax.length)}
                icon="inventory"
                color={estoque.acimaMax.length > 0 ? "#D97706" : GREEN}
                valueColor={estoque.acimaMax.length > 0 ? "#D97706" : GREEN}
                tooltip="Produtos estocáveis acima do máximo configurado"
                onClick={
                  estoque.acimaMax.length > 0 ? () => irParaGrupo("acima_maximo") : undefined
                }
              />
              <KpiCard
                size="compact"
                label="Validade crítica (vencidos + 30 dias)"
                value={num(alertas.validade.length)}
                sub={subValidade}
                icon="event_busy"
                color={corValidade}
                valueColor={corValidade}
                tooltip="Estocáveis já vencidos ou com validade nos próximos 30 dias"
                onClick={
                  alertas.validade.length > 0
                    ? () => irParaGrupo(alertas.vencidos.length > 0 ? "vencidos" : "vencendo")
                    : undefined
                }
              />
            </div>
            {totalAlertas > 0 ? (
              <div className="border-t border-gray-100 pt-3 space-y-2.5">
                <OverviewSectionHeading title="Produtos com pendência" />
                <InsumosAlertasCentral
                  grupos={gruposAlertas}
                  highlightId={highlightAlerta}
                  defaultGrupoAberto={false}
                  variant="embedded"
                  grupoExpandidoId={grupoExpandidoId}
                />
              </div>
            ) : null}
          </OverviewBlock>

          <OverviewBlock
            title="Movimentações no período"
            hint={`${dataBr(periodoIni)} – ${dataBr(periodoFim)}`}
            tone="periodo"
            headerExtra={
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl">
                <div>
                  <FormLabel className="text-[10px] text-gray-500">De</FormLabel>
                  <FormDatePicker
                    value={periodoIni}
                    onChange={mudarPeriodoIni}
                    placeholder="dd/mm/aaaa"
                    variant="light"
                    max={periodoFim || hojeIso}
                    aria-label="Data inicial do período"
                  />
                </div>
                <div>
                  <FormLabel className="text-[10px] text-gray-500">Até</FormLabel>
                  <FormDatePicker
                    value={periodoFim}
                    onChange={mudarPeriodoFim}
                    placeholder="dd/mm/aaaa"
                    variant="light"
                    max={hojeIso}
                    aria-label="Data final do período"
                  />
                </div>
              </div>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <KpiCard
                size="compact"
                label="Compras no período"
                value={brl(periodoTotais.comprado)}
                sub={
                  <ComprasPeriodoSub
                    comprado={periodoTotais.comprado}
                    comprasEstocaveis={periodoTotais.comprasEstocaveis}
                    comprasSemEstoque={periodoTotais.comprasSemEstoque}
                    compradoEstimado={periodoTotais.compradoEstimado}
                    comprasSemValor={periodoTotais.comprasSemValor}
                  />
                }
                icon="shopping_cart"
                color={NAVY}
                tooltip="Tudo que comprou no período: produtos que ficam no estoque e compras de uso imediato (não entram no saldo). Clique para ver a lista."
                onClick={() => setModalComprasOpen(true)}
              />
              <KpiCard
                size="compact"
                label="Saída do Estoque"
                value={brl(periodoTotais.consumido)}
                sub={
                  <span className="block space-y-0.5 text-[10px] leading-snug text-gray-500">
                    <span className="block">
                      {periodoTotais.consumido > 0
                        ? "Baixas por consumo interno no período"
                        : "Nenhum consumo interno no período"}
                    </span>
                    <span className="block text-gray-400">
                      {periodoTotais.consumido > 0
                        ? "Demais saídas não entram neste total"
                        : "Contabiliza só consumo interno em Insumos"}
                    </span>
                  </span>
                }
                icon="local_fire_department"
                color="#0891B2"
                tooltip="Só consumo interno lançado em Insumos no período. Venda, perda, ajuste e uso imediato não entram neste total."
              />
            </div>
          </OverviewBlock>

          </div>

          <Tabs
            value={abaVisao}
            onValueChange={v => setAbaVisao(v as typeof abaVisao)}
            className="gap-3"
          >
            <TabsList className="grid w-full h-auto grid-cols-2 gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-1">
              <TabsTrigger value="analise" className={TAB_TRIGGER_CLASS}>
                Análise
              </TabsTrigger>
              <TabsTrigger value="rankings" className={TAB_TRIGGER_CLASS}>
                Rankings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analise" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <SectionCard
                  title="Valor em estoque por categoria"
                  icon="donut_large"
                >
                  <div className="p-4">
                    {categoriaChart.length === 0 ? (
                      <EmptyState icon="inventory_2" text="Sem produtos com valor" />
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={150}>
                          <PieChart>
                            <Pie
                              data={categoriaChart}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={42}
                              outerRadius={68}
                              paddingAngle={2}
                              cursor="pointer"
                              isAnimationActive={false}
                              onMouseEnter={(_data, index) => {
                                const item = categoriaChart[index];
                                if (!item) return;
                                setCategoriaHover({
                                  ...item,
                                  color: CHART_COLORS[index % CHART_COLORS.length],
                                });
                              }}
                              onMouseLeave={() => setCategoriaHover(null)}
                              onClick={(_data, index) => {
                                const item = categoriaChart[index];
                                if (!item) return;
                                abrirCategoriaNaLista(item.name, item.isOutras);
                              }}
                            >
                              {categoriaChart.map((c, i) => {
                                const ativa = !categoriaHover || categoriaHover.name === c.name;
                                return (
                                  <Cell
                                    key={c.name}
                                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                                    fillOpacity={ativa ? 1 : 0.35}
                                    stroke={ativa && categoriaHover ? "#fff" : "transparent"}
                                    strokeWidth={ativa && categoriaHover ? 2 : 0}
                                  />
                                );
                              })}
                              <Label
                                content={({ viewBox }) => {
                                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                                  const cx = Number(viewBox.cx);
                                  const cy = Number(viewBox.cy);
                                  return (
                                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                      <tspan
                                        x={cx}
                                        dy="-0.35em"
                                        fill="#111827"
                                        fontSize={14}
                                        fontWeight={700}
                                      >
                                        {brlCompact(estoque.valorTotal)}
                                      </tspan>
                                      <tspan x={cx} dy="1.35em" fill="#6B7280" fontSize={9}>
                                        Total
                                      </tspan>
                                    </text>
                                  );
                                }}
                              />
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>

                        <div className="min-h-[28px] flex items-center justify-center mb-1">
                          {categoriaHover ? (
                            <div className="inline-flex items-center gap-2 max-w-full rounded-full bg-slate-50 border border-slate-100 px-2.5 py-0.5 text-[10px]">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: categoriaHover.color }}
                              />
                              <span className="font-semibold text-gray-800 truncate">
                                {categoriaHover.name}
                              </span>
                              <span className="tabular-nums text-gray-700 shrink-0">
                                {brl(categoriaHover.value)}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-0.5 max-h-[140px] overflow-y-auto pr-1">
                          {categoriaChart.map((c, i) => {
                            const color = CHART_COLORS[i % CHART_COLORS.length];
                            const ativa = categoriaHover?.name === c.name;
                            return (
                              <button
                                key={c.name}
                                type="button"
                                disabled={c.isOutras}
                                onClick={() => abrirCategoriaNaLista(c.name, c.isOutras)}
                                onMouseEnter={() => setCategoriaHover({ ...c, color })}
                                onMouseLeave={() => setCategoriaHover(null)}
                                className={`w-full flex items-center justify-between gap-2 text-[11px] rounded px-1.5 py-1 text-left transition-colors ${
                                  c.isOutras ? "cursor-default" : "cursor-pointer hover:bg-slate-50"
                                } ${ativa ? "bg-slate-50 ring-1 ring-slate-100" : ""}`}
                                title={c.isOutras ? undefined : `Ver produtos de ${c.name}`}
                              >
                                <span className="flex items-center gap-1.5 text-gray-600 truncate min-w-0">
                                  <span
                                    className="w-2 h-2 rounded-sm flex-shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className={`truncate ${ativa ? "font-semibold text-gray-800" : ""}`}>
                                    {c.name}
                                  </span>
                                </span>
                                <span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap shrink-0 text-[10px]">
                                  {brlCompact(c.value)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Fluxo no período"
                  icon="bar_chart"
                  className="lg:col-span-2"
                  action={
                    <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400 shrink-0 tabular-nums">
                      {dataBr(periodoIni)} – {dataBr(periodoFim)}
                    </span>
                  }
                >
                  <div className="p-4 space-y-2">
                    <p className="text-[11px] text-gray-500 leading-snug">
                      Compras e saídas por mês (R$)
                    </p>
                    {fluxo.every(b => b.entrada === 0 && b.saida === 0) ? (
                      <EmptyState icon="show_chart" text="Sem movimentações no período" />
                    ) : (
                      <>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={fluxo} margin={{ top: 8, right: 8, left: 12, bottom: 0 }} barGap={4}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "#94a3b8" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            width={64}
                            tick={{ fontSize: 10, fill: "#94a3b8", textAnchor: "end" }}
                            axisLine={false}
                            tickLine={false}
                            tickMargin={4}
                            tickFormatter={(v: number) => {
                              const n = Number(v);
                              if (!Number.isFinite(n)) return "R$ 0";
                              return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
                            }}
                          />
                          <RechartsTooltip
                            cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const row = payload[0]?.payload as {
                                label?: string;
                                entradaEstocavel?: number;
                                entradaSemEstoque?: number;
                                saida?: number;
                              } | undefined;
                              const mes = row?.label ?? String(label ?? "");
                              const entradaEstocavel = Number(row?.entradaEstocavel ?? 0);
                              const entradaSemEstoque = Number(row?.entradaSemEstoque ?? 0);
                              const saida = Number(row?.saida ?? 0);
                              return (
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm text-[12px] min-w-[168px]">
                                  <div className="font-semibold text-gray-800 mb-1.5">{mes}</div>
                                  <div className="space-y-1 text-gray-700">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: GREEN }} />
                                        Estocáveis
                                      </span>
                                      <span className="tabular-nums font-medium">{brl(entradaEstocavel)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5">
                                        <span
                                          className="w-2 h-2 rounded-sm"
                                          style={{ backgroundColor: "#6366F1" }}
                                        />
                                        Uso imediato
                                      </span>
                                      <span className="tabular-nums font-medium">{brl(entradaSemEstoque)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: GOLD }} />
                                        Saídas
                                      </span>
                                      <span className="tabular-nums font-medium">{brl(saida)}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar
                            dataKey="entradaEstocavel"
                            name="Estocáveis"
                            stackId="entrada"
                            fill={GREEN}
                            radius={[0, 0, 0, 0]}
                            maxBarSize={24}
                          />
                          <Bar
                            dataKey="entradaSemEstoque"
                            name="Uso imediato"
                            stackId="entrada"
                            fill="#6366F1"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={24}
                          />
                          <Bar
                            dataKey="saida"
                            name="Saídas (todas)"
                            fill={GOLD}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={24}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-[10px] text-gray-400 leading-snug">
                        Verde e Roxo = compras do mês · Amarelo = saídas (todas as baixas em Insumos).
                        O card Saída do Estoque acima considera só consumo interno.
                      </p>
                      </>
                    )}
                  </div>
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="rankings" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <SectionCard title="Top 5 Produtos com valor em estoque" icon="leaderboard">
                  {estoque.topProdutos.length === 0 ? (
                    <EmptyState icon="inventory_2" text="Sem produtos com valor" />
                  ) : (
                    <div className="p-4 space-y-2.5">
                      {estoque.topProdutos.map((p, i) => {
                        const max = estoque.topProdutos[0].valor || 1;
                        const barraPct = Math.round((p.valor / max) * 100);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => abrirProdutoNaLista(p.nome, undefined, "estocavel")}
                            className="w-full text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-slate-50 transition-colors"
                            title={`Ver ${p.nome} na lista de produtos`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                              <span className="font-medium text-gray-700 truncate">{p.nome}</span>
                              <span className="text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                                {brl(p.valor)}
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${barraPct}%`,
                                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </SectionCard>

                <div id="alerta-grupo-compras_fornecedor">
                  <SectionCard
                    title="Top 5 Fornecedores"
                    icon="local_shipping"
                    action={
                      <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400 shrink-0 tabular-nums">
                        {dataBr(periodoIni)} – {dataBr(periodoFim)}
                      </span>
                    }
                  >
                    {fornecedores.length === 0 ? (
                      <EmptyState icon="local_shipping" text="Sem compras com fornecedor no período" />
                    ) : (
                      <div className="p-4 space-y-2.5">
                        {fornecedores.map(f => {
                          const max = fornecedores[0].value || 1;
                          const barraPct = Math.round((f.value / max) * 100);
                          return (
                            <button
                              key={f.name}
                              type="button"
                              onClick={() => abrirComprasFornecedor(f.name, f.isOutros)}
                              className="w-full text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-slate-50 transition-colors"
                              title={
                                f.isOutros ? "Ver compras do período" : `Ver compras de ${f.name}`
                              }
                            >
                              <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                                <span className="font-medium text-gray-700 truncate">{f.name}</span>
                                <span className="text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                                  {brl(f.value)}
                                </span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${barraPct}%`, backgroundColor: NAVY }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {periodoTotais.comprasSemFornecedor > 0 ? (
                      <p className="px-4 pb-3 text-[10px] text-gray-500 border-t border-gray-50">
                        Sem fornecedor informado:{" "}
                        <span className="font-medium tabular-nums text-gray-700">
                          {brl(periodoTotais.comprasSemFornecedor)}
                        </span>
                      </p>
                    ) : null}
                  </SectionCard>
                </div>

                <SectionCard
                  title="Top 5 Uso imediato"
                  icon="receipt_long"
                  action={
                    <span className="text-[9px] font-medium uppercase tracking-wide text-gray-400 shrink-0 tabular-nums">
                      {dataBr(periodoIni)} – {dataBr(periodoFim)}
                    </span>
                  }
                >
                  {topUsoImediatoProdutos.length === 0 ? (
                    <EmptyState icon="receipt_long" text="Nenhuma compra de uso imediato no período" />
                  ) : (
                    <div className="p-4 space-y-2.5">
                      {topUsoImediatoProdutos.map(row => (
                        <button
                          key={row.produtoId}
                          type="button"
                          onClick={() => abrirProdutoNaLista(row.nome, "compras_consumo_direto", "consumo_direto")}
                          className="w-full text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-slate-50 transition-colors"
                          title={`Ver ${row.nome} na lista de produtos`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[12px] mb-0.5">
                            <span className="font-medium text-gray-700 truncate">{row.nome}</span>
                            <span className="text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                              {brl(row.valor)}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">
                            {row.qtd === 1 ? "1 compra" : `${row.qtd} compras`} · {row.fornecedorLabel}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {periodoTotais.comprasSemEstoque > 0 ? (
                    <p className="px-4 pb-3 text-[10px] text-gray-500 border-t border-gray-50">
                      Total no período:{" "}
                      <span className="font-medium tabular-nums text-gray-700">
                        {brl(periodoTotais.comprasSemEstoque)}
                      </span>
                      <span className="text-gray-400"> · não entra no valor em estoque</span>
                    </p>
                  ) : null}
                </SectionCard>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Modal — Compras no período */}
      <Dialog open={modalComprasOpen} onOpenChange={setModalComprasOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-1 text-left">
            <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
              Compras no período
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
              {dataBr(periodoIni)} – {dataBr(periodoFim)}
              {fazendaNome ? ` · ${fazendaNome}` : ""}
              {periodoTotais.comprado > 0 ? (
                <>
                  {" "}
                  · Total {brl(periodoTotais.comprado)} (Compras estocáveis {brl(periodoTotais.comprasEstocaveis)}{" "}
                  · Uso imediato {brl(periodoTotais.comprasSemEstoque)})
                  {periodoTotais.compradoEstimado > 0 ? (
                    <>
                      {" "}
                      · {brl(periodoTotais.compradoEstimado)} estimado
                    </>
                  ) : null}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll>
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Produto</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Data</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Tipo</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comprasPeriodoLista.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-gray-400">
                          Nenhuma compra no período
                        </td>
                      </tr>
                    ) : (
                      comprasPeriodoLista.map(row => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[140px] truncate">
                            {row.nome}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600 tabular-nums whitespace-nowrap">
                            {dataBr(row.data)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                row.estocavel
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-indigo-50 text-indigo-700",
                              )}
                            >
                              {row.estocavel ? "Estocável" : "Uso imediato"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-800 font-medium whitespace-nowrap">
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {brl(row.valor)}
                              {row.estimado ? (
                                <span
                                  className="inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-800"
                                  title="Valor estimado — compra sem valor informado no lançamento"
                                >
                                  Est.
                                </span>
                              ) : null}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
            {comprasPeriodoLista.length > 0 ? (
              <p className="mt-3 text-[10px] text-gray-400 leading-relaxed">
                Valores com badge <span className="font-semibold text-amber-700">Est.</span> foram
                estimados (qtd × preço unitário) por falta de valor no lançamento. Uso imediato registra
                o gasto na compra, sem saldo. Frete embutido no valor quando informado na movimentação.
              </p>
            ) : null}
          </div>
          {comprasPeriodoLista.length > 0 ? (
            <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setModalComprasOpen(false);
                  setLocation(`${movPath}${movPath.includes("?") ? "&" : "?"}tipo=Compra`);
                }}
                className="text-[12px] font-semibold text-[#4ECDC4] hover:underline"
              >
                Ver movimentações de compra
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal — Compras por fornecedor */}
      <Dialog
        open={modalFornecedorOpen}
        onOpenChange={open => {
          setModalFornecedorOpen(open);
          if (!open) setFornecedorModal(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-1 text-left">
            <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
              {fornecedorModal?.isOutros
                ? "Compras — Outros fornecedores"
                : `Compras — ${fornecedorModal?.nome ?? ""}`}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
              Movimentações de compra no período selecionado
              {fazendaNome ? ` — ${fazendaNome}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll
                fitWidth
                footer={
                  comprasFornecedorModal.length > 0 ? (
                    <div className="px-5 py-4 flex justify-end border-t border-gray-100 bg-white">
                      <button
                        type="button"
                        onClick={abrirTodasComprasFornecedor}
                        className="text-[12px] font-semibold text-[#4ECDC4] hover:underline"
                      >
                        Ver todas no período
                      </button>
                    </div>
                  ) : undefined
                }
              >
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-center`}>Data</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center`}>Valor</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center`}>Itens</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center w-12`}>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comprasFornecedorModal.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-gray-400">
                          Nenhuma compra no período
                        </td>
                      </tr>
                    ) : (
                      comprasFornecedorModal.map(resumo => (
                        <tr
                          key={resumo.movimentacaoId}
                          className="border-b border-gray-100 hover:bg-gray-50 transition-colors group"
                        >
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {formatDataResumo(resumo.dataMovimentacao)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-800 font-medium`}>
                            {formatValorResumo(resumo.valorTotal)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center text-gray-600`}>
                            {formatItensLabel(resumo.qtdItens)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center`}>
                            <TableIconButton
                              label={`Ver movimentação de ${formatDataResumo(resumo.dataMovimentacao)}`}
                              onClick={() => abrirMovimentacaoCompra(resumo)}
                              tone="neutral"
                              compact
                            >
                              <ViewActionIcon size={16} />
                            </TableIconButton>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Valor em estoque (produtos estocáveis com saldo) */}
      <Dialog open={modalEstoqueOpen} onOpenChange={setModalEstoqueOpen}>
        <DialogContent className="sm:max-w-[min(60rem,calc(100vw-2rem))] p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-0 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
                  Valor em estoque
                </DialogTitle>
                <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
                  Produtos estocáveis com saldo na fazenda
                  {fazendaNome ? ` — ${fazendaNome}` : ""}.
                </DialogDescription>
              </div>
              <ListExportButtons
                title="Valor em estoque"
                filename="valor-em-estoque"
                headers={[...ESTOQUE_EXPORT_HEADERS]}
                rows={estoqueExportRows}
                fazendaNome={fazendaNome}
                disabled={estoque.itensEmEstoque.length === 0}
                disabledTitle="Nenhum produto para exportar"
                variant="secondary"
                spreadsheetSheetName="Valor em estoque"
                spreadsheetReportTitle={estoqueExportTitle}
                spreadsheetPlainHeader
                spreadsheetBlankAfterMeta={false}
                spreadsheetAutoFilter={false}
                spreadsheetTextCols={[0, 1, 2, 3]}
                spreadsheetCurrencyCols={[4, 5]}
                spreadsheetColumnAligns={["center", "center", "center", "center", "center", "center"]}
                pdfColumnAligns={["center", "center", "center", "center", "center", "center"]}
                pdfIncludeSpreadsheetTitle={false}
                pdfShowRegistrosSubtitle={false}
                spreadsheetFooterRowCount={estoque.itensEmEstoque.length > 0 ? 1 : 0}
              />
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll>
                <table className="w-max min-w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[9rem]`}>Produto</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[7rem]`}>Categoria</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[6.5rem]`}>Saldo atual</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[4.5rem]`}>Unidade</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[6.5rem]`}>Custo médio</th>
                      <th className={`${OVERVIEW_MODAL_TH_WRAP} text-center min-w-[6.5rem]`}>
                        Valor
                        <br />
                        em estoque
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estoque.itensEmEstoque.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                          Nenhum produto estocável com saldo
                        </td>
                      </tr>
                    ) : (
                      estoque.itensEmEstoque.map(row => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className={`${PARADOS_MODAL_TD} text-center font-medium text-gray-800`}>
                            <button
                              type="button"
                              onClick={() => {
                                setModalEstoqueOpen(false);
                                abrirProdutoNaLista(row.nome, "valor_estoque", "estocavel");
                              }}
                              className="w-full text-center hover:text-[#4ECDC4] hover:underline transition-colors"
                              title={`Ver ${row.nome} na lista de produtos`}
                            >
                              {row.nome}
                            </button>
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center text-gray-600`}>{row.categoria}</td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {formatSaldoParado(row.saldo)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center text-gray-600`}>{row.unidade}</td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {row.custoMedio > 0 ? brl(row.custoMedio) : "—"}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums font-medium text-gray-800`}>
                            {row.valor > 0 ? brl(row.valor) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Capital sem movimentação */}
      <Dialog open={modalParadosOpen} onOpenChange={setModalParadosOpen}>
        <DialogContent className="sm:max-w-[min(60rem,calc(100vw-2rem))] p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-0 text-left">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="min-w-0 space-y-1">
                <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
                  Capital sem movimentação
                </DialogTitle>
                <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
                  Produtos com saldo e sem movimentação há mais de 90 dias
                  {fazendaNome ? ` — ${fazendaNome}` : ""}.
                </DialogDescription>
              </div>
              <ListExportButtons
                title="Capital sem movimentação"
                filename="capital-sem-movimentacao"
                headers={[...PARADOS_EXPORT_HEADERS]}
                rows={paradosExportRows}
                fazendaNome={fazendaNome}
                disabled={capitalParado.itens.length === 0}
                disabledTitle="Nenhum produto para exportar"
                variant="secondary"
                spreadsheetSheetName="Capital parado"
                spreadsheetReportTitle={paradosExportTitle}
                spreadsheetPlainHeader
                spreadsheetBlankAfterMeta={false}
                spreadsheetAutoFilter={false}
                spreadsheetTextCols={[0, 1, 2, 5]}
                spreadsheetCurrencyCols={[3, 4]}
                spreadsheetIntegerCols={[6]}
                spreadsheetColumnAligns={[
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                ]}
                pdfColumnAligns={[
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                  "center",
                ]}
                pdfIncludeSpreadsheetTitle={false}
                pdfShowRegistrosSubtitle={false}
                spreadsheetFooterRowCount={capitalParado.itens.length > 0 ? 1 : 0}
              />
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll>
                <table className="w-max min-w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[9rem]`}>Produto</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[6.5rem]`}>Saldo atual</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[4.5rem]`}>Unidade</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-center min-w-[6.5rem]`}>Custo médio</th>
                      <th className={`${OVERVIEW_MODAL_TH_WRAP} text-center min-w-[6.5rem]`}>
                        Valor
                        <br />
                        imobilizado
                      </th>
                      <th className={`${OVERVIEW_MODAL_TH_WRAP} text-center min-w-[6.5rem]`}>
                        Última
                        <br />
                        movimentação
                      </th>
                      <th className={`${OVERVIEW_MODAL_TH_WRAP} text-center min-w-[6.5rem]`}>
                        Dias sem
                        <br />
                        movimentação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {capitalParado.itens.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-gray-400">
                          Nenhum produto parado há mais de 90 dias
                        </td>
                      </tr>
                    ) : (
                      capitalParado.itens.map(row => (
                        <tr key={row.id} className="border-b border-gray-100">
                          <td className={`${PARADOS_MODAL_TD} text-center font-medium text-gray-800`}>
                            <button
                              type="button"
                              onClick={() => {
                                setModalParadosOpen(false);
                                abrirProdutoNaLista(row.nome, "capital_parado", "estocavel");
                              }}
                              className="w-full text-center hover:text-[#4ECDC4] hover:underline transition-colors"
                              title={`Ver ${row.nome} na lista de produtos`}
                            >
                              {row.nome}
                            </button>
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {formatSaldoParado(row.saldo)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center text-gray-600`}>{row.unidade}</td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {brl(row.custoMedio)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums font-medium text-gray-800`}>
                            {brl(row.valor)}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center text-gray-600`}>
                            {row.ultimaMov ? dataBr(row.ultimaMov) : "Sem registro"}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {row.ultimaMov ? row.diasSemMov : "90+"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal — Acima do estoque máximo */}
      <Dialog open={modalAcimaOpen} onOpenChange={setModalAcimaOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-1 text-left">
            <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
              Acima do estoque máximo
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
              Produtos estocáveis com saldo acima do máximo configurado
              {fazendaNome ? ` — ${fazendaNome}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll>
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Produto</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estoque.acimaMax.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-10 text-center text-gray-400">
                          Nenhum produto acima do máximo
                        </td>
                      </tr>
                    ) : (
                      estoque.acimaMax.map(p => {
                        const atual = numVal(p.quantidade);
                        const maximo = numVal(p.quantidadeMaxima);
                        const unA = pluralUnidade(p.unidade, atual);
                        const unM = pluralUnidade(p.unidade, maximo);
                        return (
                          <tr key={p.id} className="border-b border-gray-100">
                            <td className="px-3 py-2.5 font-medium text-gray-800">{p.nome}</td>
                            <td className="px-3 py-2.5 text-gray-600">
                              Atual: {num(atual, 2)} {unA} | Máximo: {num(maximo, 2)} {unM}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
          </div>
          {estoque.acimaMax.length > 0 ? (
            <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setModalAcimaOpen(false);
                  setLocation(listaAcimaMaximoPath);
                }}
                className="text-[12px] font-semibold text-[#4ECDC4] hover:underline"
              >
                Ver na lista de produtos
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal — Abaixo do estoque mínimo */}
      <Dialog open={modalAbaixoOpen} onOpenChange={setModalAbaixoOpen}>
        <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-1 text-left">
            <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
              Abaixo do estoque mínimo
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
              Produtos que requerem reposição
              {fazendaNome ? ` — ${fazendaNome}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll
                fitWidth
                footer={
                  <div className="px-5 py-4 flex justify-end border-t border-gray-100 bg-white">
                    <button
                      type="button"
                      onClick={() => {
                        setModalAbaixoOpen(false);
                        setLocation(listaAbaixoMinimoPath);
                      }}
                      className="text-[12px] font-semibold text-[#4ECDC4] hover:underline"
                    >
                      Ver produtos abaixo do mínimo
                    </button>
                  </div>
                }
              >
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Produto</th>
                      <th className={`${OVERVIEW_MODAL_TH} text-left`}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estoque.abaixoMin.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-10 text-center text-gray-400">
                          Nenhuma reposição pendente
                        </td>
                      </tr>
                    ) : (
                      estoque.abaixoMin.map(p => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="px-3 py-2.5 font-medium text-gray-800">{p.nome}</td>
                          <td className="px-3 py-2.5 text-gray-600">
                            {formatSaldoMinimo(
                              numVal(p.quantidade),
                              numVal(p.quantidadeMinima),
                              p.unidade,
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
