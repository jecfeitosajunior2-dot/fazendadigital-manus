import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FD_PRIMARY } from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/date-utils";
import {
  formatarCustoProjetado,
  labelFrequenciaPlan,
  labelModalidadePlan,
  labelSituacaoPlan,
} from "@shared/nutricaoPlanejamento";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[13px] text-gray-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function NutricaoPlanejamentoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.nutricaoPlanejamento.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNome = fazendas.find(f => f.id === data?.fazendaId)?.nome ?? "—";

  const encerrar = trpc.nutricaoPlanejamento.encerrar.useMutation({
    onSuccess: () => {
      toast.success("Planejamento encerrado.");
      utils.nutricaoPlanejamento.get.invalidate({ id });
      utils.nutricaoPlanejamento.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const cancelar = trpc.nutricaoPlanejamento.cancelar.useMutation({
    onSuccess: () => {
      toast.success("Planejamento cancelado.");
      utils.nutricaoPlanejamento.get.invalidate({ id });
      utils.nutricaoPlanejamento.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const p = data?.projecao;

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              {data?.loteNome ?? "Planejamento"}
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {fazendaNome}
              {data ? ` · ${labelSituacaoPlan(data.situacao)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocation(data ? `/nutricao/planejamento?fazendaId=${data.fazendaId}` : "/nutricao/planejamento")}
              className="text-[12px] text-gray-600 underline"
            >
              Voltar
            </button>
            {data?.status === "ativo" && (
              <>
                <button
                  type="button"
                  onClick={() => setLocation(`/nutricao/planejamento/${data.id}/editar`)}
                  className="px-4 min-h-[40px] rounded-lg border border-gray-200 text-[12px] font-semibold"
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={encerrar.isPending}
                  onClick={() => encerrar.mutate({ id: data.id })}
                  className="px-4 min-h-[40px] rounded-lg border border-amber-200 text-amber-800 text-[12px] font-semibold"
                >
                  Encerrar
                </button>
                <button
                  type="button"
                  disabled={cancelar.isPending}
                  onClick={() => cancelar.mutate({ id: data.id })}
                  className="px-4 min-h-[40px] rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600"
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {isLoading || !data || !p ? (
          <div className="px-4 py-10 text-center text-gray-400 text-[13px]">
            {isLoading ? "Carregando..." : "Planejamento não encontrado."}
          </div>
        ) : (
          <div className="px-4 py-5 space-y-6">
            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Estratégia</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Info label={data.tipoOrigem === "dieta" ? "Dieta" : "Produto"} value={data.origemNome} />
                <Info label="Meta" value={data.metaLabel} />
                <Info label="Frequência" value={labelFrequenciaPlan(data.frequencia)} />
                <Info label="Tratos/dia" value={data.tratosPorDia != null ? String(data.tratosPorDia) : "—"} />
                <Info
                  label="Vigência"
                  value={`${formatDateBR(data.dataInicio)} — ${data.dataFim ? formatDateBR(data.dataFim) : "em aberto"}`}
                />
                <Info label="Modalidade" value={labelModalidadePlan(data.modalidadeMeta)} />
              </div>
              {data.observacoes && <Info label="Observações" value={data.observacoes} />}
            </section>

            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Situação atual</h2>
              {p.loteVazio && <p className="text-[12px] text-amber-800">{p.avisoLoteVazio}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] bg-gray-50 rounded px-3 py-3">
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Animais atuais</div>
                  <div className="font-semibold tabular-nums">{p.animaisAtuais}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Necessidade atual/dia</div>
                  <div className="font-semibold tabular-nums">
                    {p.necessidadeKgDia != null ? `${p.necessidadeKgDia.toLocaleString("pt-BR")} kg` : (p.mensagemNecessidade ?? "—")}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Necessidade/30 dias</div>
                  <div className="font-semibold tabular-nums">
                    {p.necessidadeKg30d != null ? `${p.necessidadeKg30d.toLocaleString("pt-BR")} kg` : "—"}
                  </div>
                </div>
              </div>
              {data.modalidadeMeta === "pct_pv_dia" && (
                <p className="text-[11px] text-gray-500">
                  Peso médio de referência: {p.peso.pesoMedioKg != null ? `${p.peso.pesoMedioKg.toLocaleString("pt-BR")} kg` : "indisponível"}
                  {" · "}{p.peso.coberturaTexto}
                  {p.peso.dataReferencia ? ` · até ${formatDateBR(p.peso.dataReferencia)}` : ""}
                  {p.peso.fonte ? ` · ${p.peso.fonte}` : ""}
                  {p.peso.avisoAtualidade ? ` · ${p.peso.avisoAtualidade}` : ""}
                </p>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Custo projetado</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[12px] bg-gray-50 rounded px-3 py-3">
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Custo vigente/kg</div>
                  <div className={cn("font-semibold", !p.custo.completo && "text-amber-700")}>
                    {formatarCustoProjetado(p.custo.custoMedioPorKg, p.custo.completo, p.custo.mensagem ?? "Custo não disponível")}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Custo/dia</div>
                  <div className="font-semibold">{formatarCustoProjetado(p.custo.custoDia, p.custo.completo, p.custo.mensagem ?? "Custo não disponível")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Custo/cabeça/dia</div>
                  <div className="font-semibold">{formatarCustoProjetado(p.custo.custoCabecaDia, p.custo.completo, p.custo.mensagem ?? "Custo não disponível")}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Custo/30 dias</div>
                  <div className="font-semibold">{formatarCustoProjetado(p.custo.custo30d, p.custo.completo, p.custo.mensagem ?? "Custo não disponível")}</div>
                </div>
              </div>
              <p className="text-[11px] text-gray-500">Estimativa com custo médio vigente. Não é despesa realizada.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Estoque / autonomia</h2>
              <div className="text-[13px] text-gray-800">
                {p.autonomiaProduto?.calculavel && (
                  <p>
                    Saldo: {p.autonomiaProduto.saldoKg?.toLocaleString("pt-BR")} kg
                    {" · "}Autonomia estimada: {p.autonomiaProduto.autonomiaDias?.toLocaleString("pt-BR")} dias
                  </p>
                )}
                {p.autonomiaDieta?.calculavel && (
                  <p>
                    Autonomia estimada da dieta: {p.autonomiaDieta.autonomiaDias?.toLocaleString("pt-BR")} dias
                    {p.autonomiaDieta.limitanteNome
                      ? ` · ingrediente limitante: ${p.autonomiaDieta.limitanteNome}`
                      : p.autonomiaDieta.limitanteProdutoId
                        ? ` · ingrediente limitante: produto #${p.autonomiaDieta.limitanteProdutoId}`
                        : ""}
                  </p>
                )}
                {!p.autonomiaProduto?.calculavel && !p.autonomiaDieta?.calculavel && (
                  <p className="text-gray-500">
                    {p.autonomiaProduto?.motivo || p.autonomiaDieta?.motivo || "Autonomia não calculável com os dados atuais."}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-gray-500">Consulta de estoque apenas para projeção. Nenhuma reserva ou baixa é feita aqui.</p>
            </section>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
