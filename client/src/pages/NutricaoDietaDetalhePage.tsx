import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FD_PRIMARY } from "@/components/FormFields";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  formatarCustoEstimadoDieta,
  labelObjetivoDieta,
  labelTipoDieta,
} from "@shared/nutricaoDietas";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[13px] text-gray-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function NutricaoDietaDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.nutricaoDietas.get.useQuery(
    { id },
    { enabled: Number.isFinite(id) && id > 0 },
  );
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNome = fazendas.find(f => f.id === data?.fazendaId)?.nome ?? "—";

  const inativar = trpc.nutricaoDietas.inativar.useMutation({
    onSuccess: () => {
      toast.success("Dieta inativada.");
      utils.nutricaoDietas.get.invalidate({ id });
      utils.nutricaoDietas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const reativar = trpc.nutricaoDietas.reativar.useMutation({
    onSuccess: () => {
      toast.success("Dieta reativada.");
      utils.nutricaoDietas.get.invalidate({ id });
      utils.nutricaoDietas.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const vigencia = data
    ? [data.dataInicio, data.dataFim].filter(Boolean).length
      ? `${data.dataInicio ? data.dataInicio.split("-").reverse().join("/") : "—"} a ${data.dataFim ? data.dataFim.split("-").reverse().join("/") : "—"}`
      : "Sem vigência definida"
    : "—";

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              {data?.nome ?? "Dieta"}
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {fazendaNome}
              {data ? ` · ${data.status === "ativa" ? "Ativa" : "Inativa"}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLocation(data ? `/nutricao/dietas?fazendaId=${data.fazendaId}` : "/nutricao/dietas")}
              className="text-[12px] text-gray-600 underline"
            >
              Voltar
            </button>
            {data && (
              <>
                <button
                  type="button"
                  onClick={() => setLocation(`/nutricao/dietas/${data.id}/editar`)}
                  className="px-4 min-h-[40px] rounded-lg border border-gray-200 text-[12px] font-semibold"
                >
                  Editar
                </button>
                {data.status === "ativa" ? (
                  <button
                    type="button"
                    disabled={inativar.isPending}
                    onClick={() => inativar.mutate({ id: data.id })}
                    className="px-4 min-h-[40px] rounded-lg border border-amber-200 text-amber-800 text-[12px] font-semibold"
                  >
                    Inativar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={reativar.isPending}
                    onClick={() => reativar.mutate({ id: data.id })}
                    className="px-4 min-h-[40px] rounded-lg text-[12px] font-semibold text-gray-900"
                    style={{ backgroundColor: FD_PRIMARY }}
                  >
                    Reativar
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="px-4 py-10 text-center text-gray-400 text-[13px]">
            {isLoading ? "Carregando..." : "Dieta não encontrada."}
          </div>
        ) : (
          <div className="px-4 py-5 space-y-6">
            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Informações</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Info label="Tipo" value={labelTipoDieta(data.tipo)} />
                <Info label="Categoria" value={data.categoriaAnimal ?? "—"} />
                <Info label="Objetivo" value={labelObjetivoDieta(data.objetivo)} />
                <Info label="Vigência" value={vigencia} />
                <div className="sm:col-span-2">
                  <Info label="Descrição" value={data.descricao ?? "—"} />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Composição</h2>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full min-w-[680px] text-[12px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] uppercase text-gray-500">Ingrediente</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Quantidade</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">%</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Custo médio atual</th>
                      <th className="px-3 py-2 text-center text-[10px] uppercase text-gray-500">Custo estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingredientes.map(ing => (
                      <tr key={ing.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{ing.produtoNome}</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {Number(ing.quantidade).toLocaleString("pt-BR")} kg
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {ing.percentual != null ? `${ing.percentual.toLocaleString("pt-BR")}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {ing.custoConhecido
                            ? formatarCustoEstimadoDieta(ing.custoMedioPorKg, true)
                            : "Sem custo"}
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {ing.custoConhecido
                            ? formatarCustoEstimadoDieta(ing.custoEstimado, true)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] bg-gray-50 rounded px-3 py-3">
              <div>
                <div className="text-[10px] uppercase text-gray-500">Base</div>
                <div className="font-semibold tabular-nums">
                  {Number(data.baseQuantidade).toLocaleString("pt-BR")} {data.baseUnidade}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo estimado total</div>
                <div className={cn("font-semibold", !data.custo.completo && "text-amber-700")}>
                  {formatarCustoEstimadoDieta(data.custo.custoTotal, data.custo.completo)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-gray-500">Custo estimado/kg</div>
                <div className={cn("font-semibold", !data.custo.completo && "text-amber-700")}>
                  {formatarCustoEstimadoDieta(data.custo.custoPorKg, data.custo.completo)}
                </div>
              </div>
            </section>
            <p className="text-[11px] text-gray-500">
              Custo estimado conforme o custo médio vigente. Não representa custo histórico de fornecimento.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
