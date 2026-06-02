import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import {
  SectionCard,
  KpiCard,
  AlertGroup,
  EmptyState,
  TEAL,
  NAVY,
  GREEN,
  RED,
  GOLD,
} from "@/components/dashboard/DashboardUI";
import {
  brl,
  brlCompact,
  num,
  diasAte,
  prazoRelativo,
  inicioPeriodo,
  parseData,
  ultimosMeses,
  mesChave,
  PERIODOS,
  CHART_COLORS,
  type PeriodoChave,
} from "@/lib/dashboard-utils";
import { sinalDoTipo } from "@/lib/produto-types";

const COBERTURA_CRITICA_DIAS = 15;
const PARADO_DIAS = 90;

const numVal = (v: unknown) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

export default function InsumosVisaoGeralDashboard() {
  const [, setLocation] = useLocation();
  const [periodo, setPeriodo] = useState<PeriodoChave>("90d");

  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const { data: movs = [] } = trpc.estoque.listMovimentacoes.useQuery();

  // Mapa de valor unitário por produto (para estimar valor das movimentações).
  const valorUnitMap = useMemo(() => {
    const m = new Map<number, number>();
    produtos.forEach(p => m.set(p.id, numVal(p.valorUnitario)));
    return m;
  }, [produtos]);

  const isSaida = (mv: { tipo: string | null; quantidade: string | number }) =>
    mv.tipo ? sinalDoTipo(mv.tipo) === "saida" : numVal(mv.quantidade) < 0;

  // ── Estoque atual: valor imobilizado, categorias, top produtos ───────────────
  const estoque = useMemo(() => {
    const ativos = produtos.filter(p => p.situacao !== "inativo");
    const valorTotal = ativos.reduce((s, p) => s + numVal(p.quantidade) * numVal(p.valorUnitario), 0);

    const categorias = new Map<string, number>();
    ativos.forEach(p => {
      const cat = p.categoria?.trim() || "Sem categoria";
      categorias.set(cat, (categorias.get(cat) ?? 0) + numVal(p.quantidade) * numVal(p.valorUnitario));
    });
    const porCategoria = [...categorias.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);

    const topProdutos = ativos
      .map(p => ({ nome: p.nome, valor: numVal(p.quantidade) * numVal(p.valorUnitario) }))
      .filter(p => p.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6);

    const abaixoMin = ativos.filter(p => p.monitorarEstoque && numVal(p.quantidade) <= numVal(p.quantidadeMinima));
    const acimaMax = ativos.filter(p => numVal(p.quantidadeMaxima) > 0 && numVal(p.quantidade) > numVal(p.quantidadeMaxima));

    return {
      ativos,
      valorTotal,
      porCategoria,
      topProdutos,
      abaixoMin,
      acimaMax,
      totalCategorias: porCategoria.length,
    };
  }, [produtos]);

  // ── Fluxo de movimentação (R$) por mês: entradas x saídas estimadas ──────────
  const fluxo = useMemo(() => {
    const buckets = ultimosMeses(6);
    const idx = new Map(buckets.map((b, i) => [b.chave, i]));
    for (const mv of movs) {
      const k = mesChave(mv.dataMovimentacao);
      if (k == null || !idx.has(k)) continue;
      const b = buckets[idx.get(k)!];
      const qtd = Math.abs(numVal(mv.quantidade));
      const valorMov = numVal(mv.valor) || qtd * (valorUnitMap.get(mv.estoqueId) ?? 0);
      if (isSaida(mv)) b.despesa += valorMov;
      else b.receita += valorMov;
    }
    return buckets.map(b => ({ label: b.label, entrada: b.receita, saida: b.despesa }));
  }, [movs, valorUnitMap]);

  // ── Totais do período (compras x consumo estimado) ───────────────────────────
  const periodoTotais = useMemo(() => {
    const inicio = inicioPeriodo(periodo);
    let comprado = 0;
    let consumido = 0;
    for (const mv of movs) {
      const d = parseData(mv.dataMovimentacao);
      if (inicio && (!d || d < inicio)) continue;
      const qtd = Math.abs(numVal(mv.quantidade));
      const valorMov = numVal(mv.valor) || qtd * (valorUnitMap.get(mv.estoqueId) ?? 0);
      if (isSaida(mv)) consumido += valorMov;
      else comprado += valorMov;
    }
    return { comprado, consumido };
  }, [movs, valorUnitMap, periodo]);

  // ── Inteligência: última movimentação e consumo diário por produto ───────────
  const porProduto = useMemo(() => {
    const ultimaMov = new Map<number, Date>();
    const saida90 = new Map<number, number>();
    const limite90 = inicioPeriodo("90d");
    for (const mv of movs) {
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

  // ── Central de Alertas de Insumos ────────────────────────────────────────────
  const alertas = useMemo(() => {
    // Abaixo do mínimo
    const baixo = estoque.abaixoMin.map(p => ({
      texto: p.nome,
      detalhe: `${num(p.quantidade)}/${num(p.quantidadeMinima)} ${p.unidade ?? ""}`.trim(),
    }));

    // Cobertura crítica: vai acabar em ≤15 dias pelo ritmo de consumo (90d)
    const cobertura: { texto: string; detalhe: string; dias: number }[] = [];
    for (const p of estoque.ativos) {
      const qAtual = numVal(p.quantidade);
      if (qAtual <= 0) continue;
      const consumo90 = porProduto.saida90.get(p.id) ?? 0;
      if (consumo90 <= 0) continue;
      const consumoDiario = consumo90 / 90;
      const dias = Math.floor(qAtual / consumoDiario);
      if (dias <= COBERTURA_CRITICA_DIAS) {
        cobertura.push({ texto: p.nome, detalhe: dias <= 0 ? "esgotado" : `~${dias} dias`, dias });
      }
    }
    cobertura.sort((a, b) => a.dias - b.dias);

    // Validade próxima/vencida (≤30 dias)
    const vistos = new Set<string>();
    const validade: { texto: string; detalhe: string; dias: number }[] = [];
    for (const mv of movs) {
      const dias = diasAte(mv.dataValidade);
      if (dias == null || dias > 30) continue;
      const chave = `${mv.nome}|${mv.dataValidade}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      validade.push({ texto: mv.nome ?? "Produto", detalhe: prazoRelativo(mv.dataValidade), dias });
    }
    validade.sort((a, b) => a.dias - b.dias);

    // Produtos parados: com saldo e sem movimentação há ≥90 dias (capital empatado)
    const parados = estoque.ativos
      .filter(p => numVal(p.quantidade) > 0)
      .map(p => {
        const ult = porProduto.ultimaMov.get(p.id);
        const dias = ult ? diasAte(ult) : null;
        return { p, dias: dias == null ? Infinity : -dias };
      })
      .filter(x => x.dias >= PARADO_DIAS)
      .sort((a, b) => b.dias - a.dias)
      .map(({ p, dias }) => ({
        texto: p.nome,
        detalhe: Number.isFinite(dias) ? `parado ${dias}d` : "sem registro",
      }));

    // Acima do máximo (excesso de compra)
    const excesso = estoque.acimaMax.map(p => ({
      texto: p.nome,
      detalhe: `${num(p.quantidade)} / máx ${num(p.quantidadeMaxima)}`,
    }));

    const total = baixo.length + cobertura.length + validade.length + parados.length + excesso.length;
    const temVencido = validade.some(v => v.dias < 0);

    return { baixo, cobertura, validade, parados, excesso, total, temVencido };
  }, [estoque, porProduto, movs]);

  // ── Gasto por fornecedor (entradas no período) ───────────────────────────────
  const fornecedores = useMemo(() => {
    const inicio = inicioPeriodo(periodo);
    const map = new Map<string, number>();
    for (const mv of movs) {
      if (isSaida(mv)) continue;
      const d = parseData(mv.dataMovimentacao);
      if (inicio && (!d || d < inicio)) continue;
      const nome = mv.fornecedor?.trim();
      if (!nome) continue;
      const qtd = Math.abs(numVal(mv.quantidade));
      const valorMov = numVal(mv.valor) || qtd * (valorUnitMap.get(mv.estoqueId) ?? 0);
      map.set(nome, (map.get(nome) ?? 0) + valorMov);
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter(f => f.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [movs, valorUnitMap, periodo]);

  const temProdutos = produtos.length > 0;

  return (
    <div className="space-y-5 mb-5">
      {/* ── Cabeçalho ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
            Visão Geral de Insumos
          </h1>
          <p className="text-[12px] text-gray-500">Inteligência de estoque, consumo e validade</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {PERIODOS.map(p => (
            <button
              key={p.chave}
              type="button"
              onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                periodo === p.chave ? "text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
              style={periodo === p.chave ? { backgroundColor: TEAL } : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <KpiCard
          label="Valor em estoque"
          value={brlCompact(estoque.valorTotal)}
          icon="savings"
          color={GOLD}
          sub={<span>capital imobilizado</span>}
        />
        <KpiCard
          label="Produtos ativos"
          value={num(estoque.ativos.length)}
          icon="inventory_2"
          color={TEAL}
          sub={<span>{num(estoque.totalCategorias)} categorias</span>}
        />
        <KpiCard
          label="Abaixo do mínimo"
          value={num(estoque.abaixoMin.length)}
          icon="production_quantity_limits"
          color={estoque.abaixoMin.length > 0 ? RED : GREEN}
          sub={<span>repor estoque</span>}
        />
        <KpiCard
          label="Vencendo (30d)"
          value={num(alertas.validade.length)}
          icon="event_busy"
          color={alertas.temVencido ? RED : alertas.validade.length > 0 ? GOLD : GREEN}
          sub={<span>{alertas.temVencido ? "há itens vencidos" : "validade próxima"}</span>}
        />
        <KpiCard
          label="Comprado período"
          value={brlCompact(periodoTotais.comprado)}
          icon="shopping_cart"
          color={NAVY}
          sub={<span>entradas</span>}
        />
        <KpiCard
          label="Consumo período"
          value={brlCompact(periodoTotais.consumido)}
          icon="local_fire_department"
          color="#0891B2"
          sub={<span>saídas estimadas</span>}
        />
      </div>

      {/* ── Central de Alertas ── */}
      <SectionCard
        title="Alertas de Estoque"
        icon="notifications_active"
        action={
          <span
            className="text-[11px] font-bold rounded-full px-2.5 py-0.5 text-white"
            style={{ backgroundColor: alertas.total > 0 ? RED : GREEN }}
          >
            {alertas.total} {alertas.total === 1 ? "pendência" : "pendências"}
          </span>
        }
      >
        {alertas.total === 0 ? (
          <div className="p-8 text-center">
            <span className="material-icons text-3xl" style={{ color: GREEN }}>check_circle</span>
            <p className="text-[13px] text-gray-600 mt-2 font-medium">Estoque saudável!</p>
            <p className="text-[12px] text-gray-400">Sem rupturas, vencimentos ou excessos no momento.</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AlertGroup icon="production_quantity_limits" titulo="Abaixo do mínimo" severidade="critico" itens={alertas.baixo} onClick={() => setLocation("/insumos/lista-produtos")} />
            <AlertGroup icon="hourglass_bottom" titulo="Vai acabar (≤15 dias)" severidade="critico" itens={alertas.cobertura} onClick={() => setLocation("/insumos/lista-produtos")} />
            <AlertGroup icon="event_busy" titulo="Validade próxima" severidade={alertas.temVencido ? "critico" : "alerta"} itens={alertas.validade} onClick={() => setLocation("/insumos/movimentacao")} />
            <AlertGroup icon="hourglass_empty" titulo="Parados (90+ dias)" severidade="info" itens={alertas.parados} onClick={() => setLocation("/insumos/lista-produtos")} />
            <AlertGroup icon="inventory" titulo="Acima do máximo" severidade="alerta" itens={alertas.excesso} onClick={() => setLocation("/insumos/lista-produtos")} />
          </div>
        )}
      </SectionCard>

      {/* ── Valor por categoria + Fluxo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Valor por Categoria" icon="donut_large">
          <div className="p-4">
            {estoque.porCategoria.length === 0 ? (
              <EmptyState icon="inventory_2" text="Sem produtos com valor" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={estoque.porCategoria} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {estoque.porCategoria.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [brl(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {estoque.porCategoria.slice(0, 6).map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 text-gray-600 truncate">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="font-semibold text-gray-800 tabular-nums">{brlCompact(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Entradas × Saídas (6 meses)" icon="bar_chart" className="lg:col-span-2">
          <div className="p-4">
            {movs.length === 0 ? (
              <EmptyState icon="show_chart" text="Sem movimentações registradas" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={fluxo} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => brlCompact(v).replace("R$ ", "")} />
                  <Tooltip formatter={(v: number, n: string) => [brl(v), n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="entrada" name="Entradas" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="saida" name="Saídas" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Top produtos por valor + Fornecedores ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Maior Capital Imobilizado" icon="leaderboard">
          {estoque.topProdutos.length === 0 ? (
            <EmptyState icon="inventory_2" text="Sem produtos com valor" />
          ) : (
            <div className="p-4 space-y-3">
              {estoque.topProdutos.map((p, i) => {
                const max = estoque.topProdutos[0].valor || 1;
                const pct = Math.round((p.valor / max) * 100);
                return (
                  <div key={p.nome}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-medium text-gray-700 truncate">{p.nome}</span>
                      <span className="text-gray-500 tabular-nums whitespace-nowrap">{brl(p.valor)}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Gasto por Fornecedor (período)" icon="local_shipping">
          {fornecedores.length === 0 ? (
            <EmptyState icon="local_shipping" text="Sem compras com fornecedor no período" />
          ) : (
            <div className="p-4 space-y-3">
              {fornecedores.map((f, i) => {
                const max = fornecedores[0].value || 1;
                const pct = Math.round((f.value / max) * 100);
                return (
                  <div key={f.name}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-medium text-gray-700 truncate">{f.name}</span>
                      <span className="text-gray-500 tabular-nums whitespace-nowrap">{brl(f.value)}</span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: NAVY }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {!temProdutos && (
        <div className="text-center text-[12px] text-gray-400">
          Cadastre produtos e registre movimentações — os indicadores e alertas se preenchem automaticamente.
        </div>
      )}
    </div>
  );
}
