import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import {
  destinoVoltarNutricaoDetalhe,
  NUTRICAO_LEITURAS_PATH,
  retornoNutricaoDaQuery,
} from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatarConsumoAparentePorCabeca, formatarDataHoraLeitura, labelStatusLeitura, rotuloConsumoAparenteBalanco, rotuloSobraInicialBalanco } from "@shared/nutricaoCochoLeituras";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";

export default function NutricaoCochoLeituraDetalhePage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const origem = retornoNutricaoDaQuery(useSearch());
  const id = Number(params.id);
  const { data, isLoading } = trpc.nutricaoCochoLeituras.get.useQuery({ id }, { enabled: id > 0 });
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const utils = trpc.useUtils();
  const cancelar = trpc.nutricaoCochoLeituras.cancelar.useMutation({
    onSuccess: () => {
      toast.success("Leitura cancelada. O ciclo deixa de usar este fechamento.");
      utils.nutricaoCochoLeituras.get.invalidate({ id });
      utils.nutricaoCochoLeituras.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const voltar = () =>
    setLocation(destinoVoltarNutricaoDetalhe({
      retorno: origem,
      listaPath: NUTRICAO_LEITURAS_PATH,
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
          {isLoading ? "Carregando..." : "Leitura não encontrada."}
        </div>
      </AppLayout>
    );
  }

  const fazendaNome = fazendas.find(f => f.id === data.fazendaId)?.nome ?? "—";
  const consumo = data.consumo;

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
              Detalhe da Leitura
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {formatarDataHoraLeitura(data.data, data.hora)} · {fazendaNome} · {data.cochoNomeSnapshot}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase",
              data.status === "ativa" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
            )}>
              {labelStatusLeitura(data.status)}
            </span>
          </div>
        </div>

        <div className="px-4 py-5 space-y-6 text-[13px]">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Leitura</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div><div className="text-[10px] uppercase text-gray-500">Cocho</div><div className="font-medium">{data.cochoNomeSnapshot}</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Lote</div><div className="font-medium">{data.loteNomeSnapshot ?? "—"}</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Sobra</div><div className="font-medium">{data.sobraKg != null ? `${Number(data.sobraKg).toLocaleString("pt-BR")} kg` : "—"}</div></div>
              <div><div className="text-[10px] uppercase text-gray-500">Escore</div><div className="font-medium">{data.escore || "—"}</div></div>
            </div>
            {data.observacoes && <p className="text-[12px] text-gray-600 mt-2">Obs.: {data.observacoes}</p>}
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Balanço</h2>
            {consumo.calculavel ? (
              <div className="bg-gray-50 rounded px-3 py-3 space-y-1">
                <p>Sobra inicial: <strong>{rotuloSobraInicialBalanco(consumo.sobraInicialKg)}</strong></p>
                <p>{consumo.sobraInicialKg != null ? "+ Fornecido no período" : "Fornecido"}: <strong>{consumo.fornecidoKg?.toLocaleString("pt-BR")} kg</strong></p>
                <p>{consumo.sobraInicialKg != null ? "− Sobra final" : "Sobra final"}: <strong>{consumo.sobraFinalKg?.toLocaleString("pt-BR")} kg</strong></p>
                <p>{consumo.sobraInicialKg != null ? "= " : ""}{rotuloConsumoAparenteBalanco(consumo.sobraInicialKg)}: <strong>{consumo.consumoAparenteKg?.toLocaleString("pt-BR")} kg</strong></p>
                {consumo.formula && <p className="text-[12px] text-gray-500">{consumo.formula}</p>}
                {consumo.intervaloLabel && <p className="text-[12px] text-gray-500">Intervalo: {consumo.intervaloLabel}</p>}
                <p className="text-[12px] text-gray-500">
                  Consumo aparente/cabeça: {formatarConsumoAparentePorCabeca(consumo.kgPorCabeca)}
                  {" · "}kg/cabeça/dia: {consumo.kgPorCabecaDia != null ? `${consumo.kgPorCabecaDia.toLocaleString("pt-BR")} kg` : "—"}
                </p>
                <p className="text-[11px] text-gray-500">Consumo aparente derivado dos fatos. Não é consumo real e não é despesa nova.</p>
              </div>
            ) : (
              <p className="text-gray-700">Consumo aparente indisponível: {consumo.motivo}</p>
            )}
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Rastreabilidade</h2>
            {data.fornecimento ? (
              <p>
                Fornecimento{" "}
                <button type="button" className="underline" onClick={() => setLocation(`/nutricao/fornecimentos/${data.fornecimento!.id}`)}>
                  {data.fornecimento.id}
                </button>
                {" · "}{formatarDataHoraFornecimento(data.fornecimento.data, data.fornecimento.hora)}
                {" · "}{data.fornecimento.origemNomeSnapshot}
                {" · "}{data.fornecimento.quantidadeFornecidaKg.toLocaleString("pt-BR")} kg
                {data.fornecimento.batidaId ? (
                  <>
                    {" · "}Batida{" "}
                    <button type="button" className="underline" onClick={() => setLocation(`/nutricao/batidas/${data.fornecimento!.batidaId}`)}>
                      {data.fornecimento.batidaId}
                    </button>
                  </>
                ) : null}
                {data.fornecimento.planejamentoId ? ` · Planejamento ${data.fornecimento.planejamentoId}` : ""}
              </p>
            ) : (
              <p className="text-gray-500">Leitura avulsa — sem fornecimento vinculado. Sem consumo aparente inventado.</p>
            )}
            {data.alimentoNomeSnapshot && <p className="text-[12px] text-gray-600 mt-1">Alimento: {data.alimentoNomeSnapshot}</p>}
          </section>

          {data.status === "ativa" && (
            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-gray-200"
                onClick={() => setLocation(`/nutricao/cochos/leituras/${data.id}/editar`)}
              >
                Corrigir leitura
              </button>
              <button
                type="button"
                disabled={cancelar.isPending}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold border border-amber-300 text-amber-900"
                onClick={() => cancelar.mutate({ id: data.id })}
              >
                {cancelar.isPending ? "Cancelando..." : "Cancelar leitura"}
              </button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
