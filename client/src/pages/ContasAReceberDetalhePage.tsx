import { useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { FD_PRIMARY, FormInput } from "@/components/FormFields";
import MobileCard from "@/components/MobileCard";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDateBR, formatDateInputLocal } from "@/lib/date-utils";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { MSG_FIN_PARCELAS_SOMA } from "@shared/financeiroNucleo";
import { fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  TEXTO_A_DEFINIR,
  contasAReceberVoltarPath,
  idTituloContasAReceber,
  nomeFazendaDaLinha,
  rotuloSituacaoLinhaReceber,
  tituloEstaCancelado,
  type TituloV2DetalheOficial,
} from "@/lib/contasAReceberListagem";
import { rotuloOrigemTitulo } from "@/lib/contasAPagarListagem";
import {
  MSG_ACESSO_NEGADO,
  MSG_HISTORICO_RECEBIMENTOS_CARREGANDO,
  MSG_HISTORICO_RECEBIMENTOS_ERRO,
  MSG_NAO_E_CONTA_A_RECEBER,
  MSG_NENHUM_RECEBIMENTO_REGISTRADO,
  MSG_PARCELAS_AINDA_NAO_DEFINIDAS,
  MSG_TITULO_NAO_ENCONTRADO,
  deveMostrarHistoricoVazio,
  detalheReceberVisivelParaUsuario,
  identificacaoTitulo,
  mensagemErroHistoricoRecebimentos,
  montarEventosHistoricoRecebimentos,
  resumoOficialContasAReceber,
  rotuloCondicaoPagamento,
  rotuloEstadoTitulo,
  rotuloSituacaoParcelaReceber,
  type EventoHistoricoPagamentoOficial,
  type EventoHistoricoRecebimentoExibicao,
} from "@/lib/contasAReceberDetalhe";
import {
  MSG_CONFIRMAR_PARCELAS,
  MSG_PARCELAS_ATUALIZADAS,
  MSG_PARCELAS_DEFINIDAS,
  ROTULO_DEFINIR_PARCELAS,
  ROTULO_EDITAR_PARCELAS,
  acaoCondicaoRecebimentoTitulo,
  aplicarModalidadeCondicao,
  aplicarQuantidadeParcelas,
  diferencaParcelasRascunho,
  mensagemErroDefinirParcelasReceber,
  rascunhoInicialDaCondicao,
  textoConfirmacaoParcelasReceber,
  validarCondicaoRecebimento,
  type ErrosCondicaoPagamento,
  type RascunhoCondicaoPagamento,
} from "@/lib/contasAReceberCondicao";

function formatarValorOficial(valor: string | number | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

function classeSituacao(texto: string): string {
  if (
    texto === "Cancelado"
    || texto === "Recebimento estornado"
    || texto === "Estorno de recebimento"
  ) {
    return "bg-gray-100 text-gray-500";
  }
  if (texto === "Liquidado" || texto === "Recebida" || texto === "Recebimento") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (texto === "Vencido" || texto === "Vencida") return "bg-red-50 text-red-700";
  if (texto === "Parcial") return "bg-amber-50 text-amber-800";
  return "bg-sky-50 text-sky-800";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[13px] text-gray-800 mt-0.5 break-words">{value || "—"}</div>
    </div>
  );
}

function ResumoCard({ label, value, destaque }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className={cn("text-[16px] font-semibold tabular-nums", destaque ? "text-gray-900" : "text-gray-800")}>
        {value}
      </p>
    </div>
  );
}

export default function ContasAReceberDetalhePage() {
  const params = useParams<{ id: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const tituloId = idTituloContasAReceber(params.id);
  const hojeISO = formatDateInputLocal();
  const voltarPara = contasAReceberVoltarPath(search, hojeISO);
  const voltar = () => setLocation(voltarPara);
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const [formAberto, setFormAberto] = useState(false);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoCondicaoPagamento | null>(null);
  const [errosCondicao, setErrosCondicao] = useState<ErrosCondicaoPagamento>({});

  const consulta = trpc.financeiroV2.titulosGet.useQuery(
    { id: tituloId ?? 0 },
    { enabled: tituloId != null },
  );
  const historico = trpc.financeiroV2.tituloHistoricoPagamentos.useQuery(
    { tituloId: tituloId ?? 0 },
    { enabled: tituloId != null },
  );
  const fazendasQuery = trpc.fazendas.list.useQuery();
  const fazendas = fazendasQuery.data ?? [];
  const definirParcelas = trpc.financeiroV2.titulosDefinirParcelas.useMutation({
    onSuccess: async () => {
      toast.success(modoEdicao ? MSG_PARCELAS_ATUALIZADAS : MSG_PARCELAS_DEFINIDAS);
      setFormAberto(false);
      setRascunho(null);
      setErrosCondicao({});
      await Promise.all([
        utils.financeiroV2.titulosGet.invalidate(),
        utils.financeiroV2.titulosList.invalidate(),
      ]);
    },
    onError: erro => {
      toast.error(mensagemErroDefinirParcelasReceber(erro.data?.code, erro.message));
    },
  });

  if (tituloId == null) {
    return (
      <EstadoDetalhe
        titulo="Título não encontrado"
        mensagem={MSG_TITULO_NAO_ENCONTRADO}
        onVoltar={voltar}
      />
    );
  }

  if (consulta.isLoading) {
    return (
      <AppLayout>
        <BotaoVoltar onClick={voltar} />
        <p className="px-4 py-16 text-center text-[13px] text-gray-400">Carregando detalhes da conta a receber...</p>
      </AppLayout>
    );
  }

  if (consulta.error) {
    const codigo = consulta.error.data?.code;
    const acessoNegado = codigo === "FORBIDDEN";
    const naoEncontrado = codigo === "NOT_FOUND";
    const mensagem = acessoNegado
      ? MSG_ACESSO_NEGADO
      : naoEncontrado
        ? MSG_TITULO_NAO_ENCONTRADO
        : consulta.error.message || MSG_TITULO_NAO_ENCONTRADO;
    return (
      <EstadoDetalhe
        titulo={acessoNegado ? "Acesso negado" : naoEncontrado ? "Título não encontrado" : "Não foi possível abrir o título"}
        mensagem={mensagem}
        onVoltar={voltar}
      />
    );
  }

  const titulo = consulta.data as TituloV2DetalheOficial | undefined;
  if (!titulo) {
    return (
      <EstadoDetalhe titulo="Título não encontrado" mensagem={MSG_TITULO_NAO_ENCONTRADO} onVoltar={voltar} />
    );
  }

  const visivel = detalheReceberVisivelParaUsuario(titulo, user?.id);
  if (!visivel.ok) {
    return (
      <EstadoDetalhe
        titulo={visivel.motivo === "acesso" ? "Acesso negado" : "Conta a receber"}
        mensagem={visivel.motivo === "acesso" ? MSG_ACESSO_NEGADO : MSG_NAO_E_CONTA_A_RECEBER}
        onVoltar={voltar}
      />
    );
  }

  const resumo = resumoOficialContasAReceber(titulo);
  const parcelas = [...titulo.parcelas].sort((a, b) => a.numero - b.numero);
  const situacao = rotuloSituacaoLinhaReceber({ estado: titulo.estado, situacao: titulo.situacao });
  const textoRecebido = resumo.totalPago == null ? TEXTO_A_DEFINIR : formatarValorOficial(resumo.totalPago);
  const textoSaldo = tituloEstaCancelado(titulo)
    ? "Não pendente"
    : resumo.saldoAberto == null
      ? TEXTO_A_DEFINIR
      : formatarValorOficial(resumo.saldoAberto);
  const eventosHistorico = (historico.data?.eventos ?? []) as EventoHistoricoPagamentoOficial[];
  const acaoCondicao = acaoCondicaoRecebimentoTitulo(titulo, user?.id);

  const abrirCondicao = () => {
    if (acaoCondicao.tipo === "nenhuma" || definirParcelas.isPending) return;
    setModoEdicao(acaoCondicao.tipo === "editar");
    setRascunho(rascunhoInicialDaCondicao(titulo));
    setErrosCondicao({});
    setFormAberto(true);
  };

  const confirmarCondicao = async () => {
    if (!rascunho) return;
    const validado = validarCondicaoRecebimento({ titulo, userId: user?.id, rascunho });
    if (!validado.ok) {
      setErrosCondicao(validado.erros);
      return;
    }
    setErrosCondicao({});
    const ok = await confirm({
      title: MSG_CONFIRMAR_PARCELAS,
      description: (
        <span className="whitespace-pre-line">
          {textoConfirmacaoParcelasReceber({
            cliente: titulo.contraparteNomeSnapshot,
            descricao: titulo.descricao,
            valorOriginal: titulo.valorOriginal,
            parcelas: validado.payload.parcelas,
          })}
        </span>
      ),
      confirmText: modoEdicao ? ROTULO_EDITAR_PARCELAS : ROTULO_DEFINIR_PARCELAS,
      cancelText: "Voltar",
      variant: "success",
    });
    if (!ok) return;
    definirParcelas.mutate(validado.payload);
  };

  return (
    <AppLayout>
      <BotaoVoltar onClick={voltar} />
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Contas a Receber / Detalhes</p>
            <h1
              className="text-[20px] font-semibold text-gray-900 mt-0.5"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              {identificacaoTitulo(titulo)}
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {titulo.contraparteNomeSnapshot || "Cliente não informado"}
              {titulo.origemItemChave ? ` · ${titulo.origemItemChave}` : ""}
            </p>
          </div>
          <span className={cn("inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold", classeSituacao(situacao))}>
            {situacao}
          </span>
        </div>

        <section className="px-4 py-4 border-b border-gray-50">
          <h2 className="text-[13px] font-semibold text-[#4ECDC4] mb-3">Informações do título</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Info label="Cliente" value={titulo.contraparteNomeSnapshot || "—"} />
            <Info label="Descrição" value={titulo.descricao.trim() || "—"} />
            <Info label="Fazenda" value={nomeFazendaDaLinha(titulo.fazendaOrigemId, fazendas)} />
            <Info label="Origem" value={rotuloOrigemTitulo(titulo.origemTipo)} />
            <Info label="Valor original" value={formatarValorOficial(titulo.valorOriginal)} />
            <Info label="Data de emissão" value={formatDateBR(titulo.dataCompetencia)} />
            <Info label="Condição" value={rotuloCondicaoPagamento(titulo)} />
            <Info label="Estado do título" value={rotuloEstadoTitulo(titulo.estado)} />
          </div>
        </section>

        <section className="px-4 py-4 border-b border-gray-50">
          <h2 className="text-[13px] font-semibold text-[#4ECDC4] mb-3">Resumo financeiro</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ResumoCard label="Valor original" value={formatarValorOficial(resumo.valorOriginal)} />
            <ResumoCard label="Valor recebido" value={textoRecebido} />
            <ResumoCard label="Saldo a receber" value={textoSaldo} destaque />
            <ResumoCard label="Situação financeira" value={resumo.situacaoExibida} />
          </div>
        </section>

        <section className="px-4 py-4 border-b border-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-[13px] font-semibold text-[#4ECDC4]">Parcelas</h2>
            {acaoCondicao.tipo !== "nenhuma" ? (
              <button
                type="button"
                onClick={abrirCondicao}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-semibold text-white"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {acaoCondicao.tipo === "editar" ? ROTULO_EDITAR_PARCELAS : ROTULO_DEFINIR_PARCELAS}
              </button>
            ) : null}
          </div>
          {parcelas.length === 0 ? (
            <p className="text-[13px] text-gray-600">{MSG_PARCELAS_AINDA_NAO_DEFINIDAS}</p>
          ) : (
            <>
              <div className="lg:hidden space-y-3">
                {parcelas.map(parcela => {
                  const situacaoParcela = rotuloSituacaoParcelaReceber(parcela, titulo, hojeISO);
                  return (
                    <MobileCard
                      key={parcela.id}
                      title={`Parcela ${parcela.numero}`}
                      subtitle={formatDateBR(parcela.vencimento)}
                      badge={
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(situacaoParcela))}>
                          {situacaoParcela}
                        </span>
                      }
                      fields={[
                        { label: "Valor original", value: formatarValorOficial(parcela.valorOriginal), emphasis: true },
                        { label: "Valor recebido", value: formatarValorOficial(parcela.principalLiquidado) },
                        { label: "Saldo restante", value: formatarValorOficial(parcela.saldoPrincipal), emphasis: true },
                      ]}
                    />
                  );
                })}
              </div>
              <div className="hidden lg:block">
                <TableHorizontalScroll fitWidth>
                  <table className="w-full min-w-[820px] table-fixed text-[11px] border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Parcela", "Vencimento", "Valor original", "Valor recebido", "Saldo restante", "Situação"].map(col => (
                          <th
                            key={col}
                            className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map(parcela => {
                        const situacaoParcela = rotuloSituacaoParcelaReceber(parcela, titulo, hojeISO);
                        return (
                          <tr key={parcela.id} className="border-b border-gray-100">
                            <td className="px-3 py-2.5 text-gray-800">{parcela.numero}</td>
                            <td className="px-3 py-2.5 text-gray-700 tabular-nums">{formatDateBR(parcela.vencimento)}</td>
                            <td className="px-3 py-2.5 text-gray-800 tabular-nums">{formatarValorOficial(parcela.valorOriginal)}</td>
                            <td className="px-3 py-2.5 text-gray-700 tabular-nums">{formatarValorOficial(parcela.principalLiquidado)}</td>
                            <td className="px-3 py-2.5 text-gray-800 font-medium tabular-nums">{formatarValorOficial(parcela.saldoPrincipal)}</td>
                            <td className="px-3 py-2.5">
                              <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(situacaoParcela))}>
                                {situacaoParcela}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              </div>
            </>
          )}
        </section>

        <SecaoHistoricoRecebimentos
          carregando={historico.isLoading}
          erro={historico.error ? {
            codigo: historico.error.data?.code,
            mensagem: historico.error.message,
          } : null}
          eventos={eventosHistorico}
        />
      </div>

      <DialogCondicaoRecebimento
        aberto={formAberto}
        modoEdicao={modoEdicao}
        titulo={titulo}
        rascunho={rascunho}
        erros={errosCondicao}
        salvando={definirParcelas.isPending}
        onFechar={() => {
          if (definirParcelas.isPending) return;
          setFormAberto(false);
        }}
        onChange={setRascunho}
        onConfirmar={() => void confirmarCondicao()}
      />
    </AppLayout>
  );
}

function textoComponentesAlocacao(alocacao: EventoHistoricoRecebimentoExibicao["alocacoes"][number]): string {
  const partes = [`Principal ${formatarValorOficial(alocacao.principalLiquidado)}`];
  if (alocacao.mostrarComponentes) {
    if (Number(alocacao.desconto)) partes.push(`Desconto ${formatarValorOficial(alocacao.desconto)}`);
    if (Number(alocacao.juros)) partes.push(`Juros ${formatarValorOficial(alocacao.juros)}`);
    if (Number(alocacao.multa)) partes.push(`Multa ${formatarValorOficial(alocacao.multa)}`);
  }
  return partes.join(" · ");
}

function SecaoHistoricoRecebimentos({
  carregando,
  erro,
  eventos,
}: {
  carregando: boolean;
  erro: { codigo?: string; mensagem?: string } | null;
  eventos: EventoHistoricoPagamentoOficial[] | undefined;
}) {
  const oficiais = Array.isArray(eventos) ? eventos : [];
  const linhas = montarEventosHistoricoRecebimentos(oficiais);
  const vazio = deveMostrarHistoricoVazio({
    carregando,
    erro: erro != null,
    eventos,
  });
  const temTotalCompartilhado = linhas.some(linha => linha.mostrarTotalLiquidacao);
  const mensagemErro = erro
    ? mensagemErroHistoricoRecebimentos(erro.codigo, erro.mensagem)
    : MSG_HISTORICO_RECEBIMENTOS_ERRO;

  return (
    <section className="px-4 py-4 border-b border-gray-50">
      <h2 className="text-[13px] font-semibold text-[#4ECDC4] mb-3">Recebimentos</h2>
      {carregando ? (
        <p className="text-[13px] text-gray-400">{MSG_HISTORICO_RECEBIMENTOS_CARREGANDO}</p>
      ) : erro ? (
        <p className="text-[13px] text-gray-600">{mensagemErro}</p>
      ) : vazio ? (
        <p className="text-[13px] text-gray-600">{MSG_NENHUM_RECEBIMENTO_REGISTRADO}</p>
      ) : (
        <>
          <div className="lg:hidden space-y-3">
            {linhas.map(evento => (
              <MobileCard
                key={evento.liquidacaoId}
                title={formatDateBR(evento.dataLiquidacao)}
                subtitle={evento.contaNome}
                badge={
                  <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(evento.situacao))}>
                    {evento.situacao}
                  </span>
                }
                fields={[
                  {
                    label: "Neste título",
                    value: formatarValorOficial(evento.valorNesteTitulo),
                    emphasis: evento.efetivo,
                  },
                  ...(evento.mostrarTotalLiquidacao ? [{
                    label: "Total da liquidação",
                    value: formatarValorOficial(evento.valorMovimentado),
                  }] : []),
                  { label: "Parcela", value: evento.parcelasTexto },
                  ...evento.alocacoes
                    .filter(aloc => aloc.mostrarComponentes || evento.alocacoes.length > 1)
                    .map(aloc => ({
                      label: evento.alocacoes.length > 1 ? `Parcela ${aloc.parcelaNumero}` : "Composição",
                      value: textoComponentesAlocacao(aloc),
                    })),
                  ...(evento.referencia ? [{ label: "Referência", value: evento.referencia }] : []),
                ]}
              />
            ))}
          </div>
          <div className="hidden lg:block">
            <TableHorizontalScroll fitWidth>
              <table className="w-full min-w-[820px] table-fixed text-[11px] border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {[
                      "Data",
                      "Conta",
                      "Neste título",
                      ...(temTotalCompartilhado ? ["Total da liquidação"] : []),
                      "Parcela",
                      "Referência",
                      "Situação",
                    ].map(col => (
                      <th
                        key={col}
                        className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(evento => (
                    <tr
                      key={evento.liquidacaoId}
                      className={cn("border-b border-gray-100", !evento.efetivo && "text-gray-500")}
                    >
                      <td className="px-3 py-2.5 tabular-nums">{formatDateBR(evento.dataLiquidacao)}</td>
                      <td className="px-3 py-2.5">{evento.contaNome}</td>
                      <td className={cn("px-3 py-2.5 tabular-nums", evento.efetivo && "font-medium text-gray-800")}>
                        {formatarValorOficial(evento.valorNesteTitulo)}
                      </td>
                      {temTotalCompartilhado ? (
                        <td className="px-3 py-2.5 tabular-nums text-gray-600">
                          {evento.mostrarTotalLiquidacao ? formatarValorOficial(evento.valorMovimentado) : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <div>{evento.parcelasTexto}</div>
                        {evento.alocacoes.some(aloc => aloc.mostrarComponentes || evento.alocacoes.length > 1)
                          ? evento.alocacoes.map(aloc => (
                            <div key={`${evento.liquidacaoId}-${aloc.parcelaNumero}`} className="text-[10px] text-gray-500 mt-0.5">
                              {evento.alocacoes.length > 1 ? `Parcela ${aloc.parcelaNumero}: ` : ""}
                              {textoComponentesAlocacao(aloc)}
                            </div>
                          ))
                          : null}
                      </td>
                      <td className="px-3 py-2.5">{evento.referencia || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(evento.situacao))}>
                          {evento.situacao}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableHorizontalScroll>
          </div>
        </>
      )}
    </section>
  );
}

function DialogCondicaoRecebimento({
  aberto,
  modoEdicao,
  titulo,
  rascunho,
  erros,
  salvando,
  onFechar,
  onChange,
  onConfirmar,
}: {
  aberto: boolean;
  modoEdicao: boolean;
  titulo: TituloV2DetalheOficial;
  rascunho: RascunhoCondicaoPagamento | null;
  erros: ErrosCondicaoPagamento;
  salvando: boolean;
  onFechar: () => void;
  onChange: (rascunho: RascunhoCondicaoPagamento) => void;
  onConfirmar: () => void;
}) {
  const diferenca = rascunho
    ? diferencaParcelasRascunho(titulo.valorOriginal, rascunho.linhas)
    : { ok: false, originalCentavos: toCentavos(titulo.valorOriginal), somaCentavos: null, restanteCentavos: null };
  const somaBate = diferenca.ok && diferenca.restanteCentavos === 0;

  return (
    <Dialog open={aberto} onOpenChange={abertoAgora => { if (!abertoAgora) onFechar(); }}>
      <DialogContent className="max-w-lg bg-white p-0 gap-0 max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            {modoEdicao ? ROTULO_EDITAR_PARCELAS : ROTULO_DEFINIR_PARCELAS}
          </DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500 mt-1">
            {modoEdicao
              ? "As parcelas atuais serão substituídas. Só é possível alterar se ainda não houver recebimento efetivo."
              : "Informe o vencimento. O valor a receber vem do título. Isso não registra recebimento."}
          </DialogDescription>
        </div>
        {rascunho ? (
          <form
            className="px-4 py-4 space-y-4"
            onSubmit={evento => {
              evento.preventDefault();
              onConfirmar();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info label="Cliente" value={titulo.contraparteNomeSnapshot || "—"} />
              <Info label="Título" value={titulo.descricao.trim() || "—"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["unico", "parcelado"] as const).map(modalidade => {
                const ativa = rascunho.modalidade === modalidade;
                return (
                  <button
                    key={modalidade}
                    type="button"
                    className={cn(
                      "h-9 px-3 rounded-lg text-[12px] font-semibold border",
                      ativa ? "text-white border-transparent" : "text-gray-700 border-gray-200 bg-white",
                    )}
                    style={ativa ? { backgroundColor: FD_PRIMARY } : undefined}
                    onClick={() => onChange(aplicarModalidadeCondicao(rascunho, modalidade, titulo.valorOriginal))}
                  >
                    {modalidade === "unico" ? "Recebimento à vista" : "Recebimento parcelado"}
                  </button>
                );
              })}
            </div>

            <p className="text-[13px] text-gray-800">
              Valor a receber: <strong className="tabular-nums">{formatarValorOficial(titulo.valorOriginal)}</strong>
            </p>

            {rascunho.modalidade === "unico" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Valor</span>
                  <p className="text-[13px] font-medium tabular-nums text-gray-900 py-2">
                    {formatarValorOficial(titulo.valorOriginal)}
                  </p>
                </label>
                <label className="block min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Vencimento</span>
                  <FormInput
                    variant="light"
                    required
                    type="date"
                    value={rascunho.linhas[0]?.vencimento ?? ""}
                    invalid={Boolean(erros.linhas?.[1]?.vencimento)}
                    onChange={vencimento => onChange({
                      ...rascunho,
                      linhas: [{ numero: 1, valor: rascunho.linhas[0]?.valor ?? "", vencimento }],
                    })}
                  />
                  {erros.linhas?.[1]?.vencimento ? (
                    <span className="block text-[11px] text-red-600 mt-1">{erros.linhas[1].vencimento}</span>
                  ) : null}
                </label>
              </div>
            ) : (
              <>
                <label className="block max-w-[160px]">
                  <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Quantidade de parcelas</span>
                  <FormInput
                    variant="light"
                    required
                    inputMode="numeric"
                    value={String(rascunho.quantidade)}
                    invalid={Boolean(erros.quantidade)}
                    onChange={valor => {
                      const quantidade = Number.parseInt(valor.replace(/\D/g, ""), 10);
                      if (!Number.isFinite(quantidade)) return;
                      if (quantidade <= 1) {
                        onChange(aplicarModalidadeCondicao(rascunho, "unico", titulo.valorOriginal));
                        return;
                      }
                      onChange(aplicarQuantidadeParcelas(rascunho, quantidade, titulo.valorOriginal));
                    }}
                  />
                  {erros.quantidade ? <span className="block text-[11px] text-red-600 mt-1">{erros.quantidade}</span> : null}
                </label>
                <div className="space-y-3">
                  {rascunho.linhas.map(linha => (
                    <div key={linha.numero} className="grid grid-cols-1 sm:grid-cols-[56px_1fr_1fr] gap-3 items-end">
                      <p className="text-[13px] font-medium text-gray-800 pb-2">#{linha.numero}</p>
                      <label className="block min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Valor</span>
                        <FormInput
                          variant="light"
                          required
                          inputMode="decimal"
                          value={linha.valor}
                          invalid={Boolean(erros.linhas?.[linha.numero]?.valor)}
                          onChange={valor => onChange({
                            ...rascunho,
                            linhas: rascunho.linhas.map(atual => atual.numero === linha.numero ? { ...atual, valor } : atual),
                          })}
                        />
                        {erros.linhas?.[linha.numero]?.valor ? (
                          <span className="block text-[11px] text-red-600 mt-1">{erros.linhas[linha.numero]?.valor}</span>
                        ) : null}
                      </label>
                      <label className="block min-w-0">
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Vencimento</span>
                        <FormInput
                          variant="light"
                          required
                          type="date"
                          value={linha.vencimento}
                          invalid={Boolean(erros.linhas?.[linha.numero]?.vencimento)}
                          onChange={vencimento => onChange({
                            ...rascunho,
                            linhas: rascunho.linhas.map(atual => atual.numero === linha.numero ? { ...atual, vencimento } : atual),
                          })}
                        />
                        {erros.linhas?.[linha.numero]?.vencimento ? (
                          <span className="block text-[11px] text-red-600 mt-1">{erros.linhas[linha.numero]?.vencimento}</span>
                        ) : null}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className={cn("text-[12px] space-y-0.5", somaBate ? "text-gray-600" : "text-red-600")}>
              <p>Valor original: {formatarValorOficial(titulo.valorOriginal)}</p>
              <p>
                Total distribuído:{" "}
                {diferenca.somaCentavos == null ? "—" : formatarValorOficial(fromCentavos(diferenca.somaCentavos))}
              </p>
              <p>
                Diferença restante:{" "}
                {diferenca.restanteCentavos == null
                  ? "—"
                  : formatarValorOficial(fromCentavos(diferenca.restanteCentavos))}
              </p>
              {!somaBate ? <p>{MSG_FIN_PARCELAS_SOMA}</p> : null}
            </div>

            {erros.geral ? <p className="text-[12px] text-red-600">{erros.geral}</p> : null}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700"
                onClick={onFechar}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {salvando ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BotaoVoltar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
      aria-label="Voltar para Contas a Receber"
    >
      <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
      <span className="text-[13px]">Voltar para Contas a Receber</span>
    </button>
  );
}

function EstadoDetalhe({
  titulo,
  mensagem,
  onVoltar,
}: {
  titulo: string;
  mensagem: string;
  onVoltar: () => void;
}) {
  return (
    <AppLayout>
      <BotaoVoltar onClick={onVoltar} />
      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-xl px-4 py-12 text-center">
        <p className="text-[16px] font-semibold text-gray-800">{titulo}</p>
        <p className="text-[13px] text-gray-500 mt-2">{mensagem}</p>
      </div>
    </AppLayout>
  );
}
