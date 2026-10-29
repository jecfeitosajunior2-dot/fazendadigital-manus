import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { trpc } from "@/lib/trpc";
import { FINANCEIRO_CAIXA_OFICIAL_PATH, FINANCEIRO_VISAO_GERAL_PATH } from "@/lib/financeiroNavegacao";
import { formatarValorRelatorioV2 } from "@/lib/financeiroRelatoriosExport";
import {
  COMPRA_VENDA_COMPRAS_PATH,
  COMPRA_VENDA_VENDAS_PATH,
  compraVendaCompraDetalhePath,
  compraVendaVendaDetalhePath,
} from "@/lib/compraVendaCompradores";
import { getFichaAnimalPath } from "@/lib/fichaAnimalRoute";
import { usePersistedState } from "@/hooks/usePersistedState";
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
  brlCompact,
  num,
  dataBr,
  CHART_COLORS,
} from "@/lib/dashboard-utils";
import {
  MSG_PAINEL_FAZENDA_NEGADA,
  PAINEL_STORAGE_KEY,
  emptyPainelOverview,
  estadoBlocoPainel,
  normalizarFazendaPainelPersistida,
  statusOperacaoPainel,
} from "@shared/painelControle";

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [filtro, setFiltro] = usePersistedState<{ fazendaId: string }>(PAINEL_STORAGE_KEY, {
    fazendaId: "",
  });

  const { data: me } = trpc.auth.me.useQuery();
  const fazendaIdInput = useMemo(() => {
    const id = Number(filtro.fazendaId);
    return Number.isFinite(id) && id > 0 ? id : undefined;
  }, [filtro.fazendaId]);

  const overviewQuery = trpc.dashboard.overview.useQuery(
    { fazendaId: fazendaIdInput },
    { retry: false },
  );

  useEffect(() => {
    const codigo = overviewQuery.error?.data?.code;
    const mensagem = overviewQuery.error?.message ?? "";
    if (codigo === "FORBIDDEN" || mensagem.includes(MSG_PAINEL_FAZENDA_NEGADA)) {
      setFiltro({ fazendaId: "" });
    }
  }, [overviewQuery.error, setFiltro]);

  useEffect(() => {
    if (!overviewQuery.data) return;
    const valida = normalizarFazendaPainelPersistida(filtro.fazendaId, overviewQuery.data.fazendas);
    if (filtro.fazendaId && valida == null) setFiltro({ fazendaId: "" });
  }, [overviewQuery.data, filtro.fazendaId, setFiltro]);

  const carregando = overviewQuery.isLoading || overviewQuery.isFetching;
  const comErro = overviewQuery.isError
    && overviewQuery.error?.data?.code !== "FORBIDDEN"
    && !(overviewQuery.error?.message ?? "").includes(MSG_PAINEL_FAZENDA_NEGADA);
  const painel = overviewQuery.data ?? emptyPainelOverview();
  const fazendas = painel.fazendas;
  const estadoIndicadores = estadoBlocoPainel(carregando, comErro, overviewQuery.data != null);
  const estadoAlertas = estadoBlocoPainel(carregando, comErro, overviewQuery.data != null);

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

  const fazendaNome = fazendaIdInput
    ? fazendas.find(f => f.id === fazendaIdInput)?.nome
    : fazendas.length === 1
      ? fazendas[0].nome
      : fazendas.length > 1
        ? "Todas as fazendas"
        : "";

  const primeiroAlerta =
    painel.alertas.estoqueBaixo[0] ??
    painel.alertas.validade[0] ??
    painel.alertas.sanidade[0] ??
    painel.alertas.partos[0] ??
    painel.alertas.manut[0] ??
    painel.alertas.pendentes[0];

  const statusOperacao = statusOperacaoPainel(estadoAlertas, painel.alertas);
  const statusColor =
    statusOperacao.tom === "ok" ? GREEN
      : statusOperacao.tom === "critico" ? RED
        : statusOperacao.tom === "alerta" ? GOLD
          : TEAL;

  const resumoOperacao = [
    {
      label: "Status",
      value: statusOperacao.label,
      detail: statusOperacao.detalhe,
      icon: statusOperacao.tom === "ok" ? "check_circle" : statusOperacao.tom === "critico" ? "warning" : "priority_high",
      color: statusColor,
    },
    {
      label: "Próxima ação",
      value: estadoAlertas === "carregando"
        ? "Carregando…"
        : estadoAlertas === "erro"
          ? "Indisponível"
          : primeiroAlerta?.texto ?? "Sem ação imediata",
      detail: estadoAlertas === "carregando"
        ? "Aguardando alertas"
        : estadoAlertas === "erro"
          ? "Tente novamente"
          : primeiroAlerta?.detalhe ?? "Operação sem alerta prioritário",
      icon: "task_alt",
      color: primeiroAlerta && estadoAlertas === "pronto" ? RED : GREEN,
    },
    {
      label: "Fazenda",
      value: fazendaNome || (carregando ? "Carregando…" : "Sem fazenda"),
      detail: fazendaIdInput ? "Filtro aplicado no servidor" : "Consolidado das fazendas autorizadas",
      icon: "agriculture",
      color: TEAL,
    },
    {
      label: "Base",
      value: carregando ? "Carregando…" : `${num(fazendas.length)} fazenda${fazendas.length === 1 ? "" : "s"}`,
      detail: carregando
        ? "Consultando lotes e pastos"
        : `${num(painel.totalLotes)} lotes · ${num(painel.totalPastos)} pastos`,
      icon: "map",
      color: NAVY,
    },
  ];

  const temAlgumDado =
    estadoIndicadores === "pronto" &&
    (painel.rebanho.total > 0 || painel.estoque.totalProdutos > 0 || fazendas.length > 0);

  return (
    <AppLayout>
      <div className="relative overflow-hidden rounded-3xl border border-[#D7F4F1] bg-gradient-to-br from-[#0F3F46] via-[#12606A] to-[#0F766E] shadow-[0_22px_50px_rgba(15,79,89,0.22)] mb-5">
        <div className="absolute -right-14 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute bottom-0 left-1/3 h-24 w-64 rounded-full bg-[#1BC5BD]/20 blur-3xl" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 sm:flex-1">
              <p className="text-[12px] text-teal-100/85 break-words">{hojeBr.charAt(0).toUpperCase() + hojeBr.slice(1)}</p>
              <h1 className="text-[26px] sm:text-[30px] font-bold text-white leading-tight mt-1 break-words">
                {saudacao}{me?.name ? `, ${me.name.split(" ")[0]}` : ""}
              </h1>
              <p className="text-[13px] text-teal-50/80 mt-1 break-words">
                Painel de controle da sua operação{fazendaNome ? ` · ${fazendaNome}` : ""}
              </p>
            </div>
            <div className="w-full min-w-0 max-w-full rounded-xl bg-white p-1 sm:w-auto sm:max-w-sm sm:min-w-[220px] sm:shrink-0">
              <FazendaOverviewSelect
                value={filtro.fazendaId}
                onChange={value => setFiltro({ fazendaId: value })}
                fazendas={fazendas}
                emptyLabel="Todas as fazendas"
                disabled={carregando && fazendas.length === 0}
                className="w-full min-w-0 max-w-full sm:min-w-[200px]"
              />
            </div>
          </div>

          <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {resumoOperacao.map(item => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === "Próxima ação") setLocation(primeiroAlerta ? "/insumos/visao-geral" : "/admin/overview");
                  if (item.label === "Base") setLocation("/fazendas/visao-geral");
                }}
                className="min-w-0 text-left rounded-2xl border border-white/15 bg-white/12 p-3 backdrop-blur-sm hover:bg-white/18 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="material-icons shrink-0 rounded-xl bg-white/90 p-2 text-[20px]" style={{ color: item.color }}>{item.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-teal-50/70">{item.label}</p>
                    <p className="break-words text-[14px] font-bold leading-snug text-white line-clamp-2">{item.value}</p>
                    <p className="break-words text-[11px] leading-snug text-teal-50/70 line-clamp-2">{item.detail}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {comErro ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          Não foi possível carregar o Painel de Controle. Os números abaixo não estão confirmados.
        </div>
      ) : null}

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Resumo executivo</p>
          <h2 className="text-[16px] font-bold text-gray-800">Indicadores principais</h2>
        </div>
      </div>

      <div className="mb-5 grid min-w-0 grid-cols-1 items-stretch gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          wrapText
          label="Rebanho ativo"
          value={num(painel.rebanho.total)}
          loading={carregando}
          icon="pets"
          color={TEAL}
          sub={carregando ? <span>Carregando…</span> : <span>{num(painel.rebanho.machos)} machos · {num(painel.rebanho.femeas)} fêmeas</span>}
          onClick={() => setLocation("/rebanho/visao-geral")}
        />
        <KpiCard
          wrapText
          label="Peso médio"
          value={`${num(painel.rebanho.pesoMedio, 0)} kg`}
          loading={carregando}
          icon="monitor_weight"
          color={NAVY}
          sub={carregando ? <span>Carregando…</span> : <span>{num(painel.rebanho.pesoTotal / 1000, 1)} t no rebanho</span>}
          onClick={() => setLocation("/rebanho/visao-geral")}
        />
        <KpiCard
          wrapText
          label="Caixa e Bancos"
          value={painel.financeiro.disponivel ? formatarValorRelatorioV2(painel.financeiro.saldoCaixaBancos) : "—"}
          loading={carregando}
          icon="account_balance"
          color={GREEN}
          sub={<span>{carregando ? "Carregando…" : painel.financeiro.disponivel ? painel.financeiro.avisoCaixa : "Financeiro oficial indisponível"}</span>}
          onClick={() => setLocation(FINANCEIRO_CAIXA_OFICIAL_PATH)}
        />
        <KpiCard
          wrapText
          label="Total a receber"
          value={painel.financeiro.disponivel ? formatarValorRelatorioV2(painel.financeiro.totalAReceber) : "—"}
          loading={carregando}
          icon="south_west"
          color={TEAL}
          sub={<span>{carregando ? "Carregando…" : painel.financeiro.disponivel ? [painel.financeiro.titulosFiltradosPorFazenda ? "Títulos desta fazenda" : "Títulos autorizados", painel.financeiro.avisoTitulos].filter(Boolean).join(" · ") : "Financeiro oficial indisponível"}</span>}
          onClick={() => setLocation("/financeiro/contas-a-receber")}
        />
        <KpiCard
          wrapText
          label="Total a pagar"
          value={painel.financeiro.disponivel ? formatarValorRelatorioV2(painel.financeiro.totalAPagar) : "—"}
          loading={carregando}
          icon="north_east"
          color={RED}
          sub={<span>{carregando ? "Carregando…" : painel.financeiro.disponivel ? [painel.financeiro.titulosFiltradosPorFazenda ? "Títulos desta fazenda" : "Títulos autorizados", painel.financeiro.avisoTitulos].filter(Boolean).join(" · ") : "Financeiro oficial indisponível"}</span>}
          onClick={() => setLocation("/financeiro/contas-a-pagar")}
        />
        <KpiCard
          wrapText
          label={painel.financeiro.rotuloResultado}
          value={painel.financeiro.disponivel ? formatarValorRelatorioV2(painel.financeiro.resultadoRealizado) : "—"}
          loading={carregando}
          icon="trending_up"
          color={painel.financeiro.resultadoRealizado < 0 ? RED : TEAL}
          sub={<span>{carregando ? "Carregando…" : painel.financeiro.disponivel ? [painel.financeiro.avisoResultado, painel.financeiro.avisoSemAtribuicao].filter(Boolean).join(" ") : "Financeiro oficial indisponível"}</span>}
          onClick={() => setLocation("/financeiro/relatorios")}
        />
        <KpiCard
          wrapText
          label="Valor em estoque"
          value={brlCompact(painel.estoque.valorTotal)}
          loading={carregando}
          icon="inventory_2"
          color={GOLD}
          sub={carregando ? <span>Carregando…</span> : <span>{num(painel.estoque.totalProdutos)} produtos</span>}
          onClick={() => setLocation("/insumos/visao-geral")}
        />
        <KpiCard
          wrapText
          label="Área total"
          value={`${num(painel.areaTotal, 0)} ha`}
          loading={carregando}
          icon="map"
          color="#0891B2"
          sub={carregando ? <span>Carregando…</span> : <span>{num(painel.totalLotes)} lotes · {num(painel.totalPastos)} pastos</span>}
          onClick={() => setLocation("/fazendas/visao-geral")}
        />
      </div>

      <SectionCard
        title="Central de Alertas"
        icon="notifications_active"
        className="mb-5"
        action={
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
            style={{ backgroundColor: estadoAlertas === "pronto" && painel.alertas.total > 0 ? RED : GREEN }}
          >
            {carregando ? "…" : `${painel.alertas.total} ${painel.alertas.total === 1 ? "pendência" : "pendências"}`}
          </span>
        }
      >
        {estadoAlertas === "carregando" ? (
          <div className="p-8 text-center">
            <span className="material-icons text-3xl text-gray-300 animate-pulse">hourglass_empty</span>
            <p className="text-[13px] text-gray-600 mt-2 font-medium">Carregando alertas…</p>
            <p className="text-[12px] text-gray-400">Aguarde a consulta terminar para ver o status.</p>
          </div>
        ) : estadoAlertas === "erro" ? (
          <div className="p-8 text-center">
            <span className="material-icons text-3xl text-red-400">error_outline</span>
            <p className="text-[13px] text-gray-600 mt-2 font-medium">Não foi possível carregar os alertas.</p>
            <p className="text-[12px] text-gray-400">Isso não significa que está tudo em ordem.</p>
          </div>
        ) : painel.alertas.total === 0 ? (
          <div className="p-8 text-center">
            <span className="material-icons text-3xl" style={{ color: GREEN }}>check_circle</span>
            <p className="text-[13px] text-gray-600 mt-2 font-medium">Tudo em ordem!</p>
            <p className="text-[12px] text-gray-400">Nenhuma pendência crítica no momento.</p>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            <AlertGroup
              icon="warning"
              titulo="Estoque baixo"
              severidade="critico"
              itens={painel.alertas.estoqueBaixo}
              onClick={() => setLocation("/insumos/visao-geral")}
            />
            <AlertGroup
              icon="event_busy"
              titulo="Validade próxima"
              severidade={painel.alertas.validade.some(v => v.vencido) ? "critico" : "alerta"}
              itens={painel.alertas.validade}
              onClick={() => setLocation("/insumos/movimentacao")}
            />
            <AlertGroup
              icon="vaccines"
              titulo="Sanidade / retornos"
              severidade="alerta"
              itens={painel.alertas.sanidade}
              onClick={() => setLocation("/rebanho/visao-geral")}
            />
            <AlertGroup
              icon="pregnant_woman"
              titulo="Partos previstos"
              severidade="info"
              itens={painel.alertas.partos}
              onItemClick={(item) => {
                if (item.animalId == null || item.animalId <= 0) return;
                setLocation(getFichaAnimalPath(item.animalId, "reproducao"));
              }}
            />
            <AlertGroup
              icon="build"
              titulo="Manutenções"
              severidade="alerta"
              itens={painel.alertas.manut}
              onClick={() => setLocation("/maquinas/manutencao")}
            />
            <AlertGroup
              icon="schedule"
              titulo="Lançamentos pendentes"
              severidade="info"
              itens={painel.alertas.pendentes}
              onClick={() => setLocation(FINANCEIRO_VISAO_GERAL_PATH)}
            />
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <SectionCard title="Compra e Venda recentes" icon="swap_horiz" className="lg:col-span-2">
          <div className="p-4">
            {carregando ? (
              <EmptyState icon="swap_horiz" text="Carregando operações…" />
            ) : painel.comercial.compras.length === 0 && painel.comercial.vendas.length === 0 ? (
              <EmptyState icon="swap_horiz" text="Sem compras ou vendas recentes neste recorte." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Compras</p>
                  {painel.comercial.compras.length === 0 ? (
                    <p className="text-[12px] text-gray-400">Nenhuma compra recente.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {painel.comercial.compras.map(op => (
                        <button
                          key={`c-${op.id}`}
                          type="button"
                          onClick={() => setLocation(compraVendaCompraDetalhePath(op.id))}
                          className="w-full text-left py-2 hover:bg-gray-50 rounded-md px-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-gray-700 truncate">{op.parceiro}</span>
                            <span className="text-[12px] tabular-nums text-gray-800">{op.valor == null ? "—" : formatarValorRelatorioV2(op.valor)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">{dataBr(op.data)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Vendas</p>
                  {painel.comercial.vendas.length === 0 ? (
                    <p className="text-[12px] text-gray-400">Nenhuma venda recente.</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {painel.comercial.vendas.map(op => (
                        <button
                          key={`v-${op.id}`}
                          type="button"
                          onClick={() => setLocation(compraVendaVendaDetalhePath(op.id))}
                          className="w-full text-left py-2 hover:bg-gray-50 rounded-md px-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-medium text-gray-700 truncate">{op.parceiro}</span>
                            <span className="text-[12px] tabular-nums text-gray-800">{op.valor == null ? "—" : formatarValorRelatorioV2(op.valor)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400">{dataBr(op.data)}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setLocation(COMPRA_VENDA_COMPRAS_PATH)} className="text-[12px] font-medium hover:underline" style={{ color: TEAL }}>
                Compras
              </button>
              <button type="button" onClick={() => setLocation(COMPRA_VENDA_VENDAS_PATH)} className="text-[12px] font-medium hover:underline" style={{ color: TEAL }}>
                Vendas
              </button>
              <button type="button" onClick={() => setLocation("/financeiro/contas-a-receber")} className="text-[12px] font-medium hover:underline" style={{ color: TEAL }}>
                Contas a Receber
              </button>
              <button type="button" onClick={() => setLocation("/financeiro/contas-a-pagar")} className="text-[12px] font-medium hover:underline" style={{ color: TEAL }}>
                Contas a Pagar
              </button>
              <button type="button" onClick={() => setLocation(FINANCEIRO_CAIXA_OFICIAL_PATH)} className="text-[12px] font-medium hover:underline" style={{ color: TEAL }}>
                Caixa e Bancos
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Composição do Rebanho" icon="donut_large">
          <div className="p-4">
            {carregando ? (
              <EmptyState icon="donut_large" text="Carregando composição…" />
            ) : painel.rebanho.composicao.length === 0 ? (
              <EmptyState icon="pets" text="Sem animais cadastrados" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={painel.rebanho.composicao}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {painel.rebanho.composicao.map((_, i) => (
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
                  {painel.rebanho.composicao.slice(0, 6).map((c, i) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <SectionCard title="Ocupação de Pastos" icon="grass" className="lg:col-span-2">
          {carregando ? (
            <EmptyState icon="grass" text="Carregando pastos…" />
          ) : painel.ocupacao.length === 0 ? (
            <EmptyState icon="grass" text="Sem pastos cadastrados" />
          ) : (
            <div className="p-4 space-y-3">
              {painel.ocupacao.map(p => {
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
            {carregando ? (
              <EmptyState icon="cake" text="Carregando idades…" />
            ) : painel.rebanho.total === 0 ? (
              <EmptyState icon="cake" text="Sem animais cadastrados" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart
                  layout="vertical"
                  data={painel.rebanho.idades}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard
          title="Caixa oficial"
          icon="receipt_long"
          action={
            <button type="button" onClick={() => setLocation(FINANCEIRO_CAIXA_OFICIAL_PATH)} className="text-[11px] font-medium hover:underline" style={{ color: TEAL }}>
              Abrir
            </button>
          }
        >
          <EmptyState icon="account_balance_wallet" text="O caixa oficial está em Caixa e Bancos." />
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
          {carregando ? (
            <EmptyState icon="health_and_safety" text="Carregando registros…" />
          ) : painel.saudeRecente.length === 0 ? (
            <EmptyState icon="health_and_safety" text="Sem registros" />
          ) : (
            <div className="divide-y divide-gray-50">
              {painel.saudeRecente.map(s => (
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
          title="Caixa e Bancos"
          icon="savings"
          action={
            <button type="button" onClick={() => setLocation(FINANCEIRO_CAIXA_OFICIAL_PATH)} className="text-[11px] font-medium hover:underline" style={{ color: TEAL }}>
              Abrir
            </button>
          }
        >
          <EmptyState icon="account_balance" text="Consulte os saldos oficiais no Financeiro V2." />
        </SectionCard>
      </div>

      {estadoIndicadores === "pronto" && !temAlgumDado && (
        <div className="mt-5 text-center text-[12px] text-gray-400">
          Comece cadastrando sua fazenda, rebanho e lançamentos — o painel se preenche automaticamente.
        </div>
      )}
    </AppLayout>
  );
}
