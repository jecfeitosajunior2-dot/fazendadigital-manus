import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FD_PRIMARY, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  NUTRICAO_FORN_MOTIVOS_ESTORNO,
  formatarDataHoraFornecimento,
  formatarOferecidoPorCabeca,
  labelMotivoEstornoForn,
  rotuloVinculoPlanejamentoForn,
} from "@shared/nutricaoFornecimentos";

export default function NutricaoFornecimentoDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const { data, isLoading } = trpc.nutricaoFornecimentos.get.useQuery({ id }, { enabled: id > 0 });
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [abrirEstorno, setAbrirEstorno] = useState(false);

  const estornar = trpc.nutricaoFornecimentos.estornar.useMutation({
    onSuccess: () => {
      toast.success("Fornecimento estornado. Estoque revertido.");
      utils.nutricaoFornecimentos.get.invalidate({ id });
      utils.nutricaoFornecimentos.list.invalidate();
      setAbrirEstorno(false);
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <AppLayout>
        <div className="bg-white rounded border border-gray-200 p-8 text-center text-gray-400">
          {isLoading ? "Carregando..." : "Fornecimento não encontrado."}
        </div>
      </AppLayout>
    );
  }

  const fazendaNome = fazendas.find(f => f.id === data.fazendaId)?.nome ?? "—";
  const oferecidoCabecaTexto = formatarOferecidoPorCabeca({
    quantidadeKg: Number(data.quantidadeFornecidaKg),
    populacao: data.populacaoSnapshot,
    planejamentoId: data.planejamentoId,
    modalidadeSnapshot: data.planejamentoModalidadeSnapshot,
  });
  const diferencaKg = data.planejamentoNecessidadeKgSnapshot != null
    ? Number(data.quantidadeFornecidaKg) - Number(data.planejamentoNecessidadeKgSnapshot)
    : null;

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              Detalhe do Fornecimento
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {formatarDataHoraFornecimento(data.data, data.hora)} · {fazendaNome} · {data.loteNome}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
              data.status === "confirmado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
            )}>
              {data.status === "confirmado" ? "Confirmado" : "Estornado"}
            </span>
            {data.cochoId ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-gray-900"
                style={{ backgroundColor: FD_PRIMARY }}
                onClick={() => setLocation(`/nutricao/cochos/leituras/nova?fazendaId=${data.fazendaId}&cochoId=${data.cochoId}&loteId=${data.loteId}&fornecimentoId=${data.id}`)}
              >
                Registrar leitura do cocho
              </button>
            ) : null}
            <button
              type="button"
              className="text-[12px] text-gray-600 underline"
              onClick={() => setLocation(`/nutricao/fornecimentos?fazendaId=${data.fazendaId}`)}
            >
              Voltar
            </button>
          </div>
        </div>

        <div className="px-4 py-5 space-y-6 text-[13px]">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Alimentação</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] uppercase text-gray-500">{data.tipoOrigem === "dieta" ? "Dieta" : "Produto"}</div>
                <div className="font-medium">{data.origemNomeSnapshot}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Quantidade fornecida</div>
                <div className="font-medium">{Number(data.quantidadeFornecidaKg).toLocaleString("pt-BR")} kg</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Origem operacional</div>
                <div className="font-medium">{data.origemOperacional === "batida" ? `Batida${data.batidaId ? ` ${data.batidaId}` : ""}` : "Direto"}</div>
              </div>
              {data.cochoNomeSnapshot && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500">Cocho</div>
                  <div className="font-medium">{data.cochoNomeSnapshot}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo histórico</div>
                <div className="font-medium">
                  {data.custoCompleto && data.custoTotalSnapshot != null
                    ? Number(data.custoTotalSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                    : "Custo incompleto"}
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">População</h2>
            {data.populacaoSnapshot > 0 ? (
              <p>
                Animais no momento: <strong>{data.populacaoSnapshot}</strong>
                {" · "}Oferecido/cabeça:{" "}
                <strong>{oferecidoCabecaTexto}</strong>
              </p>
            ) : (
              <p className="text-amber-800">Sem animais ativos no lote no momento do fornecimento. Quantidade/cabeça: —</p>
            )}
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Planejamento</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
                  Number(data.planejamentoId) > 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-gray-100 text-gray-500",
                )}
              >
                {rotuloVinculoPlanejamentoForn(data.planejamentoId)}
              </span>
              {Number(data.planejamentoId) > 0 ? (
                <button
                  type="button"
                  className="text-[12px] text-gray-600 underline"
                  onClick={() => setLocation(`/nutricao/planejamento/${data.planejamentoId}`)}
                >
                  Ver planejamento
                </button>
              ) : null}
            </div>
            {Number(data.planejamentoId) > 0 ? (
              <p className="text-gray-700 mt-2">
                {data.loteNome}
                {data.planejamentoMetaSnapshot ? ` · ${data.planejamentoMetaSnapshot}` : ""}
                {data.planejamentoModalidadeSnapshot === "ad_libitum"
                  ? " · Ad libitum — sem desvio de meta. Quantidade registrada como oferecida."
                  : ` · Necessidade projetada: ${
                    data.planejamentoNecessidadeKgSnapshot != null
                      ? `${Number(data.planejamentoNecessidadeKgSnapshot).toLocaleString("pt-BR")} kg`
                      : "—"
                  } · Diferença: ${
                    diferencaKg != null
                      ? `${diferencaKg > 0 ? "+" : ""}${diferencaKg.toLocaleString("pt-BR")} kg (informativa)`
                      : "—"
                  }`}
              </p>
            ) : null}
          </section>

          {data.custoPorKgSnapshot != null && data.custoCompleto && (
            <p className="text-[12px] text-gray-600">
              Custo/kg snapshot: {Number(data.custoPorKgSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          )}

          {data.origemOperacional === "batida" && data.batidaId && (
            <p className="text-[12px] text-gray-600">
              Custo alocado da Batida {data.batidaId} — não é nova despesa nem nova baixa.
              {" "}
              <button type="button" className="underline" onClick={() => setLocation(`/nutricao/batidas/${data.batidaId}`)}>Ver batida</button>
            </p>
          )}

          {data.tipoOrigem === "dieta" && data.origemOperacional !== "batida" && (
            <section>
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Composição utilizada (snapshot)
              </h2>
              <p className="text-[11px] text-gray-500 mb-2">
                Esta composição é a do momento da confirmação. Alterações posteriores da dieta não mudam este evento.
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Ingrediente</th>
                      <th className="px-3 py-2 text-center">Quantidade</th>
                      <th className="px-3 py-2 text-center">Proporção</th>
                      <th className="px-3 py-2 text-center">Custo unitário</th>
                      <th className="px-3 py-2 text-center">Custo total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingredientes.map((i, idx) => (
                      <tr key={`${i.produtoId}-${i.ordem}-${idx}`} className="border-t">
                        <td className="px-3 py-1.5">{i.produtoNomeSnapshot}</td>
                        <td className="px-3 py-1.5 text-center">
                          {Number(i.quantidadeKg).toLocaleString("pt-BR")} kg
                          {i.unidadeSnapshot && i.unidadeSnapshot !== "kg" && Number(i.quantidadeUnidade) > 0
                            ? ` · ${Number(i.quantidadeUnidade).toLocaleString("pt-BR")} ${i.unidadeSnapshot}`
                            : ""}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {i.proporcaoSnapshot != null
                            ? `${(Number(i.proporcaoSnapshot) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {i.custoConhecido && i.custoUnitarioSnapshot != null
                            ? Number(i.custoUnitarioSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {i.custoConhecido && i.custoTotalSnapshot != null
                            ? Number(i.custoTotalSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                            : "Custo incompleto"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Estoque</h2>
            {data.origemOperacional === "batida" && (
              <p className="text-[12px] text-gray-600 mb-2">Este fornecimento distribuiu a batida. Não gerou nova baixa de estoque.</p>
            )}
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-center">Quantidade</th>
                    <th className="px-3 py-2 text-center">Tipo</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimentacoes.map(m => (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-1.5">{m.produtoNome ?? `Estoque ${m.estoqueId}`}</td>
                      <td className="px-3 py-1.5 text-center">{Number(m.quantidade).toLocaleString("pt-BR")}</td>
                      <td className="px-3 py-1.5 text-center">{m.tipo}</td>
                      <td className="px-3 py-1.5 text-center">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.observacoes && <p className="text-[12px] text-gray-600">Obs.: {data.observacoes}</p>}

          {data.status === "estornado" && (
            <p className="text-[12px] text-amber-800">
              Estornado{data.estornadoEm ? ` em ${new Date(data.estornadoEm).toLocaleString("pt-BR")}` : ""}.
              Motivo: {labelMotivoEstornoForn(data.motivoEstorno)}
              {data.observacaoEstorno ? ` · ${data.observacaoEstorno}` : ""}
            </p>
          )}

          {data.status === "confirmado" && (
            <section className="border-t border-gray-100 pt-4">
              {!abrirEstorno ? (
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-amber-300 text-amber-900"
                  onClick={() => setAbrirEstorno(true)}
                >
                  Estornar fornecimento
                </button>
              ) : (
                <div className="space-y-3 max-w-lg">
                  <p className="text-[12px] text-gray-600">
                    {data.origemOperacional === "batida"
                      ? "O estorno devolve o saldo à batida. Não movimenta estoque."
                      : "O estorno devolve exatamente as saídas deste evento. Não apaga o histórico."}
                  </p>
                  <div>
                    <FormLabel required>Motivo</FormLabel>
                    <FormSelect
                      variant="light"
                      required
                      placeholder="Selecione"
                      value={motivo || "__empty__"}
                      onChange={v => setMotivo(v === "__empty__" ? "" : v)}
                    >
                      <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                      {NUTRICAO_FORN_MOTIVOS_ESTORNO.map(m => (
                        <SelectItem key={m.value} value={m.value} className="text-[12px]">{m.label}</SelectItem>
                      ))}
                    </FormSelect>
                  </div>
                  <div>
                    <FormLabel>Observação</FormLabel>
                    <FormTextarea variant="light" value={obs} onChange={setObs} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="px-4 py-2 rounded-lg text-[12px] bg-gray-100" onClick={() => setAbrirEstorno(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!motivo || estornar.isPending}
                      onClick={() => estornar.mutate({ id: data.id, motivo, observacao: obs || null })}
                      className="px-4 py-2 rounded-lg text-[12px] font-semibold text-gray-900 disabled:opacity-50"
                      style={{ backgroundColor: FD_PRIMARY }}
                    >
                      {estornar.isPending ? "Estornando..." : "Confirmar estorno"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
