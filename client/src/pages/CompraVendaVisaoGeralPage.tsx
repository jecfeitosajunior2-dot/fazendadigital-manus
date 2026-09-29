import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { useIsMobile } from "@/hooks/useMobile";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FormDatePicker } from "@/components/FormFields";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateBR, periodoMesAtual } from "@/lib/date-utils";
import {
  formatarMetricaPeso,
  formatarMetricaQuantidade,
  formatarMetricaValor,
  type CommercialMetric,
} from "@/lib/compraVendaResumo";
import {
  agruparSeriesTemporaisPainel,
  formatarEixoYValorPainel,
  formatarMediaQuantidadePainel,
  intervaloTicksEixoXPainel,
  linhasTooltipSeriePainel,
  destinoAtencaoPendencia,
  resumirAtencaoComprasPainel,
  resumoAtencaoPendencia,
  textoAtencaoPendencia,
  tituloAtencaoPendencia,
  resumirPainelCompras,
  resumirPainelVendas,
  resumirPerfilComprasPainel,
  resumirPerfilVendasPainel,
  rotuloAcaoAtencaoPainel,
  type PainelAtencaoDestino,
  type PainelOperacaoLinha,
} from "@/lib/compraVendaPainel";
import {
  COMPRA_VENDA_COMPRAS_PATH,
  COMPRA_VENDA_VENDAS_PATH,
  comRetornoCompraVendaVisaoGeral,
  compraVendaCompraDetalhePath,
  compraVendaCompraRecebimentoPath,
  compraVendaVendaDetalhePath,
} from "@/lib/compraVendaCompradores";
import {
  FILTRO_IDENTIFICACAO_PENDENTE,
  compraVendaComprasListagemPath,
} from "@/lib/comprasListagem";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { trpc } from "@/lib/trpc";

const COR_COMPRAS = "var(--fd-serie-compra)";
const COR_VENDAS = "var(--fd-serie-venda)";
const ALTURA_GRAFICO_DESKTOP_PX = 186;
const ALTURA_GRAFICO_MOBILE_PX = 168;
const LARGURA_EIXO_Y_PX = 88;

function EixoYTickPainel({
  x,
  y,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: number };
}) {
  if (x == null || y == null || payload?.value == null) return null;
  return (
    <text x={x} y={y} dy={3} textAnchor="end" fill="#94a3b8" fontSize={10}>
      {formatarEixoYValorPainel(Number(payload.value))}
    </text>
  );
}

function alturaMinimaBarraSerie(valor: number) {
  return Number(valor) > 0 ? 4 : 0;
}

function caminhoAtencaoPainel(
  destino: PainelAtencaoDestino,
  periodo: { de: string; ate: string },
  fazendaId?: string,
): string | null {
  if (!destino) return null;
  const destinoPath = destino.tipo === "recebimento"
    ? compraVendaCompraRecebimentoPath(destino.compraId)
    : compraVendaComprasListagemPath({
        identificacao: FILTRO_IDENTIFICACAO_PENDENTE,
        de: periodo.de,
        ate: periodo.ate,
      });
  return comRetornoCompraVendaVisaoGeral(destinoPath, fazendaId);
}

function MetricHint({ label, hint }: { label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="shrink-0 inline-flex items-center justify-center w-8 h-8 -mr-1.5 -my-1.5 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded"
          aria-label={`Ajuda: ${label}`}
          onPointerDown={event => {
            if (event.pointerType === "touch") {
              event.preventDefault();
              setOpen(atual => !atual);
            }
          }}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[240px] text-[11px] leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCard({
  label,
  compactLabel,
  value,
  hint,
  cor,
}: {
  label: string;
  compactLabel?: string;
  value: string;
  hint?: string;
  cor: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 min-h-[64px] min-w-0 h-full overflow-hidden flex flex-col">
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: cor }} aria-hidden />
      <div className="px-2.5 py-2 sm:px-3 sm:py-2.5 flex-1 min-w-0">
        <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-wide flex items-start gap-0.5 min-w-0">
          <span className="min-w-0 leading-snug">
            <span className="md:hidden">{compactLabel ?? label}</span>
            <span className="hidden md:inline">{label}</span>
          </span>
          {hint ? <MetricHint label={label} hint={hint} /> : null}
        </p>
        <p className="text-[17px] sm:text-[20px] font-bold text-gray-800 leading-tight mt-0.5 tabular-nums break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

function formatLinha(metric: CommercialMetric, kind: "valor" | "qtd" | "peso"): string {
  if (kind === "valor") return formatarMetricaValor(metric);
  if (kind === "peso") return formatarMetricaPeso(metric);
  return formatarMetricaQuantidade(metric);
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
      {children}
    </h2>
  );
}

function PerfilCard({
  titulo,
  cor,
  children,
}: {
  titulo: string;
  cor: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 min-w-0 h-full overflow-hidden flex flex-col">
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: cor }} aria-hidden />
      <div className="px-3 py-2.5 flex-1 min-w-0">
        <h3 className="text-[13px] font-medium text-gray-800 mb-1.5">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}

function PerfilLinha({
  label,
  value,
  separar,
}: {
  label: string;
  value: string;
  separar?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 min-w-0 ${
        separar ? "mt-1.5 pt-1.5 border-t border-gray-100" : ""
      }`}
    >
      <span className="text-[11px] text-gray-500 min-w-0 leading-snug">{label}</span>
      <span className="text-[13px] font-semibold text-gray-800 tabular-nums text-right whitespace-nowrap shrink-0">
        {value}
      </span>
    </div>
  );
}

function AtencaoCard({
  destaque,
  titulo,
  texto,
  acao,
  onAcao,
}: {
  destaque: string;
  titulo: string;
  texto: string;
  acao?: string;
  onAcao?: () => void;
}) {
  return (
    <div className="min-w-0 max-w-full bg-white rounded-lg border border-amber-200 px-3 py-2">
      <p className="text-[18px] sm:text-[20px] font-bold leading-tight tabular-nums text-amber-800 break-words">
        {destaque}
      </p>
      <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mt-0.5 leading-snug">
        {titulo}
      </p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug break-words">{texto}</p>
      {acao && onAcao ? (
        <button
          type="button"
          onClick={onAcao}
          className="mt-1 inline-flex items-center max-w-full min-h-11 md:min-h-0 text-[12px] text-gray-600 hover:text-gray-800 hover:underline"
        >
          {acao}
        </button>
      ) : null}
    </div>
  );
}

function OperacaoRecenteCard({
  row,
  onOpen,
}: {
  row: PainelOperacaoLinha;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left px-3 py-3 min-h-11 border-t border-gray-50 first:border-t-0 active:bg-gray-50"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-gray-500">{formatDateBR(row.data)}</p>
          <p className="text-[13px] font-medium text-gray-800 truncate" title={row.parceiro}>{row.parceiro}</p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[12px] text-gray-600">
            <span>{formatLinha(row.animais, "qtd")} animais</span>
            <span>{formatLinha(row.peso, "peso")}</span>
          </div>
          <p className="mt-0.5 text-[13px] font-semibold text-gray-800 tabular-nums">
            {formatLinha(row.valor, "valor")}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 text-gray-300" aria-hidden />
      </div>
    </button>
  );
}

export default function CompraVendaVisaoGeralPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const padrao = periodoMesAtual();
  const [de, setDe] = useState(padrao.de);
  const [ate, setAte] = useState(padrao.ate);
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const periodo = { de, ate };
  const fazendaNum = fazendaId ? Number(fazendaId) : 0;
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();

  useEffect(() => {
    if (fazendaInitDone || loadingFazendas) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const stored = readPersistedRebanhoFazendaId(ids);
    const resolved = stored || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const { data: compras = [], isLoading: loadingCompras } = trpc.compras.list.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaNum > 0 },
  );
  const { data: vendas = [], isLoading: loadingVendas } = trpc.vendas.list.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaNum > 0 },
  );
  const loading = !fazendaInitDone || loadingFazendas || (fazendaNum > 0 && (loadingCompras || loadingVendas));
  const comprasFonte = fazendaNum > 0 ? compras : [];
  const vendasFonte = fazendaNum > 0 ? vendas : [];

  const resumoCompras = useMemo(
    () => resumirPainelCompras(comprasFonte, periodo),
    [comprasFonte, periodo.de, periodo.ate],
  );
  const resumoVendas = useMemo(
    () => resumirPainelVendas(vendasFonte, periodo),
    [vendasFonte, periodo.de, periodo.ate],
  );
  const perfilCompras = useMemo(
    () => resumirPerfilComprasPainel(comprasFonte, periodo),
    [comprasFonte, periodo.de, periodo.ate],
  );
  const perfilVendas = useMemo(
    () => resumirPerfilVendasPainel(vendasFonte, periodo),
    [vendasFonte, periodo.de, periodo.ate],
  );
  const serie = useMemo(
    () => agruparSeriesTemporaisPainel(comprasFonte, vendasFonte, periodo),
    [comprasFonte, vendasFonte, periodo.de, periodo.ate],
  );
  const atencao = useMemo(
    () => resumirAtencaoComprasPainel(comprasFonte, periodo),
    [comprasFonte, periodo.de, periodo.ate],
  );
  const acaoPendencia = destinoAtencaoPendencia(atencao);

  return (
    <AppLayout>
      <div className="box-border w-full max-w-full min-w-0 pb-8">
        <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:gap-4 min-w-0">
          <div className="min-w-0 w-full sm:w-[16.5rem] sm:max-w-[18rem] shrink-0">
            <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Fazenda</p>
            <FazendaOverviewSelect
              value={fazendaId}
              onChange={value => {
                setFazendaId(value);
                if (value) persistRebanhoFazendaId(value);
              }}
              fazendas={fazendas}
              emptyLabel="Selecione uma fazenda"
              showEmptyOption
              className="w-full min-w-0"
            />
          </div>
          <div className="min-w-0 w-full sm:w-auto">
            <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Período</p>
            <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center gap-1.5 min-w-0">
              <div className="w-full min-[380px]:w-[11rem] min-w-0">
                <FormDatePicker
                  value={de}
                  onChange={setDe}
                  placeholder="dd/mm/aaaa"
                  variant="light"
                  aria-label="Data inicial"
                />
              </div>
              <span className="hidden min-[380px]:inline text-[12px] text-gray-400 leading-none" aria-hidden>
                →
              </span>
              <span className="min-[380px]:hidden text-center text-[11px] text-gray-400 leading-none" aria-hidden>
                ↓
              </span>
              <div className="w-full min-[380px]:w-[11rem] min-w-0">
                <FormDatePicker
                  value={ate}
                  onChange={setAte}
                  placeholder="dd/mm/aaaa"
                  variant="light"
                  aria-label="Data final"
                />
              </div>
            </div>
          </div>
        </div>

        <SectionTitle>Resumo do período</SectionTitle>
        {loading ? (
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-2 mb-4 min-w-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-100 min-h-[64px] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-2 mb-4 min-w-0 items-stretch">
            <MetricCard
              label="Compras no período"
              compactLabel="Compras no período"
              value={formatarMetricaValor(resumoCompras.valor)}
              cor={COR_COMPRAS}
            />
            <MetricCard
              label="Vendas no período"
              compactLabel="Vendas no período"
              value={formatarMetricaValor(resumoVendas.valor)}
              cor={COR_VENDAS}
            />
            <MetricCard
              label="Custo médio/kg"
              compactLabel="Custo médio/kg"
              value={formatarMetricaValor(resumoCompras.custoMedioKg)}
              hint="Custo total das compras com peso informado dividido pelo peso adquirido."
              cor={COR_COMPRAS}
            />
            <MetricCard
              label="Preço médio/kg"
              compactLabel="Preço médio/kg"
              value={formatarMetricaValor(resumoVendas.custoMedioKg)}
              hint="Valor das vendas com peso informado dividido pelo peso vendido."
              cor={COR_VENDAS}
            />
            <MetricCard
              label="Animais comprados"
              compactLabel="Animais comprados"
              value={formatarMetricaQuantidade(resumoCompras.animais)}
              cor={COR_COMPRAS}
            />
            <MetricCard
              label="Animais vendidos"
              compactLabel="Animais vendidos"
              value={formatarMetricaQuantidade(resumoVendas.animais)}
              cor={COR_VENDAS}
            />
            <MetricCard
              label="Peso comprado"
              compactLabel="Peso comprado"
              value={formatarMetricaPeso(resumoCompras.peso)}
              cor={COR_COMPRAS}
            />
            <MetricCard
              label="Peso vendido"
              compactLabel="Peso vendido"
              value={formatarMetricaPeso(resumoVendas.peso)}
              cor={COR_VENDAS}
            />
          </div>
        )}

        <SectionTitle>Como foram as operações</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4 min-w-0 items-stretch">
          <PerfilCard titulo="Compras" cor={COR_COMPRAS}>
            {loading ? (
              <p className="text-[12px] text-gray-400">Carregando...</p>
            ) : (
              <>
                <PerfilLinha label="Operações" value={String(perfilCompras.operacoes)} />
                <PerfilLinha
                  label="Animais por operação"
                  value={formatarMediaQuantidadePainel(perfilCompras.animaisPorOperacao)}
                />
                <PerfilLinha
                  label="Peso médio/animal"
                  value={formatarMetricaPeso(perfilCompras.pesoMedioPorAnimal)}
                />
                <PerfilLinha
                  label="Custo médio/animal"
                  value={formatarMetricaValor(perfilCompras.medioPorAnimal)}
                  separar
                />
                <PerfilLinha
                  label="Custo médio/kg"
                  value={formatarMetricaValor(perfilCompras.medioPorKg)}
                />
              </>
            )}
          </PerfilCard>
          <PerfilCard titulo="Vendas" cor={COR_VENDAS}>
            {loading ? (
              <p className="text-[12px] text-gray-400">Carregando...</p>
            ) : (
              <>
                <PerfilLinha label="Operações" value={String(perfilVendas.operacoes)} />
                <PerfilLinha
                  label="Animais por operação"
                  value={formatarMediaQuantidadePainel(perfilVendas.animaisPorOperacao)}
                />
                <PerfilLinha
                  label="Peso médio/animal"
                  value={formatarMetricaPeso(perfilVendas.pesoMedioPorAnimal)}
                />
                <PerfilLinha
                  label="Valor médio/animal"
                  value={formatarMetricaValor(perfilVendas.medioPorAnimal)}
                  separar
                />
                <PerfilLinha
                  label="Preço médio/kg"
                  value={formatarMetricaValor(perfilVendas.medioPorKg)}
                />
              </>
            )}
          </PerfilCard>
        </div>

        <SectionTitle>Compras e vendas ao longo do tempo</SectionTitle>
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-2 py-1.5 sm:px-3 mb-4 min-w-0 w-full max-w-full overflow-x-hidden">
          {loading ? (
            <div
              className="animate-pulse bg-gray-50 rounded"
              style={{ height: isMobile ? ALTURA_GRAFICO_MOBILE_PX : ALTURA_GRAFICO_DESKTOP_PX }}
            />
          ) : !serie.temOperacao ? (
            <p className="py-3 text-center text-[12px] text-gray-400">
              Nenhuma compra ou venda registrada no período.
            </p>
          ) : (
            <>
              <ResponsiveContainer
                width="100%"
                height={isMobile ? ALTURA_GRAFICO_MOBILE_PX : ALTURA_GRAFICO_DESKTOP_PX}
                minHeight={0}
              >
                <BarChart
                  data={serie.pontos}
                  margin={{ top: 10, right: 8, left: 4, bottom: 2 }}
                  barGap={3}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: isMobile ? 9 : 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    interval={intervaloTicksEixoXPainel(serie.pontos.length, serie.granularidade, isMobile)}
                    minTickGap={isMobile ? 36 : 20}
                  />
                  <YAxis
                    width={LARGURA_EIXO_Y_PX}
                    tick={<EixoYTickPainel />}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    allowEscapeViewBox={{ x: false, y: false }}
                    wrapperStyle={{ outline: "none", zIndex: 20, maxWidth: 220 }}
                    cursor={{ fill: "rgba(15, 23, 42, 0.04)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as {
                        labelTooltip?: string;
                        compras?: number;
                        vendas?: number;
                      };
                      const linhas = linhasTooltipSeriePainel(row);
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-[12px] leading-snug">
                          <p className="font-semibold text-gray-800">{linhas.data}</p>
                          <p className="tabular-nums text-gray-700 mt-0.5">{linhas.compras}</p>
                          <p className="tabular-nums text-gray-700 mt-0.5">{linhas.vendas}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="compras"
                    name="Compras"
                    fill={COR_COMPRAS}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    minPointSize={alturaMinimaBarraSerie}
                  />
                  <Bar
                    dataKey="vendas"
                    name="Vendas"
                    fill={COR_VENDAS}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                    minPointSize={alturaMinimaBarraSerie}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-[11px] leading-none text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ backgroundColor: COR_COMPRAS }} />
                  Compras
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] shrink-0" style={{ backgroundColor: COR_VENDAS }} />
                  Vendas
                </span>
              </div>
            </>
          )}
        </div>

        {atencao.comprasComRecebimentoPendente > 0 ? (
          <section className="mb-3 min-w-0">
            <SectionTitle>Alertas e Pendências</SectionTitle>
            <div className="grid min-w-0 gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),30rem))]">
              <AtencaoCard
                destaque={resumoAtencaoPendencia(atencao)}
                titulo={tituloAtencaoPendencia()}
                texto={textoAtencaoPendencia(atencao)}
                acao={rotuloAcaoAtencaoPainel(acaoPendencia) ?? undefined}
                onAcao={
                  caminhoAtencaoPainel(acaoPendencia, periodo, fazendaId)
                    ? () => setLocation(caminhoAtencaoPainel(acaoPendencia, periodo, fazendaId)!)
                    : undefined
                }
              />
            </div>
          </section>
        ) : null}

        <SectionTitle>Operações recentes</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden min-w-0">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-gray-800">Últimas Compras</h3>
              <button
                type="button"
                onClick={() => setLocation(comRetornoCompraVendaVisaoGeral(COMPRA_VENDA_COMPRAS_PATH, fazendaId))}
                className="inline-flex items-center min-h-11 px-1 text-[12px] text-gray-500 hover:text-gray-700 hover:underline"
              >
                Ver todas
              </button>
            </div>
            {loading ? (
              <p className="p-4 text-center text-[12px] text-gray-400">Carregando...</p>
            ) : resumoCompras.recentes.length === 0 ? (
              <p className="p-4 text-center text-[12px] text-gray-400">Nenhuma compra no período</p>
            ) : (
              <>
                <div className="lg:hidden">
                  {resumoCompras.recentes.map(row => (
                    <OperacaoRecenteCard
                      key={row.id}
                      row={row}
                      onOpen={() => setLocation(compraVendaCompraDetalhePath(row.id))}
                    />
                  ))}
                </div>
                <table className="hidden lg:table w-full table-fixed text-[11px]">
                  <colgroup>
                    <col className="w-[5.75rem]" />
                    <col />
                    <col className="w-[4rem]" />
                    <col className="w-[5.25rem]" />
                    <col className="w-[6.75rem]" />
                  </colgroup>
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Data</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Fornecedor</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Animais</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoCompras.recentes.map(row => (
                      <tr
                        key={row.id}
                        className="border-t border-gray-50 cursor-pointer hover:bg-gray-50/50"
                        onClick={() => setLocation(compraVendaCompraDetalhePath(row.id))}
                      >
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatDateBR(row.data)}</td>
                        <td className="min-w-0 px-3 py-1.5 text-center text-gray-700 font-medium truncate" title={row.parceiro}>{row.parceiro}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.animais, "qtd")}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.peso, "peso")}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.valor, "valor")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden min-w-0">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-medium text-gray-800">Últimas Vendas</h3>
              <button
                type="button"
                onClick={() => setLocation(comRetornoCompraVendaVisaoGeral(COMPRA_VENDA_VENDAS_PATH, fazendaId))}
                className="inline-flex items-center min-h-11 px-1 text-[12px] text-gray-500 hover:text-gray-700 hover:underline"
              >
                Ver todas
              </button>
            </div>
            {loading ? (
              <p className="p-4 text-center text-[12px] text-gray-400">Carregando...</p>
            ) : resumoVendas.recentes.length === 0 ? (
              <p className="p-4 text-center text-[12px] text-gray-400">Nenhuma venda no período</p>
            ) : (
              <>
                <div className="lg:hidden">
                  {resumoVendas.recentes.map(row => (
                    <OperacaoRecenteCard
                      key={row.id}
                      row={row}
                      onOpen={() => setLocation(compraVendaVendaDetalhePath(row.id))}
                    />
                  ))}
                </div>
                <table className="hidden lg:table w-full table-fixed text-[11px]">
                  <colgroup>
                    <col className="w-[5.75rem]" />
                    <col />
                    <col className="w-[4rem]" />
                    <col className="w-[5.25rem]" />
                    <col className="w-[6.75rem]" />
                  </colgroup>
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Data</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Comprador</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Animais</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Peso</th>
                      <th className="px-3 py-2 text-center text-[10px] font-medium text-gray-500 uppercase">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoVendas.recentes.map(row => (
                      <tr
                        key={row.id}
                        className="border-t border-gray-50 cursor-pointer hover:bg-gray-50/50"
                        onClick={() => setLocation(compraVendaVendaDetalhePath(row.id))}
                      >
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatDateBR(row.data)}</td>
                        <td className="min-w-0 px-3 py-1.5 text-center text-gray-700 font-medium truncate" title={row.parceiro}>{row.parceiro}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.animais, "qtd")}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.peso, "peso")}</td>
                        <td className="px-3 py-1.5 text-center text-gray-700 whitespace-nowrap">{formatLinha(row.valor, "valor")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
