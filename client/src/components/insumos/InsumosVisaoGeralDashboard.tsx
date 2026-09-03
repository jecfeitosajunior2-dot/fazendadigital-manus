import { useMemo, useState } from "react";
import { useLocation } from "wouter";
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
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { FormLabel, FormDatePicker } from "@/components/FormFields";
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
import { nomeUnidadeExibicao, siglaUnidade, sinalDoTipo } from "@/lib/produto-types";

const COBERTURA_CRITICA_DIAS = 15;
const PARADO_DIAS = 90;

const OVERVIEW_MODAL_TH =
  "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap";
const OVERVIEW_MODAL_TH_WRAP =
  "px-3 py-2.5 text-[11px] font-semibold text-gray-600 uppercase tracking-wide leading-snug whitespace-normal align-middle";
const PARADOS_MODAL_TD = "px-3 py-2.5 align-middle whitespace-nowrap";

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
  if (qtd === 1) return "1 produto requer reposição";
  return `${qtd} produtos requerem reposição`;
}

/** Card compacto no padrão da Visão Geral do Rebanho (ícone à esquerda + valor + rótulo). */
function OverviewKpiCard({
  label,
  value,
  sub,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        "bg-white rounded border border-gray-200 shadow-sm p-3 min-h-[80px] flex items-center transition",
        onClick && "cursor-pointer hover:shadow-md hover:border-gray-300 active:scale-[0.99]",
      )}
    >
      <div className="flex items-center gap-2.5 w-full min-w-0">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}14` }}
        >
          <span className="material-icons text-[19px]" style={{ color }}>
            {icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-bold text-gray-800 leading-tight tabular-nums truncate">
            {value}
          </div>
          <div className="text-[10px] text-gray-500 leading-snug line-clamp-2">{label}</div>
          {sub ? (
            <div className="text-[9px] text-gray-400 leading-snug mt-0.5 line-clamp-2">{sub}</div>
          ) : null}
        </div>
        {onClick ? (
          <span className="material-icons text-[18px] text-gray-300 shrink-0" aria-hidden>
            chevron_right
          </span>
        ) : null}
      </div>
    </div>
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
  const [highlightAlerta, setHighlightAlerta] = useState<string | null>(null);
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

  // Mapa de valor unitário por produto (custo médio vigente).
  const valorUnitMap = useMemo(() => {
    const m = new Map<number, number>();
    produtos.forEach(p => m.set(p.id, numVal(p.valorUnitario)));
    return m;
  }, [produtos]);

  // Preço médio implícito das entradas ativas (fallback).
  const precoMedioImplicit = useMemo(() => {
    const totalQtd = new Map<number, number>();
    const totalVal = new Map<number, number>();
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (sinalDoTipo(mv.tipo) === "saida") continue;
      const qtd = numVal(mv.quantidade);
      if (!(qtd > 0)) continue;
      const val = numVal(mv.valor);
      if (val > 0) {
        totalQtd.set(mv.estoqueId, (totalQtd.get(mv.estoqueId) ?? 0) + qtd);
        totalVal.set(mv.estoqueId, (totalVal.get(mv.estoqueId) ?? 0) + val);
      }
    }
    const m = new Map<number, number>();
    for (const [id, qtd] of totalQtd.entries()) {
      const val = totalVal.get(id) ?? 0;
      m.set(id, qtd > 0 ? val / qtd : 0);
    }
    return m;
  }, [movs]);

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
    // Ativos e inativos com saldo (capital imobilizado)
    const comValor = produtos.filter(p => numVal(p.quantidade) > 0);

    const valorTotal = comValor.reduce(
      (s, p) => s + numVal(p.quantidade) * precoEfetivo(p.id, p.valorUnitario),
      0,
    );

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
        p.monitorarEstoque &&
        numVal(p.quantidadeMinima) > 0 &&
        numVal(p.quantidade) <= numVal(p.quantidadeMinima),
    );
    const acimaMax = ativos.filter(
      p =>
        p.monitorarEstoque &&
        numVal(p.quantidadeMaxima) > 0 &&
        numVal(p.quantidade) > numVal(p.quantidadeMaxima),
    );

    return {
      ativos,
      valorTotal,
      porCategoria,
      topProdutos,
      abaixoMin,
      acimaMax,
    };
  }, [produtos, precoMedioImplicit]);

  // ── Fluxo Entradas × Saídas (R$) conforme período ──────────────────────────
  const fluxo = useMemo(() => {
    const movsPeriodo = movs.filter(mv => {
      if (!isMovAtiva(mv.status)) return false;
      if (isTransferencia(mv.tipo)) return false;
      return movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim);
    });
    const buckets = bucketsFluxoIntervalo(periodoIni, periodoFim);
    const idx = new Map(buckets.map((b, i) => [b.chave, i]));
    for (const mv of movsPeriodo) {
      const k = chaveFluxoIntervalo(periodoIni, periodoFim, mv.dataMovimentacao);
      if (k == null || !idx.has(k)) continue;
      const b = buckets[idx.get(k)!]!;
      const valorMov = valorMovimentacao(mv);
      if (!(valorMov > 0)) continue;
      if (isSaida(mv)) b.saida += valorMov;
      else b.entrada += valorMov;
    }
    // Números finitos — tooltip/eixo sempre coerentes com as barras.
    return buckets.map(b => ({
      ...b,
      entrada: Number.isFinite(b.entrada) ? b.entrada : 0,
      saida: Number.isFinite(b.saida) ? b.saida : 0,
    }));
  }, [movs, valorUnitMap, precoMedioImplicit, periodoIni, periodoFim]);

  // ── Totais do período (fluxo) ──────────────────────────────────────────────
  const periodoTotais = useMemo(() => {
    let comprado = 0;
    let consumido = 0;
    for (const mv of movs) {
      if (!isMovAtiva(mv.status)) continue;
      if (isTransferencia(mv.tipo)) continue;
      if (!movimentoNoIntervalo(mv.dataMovimentacao, periodoIni, periodoFim)) continue;
      const valorMov = valorMovimentacao(mv);
      if (isConsumo(mv.tipo)) consumido += valorMov;
      else if (isCompra(mv.tipo)) comprado += valorMov;
    }
    return { comprado, consumido };
  }, [movs, valorUnitMap, precoMedioImplicit, periodoIni, periodoFim]);

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
      const frete = Math.max(0, numVal(mv.frete));
      const total = valorMovimentacao(mv) + frete;
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

  const listaPath = fazendaId
    ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}`
    : "/insumos/lista-produtos";
  const listaAbaixoMinimoPath = fazendaId
    ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}&status=ativo&alerta=abaixo_minimo`
    : "/insumos/lista-produtos?status=ativo&alerta=abaixo_minimo";
  const listaAcimaMaximoPath = fazendaId
    ? `/insumos/lista-produtos?fazendaId=${encodeURIComponent(fazendaId)}&status=ativo&alerta=acima_maximo`
    : "/insumos/lista-produtos?status=ativo&alerta=acima_maximo";
  const movPath = fazendaId
    ? `/insumos/movimentacao?fazendaId=${encodeURIComponent(fazendaId)}`
    : "/insumos/movimentacao";

  const abrirProdutoNaLista = (nome: string) => {
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("status", "todos");
    qs.set("busca", nome);
    setLocation(`/insumos/lista-produtos?${qs.toString()}`);
  };

  const abrirComprasFornecedor = (nome: string, isOutros?: boolean) => {
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("tipo", "Compra");
    if (!isOutros) qs.set("fornecedor", nome);
    if (periodoIni) qs.set("periodoIni", periodoIni);
    if (periodoFim) qs.set("periodoFim", periodoFim);
    setLocation(`/insumos/movimentacao?${qs.toString()}`);
  };

  const irParaGrupo = (grupoId: string) => {
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

  const subValidade =
    alertas.validade.length === 0
      ? "Nenhum produto próximo do vencimento"
      : `${brlCompact(alertas.valorRiscoValidade)} em estoque próximo do vencimento`;

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

  const pctBr = (pct: number) =>
    `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  const abrirCategoriaNaLista = (nome: string, isOutras?: boolean) => {
    if (isOutras) return;
    const qs = new URLSearchParams();
    if (fazendaId) qs.set("fazendaId", fazendaId);
    qs.set("categoria", nome);
    qs.set("status", "todos");
    setLocation(`/insumos/lista-produtos?${qs.toString()}`);
  };

  return (
    <div className="space-y-5 mb-5">
      {/* ── Cabeçalho ── */}
      <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
        Visão Geral de Insumos
      </h1>

      {/* Fazenda e período — mesma largura das colunas dos KPIs abaixo */}
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
        {fazendaSelecionada && (
          <div className="min-w-0 sm:col-span-2">
            <FormLabel>Período</FormLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormDatePicker
                value={periodoIni}
                onChange={mudarPeriodoIni}
                placeholder="dd/mm/aaaa"
                variant="light"
                max={periodoFim || hojeIso}
                aria-label="Data inicial do período"
              />
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
        )}
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
          {/* ── KPIs: 3 por linha ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-1">
            {/* Linha 1 — posição e riscos */}
            <OverviewKpiCard
              label="Valor em estoque"
              value={brlCompact(estoque.valorTotal)}
              sub="Capital atualmente imobilizado"
              icon="savings"
              color={GOLD}
            />
            <OverviewKpiCard
              label="Abaixo do estoque mínimo"
              value={num(estoque.abaixoMin.length)}
              sub={subAbaixoMinimo(estoque.abaixoMin.length)}
              icon="production_quantity_limits"
              color={estoque.abaixoMin.length > 0 ? RED : GREEN}
              onClick={() => setModalAbaixoOpen(true)}
            />
            <OverviewKpiCard
              label="Vencendo em 30 dias"
              value={num(alertas.validade.length)}
              sub={subValidade}
              icon="event_busy"
              color={corValidade}
              onClick={
                alertas.validade.length > 0
                  ? () => irParaGrupo(alertas.vencidos.length > 0 ? "vencidos" : "vencendo")
                  : undefined
              }
            />
            {/* Linha 2 — fluxo e eficiência */}
            <OverviewKpiCard
              label="Compras no período"
              value={brlCompact(periodoTotais.comprado)}
              sub="Total comprado no período"
              icon="shopping_cart"
              color={NAVY}
            />
            <OverviewKpiCard
              label="Consumo no período"
              value={brlCompact(periodoTotais.consumido)}
              sub="Custo dos insumos utilizados"
              icon="local_fire_department"
              color="#0891B2"
            />
            <OverviewKpiCard
              label="Capital sem movimentação"
              value={brlCompact(capitalParado.valorTotal)}
              sub="Sem movimentação há mais de 90 dias"
              icon="hourglass_empty"
              color={capitalParado.valorTotal > 0 ? GOLD : TEAL}
              onClick={() => setModalParadosOpen(true)}
            />
          </div>

          {/* ── Central de Alertas ── */}
          <InsumosAlertasCentral grupos={gruposAlertas} highlightId={highlightAlerta} />

          {/* ── Valor por categoria + Fluxo ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <SectionCard title="Valor por Categoria" icon="donut_large">
              <div className="p-5">
                {categoriaChart.length === 0 ? (
                  <EmptyState icon="inventory_2" text="Sem produtos com valor" />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={188}>
                      <PieChart>
                        <Pie
                          data={categoriaChart}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
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
                                    fontSize={15}
                                    fontWeight={700}
                                  >
                                    {brlCompact(estoque.valorTotal)}
                                  </tspan>
                                  <tspan
                                    x={cx}
                                    dy="1.45em"
                                    fill="#6B7280"
                                    fontSize={10}
                                  >
                                    Total em estoque
                                  </tspan>
                                </text>
                              );
                            }}
                          />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Detalhe da fatia: entre o gráfico e a legenda */}
                    <div className="min-h-[32px] flex items-center justify-center mb-1">
                      {categoriaHover ? (
                        <div className="inline-flex items-center gap-2 max-w-full rounded-full bg-slate-50 border border-slate-100 px-3 py-1 text-[11px]">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: categoriaHover.color }}
                          />
                          <span className="font-semibold text-gray-800 truncate">
                            {categoriaHover.name}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className="tabular-nums text-gray-700 shrink-0">
                            {brl(categoriaHover.value)}
                          </span>
                          <span className="tabular-nums font-semibold text-teal-700 shrink-0">
                            {pctBr(categoriaHover.pct)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      {categoriaChart.map((c, i) => {
                        const color = CHART_COLORS[i % CHART_COLORS.length];
                        const ativa = categoriaHover?.name === c.name;
                        return (
                          <button
                            key={c.name}
                            type="button"
                            disabled={c.isOutras}
                            onClick={() => abrirCategoriaNaLista(c.name, c.isOutras)}
                            onMouseEnter={() =>
                              setCategoriaHover({ ...c, color })
                            }
                            onMouseLeave={() => setCategoriaHover(null)}
                            className={`w-full flex items-center justify-between gap-2 text-[12px] rounded-md px-2 py-1.5 text-left transition-colors ${
                              c.isOutras
                                ? "cursor-default"
                                : "cursor-pointer hover:bg-slate-50"
                            } ${ativa ? "bg-slate-50 ring-1 ring-slate-100" : ""}`}
                            title={c.isOutras ? undefined : `Ver produtos de ${c.name}`}
                          >
                            <span className="flex items-center gap-2 text-gray-600 truncate min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              <span className={`truncate ${ativa ? "font-semibold text-gray-800" : ""}`}>
                                {c.name}
                              </span>
                            </span>
                            <span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap shrink-0">
                              {brlCompact(c.value)}
                              <span className="text-gray-400 font-medium ml-1.5">{pctBr(c.pct)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Valor de Entradas × Saídas" icon="bar_chart" className="lg:col-span-2">
              <div className="p-5">
                {fluxo.every(b => b.entrada === 0 && b.saida === 0) ? (
                  <EmptyState icon="show_chart" text="Sem movimentações no período" />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={fluxo} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={56}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
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
                            entrada?: number;
                            saida?: number;
                          } | undefined;
                          const mes = row?.label ?? String(label ?? "");
                          const entrada = Number(row?.entrada ?? 0);
                          const saida = Number(row?.saida ?? 0);
                          return (
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm text-[12px]">
                              <div className="font-semibold text-gray-800 mb-1.5">{mes}</div>
                              <div className="flex items-center justify-between gap-4 text-gray-700">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: GREEN }} />
                                  Entradas
                                </span>
                                <span className="tabular-nums font-medium">{brl(entrada)}</span>
                              </div>
                              <div className="flex items-center justify-between gap-4 text-gray-700 mt-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: GOLD }} />
                                  Saídas
                                </span>
                                <span className="tabular-nums font-medium">{brl(saida)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="entrada"
                        name="Entradas"
                        fill={GREEN}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="saida"
                        name="Saídas"
                        fill={GOLD}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </SectionCard>
          </div>

          {/* ── Top produtos + Fornecedores ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Produtos com maior valor em estoque" icon="leaderboard">
              {estoque.topProdutos.length === 0 ? (
                <EmptyState icon="inventory_2" text="Sem produtos com valor" />
              ) : (
                <div className="p-5 space-y-3">
                  {estoque.topProdutos.map((p, i) => {
                    const max = estoque.topProdutos[0].valor || 1;
                    const barraPct = Math.round((p.valor / max) * 100);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => abrirProdutoNaLista(p.nome)}
                        className="w-full text-left rounded-md px-1 py-0.5 -mx-1 hover:bg-slate-50 transition-colors"
                        title={`Ver ${p.nome} na lista de produtos`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                          <span className="font-medium text-gray-700 truncate">{p.nome}</span>
                          <span className="text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                            {brl(p.valor)}
                            <span className="text-gray-400 ml-1.5">
                              {p.pct.toLocaleString("pt-BR", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
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

            <SectionCard title="Compras por fornecedor" icon="local_shipping">
              {fornecedores.length === 0 ? (
                <EmptyState icon="local_shipping" text="Sem compras com fornecedor no período" />
              ) : (
                <div className="p-5 space-y-3">
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
                          f.isOutros
                            ? "Ver compras do período"
                            : `Ver compras de ${f.name}`
                        }
                      >
                        <div className="flex items-center justify-between gap-2 text-[12px] mb-1">
                          <span className="font-medium text-gray-700 truncate">{f.name}</span>
                          <span className="text-gray-500 tabular-nums whitespace-nowrap shrink-0">
                            {brl(f.value)}
                            <span className="text-gray-400 ml-1.5">
                              {f.pct.toLocaleString("pt-BR", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
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
            </SectionCard>
          </div>
        </>
      )}

      {/* Modal — Capital sem movimentação */}
      <Dialog open={modalParadosOpen} onOpenChange={setModalParadosOpen}>
        <DialogContent className="sm:max-w-[min(60rem,calc(100vw-2rem))] p-0 gap-0 overflow-hidden flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-1 text-left">
            <DialogTitle className="text-[13px] font-semibold text-[#4ECDC4]">
              Capital sem movimentação
            </DialogTitle>
            <DialogDescription className="text-[11px] text-gray-500 leading-relaxed">
              Produtos com saldo e sem movimentação há mais de 90 dias
              {fazendaNome ? ` — ${fazendaNome}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <TableHorizontalScroll>
                <table className="w-max min-w-full text-[12px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr className="border-b border-gray-200">
                      <th className={`${OVERVIEW_MODAL_TH} text-left min-w-[9rem]`}>Produto</th>
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
                          <td className={`${PARADOS_MODAL_TD} text-left font-medium text-gray-800`}>
                            {row.nome}
                          </td>
                          <td className={`${PARADOS_MODAL_TD} text-center tabular-nums text-gray-700`}>
                            {num(row.saldo, 2)}
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
