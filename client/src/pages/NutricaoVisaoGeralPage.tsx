import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Info } from "lucide-react";
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
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import { FormDatePicker, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { useIsMobile } from "@/hooks/useMobile";
import { persistRebanhoFazendaId, readPersistedRebanhoFazendaId } from "@shared/animal-filter-types";
import { formatarDataCivilBR, hojeISODateLocal } from "@shared/nutricaoPlanejamento";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";
import {
  formatarIndicadorNumero,
  formatarMoedaIndicador,
  MSG_VG_FORNECIDO_CAB_DIA_AJUDA,
  periodoRapido,
} from "@shared/nutricaoVisaoGeral";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const COR_QTD = "var(--fd-turquesa-1)";
const COR_CUSTO = "var(--fd-navy-1)";
const ALTURA_GRAFICO_DESKTOP_PX = 186;
const ALTURA_GRAFICO_MOBILE_PX = 168;
const LARGURA_EIXO_Y_PX = 88;

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
      <TooltipContent side="top" sideOffset={6} className="max-w-[260px] text-[11px] leading-relaxed">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCard({
  label,
  value,
  hint,
  cor,
  extra,
  extraNeutro,
}: {
  label: string;
  value: string;
  hint?: string;
  cor: string;
  extra?: string | null;
  extraNeutro?: boolean;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 min-h-[64px] min-w-0 h-full overflow-hidden flex flex-col">
      <div className="h-0.5 w-full shrink-0" style={{ backgroundColor: cor }} aria-hidden />
      <div className="px-2.5 py-2 sm:px-3 sm:py-2.5 flex-1 min-w-0">
        <p className="text-[10px] sm:text-[11px] text-gray-500 uppercase tracking-wide flex items-start gap-0.5 min-w-0">
          <span className="min-w-0 leading-snug">{label}</span>
          {hint ? <MetricHint label={label} hint={hint} /> : null}
        </p>
        <p className="text-[17px] sm:text-[20px] font-bold text-gray-800 leading-tight mt-0.5 tabular-nums break-words">
          {value}
        </p>
        {extra ? (
          <p className={`text-[10px] mt-0.5 leading-snug ${extraNeutro ? "text-gray-500" : "text-amber-700"}`}>
            {extra}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
      {children}
    </h2>
  );
}

function EixoYTick({ x, y, payload, modo }: { x?: number; y?: number; payload?: { value?: number }; modo: "kg" | "custo" }) {
  if (x == null || y == null || payload?.value == null) return null;
  const n = Number(payload.value);
  const txt = modo === "custo"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : `${n.toLocaleString("pt-BR")} kg`;
  return <text x={x} y={y} dy={3} textAnchor="end" fill="#94a3b8" fontSize={10}>{txt}</text>;
}

const RAPIDOS = [
  { id: "hoje" as const, label: "Hoje" },
  { id: "7d" as const, label: "7 dias" },
  { id: "30d" as const, label: "30 dias" },
  { id: "mes" as const, label: "Este mês" },
  { id: "personalizado" as const, label: "Personalizado" },
];

export default function NutricaoVisaoGeralPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const hoje = hojeISODateLocal();
  const padrao = periodoRapido("mes", hoje);
  const [de, setDe] = useState(padrao.de);
  const [ate, setAte] = useState(padrao.ate);
  const [rapido, setRapido] = useState<(typeof RAPIDOS)[number]["id"]>("mes");
  const [fazendaId, setFazendaId] = useState("");
  const [loteId, setLoteId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [modoGrafico, setModoGrafico] = useState<"kg" | "custo">("kg");

  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const fazendaNum = Number(fazendaId);
  const fazendaOk = fazendaNum > 0;
  const { data: lotes = [] } = trpc.nutricaoPlanejamento.listLotes.useQuery(
    { fazendaId: fazendaNum },
    { enabled: fazendaOk },
  );

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

  const { data, isLoading } = trpc.nutricaoVisaoGeral.carregar.useQuery({
    fazendaId: fazendaNum,
    de,
    ate,
    loteId: loteId ? Number(loteId) : null,
  }, { enabled: fazendaOk && Boolean(de && ate) });

  const loading = !fazendaInitDone || loadingFazendas || (fazendaOk && isLoading);
  const cards = data?.cards;
  const aplicarRapido = (id: (typeof RAPIDOS)[number]["id"]) => {
    setRapido(id);
    if (id === "personalizado") return;
    const p = periodoRapido(id, hojeISODateLocal());
    setDe(p.de);
    setAte(p.ate);
  };

  const serie = useMemo(() => data?.evolucao.pontos.map(p => ({
    ...p,
    valor: modoGrafico === "kg" ? p.kg : p.custoConhecido,
  })) ?? [], [data, modoGrafico]);

  return (
    <AppLayout>
      <div className="box-border w-full max-w-full min-w-0 pb-8">
        <div className="mb-3 flex flex-col gap-2.5 min-w-0">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:gap-4 min-w-0">
            <div className="min-w-0 w-full sm:w-[16.5rem] sm:max-w-[18rem] shrink-0">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Fazenda</p>
              <FazendaOverviewSelect
                value={fazendaId}
                onChange={value => {
                  setFazendaId(value);
                  setLoteId("");
                  if (value) persistRebanhoFazendaId(value);
                }}
                fazendas={fazendas}
                emptyLabel="Selecione uma fazenda"
                showEmptyOption
                className="w-full min-w-0"
              />
            </div>
            <div className="min-w-0 w-full sm:w-[14rem]">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Lote</p>
              <FormSelect variant="light" placeholder="Todos" value={loteId || "__all__"} onChange={v => setLoteId(v === "__all__" ? "" : v)}>
                <SelectItem value="__all__" className="text-[12px]">Todos os lotes</SelectItem>
                {lotes.map(l => <SelectItem key={l.id} value={String(l.id)} className="text-[12px]">{l.nome}</SelectItem>)}
              </FormSelect>
            </div>
            <div className="min-w-0 w-full sm:w-auto">
              <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">Período</p>
              <div className="flex flex-col min-[380px]:flex-row min-[380px]:items-center gap-1.5 min-w-0">
                <div className="w-full min-[380px]:w-[11rem] min-w-0">
                  <FormDatePicker value={de} onChange={v => { setDe(v); setRapido("personalizado"); }} placeholder="dd/mm/aaaa" variant="light" aria-label="Data inicial" />
                </div>
                <span className="hidden min-[380px]:inline text-[12px] text-gray-400" aria-hidden>→</span>
                <div className="w-full min-[380px]:w-[11rem] min-w-0">
                  <FormDatePicker value={ate} onChange={v => { setAte(v); setRapido("personalizado"); }} placeholder="dd/mm/aaaa" variant="light" aria-label="Data final" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RAPIDOS.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => aplicarRapido(r.id)}
                className={cn(
                  "px-2.5 min-h-8 rounded-full text-[11px] font-semibold border",
                  rapido === r.id ? "border-[#1BC5BD] text-gray-800 bg-white" : "border-gray-200 text-gray-500 bg-white",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {!fazendaOk && fazendaInitDone ? (
          <div className="bg-white rounded-lg border border-gray-100 px-4 py-10 text-center text-[13px] text-gray-500">
            Selecione a fazenda para ver a Visão Geral da Nutrição.
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-2 mb-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-100 min-h-[64px] animate-pulse" />
            ))}
          </div>
        ) : !data || data.vazio ? (
          <div className="bg-white rounded-lg border border-gray-100 px-4 py-12 text-center">
            <p className="text-[14px] font-medium text-gray-800">{data?.mensagemVazio ?? "Ainda não há movimentação nutricional no período selecionado."}</p>
            <p className="text-[12px] text-gray-500 mt-2">Comece pelo planejamento ou registre o que já foi oferecido.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="px-4 min-h-[40px] rounded-lg text-[12px] font-semibold text-gray-900" style={{ backgroundColor: "#4ECDC4" }} onClick={() => setLocation(`/nutricao/planejamento/novo?fazendaId=${fazendaId}`)}>
                Novo planejamento
              </button>
              <button type="button" className="px-4 min-h-[40px] rounded-lg text-[12px] font-semibold border border-gray-200" onClick={() => setLocation(`/nutricao/fornecimentos/novo?fazendaId=${fazendaId}`)}>
                Registrar fornecimento
              </button>
            </div>
          </div>
        ) : (
          <>
            <SectionTitle>Resumo do período</SectionTitle>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-2 mb-4 min-w-0 items-stretch">
              <MetricCard
                label="População observada"
                value={formatarIndicadorNumero(cards?.populacaoObservada ?? null, { inteiro: true })}
                hint={cards?.populacaoMotivo}
                extra={cards?.populacaoIncompleta ? "Cobertura incompleta — lotes com população variável ficaram de fora." : null}
                cor={COR_QTD}
              />
              <MetricCard
                label="Quantidade fornecida"
                value={formatarIndicadorNumero(cards?.kgFornecido ?? 0, { sufixo: "kg" })}
                hint="Soma dos fornecimentos confirmados. É o que foi oferecido, não o consumido."
                cor={COR_QTD}
              />
              <MetricCard
                label="Fornecido / cab / dia"
                value={formatarIndicadorNumero(cards?.fornecidoCabDia ?? null, { sufixo: "kg" })}
                hint={cards?.fornecidoCabDiaMotivo ?? MSG_VG_FORNECIDO_CAB_DIA_AJUDA}
                extra={cards?.coberturaAnimalDia}
                extraNeutro
                cor={COR_QTD}
              />
              <MetricCard
                label="Lotes atendidos"
                value={formatarIndicadorNumero(cards?.lotesAtendidos ?? 0, { inteiro: true })}
                hint="Lotes distintos com fornecimento confirmado no período."
                cor={COR_QTD}
              />
              <MetricCard
                label="Custo nutricional"
                value={formatarMoedaIndicador(cards?.custoConhecido ?? null)}
                hint="Custo snapshot dos fornecimentos. Batida entra só pelo custo alocado, nunca de novo pelo custo da preparação."
                extra={cards?.custoIncompleto ? "Custo incompleto" : cards?.coberturaCusto}
                cor={COR_CUSTO}
              />
              <MetricCard
                label="Custo / cab / dia"
                value={formatarMoedaIndicador(cards?.custoCabDia ?? null)}
                hint="Só aparece com custo completo e animal-dia válido."
                cor={COR_CUSTO}
              />
              <MetricCard
                label="Custo / kg fornecido"
                value={formatarMoedaIndicador(cards?.custoPorKg ?? null)}
                hint="Só é exato quando todos os kg do período têm custo conhecido."
                extra={cards?.custoIncompleto ? "Custo incompleto — valor exato indisponível." : null}
                cor={COR_CUSTO}
              />
              <MetricCard
                label="Menor autonomia projetada"
                value={formatarIndicadorNumero(cards?.menorAutonomiaDias ?? null, { sufixo: "dias" })}
                hint={cards?.menorAutonomiaNome
                  ? `Menor autonomia entre os planejamentos vigentes (${cards.menorAutonomiaNome}). Projeção — não reserva estoque.`
                  : "Não há autonomia quantitativa calculável nos planejamentos vigentes."}
                cor={COR_CUSTO}
              />
            </div>

            {data.alertas.length > 0 && (
              <section className="mb-4">
                <SectionTitle>Alertas operacionais</SectionTitle>
                <div className="grid min-w-0 gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),30rem))]">
                  {data.alertas.map((a, i) => (
                    <div key={`${a.tipo}-${i}`} className="min-w-0 bg-white rounded-lg border border-amber-200 px-3 py-2">
                      <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">{a.titulo}</p>
                      <p className="text-[12px] text-gray-600 mt-0.5">{a.texto}</p>
                      {a.destino && (
                        <button type="button" className="mt-1 text-[12px] text-gray-600 underline" onClick={() => setLocation(a.destino!)}>
                          Ver detalhes
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <SectionTitle>Planejado × fornecido</SectionTitle>
            <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
              {data.planejado.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">Nenhum planejamento válido no período.</p>
              ) : (
                <TableHorizontalScroll>
                  <table className="w-full min-w-[820px] text-[11px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Lote", "Fonte", "Meta", "Planejado", "Fornecido", "Desvio", "Situação"].map(h => (
                          <th key={h} className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.planejado.map(row => (
                        <tr key={row.planejamentoId} className="border-t">
                          <td className="px-3 py-2 text-center">{row.loteNome}</td>
                          <td className="px-3 py-2 text-center">{row.fonte}</td>
                          <td className="px-3 py-2 text-center">{row.meta}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{row.adLibitum ? "Ad libitum" : formatarIndicadorNumero(row.planejadoKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{formatarIndicadorNumero(row.fornecidoKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center tabular-nums">
                            {row.desvioKg == null ? "—" : `${row.desvioKg > 0 ? "+" : ""}${row.desvioKg.toLocaleString("pt-BR")} kg${row.desvioPct != null ? ` (${row.desvioPct > 0 ? "+" : ""}${row.desvioPct}%)` : ""}`}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">{row.motivo ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              )}
            </div>

            <SectionTitle>Evolução no período</SectionTitle>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 px-2 py-1.5 sm:px-3 mb-4 min-w-0">
              <div className="flex justify-end gap-1 mb-1">
                {(["kg", "custo"] as const).map(m => (
                  <button key={m} type="button" onClick={() => setModoGrafico(m)} className={cn("px-2.5 min-h-8 rounded-full text-[11px] font-semibold border", modoGrafico === m ? "border-[#1BC5BD]" : "border-gray-200 text-gray-500")}>
                    {m === "kg" ? "Quantidade" : "Custo"}
                  </button>
                ))}
              </div>
              {serie.length === 0 ? (
                <p className="py-3 text-center text-[12px] text-gray-400">Nenhum fornecimento confirmado no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={isMobile ? ALTURA_GRAFICO_MOBILE_PX : ALTURA_GRAFICO_DESKTOP_PX}>
                  <BarChart data={serie} margin={{ top: 10, right: 8, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: isMobile ? 9 : 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis width={LARGURA_EIXO_Y_PX} tick={<EixoYTick modo={modoGrafico} />} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as { label: string; kg: number; custoConhecido: number; custoIncompleto: boolean };
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm text-[12px]">
                            <p className="font-semibold">{row.label}</p>
                            <p>{row.kg.toLocaleString("pt-BR")} kg oferecidos</p>
                            <p>{formatarMoedaIndicador(row.custoConhecido)}{row.custoIncompleto ? " · custo incompleto" : ""}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="valor" fill={modoGrafico === "kg" ? COR_QTD : COR_CUSTO} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <SectionTitle>Consumo aparente</SectionTitle>
            <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
              <div className="px-3 py-2 text-[12px] text-gray-600 border-b border-gray-50">
                {data.consumo.rotulo}: {formatarIndicadorNumero(data.consumo.totalAparenteKg, { sufixo: "kg" })}
                {" · "}{data.consumo.coberturaTexto} {data.consumo.aviso}
              </div>
              {data.consumo.linhas.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">Nenhuma leitura ativa no período.</p>
              ) : (
                <TableHorizontalScroll>
                  <table className="w-full min-w-[900px] text-[11px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Cocho", "Lote", "Ciclo", "Fornecido", "Sobra inicial", "Sobra final", "Consumo aparente", "kg/cab", "kg/cab/dia"].map(h => (
                          <th key={h} className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.consumo.linhas.map(row => (
                        <tr key={row.leituraId} className="border-t">
                          <td className="px-3 py-2 text-center">
                            <button type="button" className="underline" onClick={() => setLocation(`/nutricao/cochos/leituras/${row.leituraId}`)}>{row.cochoNome}</button>
                          </td>
                          <td className="px-3 py-2 text-center">{row.loteNome ?? "—"}</td>
                          <td className="px-3 py-2 text-center">{row.intervaloLabel ?? "—"}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.fornecidoKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.sobraInicialKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.sobraFinalKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{row.calculavel ? formatarIndicadorNumero(row.consumoAparenteKg, { sufixo: "kg" }) : "—"}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.kgPorCabeca, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.kgPorCabecaDia, { sufixo: "kg" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              )}
            </div>

            <SectionTitle>Estoque e autonomia</SectionTitle>
            <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
              {data.estoqueAutonomia.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">Sem necessidade quantitativa vigente para projetar autonomia.</p>
              ) : (
                <TableHorizontalScroll>
                  <table className="w-full min-w-[700px] text-[11px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Produto", "Saldo atual", "Necessidade/dia", "Autonomia", "Situação"].map(h => (
                          <th key={h} className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.estoqueAutonomia.map(row => (
                        <tr key={row.produtoId} className="border-t">
                          <td className="px-3 py-2 text-center">{row.produtoNome}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.saldoKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.necessidadeKgDia, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.autonomiaDias, { sufixo: "dias" })}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{row.motivo ?? (row.calculavel ? "Projeção" : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              )}
            </div>

            <SectionTitle>Lotes</SectionTitle>
            <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
              {data.lotes.length === 0 ? (
                <p className="px-3 py-4 text-[12px] text-gray-400">Nenhum lote com fornecimento confirmado no período.</p>
              ) : (
                <TableHorizontalScroll>
                  <table className="w-full min-w-[900px] text-[11px]">
                    <thead className="bg-gray-50">
                      <tr>
                        {["Lote", "Animais", "Fonte atual", "Meta", "Fornecido", "Fornecido/cab/dia", "Custo", "Custo/cab/dia", "Consumo aparente"].map(h => (
                          <th key={h} className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.lotes.map(row => (
                        <tr key={row.loteId} className="border-t">
                          <td className="px-3 py-2 text-center">{row.loteNome}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.animais, { inteiro: true })}</td>
                          <td className="px-3 py-2 text-center">{row.fontes.length ? row.fontes.join(" · ") : "—"}</td>
                          <td className="px-3 py-2 text-center">{row.meta}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.fornecidoKg, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.fornecidoCabDia, { sufixo: "kg" })}</td>
                          <td className="px-3 py-2 text-center">{row.custoIncompleto ? "Custo incompleto" : formatarMoedaIndicador(row.custo)}</td>
                          <td className="px-3 py-2 text-center">{formatarMoedaIndicador(row.custoCabDia)}</td>
                          <td className="px-3 py-2 text-center">{formatarIndicadorNumero(row.consumoAparenteKg, { sufixo: "kg" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              )}
            </div>

            {data.batidasSaldo.length > 0 && (
              <>
                <SectionTitle>Batidas com saldo</SectionTitle>
                <div className="bg-white rounded-lg border border-gray-100 mb-4 overflow-hidden">
                  <TableHorizontalScroll>
                    <table className="w-full min-w-[640px] text-[11px]">
                      <thead className="bg-gray-50">
                        <tr>
                          {["Dieta", "Data", "Preparada", "Distribuída", "Saldo"].map(h => (
                            <th key={h} className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.batidasSaldo.map(b => (
                          <tr key={b.id} className="border-t">
                            <td className="px-3 py-2 text-center">
                              <button type="button" className="underline" onClick={() => setLocation(`/nutricao/batidas/${b.id}`)}>{b.dietaNome}</button>
                            </td>
                            <td className="px-3 py-2 text-center">{formatarDataCivilBR(b.data)}</td>
                            <td className="px-3 py-2 text-center">{b.preparadaKg.toLocaleString("pt-BR")} kg</td>
                            <td className="px-3 py-2 text-center">{b.distribuidaKg.toLocaleString("pt-BR")} kg</td>
                            <td className="px-3 py-2 text-center">{b.saldoKg.toLocaleString("pt-BR")} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableHorizontalScroll>
                  <p className="px-3 py-2 text-[11px] text-gray-500">Saldo da batida é preparação ainda não distribuída. Não é estoque da fazenda.</p>
                </div>
              </>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 min-w-0">
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden min-w-0">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[13px] font-medium text-gray-800">Fornecimentos recentes</h3>
                  <button type="button" className="text-[12px] text-gray-500 underline" onClick={() => setLocation(`/nutricao/fornecimentos?fazendaId=${fazendaId}`)}>Ver todos</button>
                </div>
                {data.recentesForns.length === 0 ? (
                  <p className="p-4 text-center text-[12px] text-gray-400">Nenhum fornecimento no período.</p>
                ) : (
                  data.recentesForns.map(f => (
                    <button key={f.id} type="button" className="w-full text-left px-3 py-2.5 border-t border-gray-50 first:border-t-0" onClick={() => setLocation(`/nutricao/fornecimentos/${f.id}`)}>
                      <p className="text-[11px] text-gray-500">{formatarDataHoraFornecimento(f.data, f.hora)} · {f.loteNome}</p>
                      <p className="text-[13px] text-gray-800">{f.origemNome} · {f.origemOperacional}{f.cochoNome ? ` · ${f.cochoNome}` : ""}</p>
                      <p className="text-[12px] font-semibold tabular-nums">{f.quantidadeKg.toLocaleString("pt-BR")} kg · {f.custoIncompleto ? "Custo incompleto" : formatarMoedaIndicador(f.custo)}</p>
                    </button>
                  ))
                )}
              </div>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden min-w-0">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-[13px] font-medium text-gray-800">Leituras recentes</h3>
                  <button type="button" className="text-[12px] text-gray-500 underline" onClick={() => setLocation(`/nutricao/cochos/leituras?fazendaId=${fazendaId}`)}>Ver todas</button>
                </div>
                {data.recentesLeituras.length === 0 ? (
                  <p className="p-4 text-center text-[12px] text-gray-400">Nenhuma leitura no período.</p>
                ) : (
                  data.recentesLeituras.map(l => (
                    <button key={l.id} type="button" className="w-full text-left px-3 py-2.5 border-t border-gray-50 first:border-t-0" onClick={() => setLocation(`/nutricao/cochos/leituras/${l.id}`)}>
                      <p className="text-[11px] text-gray-500">{formatarDataHoraFornecimento(l.data, l.hora)} · {l.cochoNome}</p>
                      <p className="text-[13px] text-gray-800">{l.loteNome ?? "Sem lote"} · Sobra {formatarIndicadorNumero(l.sobraKg, { sufixo: "kg" })} · Escore {l.escore || "—"}</p>
                      <p className="text-[12px] font-semibold">Consumo aparente {formatarIndicadorNumero(l.consumoAparenteKg, { sufixo: "kg" })}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
