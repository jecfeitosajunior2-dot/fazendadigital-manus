import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
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
  dataBr,
  prazoRelativo,
  inicioPeriodo,
  parseData,
  ultimosMeses,
  mesChave,
  idadeAnos,
  faixaEtaria,
  PERIODOS,
  CHART_COLORS,
  type PeriodoChave,
} from "@/lib/dashboard-utils";

// ──────────────────────────────── Página ────────────────────────────────────

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [periodo, setPeriodo] = useState<PeriodoChave>("90d");

  // Queries (todas em paralelo)
  const { data: me } = trpc.auth.me.useQuery();
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: animais = [] } = trpc.animais.list.useQuery();
  const { data: movimentacoes = [] } = trpc.financeiro.listMovimentacoes.useQuery();
  const { data: contas = [] } = trpc.financeiro.listContas.useQuery();
  const { data: produtos = [] } = trpc.estoque.list.useQuery();
  const { data: movEstoque = [] } = trpc.estoque.listMovimentacoes.useQuery();
  const { data: saude = [] } = trpc.saude.list.useQuery();
  const { data: reproducao = [] } = trpc.reproducao.list.useQuery();
  const { data: manutencoes = [] } = trpc.manutencoes.list.useQuery();
  const { data: pastos = [] } = trpc.pastos.listWithDetails.useQuery();
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();

  // ── Rebanho ────────────────────────────────────────────────────────────────
  const rebanho = useMemo(() => {
    const ativos = animais.filter(a => a.status === "ativo");
    const machos = ativos.filter(a => a.sexo === "macho").length;
    const femeas = ativos.filter(a => a.sexo === "femea").length;
    const pesos = ativos.map(a => Number(a.pesoAtual)).filter(p => p > 0);
    const pesoTotal = pesos.reduce((s, p) => s + p, 0);
    const pesoMedio = pesos.length ? pesoTotal / pesos.length : 0;

    const porCategoria = new Map<string, number>();
    ativos.forEach(a => {
      const cat = a.categoria?.trim() || (a.sexo === "femea" ? "Fêmeas" : "Machos");
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + 1);
    });
    const composicao = [...porCategoria.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const faixas = new Map<string, number>();
    ["0–12 meses", "12–24 meses", "24–36 meses", "+36 meses", "Sem idade"].forEach(f => faixas.set(f, 0));
    ativos.forEach(a => {
      const f = faixaEtaria(idadeAnos(a.dataNascimento));
      faixas.set(f, (faixas.get(f) ?? 0) + 1);
    });
    const idades = [...faixas.entries()].map(([name, value]) => ({ name, value }));

    return { total: ativos.length, machos, femeas, pesoTotal, pesoMedio, composicao, idades };
  }, [animais]);

  // ── Financeiro: período + fluxo de caixa ─────────────────────────────────────
  const financeiro = useMemo(() => {
    const inicio = inicioPeriodo(periodo);
    const validas = movimentacoes.filter(m => m.status !== "cancelado");

    let receita = 0;
    let despesa = 0;
    for (const m of validas) {
      const d = parseData(m.data);
      if (inicio && (!d || d < inicio)) continue;
      const v = Number(m.valor) || 0;
      if (m.tipo === "receita") receita += v;
      else despesa += v;
    }

    const buckets = ultimosMeses(6);
    const idx = new Map(buckets.map((b, i) => [b.chave, i]));
    for (const m of validas) {
      const k = mesChave(m.data);
      if (k == null || !idx.has(k)) continue;
      const b = buckets[idx.get(k)!];
      const v = Number(m.valor) || 0;
      if (m.tipo === "receita") b.receita += v;
      else b.despesa += v;
    }
    buckets.forEach(b => { b.saldo = b.receita - b.despesa; });

    const saldoContas = contas
      .filter(c => c.ativa !== false)
      .reduce((s, c) => s + (Number(c.saldoAtual) || 0), 0);

    return { receita, despesa, resultado: receita - despesa, fluxo: buckets, saldoContas };
  }, [movimentacoes, contas, periodo]);

  // ── Estoque ──────────────────────────────────────────────────────────────────
  const estoque = useMemo(() => {
    const valorTotal = produtos.reduce(
      (s, p) => s + (Number(p.quantidade) || 0) * (Number(p.valorUnitario) || 0),
      0
    );
    const baixo = produtos.filter(
      p => p.monitorarEstoque && Number(p.quantidade) <= Number(p.quantidadeMinima)
    );
    return { valorTotal, baixo, totalProdutos: produtos.length };
  }, [produtos]);

  // ── Central de Alertas ───────────────────────────────────────────────────────
  const alertas = useMemo(() => {
    // Estoque baixo
    const estoqueBaixo = estoque.baixo.map(p => ({
      texto: p.nome,
      detalhe: `${num(p.quantidade, 0)}/${num(p.quantidadeMinima, 0)} ${p.unidade ?? ""}`.trim(),
    }));

    // Validade próxima (≤30 dias) ou vencida — dedupe por produto+validade
    const vistos = new Set<string>();
    const validade: { texto: string; detalhe: string; vencido?: boolean; dias: number }[] = [];
    for (const m of movEstoque) {
      const dias = diasAte(m.dataValidade);
      if (dias == null || dias > 30) continue;
      const chave = `${m.nome}|${m.dataValidade}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      validade.push({
        texto: m.nome ?? "Produto",
        detalhe: prazoRelativo(m.dataValidade),
        vencido: dias < 0,
        dias,
      });
    }
    validade.sort((a, b) => a.dias - b.dias);

    // Sanidade (próxima dose/retorno ≤30 dias)
    const sanidade = saude
      .map(s => ({ s, dias: diasAte(s.proximaData) }))
      .filter(x => x.dias != null && x.dias <= 30)
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
      .map(({ s }) => ({
        texto: `${s.tipo}${s.medicamento ? ` · ${s.medicamento}` : ""}`,
        detalhe: prazoRelativo(s.proximaData),
      }));

    // Partos previstos (prenhez sem parto real, ≤45 dias)
    const partos = reproducao
      .filter(r => !r.dataPartoReal && r.dataPrevistoParto)
      .map(r => ({ r, dias: diasAte(r.dataPrevistoParto) }))
      .filter(x => x.dias != null && x.dias <= 45 && x.dias >= -15)
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
      .map(({ r }) => ({
        texto: `Fêmea #${r.femeaId}`,
        detalhe: prazoRelativo(r.dataPrevistoParto),
      }));

    // Manutenções próximas (≤30 dias, não concluídas)
    const manut = manutencoes
      .filter(m => m.status !== "concluida" && m.proximaManutencao)
      .map(m => ({ m, dias: diasAte(m.proximaManutencao) }))
      .filter(x => x.dias != null && x.dias <= 30)
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
      .map(({ m }) => ({
        texto: m.tipo ?? "Manutenção",
        detalhe: prazoRelativo(m.proximaManutencao),
      }));

    // Contas/lançamentos pendentes
    const pendentes = movimentacoes
      .filter(m => m.status === "pendente")
      .map(m => ({
        texto: m.descricao ?? "Lançamento",
        detalhe: brl(m.valor),
      }));

    const total =
      estoqueBaixo.length + validade.length + sanidade.length + partos.length + manut.length + pendentes.length;

    return { estoqueBaixo, validade, sanidade, partos, manut, pendentes, total };
  }, [estoque.baixo, movEstoque, saude, reproducao, manutencoes, movimentacoes]);

  // ── Pastos (ocupação) ────────────────────────────────────────────────────────
  const ocupacao = useMemo(
    () =>
      [...pastos]
        .filter(p => (p.capacidade ?? 0) > 0 || (p.qtdAnimais ?? 0) > 0)
        .sort((a, b) => (b.pctOcupacao ?? 0) - (a.pctOcupacao ?? 0))
        .slice(0, 6),
    [pastos]
  );

  // ── Outros KPIs ────────────────────────────────────────────────────────────
  const areaTotal = useMemo(
    () => fazendas.reduce((s, f) => s + (Number(f.area) || 0), 0),
    [fazendas]
  );

  const ultimasMov = useMemo(
    () =>
      [...movimentacoes]
        .sort((a, b) => (parseData(b.data)?.getTime() ?? 0) - (parseData(a.data)?.getTime() ?? 0))
        .slice(0, 6),
    [movimentacoes]
  );

  const saudacao = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();
  const hojeBr = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const temAlgumDado =
    rebanho.total > 0 || movimentacoes.length > 0 || produtos.length > 0 || fazendas.length > 0;

  const periodoAtivo = PERIODOS.find(p => p.chave === periodo)?.label ?? "90 dias";
  const primeiroAlerta =
    alertas.estoqueBaixo[0] ??
    alertas.validade[0] ??
    alertas.sanidade[0] ??
    alertas.partos[0] ??
    alertas.manut[0] ??
    alertas.pendentes[0];
  const statusOperacao = alertas.total === 0
    ? { label: "Tudo em ordem", detalhe: "Nenhuma pendência crítica", color: GREEN, icon: "check_circle" }
    : alertas.estoqueBaixo.length > 0
      ? { label: "Atenção no estoque", detalhe: `${alertas.estoqueBaixo.length} item(ns) abaixo do mínimo`, color: RED, icon: "warning" }
      : { label: "Pendências abertas", detalhe: `${alertas.total} ponto(s) pedindo revisão`, color: GOLD, icon: "priority_high" };
  const resumoOperacao = [
    { label: "Status", value: statusOperacao.label, detail: statusOperacao.detalhe, icon: statusOperacao.icon, color: statusOperacao.color },
    { label: "Próxima ação", value: primeiroAlerta?.texto ?? "Sem ação imediata", detail: primeiroAlerta?.detalhe ?? "Operação sem alerta prioritário", icon: "task_alt", color: primeiroAlerta ? RED : GREEN },
    { label: "Período", value: periodoAtivo, detail: "Filtro aplicado ao financeiro", icon: "date_range", color: TEAL },
    { label: "Base", value: `${num(fazendas.length)} fazenda${fazendas.length === 1 ? "" : "s"}`, detail: `${num(stats?.totalLotes ?? 0)} lotes · ${num(pastos.length)} pastos`, icon: "map", color: NAVY },
  ];

  return (
    <AppLayout>
      {/* ── Cabeçalho ── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#D7F4F1] bg-gradient-to-br from-[#0F3F46] via-[#12606A] to-[#0F766E] shadow-[0_22px_50px_rgba(15,79,89,0.22)] mb-5">
        <div className="absolute -right-14 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-64 rounded-full bg-[#1BC5BD]/20 blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] text-teal-100/85">{hojeBr.charAt(0).toUpperCase() + hojeBr.slice(1)}</p>
              <h1 className="text-[26px] sm:text-[30px] font-bold text-white leading-tight mt-1">
                {saudacao}{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
              </h1>
              <p className="text-[13px] text-teal-50/80 mt-1">
                Painel de controle da sua operação{fazendas.length === 1 ? ` · ${fazendas[0].nome}` : fazendas.length > 1 ? ` · ${fazendas.length} fazendas` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-white/12 border border-white/15 rounded-xl p-1 backdrop-blur-sm">
              {PERIODOS.map(p => (
                <button
                  key={p.chave}
                  type="button"
                  onClick={() => setPeriodo(p.chave)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    periodo === p.chave ? "bg-white text-[#0F3F46] shadow-sm" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-5">
            {resumoOperacao.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === "Próxima ação") setLocation(primeiroAlerta ? "/insumos/visao-geral" : "/admin/overview");
                  if (item.label === "Base") setLocation("/fazendas/visao-geral");
                }}
                className="text-left rounded-2xl border border-white/15 bg-white/12 p-3 backdrop-blur-sm hover:bg-white/18 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="material-icons rounded-xl p-2 text-[20px] bg-white/90" style={{ color: item.color }}>{item.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-teal-50/70">{item.label}</p>
                    <p className="text-[14px] font-bold text-white truncate">{item.value}</p>
                    <p className="text-[11px] text-teal-50/70 truncate">{item.detail}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Resumo executivo</p>
          <h2 className="text-[16px] font-bold text-gray-800">Indicadores principais</h2>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4 mb-5">
        <KpiCard
          label="Rebanho ativo"
          value={num(rebanho.total)}
          icon="pets"
          color={TEAL}
          sub={<span>{num(rebanho.machos)} machos · {num(rebanho.femeas)} fêmeas</span>}
          onClick={() => setLocation("/rebanho/visao-geral")}
        />
        <KpiCard
          label="Peso médio"
          value={`${num(rebanho.pesoMedio, 0)} kg`}
          icon="monitor_weight"
          color={NAVY}
          sub={<span>{num(rebanho.pesoTotal / 1000, 1)} t no rebanho</span>}
          onClick={() => setLocation("/rebanho/visao-geral")}
        />
        <KpiCard
          label="Saldo em contas"
          value={brlCompact(financeiro.saldoContas)}
          icon="account_balance"
          color={financeiro.saldoContas >= 0 ? GREEN : RED}
          sub={<span>{contas.length} {contas.length === 1 ? "conta" : "contas"}</span>}
          onClick={() => setLocation("/financeiro/contas")}
        />
        <KpiCard
          label="Resultado período"
          value={brlCompact(financeiro.resultado)}
          icon={financeiro.resultado >= 0 ? "trending_up" : "trending_down"}
          color={financeiro.resultado >= 0 ? GREEN : RED}
          sub={<span className="text-green-600">{brlCompact(financeiro.receita)}</span>}
          onClick={() => setLocation("/financeiro/visao-geral")}
        />
        <KpiCard
          label="Valor em estoque"
          value={brlCompact(estoque.valorTotal)}
          icon="inventory_2"
          color={GOLD}
          sub={<span>{num(estoque.totalProdutos)} produtos</span>}
          onClick={() => setLocation("/insumos/visao-geral")}
        />
        <KpiCard
          label="Área total"
          value={`${num(areaTotal, 0)} ha`}
          icon="map"
          color="#0891B2"
          sub={<span>{num(stats?.totalLotes ?? 0)} lotes · {num(pastos.length)} pastos</span>}
          onClick={() => setLocation("/fazendas/visao-geral")}
        />
      </div>

      {/* ── Central de Alertas ── */}
      <SectionCard
        title="Central de Alertas"
        icon="notifications_active"
        className="mb-5"
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
            <p className="text-[13px] text-gray-600 mt-2 font-medium">Tudo em ordem!</p>
            <p className="text-[12px] text-gray-400">Nenhuma pendência crítica no momento.</p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AlertGroup
              icon="warning"
              titulo="Estoque baixo"
              severidade="critico"
              itens={alertas.estoqueBaixo}
              onClick={() => setLocation("/insumos/visao-geral")}
            />
            <AlertGroup
              icon="event_busy"
              titulo="Validade próxima"
              severidade={alertas.validade.some(v => v.vencido) ? "critico" : "alerta"}
              itens={alertas.validade}
              onClick={() => setLocation("/insumos/movimentacao")}
            />
            <AlertGroup
              icon="vaccines"
              titulo="Sanidade / retornos"
              severidade="alerta"
              itens={alertas.sanidade}
              onClick={() => setLocation("/rebanho/visao-geral")}
            />
            <AlertGroup
              icon="pregnant_woman"
              titulo="Partos previstos"
              severidade="info"
              itens={alertas.partos}
              onClick={() => setLocation("/reproducao/visao-geral")}
            />
            <AlertGroup
              icon="build"
              titulo="Manutenções"
              severidade="alerta"
              itens={alertas.manut}
              onClick={() => setLocation("/maquinas/manutencao")}
            />
            <AlertGroup
              icon="schedule"
              titulo="Lançamentos pendentes"
              severidade="info"
              itens={alertas.pendentes}
              onClick={() => setLocation("/financeiro/movimentacao")}
            />
          </div>
        )}
      </SectionCard>

      {/* ── Fluxo de caixa + Composição do rebanho ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <SectionCard title="Fluxo de Caixa (6 meses)" icon="bar_chart" className="lg:col-span-2">
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
              <div className="rounded-lg p-3 flex flex-row sm:flex-col items-center sm:items-start justify-between" style={{ backgroundColor: "#F0FDF4" }}>
                <p className="text-[11px] sm:text-[10px] uppercase tracking-wide text-green-700">Receitas</p>
                <p className="text-[16px] sm:text-[15px] font-bold text-green-600">{brl(financeiro.receita)}</p>
              </div>
              <div className="rounded-lg p-3 flex flex-row sm:flex-col items-center sm:items-start justify-between" style={{ backgroundColor: "#FEF2F2" }}>
                <p className="text-[11px] sm:text-[10px] uppercase tracking-wide text-red-700">Despesas</p>
                <p className="text-[16px] sm:text-[15px] font-bold text-red-600">{brl(financeiro.despesa)}</p>
              </div>
              <div className="rounded-lg p-3 flex flex-row sm:flex-col items-center sm:items-start justify-between" style={{ backgroundColor: "#F0FDFA" }}>
                <p className="text-[11px] sm:text-[10px] uppercase tracking-wide" style={{ color: NAVY }}>Resultado</p>
                <p className="text-[16px] sm:text-[15px] font-bold" style={{ color: financeiro.resultado >= 0 ? GREEN : RED }}>
                  {brl(financeiro.resultado)}
                </p>
              </div>
            </div>
            {movimentacoes.length === 0 ? (
              <EmptyState icon="show_chart" text="Sem lançamentos financeiros ainda" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={financeiro.fluxo} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => brlCompact(v).replace("R$ ", "")}
                  />
                  <Tooltip
                    formatter={(v: number, n: string) => [brl(v), n]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="receita" name="Receita" fill={GREEN} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="despesa" name="Despesa" fill={RED} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line dataKey="saldo" name="Saldo" stroke={NAVY} strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Composição do Rebanho" icon="donut_large">
          <div className="p-4">
            {rebanho.composicao.length === 0 ? (
              <EmptyState icon="pets" text="Sem animais cadastrados" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={rebanho.composicao}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {rebanho.composicao.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number, n: string) => [`${num(v)} animais`, n]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {rebanho.composicao.slice(0, 6).map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-2 text-gray-600 truncate">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="font-semibold text-gray-800 tabular-nums">{num(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Ocupação de pastos + Faixa etária ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <SectionCard title="Ocupação de Pastos" icon="grass" className="lg:col-span-2">
          {ocupacao.length === 0 ? (
            <EmptyState icon="grass" text="Sem pastos cadastrados" />
          ) : (
            <div className="p-4 space-y-3">
              {ocupacao.map(p => {
                const pct = p.pctOcupacao ?? 0;
                const cor = pct >= 95 ? RED : pct >= 75 ? GOLD : TEAL;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="font-medium text-gray-700 truncate">{p.nome}</span>
                      <span className="text-gray-500 tabular-nums whitespace-nowrap">
                        {num(p.qtdAnimais)}{p.capacidade ? `/${num(p.capacidade)}` : ""} cab.
                        {p.pctOcupacao != null && <span className="ml-1 font-semibold" style={{ color: cor }}>{pct}%</span>}
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: cor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Faixa Etária" icon="cake">
          <div className="p-4">
            {rebanho.total === 0 ? (
              <EmptyState icon="cake" text="Sem animais cadastrados" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  layout="vertical"
                  data={rebanho.idades}
                  margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={78} />
                  <Tooltip
                    formatter={(v: number) => [`${num(v)} animais`, "Total"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                  <Bar dataKey="value" fill={TEAL} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ── Atividade recente ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Últimas Movimentações"
          icon="receipt_long"
          action={
            <button type="button" onClick={() => setLocation("/financeiro/movimentacao")} className="text-[11px] font-medium hover:underline" style={{ color: TEAL }}>
              Ver tudo
            </button>
          }
        >
          {ultimasMov.length === 0 ? (
            <EmptyState icon="account_balance_wallet" text="Sem movimentações" />
          ) : (
            <div className="divide-y divide-gray-50">
              {ultimasMov.map(m => (
                <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-gray-700 truncate">{m.descricao}</p>
                    <p className="text-[10px] text-gray-400">{dataBr(m.data)}</p>
                  </div>
                  <span className={`text-[12px] font-bold whitespace-nowrap ${m.tipo === "receita" ? "text-green-600" : "text-red-600"}`}>
                    {m.tipo === "receita" ? "+" : "−"} {brl(m.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Saúde Recente"
          icon="health_and_safety"
          action={
            <button type="button" onClick={() => setLocation("/rebanho/visao-geral")} className="text-[11px] font-medium hover:underline" style={{ color: TEAL }}>
              Ver tudo
            </button>
          }
        >
          {saude.length === 0 ? (
            <EmptyState icon="health_and_safety" text="Sem registros" />
          ) : (
            <div className="divide-y divide-gray-50">
              {[...saude].slice(0, 6).map(s => (
                <div key={s.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between mb-0.5 gap-2">
                    <span className="text-[11px] font-medium text-gray-700 truncate">Animal #{s.animalId}</span>
                    <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] capitalize whitespace-nowrap">{s.tipo}</span>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    {dataBr(s.dataRegistro)}{s.medicamento ? ` · ${s.medicamento}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Saldo por Conta"
          icon="savings"
          action={
            <button type="button" onClick={() => setLocation("/financeiro/contas")} className="text-[11px] font-medium hover:underline" style={{ color: TEAL }}>
              Ver tudo
            </button>
          }
        >
          {contas.length === 0 ? (
            <EmptyState icon="account_balance" text="Nenhuma conta cadastrada" />
          ) : (
            <div className="divide-y divide-gray-50">
              {contas.slice(0, 6).map(c => (
                <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-gray-700 truncate">{c.nome}</p>
                    <p className="text-[10px] text-gray-400 truncate">{c.banco || c.tipo || "Conta"}</p>
                  </div>
                  <span className={`text-[12px] font-bold whitespace-nowrap ${Number(c.saldoAtual) >= 0 ? "text-gray-800" : "text-red-600"}`}>
                    {brl(c.saldoAtual)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {!temAlgumDado && (
        <div className="mt-5 text-center text-[12px] text-gray-400">
          Comece cadastrando sua fazenda, rebanho e lançamentos — o painel se preenche automaticamente.
        </div>
      )}
    </AppLayout>
  );
}
