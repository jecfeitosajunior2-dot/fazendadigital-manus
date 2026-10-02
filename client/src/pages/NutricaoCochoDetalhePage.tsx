import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { FD_PRIMARY } from "@/components/FormFields";
import {
  comRetornoNutricao,
  destinoVoltarNutricaoDetalhe,
  NUTRICAO_COCHOS_PATH,
  retornoNutricaoDaQuery,
} from "@/lib/nutricaoRoutes";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatarDataHoraFornecimento } from "@shared/nutricaoFornecimentos";
import { formatarIdentificacaoCocho, labelTipoCocho, textoSecundarioPastoCochoDetalhe } from "@shared/nutricaoCochos";
import { formatarConsumoLista, formatarDataHoraLeitura } from "@shared/nutricaoCochoLeituras";

function LeiturasRecentesTabela({ cochoId }: { cochoId: number }) {
  const [, setLocation] = useLocation();
  const { data: leituras = [] } = trpc.nutricaoCochoLeituras.listPorCocho.useQuery({ cochoId }, { enabled: cochoId > 0 });
  if (leituras.length === 0) {
    return <p className="text-[12px] text-gray-500">Nenhuma leitura registrada neste cocho.</p>;
  }
  return (
    <div className="overflow-x-auto border border-gray-200 rounded">
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">Data/Hora</th>
            <th className="px-3 py-2 text-center">Lote</th>
            <th className="px-3 py-2 text-center">Sobra</th>
            <th className="px-3 py-2 text-center">Escore</th>
            <th className="px-3 py-2 text-center">Consumo aparente</th>
          </tr>
        </thead>
        <tbody>
          {leituras.map(l => (
            <tr key={l.id} className="border-t">
              <td className="px-3 py-1.5">
                <button type="button" className="underline" onClick={() => setLocation(comRetornoNutricao(`/nutricao/cochos/leituras/${l.id}`, `/nutricao/cochos/${cochoId}`))}>
                  {formatarDataHoraLeitura(l.data, l.hora)}
                </button>
              </td>
              <td className="px-3 py-1.5 text-center">{l.loteNomeSnapshot ?? "—"}</td>
              <td className="px-3 py-1.5 text-center">{l.sobraKg != null ? `${Number(l.sobraKg).toLocaleString("pt-BR")} kg` : "—"}</td>
              <td className="px-3 py-1.5 text-center">{l.escore || "—"}</td>
              <td className="px-3 py-1.5 text-center">{formatarConsumoLista(l.consumo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[13px] text-gray-800 mt-0.5">{value || "—"}</div>
    </div>
  );
}

export default function NutricaoCochoDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const origem = retornoNutricaoDaQuery(useSearch());
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.nutricaoCochos.get.useQuery({ id }, { enabled: id > 0 });
  const { data: fazendas = [] } = trpc.fazendas.list.useQuery();
  const fazendaNome = fazendas.find(f => f.id === data?.fazendaId)?.nome ?? "—";

  const inativar = trpc.nutricaoCochos.inativar.useMutation({
    onSuccess: () => { toast.success("Cocho inativado."); utils.nutricaoCochos.get.invalidate({ id }); utils.nutricaoCochos.list.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const reativar = trpc.nutricaoCochos.reativar.useMutation({
    onSuccess: () => { toast.success("Cocho reativado."); utils.nutricaoCochos.get.invalidate({ id }); utils.nutricaoCochos.list.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const voltar = () =>
    setLocation(destinoVoltarNutricaoDetalhe({
      retorno: origem,
      listaPath: NUTRICAO_COCHOS_PATH,
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
          {isLoading ? "Carregando..." : "Cocho não encontrado."}
        </div>
      </AppLayout>
    );
  }

  const ultimo = data.ultimoFornecimento;
  const pastoSecundario = textoSecundarioPastoCochoDetalhe(data.pastoNome, data.localizacaoDescricao);

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
              {formatarIdentificacaoCocho(data.nome, data.codigo)}
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">{fazendaNome} · {data.status === "ativo" ? "Ativo" : "Inativo"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="px-4 min-h-[40px] rounded-lg border border-gray-200 text-[12px] font-semibold" onClick={() => setLocation(`/nutricao/cochos/${data.id}/editar`)}>Editar</button>
            {data.status === "ativo" ? (
              <button type="button" disabled={inativar.isPending} onClick={() => inativar.mutate({ id: data.id })} className="px-4 min-h-[40px] rounded-lg border border-amber-200 text-amber-800 text-[12px] font-semibold">Inativar</button>
            ) : (
              <button type="button" disabled={reativar.isPending} onClick={() => reativar.mutate({ id: data.id })} className="px-4 min-h-[40px] rounded-lg text-[12px] font-semibold text-gray-900" style={{ backgroundColor: FD_PRIMARY }}>Reativar</button>
            )}
          </div>
        </div>

        <div className="px-4 py-5 space-y-6 text-[13px]">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Localização</h2>
            <div className="grid grid-cols-2 gap-3">
              <Info label="Pasto" value={data.pastoNome ?? "—"} />
              <Info label="Referência" value={data.localizacaoDescricao ?? "—"} />
            </div>
            {pastoSecundario && (
              <p className="text-[11px] text-gray-500 mt-2">{pastoSecundario}</p>
            )}
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Características</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Info label="Tipo" value={labelTipoCocho(data.tipo)} />
              <Info label="Comprimento" value={data.comprimentoMetros != null ? `${Number(data.comprimentoMetros).toLocaleString("pt-BR")} m` : "—"} />
              <Info label="Largura" value={data.larguraMetros != null ? `${Number(data.larguraMetros).toLocaleString("pt-BR")} m` : "—"} />
              <Info label="Capacidade" value={data.capacidadeKg != null ? `${Number(data.capacidadeKg).toLocaleString("pt-BR")} kg` : "—"} />
              <Info label="Lados de acesso" value={data.ladosAcesso != null ? String(data.ladosAcesso) : "—"} />
              <Info label="Coberto" value={data.coberto ? "Sim" : "Não"} />
            </div>
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Situação</h2>
            {ultimo ? (
              <p>
                Último fornecimento: <strong>{formatarDataHoraFornecimento(ultimo.data, ultimo.hora)}</strong>
                {" · "}{Number(ultimo.quantidadeFornecidaKg).toLocaleString("pt-BR")} kg
                {" · "}Último lote atendido: <strong>{ultimo.loteNome}</strong>
              </p>
            ) : (
              <p className="text-gray-500">Nenhum fornecimento vinculado a este cocho.</p>
            )}
          </section>

          {data.observacoes && <p className="text-[12px] text-gray-600">Obs.: {data.observacoes}</p>}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">Leituras recentes</h2>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-gray-900"
                style={{ backgroundColor: FD_PRIMARY }}
                onClick={() => setLocation(`/nutricao/cochos/leituras/nova?fazendaId=${data.fazendaId}&cochoId=${data.id}`)}
              >
                + Registrar leitura
              </button>
            </div>
            <LeiturasRecentesTabela cochoId={data.id} />
          </section>

          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Fornecimentos recentes</h2>
            {data.fornecimentos.length === 0 ? (
              <p className="text-[12px] text-gray-500">Nenhum fornecimento registrado neste cocho.</p>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-[12px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Data/Hora</th>
                      <th className="px-3 py-2 text-center">Lote</th>
                      <th className="px-3 py-2 text-center">Produto / Dieta</th>
                      <th className="px-3 py-2 text-center">Quantidade</th>
                      <th className="px-3 py-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fornecimentos.map(f => (
                      <tr key={f.id} className="border-t">
                        <td className="px-3 py-1.5">{formatarDataHoraFornecimento(f.data, f.hora)}</td>
                        <td className="px-3 py-1.5 text-center">{f.loteNome}</td>
                        <td className="px-3 py-1.5 text-center">{f.origemNomeSnapshot ?? "—"}</td>
                        <td className="px-3 py-1.5 text-center">{Number(f.quantidadeFornecidaKg).toLocaleString("pt-BR")} kg</td>
                        <td className="px-3 py-1.5 text-center">{f.status === "estornado" ? "Estornado" : "Confirmado"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
