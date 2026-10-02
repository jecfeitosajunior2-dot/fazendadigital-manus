import { useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FD_PRIMARY, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import {
  destinoVoltarNutricaoDetalhe,
  NUTRICAO_BATIDAS_PATH,
  retornoNutricaoDaQuery,
} from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  formatarDataHoraBatida,
  labelMotivoEstornoBatida,
  labelSituacaoBatida,
  labelStatusBatida,
  NUTRICAO_BATIDA_MOTIVOS_ESTORNO,
} from "@shared/nutricaoBatidas";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";

export default function NutricaoBatidaDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const origem = retornoNutricaoDaQuery(useSearch());
  const id = Number(params.id);
  const { data, isLoading } = trpc.nutricaoBatidas.get.useQuery({ id }, { enabled: id > 0 });
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [abrirEstorno, setAbrirEstorno] = useState(false);

  const estornar = trpc.nutricaoBatidas.estornar.useMutation({
    onSuccess: () => {
      toast.success("Batida estornada. Ingredientes devolvidos ao estoque.");
      utils.nutricaoBatidas.get.invalidate({ id });
      utils.nutricaoBatidas.list.invalidate();
      setAbrirEstorno(false);
    },
    onError: e => toast.error(e.message),
  });

  const voltar = () =>
    setLocation(destinoVoltarNutricaoDetalhe({
      retorno: origem,
      listaPath: NUTRICAO_BATIDAS_PATH,
      fazendaId: data?.fazendaId,
    }));

  if (isLoading || !data) {
    return (
      <AppLayout>
        <button
          type="button"
          onClick={voltar}
          className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
          aria-label="Voltar"
        >
          <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
            arrow_back
          </span>
          <span className="text-[13px]">Voltar</span>
        </button>
        <div className="bg-white rounded border border-gray-200 p-8 text-center text-gray-400">
          {isLoading ? "Carregando..." : "Batida não encontrada."}
        </div>
      </AppLayout>
    );
  }

  const fazendaNome = fazendas.find(f => f.id === data.fazendaId)?.nome ?? "—";

  return (
    <AppLayout>
      <button
        type="button"
        onClick={voltar}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">
          arrow_back
        </span>
        <span className="text-[13px]">Voltar</span>
      </button>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              Detalhe da Batida
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {formatarDataHoraBatida(data.data, data.hora)} · {fazendaNome} · {data.dietaNomeSnapshot}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
              data.status === "confirmado" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
            )}>
              {labelStatusBatida(data.status)}
            </span>
          </div>
        </div>

        <div className="px-4 py-5 space-y-6 text-[13px]">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Resumo</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div><div className="text-[10px] uppercase text-gray-500">Preparada</div><div className="font-medium">{data.quantidadePreparadaKgNum.toLocaleString("pt-BR")} kg</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Distribuída</div><div className="font-medium">{data.quantidadeDistribuidaKg.toLocaleString("pt-BR")} kg</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Saldo disponível</div><div className="font-medium">{data.saldoDisponivelKg.toLocaleString("pt-BR")} kg</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Custo total</div><div className="font-medium">{data.custoCompleto && data.custoTotalSnapshot != null ? Number(data.custoTotalSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Custo/kg</div><div className="font-medium">{data.custoCompleto && data.custoKgSnapshot != null ? Number(data.custoKgSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</div></div>
            </div>
            <p className="text-[12px] text-gray-500 mt-2">Situação: {labelSituacaoBatida(data.situacao)}. Esta batida não tem lote nem cocho fixos.</p>
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Composição utilizada</h2>
            <p className="text-[11px] text-gray-500 mb-2">Snapshot do momento da confirmação. Mudanças posteriores da dieta não alteram esta batida.</p>
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Ingrediente</th>
                    <th className="px-3 py-2 text-center">Proporção</th>
                    <th className="px-3 py-2 text-center">Quantidade</th>
                    <th className="px-3 py-2 text-center">Custo unitário</th>
                    <th className="px-3 py-2 text-center">Custo total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ingredientes.map((i, idx) => (
                    <tr key={`${i.produtoId}-${i.ordem}-${idx}`} className="border-t">
                      <td className="px-3 py-1.5">{i.produtoNomeSnapshot}</td>
                      <td className="px-3 py-1.5 text-center">{i.proporcaoSnapshot != null ? `${(Number(i.proporcaoSnapshot) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—"}</td>
                      <td className="px-3 py-1.5 text-center">{Number(i.quantidadeKg).toLocaleString("pt-BR")} kg</td>
                      <td className="px-3 py-1.5 text-center">{i.custoConhecido && i.custoUnitarioSnapshot != null ? Number(i.custoUnitarioSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                      <td className="px-3 py-1.5 text-center">{i.custoConhecido && i.custoTotalSnapshot != null ? Number(i.custoTotalSnapshot).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Custo incompleto"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Estoque</h2>
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

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Distribuições</h2>
              {data.disponivelDistribuicao && (
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-[12px] font-semibold text-gray-900"
                  style={{ backgroundColor: FD_PRIMARY }}
                  onClick={() => setLocation(`/nutricao/fornecimentos/novo?fazendaId=${data.fazendaId}&batidaId=${data.id}`)}
                >
                  Distribuir / Registrar fornecimento
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">Distribuição é Fornecimento. Custo aqui é alocado ao lote, não é nova despesa.</p>
            <div className="overflow-x-auto border border-gray-200 rounded">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Data/Hora</th>
                    <th className="px-3 py-2 text-center">Lote</th>
                    <th className="px-3 py-2 text-center">Cocho</th>
                    <th className="px-3 py-2 text-center">Quantidade</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fornecimentos.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">Nenhuma distribuição registrada.</td></tr>
                  )}
                  {data.fornecimentos.map(f => (
                    <tr key={f.id} className="border-t">
                      <td className="px-3 py-1.5">
                        <button type="button" className="underline text-gray-700" onClick={() => setLocation(`/nutricao/fornecimentos/${f.id}`)}>
                          {formatarDataHoraFornecimento(f.data, f.hora)}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-center">{f.loteNome ?? `Lote ${f.loteId}`}</td>
                      <td className="px-3 py-1.5 text-center">{f.cochoNomeSnapshot ?? "—"}</td>
                      <td className="px-3 py-1.5 text-center">{Number(f.quantidadeFornecidaKg).toLocaleString("pt-BR")} kg</td>
                      <td className="px-3 py-1.5 text-center">{f.status === "confirmado" ? "Confirmado" : "Estornado"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.observacoes && <p className="text-[12px] text-gray-600">Obs.: {data.observacoes}</p>}

          {data.status === "estornado" && (
            <p className="text-[12px] text-amber-800">
              Estornada. Motivo: {labelMotivoEstornoBatida(data.motivoEstorno)}
              {data.observacaoEstorno ? ` · ${data.observacaoEstorno}` : ""}
            </p>
          )}

          {data.status === "confirmado" && data.podeEstornar && (
            <section className="border-t border-gray-100 pt-4">
              {!abrirEstorno ? (
                <button type="button" className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-amber-300 text-amber-900" onClick={() => setAbrirEstorno(true)}>
                  Estornar Batida
                </button>
              ) : (
                <div className="space-y-3 max-w-lg">
                  <p className="text-[12px] text-gray-600">O estorno devolve exatamente as saídas desta batida. Não apaga o histórico.</p>
                  <div>
                    <FormLabel required>Motivo</FormLabel>
                    <FormSelect variant="light" required placeholder="Selecione" value={motivo || "__empty__"} onChange={v => setMotivo(v === "__empty__" ? "" : v)}>
                      <SelectItem value="__empty__" className="text-[12px] text-gray-400">Selecione</SelectItem>
                      {NUTRICAO_BATIDA_MOTIVOS_ESTORNO.map(m => (
                        <SelectItem key={m.value} value={m.value} className="text-[12px]">{m.label}</SelectItem>
                      ))}
                    </FormSelect>
                  </div>
                  <div>
                    <FormLabel>Observação</FormLabel>
                    <FormTextarea variant="light" value={obs} onChange={setObs} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="px-4 py-2 rounded-lg text-[12px] bg-gray-100" onClick={() => setAbrirEstorno(false)}>Cancelar</button>
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

          {data.status === "confirmado" && !data.podeEstornar && (
            <p className="text-[12px] text-amber-800">Não é possível estornar esta batida porque há fornecimentos confirmados vinculados.</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
