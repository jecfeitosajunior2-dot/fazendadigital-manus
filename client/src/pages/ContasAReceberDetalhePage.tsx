import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { useConfirm } from "@/components/ConfirmDialog";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import MobileCard from "@/components/MobileCard";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SelectItem } from "@/components/ui/select";
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
import { type ParcelaV2Oficial } from "@/lib/contasAPagarListagem";
import {
  FINANCEIRO_CONTAS_V2_PATH,
  MSG_SEM_CONTA_V2_ATIVA,
  deveOrientarCadastroContaV2,
  type ContaFinanceiraV2Oficial,
} from "@/lib/contasFinanceirasV2";
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
  linkOrigemContasAReceber,
  mensagemErroHistoricoRecebimentos,
  montarEventosHistoricoRecebimentos,
  referenciaOrigemVendaAnimais,
  resumoOficialContasAReceber,
  rotuloOrigemTitulo,
  rotuloCondicaoPagamento,
  rotuloEstadoTitulo,
  rotuloParcelasHistorico,
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
import {
  MSG_CONFIRMAR_RECEBIMENTO,
  MSG_RECEBIMENTO_OCUPADO,
  MSG_RECEBIMENTO_PENDENTE_RECUPERADA,
  MSG_RECEBIMENTO_REGISTRADO,
  MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO,
  MSG_RECEBIMENTO_RETRY_MESMA_CHAVE,
  ROTULO_REGISTRAR_RECEBIMENTO,
  apagarRecebimentoPendente,
  contasAtivasParaRecebimento,
  gravarRecebimentoPendente,
  historicoSugereRecebimentoDaPendencia,
  lerRecebimentoPendente,
  mensagemErroRecebimento,
  mensagemSituacaoPendenciaRecebimento,
  montarIntencaoRecebimento,
  novaChaveIdempotenciaRecebimento,
  pendenciaFoiRecuperada,
  podeRegistrarRecebimentoParcela,
  rascunhoDeIntencaoRecebimento,
  rascunhoInicialRecebimento,
  recebimentoRecusaDefinitiva,
  textoConfirmacaoRecebimento,
  validarRecebimentoParcela,
  type ErrosRecebimentoParcela,
  type IntencaoRecebimentoV2,
  type RascunhoRecebimentoParcela,
} from "@/lib/contasAReceberRecebimento";
import {
  MSG_CONFIRMAR_ESTORNO_RECEBIMENTO,
  MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO,
  MSG_ESTORNO_RECEBIMENTO_CHAVE_COLIDIU,
  MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA,
  MSG_ESTORNO_RECEBIMENTO_REGISTRADO,
  MSG_ESTORNO_RECEBIMENTO_RESULTADO_DESCONHECIDO,
  MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE,
  MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO,
  MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS,
  PREFIXO_CHAVE_ESTORNO_RECEBIMENTO,
  ROTULO_ESTORNAR_RECEBIMENTO,
  alcanceEstornoDaLiquidacao,
  apagarEstornoRecebimentoPendente,
  estornoRecebimentoRecusaDefinitiva,
  gravarEstornoRecebimentoPendente,
  historicoSugereEstornoRecebimentoDaPendencia,
  lerEstornoRecebimentoPendenteDoTitulo,
  linhasTitulosAlcanceEstorno,
  mensagemBloqueioEstornoRecebimento,
  mensagemErroEstornoRecebimento,
  mensagemSituacaoPendenciaEstornoRecebimento,
  montarIntencaoEstornoRecebimento,
  novaChaveIdempotenciaEstornoRecebimento,
  pendenciaEstornoRecebimentoFoiRecuperada,
  podeEstornarRecebimento,
  respostaEstornoConfirmaIntencao,
  textoAlcanceConfirmacaoEstornoRecebimento,
  textoConfirmacaoEstornoRecebimento,
  validarEstornoRecebimento,
  type ErrosEstornoRecebimento,
  type IntencaoEstornoRecebimentoV2,
} from "@/lib/contasAReceberEstorno";

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

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-[13px] text-gray-800 mt-0.5 break-words">{value == null || value === "" ? "—" : value}</div>
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
  const [recebimentoAberto, setRecebimentoAberto] = useState(false);
  const [parcelaRecebimento, setParcelaRecebimento] = useState<ParcelaV2Oficial | null>(null);
  const [rascunhoRecebimento, setRascunhoRecebimento] = useState<RascunhoRecebimentoParcela | null>(null);
  const [errosRecebimento, setErrosRecebimento] = useState<ErrosRecebimentoParcela>({});
  const [chaveRecebimento, setChaveRecebimento] = useState("");
  const [intencaoRecebimento, setIntencaoRecebimento] = useState<IntencaoRecebimentoV2 | null>(null);
  const [resultadoDesconhecido, setResultadoDesconhecido] = useState(false);
  const [bloqueioRecebimento, setBloqueioRecebimento] = useState(false);
  const enviandoRecebimentoRef = useRef(false);
  const pendenciaChaveRestauradaRef = useRef<string | null>(null);
  const chaveIniciadaNestaSessaoRef = useRef<string | null>(null);
  const [estornoAberto, setEstornoAberto] = useState(false);
  const [eventoEstorno, setEventoEstorno] = useState<EventoHistoricoPagamentoOficial | null>(null);
  const [dataEstorno, setDataEstorno] = useState("");
  const [errosEstorno, setErrosEstorno] = useState<ErrosEstornoRecebimento>({});
  const [chaveEstorno, setChaveEstorno] = useState("");
  const [intencaoEstorno, setIntencaoEstorno] = useState<IntencaoEstornoRecebimentoV2 | null>(null);
  const [resultadoDesconhecidoEstorno, setResultadoDesconhecidoEstorno] = useState(false);
  const [bloqueioEstorno, setBloqueioEstorno] = useState(false);
  const enviandoEstornoRef = useRef(false);
  const pendenciaEstornoRestauradaRef = useRef<string | null>(null);
  const chaveEstornoSessaoRef = useRef<string | null>(null);

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
  const contasV2 = trpc.financeiroV2.contasList.useQuery();
  const receberParcela = trpc.financeiroV2.liquidacaoReceber.useMutation();
  const estornarRecebimento = trpc.financeiroV2.liquidacaoEstornar.useMutation();
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

  useEffect(() => {
    if (typeof user?.id !== "number" || tituloId == null) return;
    const persistido = lerRecebimentoPendente({ userId: user.id, tituloId });
    if (!persistido) return;
    if (!pendenciaFoiRecuperada({
      persistido,
      chaveIniciadaNestaSessao: chaveIniciadaNestaSessaoRef.current,
    })) return;
    const tituloAtual = consulta.data as TituloV2DetalheOficial | undefined;
    const parcela = tituloAtual?.parcelas.find(item => item.id === persistido.parcelaId) ?? null;
    if (pendenciaChaveRestauradaRef.current !== persistido.chave) {
      pendenciaChaveRestauradaRef.current = persistido.chave;
      setIntencaoRecebimento(persistido);
      setChaveRecebimento(persistido.chave);
      setResultadoDesconhecido(true);
      setRascunhoRecebimento(rascunhoDeIntencaoRecebimento(persistido));
      setRecebimentoAberto(true);
      setErrosRecebimento({ geral: MSG_RECEBIMENTO_PENDENTE_RECUPERADA });
      void Promise.all([
        utils.financeiroV2.titulosGet.invalidate(),
        utils.financeiroV2.tituloHistoricoPagamentos.invalidate(),
        utils.financeiroV2.contasList.invalidate(),
      ]);
    }
    if (parcela) setParcelaRecebimento(parcela);
  }, [consulta.data, tituloId, user?.id, utils]);

  useEffect(() => {
    if (typeof user?.id !== "number" || tituloId == null) return;
    const eventos = (historico.data?.eventos ?? []) as EventoHistoricoPagamentoOficial[];
    const persistido = lerEstornoRecebimentoPendenteDoTitulo({
      userId: user.id,
      tituloId,
      liquidacaoIds: eventos.map(item => item.liquidacaoId),
    });
    if (!persistido) return;
    if (!pendenciaEstornoRecebimentoFoiRecuperada({
      persistido,
      chaveIniciadaNestaSessao: chaveEstornoSessaoRef.current,
    })) return;
    const evento = eventos.find(item => item.liquidacaoId === persistido.liquidacaoId) ?? null;
    if (pendenciaEstornoRestauradaRef.current !== persistido.chave) {
      pendenciaEstornoRestauradaRef.current = persistido.chave;
      setIntencaoEstorno(persistido);
      setChaveEstorno(persistido.chave);
      setResultadoDesconhecidoEstorno(true);
      setDataEstorno(persistido.payload.dataLiquidacao);
      setEstornoAberto(true);
      setErrosEstorno({ geral: MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA });
      void Promise.all([
        utils.financeiroV2.titulosGet.invalidate(),
        utils.financeiroV2.tituloHistoricoPagamentos.invalidate(),
        utils.financeiroV2.contasList.invalidate(),
      ]);
    }
    if (evento) setEventoEstorno(evento);
  }, [historico.data, tituloId, user?.id, utils]);

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
  const linkOrigem = linkOrigemContasAReceber(titulo.origemTipo, titulo.origemId);
  const referenciaVenda = referenciaOrigemVendaAnimais(titulo.origemTipo, titulo.origemId);
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
  const contasAtivas = contasAtivasParaRecebimento(
    (contasV2.data ?? []) as ContaFinanceiraV2Oficial[],
    user?.id,
  );
  const orientarContaV2 = deveOrientarCadastroContaV2({
    carregando: contasV2.isLoading,
    erro: Boolean(contasV2.error),
    contas: contasV2.data as ContaFinanceiraV2Oficial[] | undefined,
  });
  const ocupadoRecebimento = bloqueioRecebimento
    || enviandoRecebimentoRef.current
    || receberParcela.isPending
    || definirParcelas.isPending
    || formAberto
    || bloqueioEstorno
    || enviandoEstornoRef.current
    || estornarRecebimento.isPending
    || estornoAberto;
  const persistidoTitulo = typeof user?.id === "number"
    ? lerRecebimentoPendente({ userId: user.id, tituloId: titulo.id })
    : null;
  const pendenteTitulo = persistidoTitulo ?? (resultadoDesconhecido ? intencaoRecebimento : null);
  const pendenciaRecuperada = pendenciaFoiRecuperada({
    persistido: persistidoTitulo,
    chaveIniciadaNestaSessao: chaveIniciadaNestaSessaoRef.current,
  });
  const situacaoPendencia = pendenteTitulo
    ? historicoSugereRecebimentoDaPendencia({
      intencao: pendenteTitulo,
      eventos: historico.data?.eventos as EventoHistoricoPagamentoOficial[] | undefined,
      historicoCarregando: historico.isLoading,
      historicoComErro: Boolean(historico.error),
    })
    : null;
  const persistidoEstorno = typeof user?.id === "number"
    ? lerEstornoRecebimentoPendenteDoTitulo({
      userId: user.id,
      tituloId: titulo.id,
      liquidacaoIds: eventosHistorico.map(item => item.liquidacaoId),
    })
    : null;
  const pendenteEstorno = persistidoEstorno ?? (resultadoDesconhecidoEstorno ? intencaoEstorno : null);
  const pendenciaEstornoRecuperada = pendenciaEstornoRecebimentoFoiRecuperada({
    persistido: persistidoEstorno,
    chaveIniciadaNestaSessao: chaveEstornoSessaoRef.current,
  });
  const situacaoPendenciaEstorno = pendenteEstorno
    ? historicoSugereEstornoRecebimentoDaPendencia({
      intencao: pendenteEstorno,
      eventos: eventosHistorico,
      historicoCarregando: historico.isLoading,
      historicoComErro: Boolean(historico.error),
    })
    : null;

  const abrirCondicao = () => {
    if (acaoCondicao.tipo === "nenhuma" || ocupadoRecebimento || recebimentoAberto || pendenteTitulo || pendenteEstorno) return;
    setModoEdicao(acaoCondicao.tipo === "editar");
    setRascunho(rascunhoInicialDaCondicao(titulo));
    setErrosCondicao({});
    setFormAberto(true);
  };

  const abrirRecebimento = (parcela: ParcelaV2Oficial) => {
    if (pendenteEstorno || estornoAberto) {
      toast.error(pendenciaEstornoRecuperada ? MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA : MSG_RECEBIMENTO_OCUPADO);
      return;
    }
    if (pendenteTitulo) {
      if (pendenteTitulo.parcelaId !== parcela.id) {
        toast.error(pendenciaRecuperada ? MSG_RECEBIMENTO_PENDENTE_RECUPERADA : MSG_RECEBIMENTO_OCUPADO);
        return;
      }
      setParcelaRecebimento(parcela);
      setIntencaoRecebimento(pendenteTitulo);
      setChaveRecebimento(pendenteTitulo.chave);
      setResultadoDesconhecido(true);
      setRascunhoRecebimento(rascunhoDeIntencaoRecebimento(pendenteTitulo));
      setErrosRecebimento({
        geral: situacaoPendencia
          ? mensagemSituacaoPendenciaRecebimento(situacaoPendencia)
          : MSG_RECEBIMENTO_RETRY_MESMA_CHAVE,
      });
      setRecebimentoAberto(true);
      return;
    }
    const pode = podeRegistrarRecebimentoParcela({
      titulo,
      parcela,
      contasAtivas,
      userId: user?.id,
      ocupado: ocupadoRecebimento || recebimentoAberto,
    });
    if (!pode.ok) {
      if (pode.motivo === "ocupado" || pode.motivo === "pendente") toast.error(MSG_RECEBIMENTO_OCUPADO);
      return;
    }
    setParcelaRecebimento(parcela);
    setRascunhoRecebimento(rascunhoInicialRecebimento({
      parcela,
      dataLiquidacao: hojeISO,
      contaId: contasAtivas.length === 1 ? contasAtivas[0]!.id : null,
    }));
    const chaveNova = novaChaveIdempotenciaRecebimento();
    chaveIniciadaNestaSessaoRef.current = chaveNova;
    setChaveRecebimento(chaveNova);
    setIntencaoRecebimento(null);
    setResultadoDesconhecido(false);
    setErrosRecebimento({});
    setRecebimentoAberto(true);
  };

  const atualizarAposRecebimento = async () => {
    await Promise.all([
      utils.financeiroV2.titulosGet.invalidate(),
      utils.financeiroV2.titulosList.invalidate(),
      utils.financeiroV2.tituloHistoricoPagamentos.invalidate(),
      utils.financeiroV2.contasList.invalidate(),
    ]);
  };

  const confirmarRecebimento = async () => {
    if (!rascunhoRecebimento || !parcelaRecebimento) return;
    if (enviandoRecebimentoRef.current || receberParcela.isPending) return;
    const validado = validarRecebimentoParcela({
      titulo,
      parcela: parcelaRecebimento,
      contas: (contasV2.data ?? []) as ContaFinanceiraV2Oficial[],
      userId: user?.id,
      rascunho: rascunhoRecebimento,
      idempotencyKey: chaveRecebimento,
      ocupado: false,
      resultadoDesconhecido,
      intencao: intencaoRecebimento,
    });
    if (!validado.ok) {
      setErrosRecebimento(validado.erros);
      return;
    }
    setErrosRecebimento({});
    const ok = await confirm({
      title: MSG_CONFIRMAR_RECEBIMENTO,
      description: (
        <span className="whitespace-pre-line">
          {textoConfirmacaoRecebimento({
            cliente: titulo.contraparteNomeSnapshot,
            parcelaNumero: parcelaRecebimento.numero,
            contaNome: contasAtivas.find(c => c.id === validado.payload.contaId)?.nome ?? "—",
            dataLiquidacao: validado.payload.dataLiquidacao,
            valor: validado.payload.valorMovimentado,
          })}
        </span>
      ),
      confirmText: ROTULO_REGISTRAR_RECEBIMENTO,
      cancelText: "Voltar",
      variant: "success",
    });
    if (!ok) return;
    if (enviandoRecebimentoRef.current) return;
    enviandoRecebimentoRef.current = true;
    setBloqueioRecebimento(true);
    const intencao = montarIntencaoRecebimento(titulo.id, validado.payload);
    setIntencaoRecebimento(intencao);
    setChaveRecebimento(validado.payload.idempotencyKey);
    if (typeof user?.id === "number") {
      gravarRecebimentoPendente({ userId: user.id, intencao });
    }
    try {
      await receberParcela.mutateAsync(validado.payload);
      if (typeof user?.id === "number") apagarRecebimentoPendente({ userId: user.id, tituloId: titulo.id });
      pendenciaChaveRestauradaRef.current = null;
      chaveIniciadaNestaSessaoRef.current = null;
      toast.success(MSG_RECEBIMENTO_REGISTRADO);
      setRecebimentoAberto(false);
      setParcelaRecebimento(null);
      setRascunhoRecebimento(null);
      setIntencaoRecebimento(null);
      setResultadoDesconhecido(false);
      setChaveRecebimento("");
      await atualizarAposRecebimento();
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "data" in erro
        ? (erro as { data?: { code?: string } }).data?.code
        : undefined;
      const mensagem = erro instanceof Error ? erro.message : undefined;
      await atualizarAposRecebimento();
      if (!recebimentoRecusaDefinitiva(codigo)) {
        setResultadoDesconhecido(true);
        if (typeof user?.id === "number") gravarRecebimentoPendente({ userId: user.id, intencao });
        setErrosRecebimento({ geral: MSG_RECEBIMENTO_RETRY_MESMA_CHAVE });
        toast.message(MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO);
      } else {
        if (typeof user?.id === "number") {
          apagarRecebimentoPendente({ userId: user.id, tituloId: titulo.id });
        }
        pendenciaChaveRestauradaRef.current = null;
        setResultadoDesconhecido(false);
        setIntencaoRecebimento(null);
        const chaveNova = novaChaveIdempotenciaRecebimento();
        chaveIniciadaNestaSessaoRef.current = chaveNova;
        setChaveRecebimento(chaveNova);
        setErrosRecebimento({ geral: mensagemErroRecebimento(codigo, mensagem) });
        toast.error(mensagemErroRecebimento(codigo, mensagem));
      }
    } finally {
      enviandoRecebimentoRef.current = false;
      setBloqueioRecebimento(false);
    }
  };

  const abrirEstorno = (oficial: EventoHistoricoPagamentoOficial) => {
    if (pendenteTitulo || recebimentoAberto) {
      toast.error(pendenciaRecuperada ? MSG_RECEBIMENTO_PENDENTE_RECUPERADA : MSG_RECEBIMENTO_OCUPADO);
      return;
    }
    if (pendenteEstorno) {
      if (pendenteEstorno.liquidacaoId !== oficial.liquidacaoId) {
        toast.error(pendenciaEstornoRecuperada ? MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA : MSG_RECEBIMENTO_OCUPADO);
        return;
      }
      const evento = eventosHistorico.find(item => item.liquidacaoId === pendenteEstorno.liquidacaoId) ?? oficial;
      setEventoEstorno(evento);
      setIntencaoEstorno(pendenteEstorno);
      setChaveEstorno(pendenteEstorno.chave);
      setResultadoDesconhecidoEstorno(true);
      setDataEstorno(pendenteEstorno.payload.dataLiquidacao);
      setErrosEstorno({
        geral: situacaoPendenciaEstorno
          ? mensagemSituacaoPendenciaEstornoRecebimento(situacaoPendenciaEstorno)
          : MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE,
      });
      setEstornoAberto(true);
      return;
    }
    const pode = podeEstornarRecebimento({
      titulo,
      evento: oficial,
      userId: user?.id,
      ocupado: ocupadoRecebimento && !estornoAberto,
    });
    if (!pode.ok) {
      toast.error(mensagemBloqueioEstornoRecebimento(pode.motivo));
      return;
    }
    const alcance = alcanceEstornoDaLiquidacao(oficial);
    setEventoEstorno(oficial);
    setDataEstorno(hojeISO);
    const chaveNova = novaChaveIdempotenciaEstornoRecebimento();
    if (!chaveNova.startsWith(PREFIXO_CHAVE_ESTORNO_RECEBIMENTO)) return;
    chaveEstornoSessaoRef.current = chaveNova;
    setChaveEstorno(chaveNova);
    setIntencaoEstorno(null);
    setResultadoDesconhecidoEstorno(false);
    setErrosEstorno(alcance.ok ? {} : { geral: MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO });
    setEstornoAberto(true);
  };

  const confirmarEstorno = async () => {
    if (!eventoEstorno) return;
    if (enviandoEstornoRef.current || estornarRecebimento.isPending) return;
    const validado = validarEstornoRecebimento({
      titulo,
      evento: eventoEstorno,
      contas: (contasV2.data ?? []) as ContaFinanceiraV2Oficial[],
      userId: user?.id,
      dataLiquidacao: dataEstorno,
      idempotencyKey: chaveEstorno,
      ocupado: false,
      resultadoDesconhecido: resultadoDesconhecidoEstorno,
      intencao: intencaoEstorno,
    });
    if (!validado.ok) {
      setErrosEstorno(validado.erros);
      return;
    }
    setErrosEstorno({});
    const ok = await confirm({
      title: MSG_CONFIRMAR_ESTORNO_RECEBIMENTO,
      description: (
        <span className="whitespace-pre-line">
          {textoConfirmacaoEstornoRecebimento({
            cliente: validado.snapshot.cliente,
            dataRecebimentoOriginal: validado.snapshot.dataRecebimentoOriginal,
            contaNome: validado.snapshot.contaNome,
            valorTotal: validado.snapshot.valorMovimentado,
            valorNesteTitulo: validado.snapshot.valorNesteTitulo,
            parcelasTexto: validado.snapshot.parcelasTexto,
            dataEstorno: validado.payload.dataLiquidacao,
            abrangencia: validado.snapshot.abrangencia,
            titulos: validado.snapshot.titulosNaLiquidacao,
          })}
        </span>
      ),
      confirmText: ROTULO_ESTORNAR_RECEBIMENTO,
      cancelText: "Voltar",
      variant: "danger",
    });
    if (!ok) return;
    if (enviandoEstornoRef.current) return;
    enviandoEstornoRef.current = true;
    setBloqueioEstorno(true);
    const intencao = montarIntencaoEstornoRecebimento(titulo.id, validado.payload, validado.snapshot);
    setIntencaoEstorno(intencao);
    setChaveEstorno(validado.payload.idempotencyKey);
    if (typeof user?.id === "number") gravarEstornoRecebimentoPendente({ userId: user.id, intencao });
    try {
      const resposta = await estornarRecebimento.mutateAsync(validado.payload);
      const respostaId = resposta && typeof resposta === "object" && "id" in resposta
        ? Number((resposta as { id: unknown }).id)
        : null;
      if (Number.isInteger(respostaId) && !respostaEstornoConfirmaIntencao({
        liquidacaoOriginalId: validado.payload.liquidacaoId,
        respostaId,
      })) {
        setResultadoDesconhecidoEstorno(true);
        setErrosEstorno({ geral: MSG_ESTORNO_RECEBIMENTO_CHAVE_COLIDIU });
        toast.error(MSG_ESTORNO_RECEBIMENTO_CHAVE_COLIDIU);
        return;
      }
      if (typeof user?.id === "number") {
        apagarEstornoRecebimentoPendente({ userId: user.id, liquidacaoId: validado.payload.liquidacaoId });
      }
      pendenciaEstornoRestauradaRef.current = null;
      chaveEstornoSessaoRef.current = null;
      toast.success(MSG_ESTORNO_RECEBIMENTO_REGISTRADO);
      setEstornoAberto(false);
      setEventoEstorno(null);
      setIntencaoEstorno(null);
      setResultadoDesconhecidoEstorno(false);
      setChaveEstorno("");
      await atualizarAposRecebimento();
    } catch (erro) {
      const codigo = erro && typeof erro === "object" && "data" in erro
        ? (erro as { data?: { code?: string } }).data?.code
        : undefined;
      const mensagem = erro instanceof Error ? erro.message : undefined;
      await atualizarAposRecebimento();
      if (!estornoRecebimentoRecusaDefinitiva(codigo)) {
        setResultadoDesconhecidoEstorno(true);
        if (typeof user?.id === "number") gravarEstornoRecebimentoPendente({ userId: user.id, intencao });
        setErrosEstorno({ geral: MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE });
        toast.message(MSG_ESTORNO_RECEBIMENTO_RESULTADO_DESCONHECIDO);
      } else {
        if (typeof user?.id === "number") {
          apagarEstornoRecebimentoPendente({ userId: user.id, liquidacaoId: validado.payload.liquidacaoId });
        }
        pendenciaEstornoRestauradaRef.current = null;
        setResultadoDesconhecidoEstorno(false);
        setIntencaoEstorno(null);
        const chaveNova = novaChaveIdempotenciaEstornoRecebimento();
        chaveEstornoSessaoRef.current = chaveNova;
        setChaveEstorno(chaveNova);
        setErrosEstorno({ geral: mensagemErroEstornoRecebimento(codigo, mensagem) });
        toast.error(mensagemErroEstornoRecebimento(codigo, mensagem));
      }
    } finally {
      enviandoEstornoRef.current = false;
      setBloqueioEstorno(false);
    }
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

        {pendenciaRecuperada ? (
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 text-[13px] text-amber-900">
            <p>{MSG_RECEBIMENTO_PENDENTE_RECUPERADA}</p>
            {situacaoPendencia ? (
              <p className="mt-1 text-[12px]">{mensagemSituacaoPendenciaRecebimento(situacaoPendencia)}</p>
            ) : null}
          </div>
        ) : null}

        {pendenciaEstornoRecuperada ? (
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 text-[13px] text-amber-900">
            <p>{MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA}</p>
            {situacaoPendenciaEstorno ? (
              <p className="mt-1 text-[12px]">{mensagemSituacaoPendenciaEstornoRecebimento(situacaoPendenciaEstorno)}</p>
            ) : null}
          </div>
        ) : null}

        {orientarContaV2 ? (
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70 text-[13px] text-amber-900">
            <p>{MSG_SEM_CONTA_V2_ATIVA}</p>
            <button
              type="button"
              onClick={() => setLocation(FINANCEIRO_CONTAS_V2_PATH)}
              className="mt-1 text-[12px] font-semibold underline underline-offset-2"
              style={{ color: FD_PRIMARY }}
            >
              Cadastrar conta do caixa
            </button>
          </div>
        ) : null}

        <section className="px-4 py-4 border-b border-gray-50">
          <h2 className="text-[13px] font-semibold text-[#4ECDC4] mb-3">Informações do título</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Info label="Cliente" value={titulo.contraparteNomeSnapshot || "—"} />
            <Info label="Descrição" value={titulo.descricao.trim() || "—"} />
            <Info label="Fazenda" value={nomeFazendaDaLinha(titulo.fazendaOrigemId, fazendas)} />
            <Info label="Origem" value={rotuloOrigemTitulo(titulo.origemTipo)} />
            {referenciaVenda ? (
              <Info
                label="Referência"
                value={
                  linkOrigem ? (
                    <a
                      href={linkOrigem.href}
                      onClick={evento => {
                        evento.preventDefault();
                        setLocation(linkOrigem.href);
                      }}
                      className="font-semibold"
                      style={{ color: FD_PRIMARY }}
                    >
                      {linkOrigem.label}
                    </a>
                  ) : referenciaVenda
                }
              />
            ) : null}
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
            {acaoCondicao.tipo !== "nenhuma" && !pendenteTitulo && !recebimentoAberto && !pendenteEstorno && !estornoAberto ? (
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
                  const podeReceber = podeRegistrarRecebimentoParcela({
                    titulo,
                    parcela,
                    contasAtivas,
                    userId: user?.id,
                    ocupado: ocupadoRecebimento || (recebimentoAberto && parcelaRecebimento?.id !== parcela.id),
                    pendenteDestaParcela: pendenteTitulo?.parcelaId === parcela.id,
                    pendenteOutraParcela: Boolean(pendenteTitulo && pendenteTitulo.parcelaId !== parcela.id),
                  }).ok;
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
                      actions={podeReceber ? [{
                        icon: "payments",
                        label: ROTULO_REGISTRAR_RECEBIMENTO,
                        onClick: () => abrirRecebimento(parcela),
                      }] : []}
                    />
                  );
                })}
              </div>
              <div className="hidden lg:block">
                <TableHorizontalScroll fitWidth>
                  <table className="w-full min-w-[820px] table-fixed text-[11px] border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Parcela", "Vencimento", "Valor original", "Valor recebido", "Saldo restante", "Situação", ""].map(col => (
                          <th
                            key={col || "acoes"}
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
                        const podeReceber = podeRegistrarRecebimentoParcela({
                          titulo,
                          parcela,
                          contasAtivas,
                          userId: user?.id,
                          ocupado: ocupadoRecebimento || (recebimentoAberto && parcelaRecebimento?.id !== parcela.id),
                          pendenteDestaParcela: pendenteTitulo?.parcelaId === parcela.id,
                          pendenteOutraParcela: Boolean(pendenteTitulo && pendenteTitulo.parcelaId !== parcela.id),
                        }).ok;
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
                            <td className="px-3 py-2.5 text-right">
                              {podeReceber ? (
                                <button
                                  type="button"
                                  className="text-[11px] font-semibold hover:underline"
                                  style={{ color: FD_PRIMARY }}
                                  onClick={() => abrirRecebimento(parcela)}
                                >
                                  {ROTULO_REGISTRAR_RECEBIMENTO}
                                </button>
                              ) : null}
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
          onEstornar={abrirEstorno}
          mostrarEstorno={oficial => podeEstornarRecebimento({
            titulo,
            evento: oficial,
            userId: user?.id,
            ocupado: ocupadoRecebimento && !estornoAberto,
            pendenteOutraLiquidacao: Boolean(pendenteEstorno && pendenteEstorno.liquidacaoId !== oficial.liquidacaoId),
          }).ok || (pendenteEstorno?.liquidacaoId === oficial.liquidacaoId)}
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

      <DialogRecebimentoParcela
        aberto={recebimentoAberto}
        titulo={titulo}
        parcela={parcelaRecebimento}
        rascunho={rascunhoRecebimento}
        contasAtivas={contasAtivas}
        erros={errosRecebimento}
        travado={resultadoDesconhecido}
        salvando={receberParcela.isPending || bloqueioRecebimento}
        onFechar={() => {
          if (receberParcela.isPending || bloqueioRecebimento) return;
          setRecebimentoAberto(false);
        }}
        onChange={setRascunhoRecebimento}
        onConfirmar={() => void confirmarRecebimento()}
      />

      <DialogEstornoRecebimento
        aberto={estornoAberto}
        cliente={titulo.contraparteNomeSnapshot}
        evento={eventoEstorno}
        dataLiquidacao={dataEstorno}
        erros={errosEstorno}
        travado={resultadoDesconhecidoEstorno}
        salvando={bloqueioEstorno || estornarRecebimento.isPending}
        onFechar={() => {
          if (bloqueioEstorno || estornarRecebimento.isPending) return;
          setEstornoAberto(false);
          if (!resultadoDesconhecidoEstorno) {
            setEventoEstorno(null);
          }
        }}
        onChangeData={nova => {
          if (resultadoDesconhecidoEstorno) return;
          setDataEstorno(nova);
        }}
        onConfirmar={() => void confirmarEstorno()}
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
  onEstornar,
  mostrarEstorno,
}: {
  carregando: boolean;
  erro: { codigo?: string; mensagem?: string } | null;
  eventos: EventoHistoricoPagamentoOficial[] | undefined;
  onEstornar: (evento: EventoHistoricoPagamentoOficial) => void;
  mostrarEstorno: (evento: EventoHistoricoPagamentoOficial) => boolean;
}) {
  const oficiais = Array.isArray(eventos) ? eventos : [];
  const linhas = montarEventosHistoricoRecebimentos(oficiais);
  const eventoOficial = (id: number) => oficiais.find(item => item.liquidacaoId === id);
  const vazio = deveMostrarHistoricoVazio({
    carregando,
    erro: erro != null,
    eventos,
  });
  const temTotalCompartilhado = linhas.some(linha => linha.mostrarTotalLiquidacao);
  const temAcaoEstorno = oficiais.some(oficial => mostrarEstorno(oficial));
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
            {linhas.map(evento => {
              const oficial = eventoOficial(evento.liquidacaoId);
              return (
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
                actions={oficial && mostrarEstorno(oficial) ? [{
                  icon: "undo",
                  label: ROTULO_ESTORNAR_RECEBIMENTO,
                  variant: "danger",
                  onClick: () => onEstornar(oficial),
                }] : []}
              />
              );
            })}
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
                      ...(temAcaoEstorno ? [""] : []),
                    ].map(col => (
                      <th
                        key={col || "acoes"}
                        className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(evento => {
                    const oficial = eventoOficial(evento.liquidacaoId);
                    return (
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
                      {temAcaoEstorno ? (
                        <td className="px-3 py-2.5 text-right">
                          {oficial && mostrarEstorno(oficial) ? (
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-red-700 hover:underline"
                              onClick={() => onEstornar(oficial)}
                            >
                              {ROTULO_ESTORNAR_RECEBIMENTO}
                            </button>
                          ) : null}
                        </td>
                      ) : null}
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

function DialogRecebimentoParcela({
  aberto,
  titulo,
  parcela,
  rascunho,
  contasAtivas,
  erros,
  travado,
  salvando,
  onFechar,
  onChange,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: TituloV2DetalheOficial;
  parcela: ParcelaV2Oficial | null;
  rascunho: RascunhoRecebimentoParcela | null;
  contasAtivas: ContaFinanceiraV2Oficial[];
  erros: ErrosRecebimentoParcela;
  travado: boolean;
  salvando: boolean;
  onFechar: () => void;
  onChange: (rascunho: RascunhoRecebimentoParcela) => void;
  onConfirmar: () => void;
}) {
  const somenteLeitura = travado || salvando;
  return (
    <Dialog open={aberto} onOpenChange={abertoAgora => { if (!abertoAgora) onFechar(); }}>
      <DialogContent className="max-w-lg bg-white p-0 gap-0 max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <DialogTitle className="text-[16px] font-semibold text-gray-900">{ROTULO_REGISTRAR_RECEBIMENTO}</DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500 mt-1">
            {travado
              ? MSG_RECEBIMENTO_RETRY_MESMA_CHAVE
              : "Recebe uma parcela por vez. O valor sugerido é o saldo a receber. Pode ser parcial ou integral."}
          </DialogDescription>
        </div>
        {parcela && rascunho ? (
          <form
            className="px-4 py-4 space-y-3"
            onSubmit={evento => {
              evento.preventDefault();
              onConfirmar();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info label="Cliente" value={titulo.contraparteNomeSnapshot || "—"} />
              <Info label="Título" value={identificacaoTitulo(titulo)} />
              <Info label="Parcela" value={String(parcela.numero)} />
              <Info label="Valor original" value={formatarValorOficial(parcela.valorOriginal)} />
              <Info label="Valor já recebido" value={formatarValorOficial(parcela.principalLiquidado)} />
              <Info label="Saldo a receber" value={formatarValorOficial(parcela.saldoPrincipal)} />
            </div>
            <label className="block min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Conta financeira</span>
              <FormSelect
                variant="light"
                required
                modal={false}
                disabled={somenteLeitura}
                value={rascunho.contaId}
                invalid={Boolean(erros.contaId)}
                placeholder="Selecione a conta"
                onChange={contaId => onChange({ ...rascunho, contaId })}
              >
                {contasAtivas.map(conta => (
                  <SelectItem key={conta.id} value={String(conta.id)}>{conta.nome}</SelectItem>
                ))}
              </FormSelect>
              {erros.contaId ? <span className="block text-[11px] text-red-600 mt-1">{erros.contaId}</span> : null}
            </label>
            <label className="block min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Data do recebimento</span>
              <FormInput
                variant="light"
                required
                type="date"
                readOnly={somenteLeitura}
                value={rascunho.dataLiquidacao}
                invalid={Boolean(erros.dataLiquidacao)}
                onChange={dataLiquidacao => onChange({ ...rascunho, dataLiquidacao })}
              />
              {erros.dataLiquidacao ? <span className="block text-[11px] text-red-600 mt-1">{erros.dataLiquidacao}</span> : null}
            </label>
            <label className="block min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Valor a receber agora</span>
              <FormInput
                variant="light"
                required
                inputMode="decimal"
                readOnly={somenteLeitura}
                value={rascunho.valor}
                invalid={Boolean(erros.valor)}
                onChange={valor => onChange({ ...rascunho, valor })}
              />
              {erros.valor ? <span className="block text-[11px] text-red-600 mt-1">{erros.valor}</span> : null}
            </label>
            {erros.geral ? <p className="text-[12px] text-red-600">{erros.geral}</p> : null}
            {travado ? <p className="text-[12px] text-amber-800">{MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO}</p> : null}
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
                {salvando ? "Registrando..." : travado ? "Tentar de novo" : "Continuar"}
              </button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DialogEstornoRecebimento({
  aberto,
  cliente,
  evento,
  dataLiquidacao,
  erros,
  travado,
  salvando,
  onFechar,
  onChangeData,
  onConfirmar,
}: {
  aberto: boolean;
  cliente: string;
  evento: EventoHistoricoPagamentoOficial | null;
  dataLiquidacao: string;
  erros: ErrosEstornoRecebimento;
  travado: boolean;
  salvando: boolean;
  onFechar: () => void;
  onChangeData: (data: string) => void;
  onConfirmar: () => void;
}) {
  const somenteLeitura = travado || salvando;
  const alcance = evento ? alcanceEstornoDaLiquidacao(evento) : null;
  const bloqueadoAlcance = alcance != null && !alcance.ok;
  const variosTitulos = alcance?.ok === true && alcance.abrangencia === "varios_titulos";
  return (
    <Dialog open={aberto} onOpenChange={abertoAgora => { if (!abertoAgora) onFechar(); }}>
      <DialogContent className="max-w-lg bg-white p-0 gap-0 max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <DialogTitle className="text-[16px] font-semibold text-gray-900">{ROTULO_ESTORNAR_RECEBIMENTO}</DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500 mt-1">
            {travado
              ? MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE
              : "Desfaz o recebimento original por completo. Isso não apaga o histórico."}
          </DialogDescription>
        </div>
        {evento ? (
          <form
            className="px-4 py-4 space-y-3"
            onSubmit={eventoForm => {
              eventoForm.preventDefault();
              if (!bloqueadoAlcance) onConfirmar();
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Info label="Cliente" value={cliente.trim() || "—"} />
              <Info label="Data do recebimento original" value={formatDateBR(evento.dataLiquidacao)} />
              <Info label="Conta financeira" value={evento.contaNome.trim() || "—"} />
              <Info label="Valor total recebido" value={formatarValorOficial(evento.valorMovimentado)} />
              <Info label="Valor atribuído ao título atual" value={formatarValorOficial(evento.valorAlocadoNesteTitulo)} />
              <Info label="Parcelas envolvidas" value={rotuloParcelasHistorico(evento.alocacoesDesteTitulo)} />
            </div>
            {alcance?.ok === true ? (
              <div className="text-[12px] text-gray-700 space-y-1">
                {linhasTitulosAlcanceEstorno(alcance.titulos).map(tituloLinha => (
                  <p key={tituloLinha.tituloId}>
                    {tituloLinha.rotulo}
                    {": "}
                    {formatarValorOficial(tituloLinha.valorAlocado)}
                  </p>
                ))}
              </div>
            ) : null}
            {alcance?.ok === true && !variosTitulos ? (
              <p className="text-[12px] text-gray-700">{MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO}</p>
            ) : null}
            {variosTitulos ? (
              <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS}
              </p>
            ) : null}
            {bloqueadoAlcance ? (
              <p className="text-[12px] text-red-700">{MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO}</p>
            ) : null}
            <label className="block min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Data do estorno</span>
              <FormInput
                variant="light"
                required
                type="date"
                readOnly={somenteLeitura || bloqueadoAlcance}
                value={dataLiquidacao}
                invalid={Boolean(erros.dataLiquidacao)}
                onChange={onChangeData}
              />
              {erros.dataLiquidacao ? <span className="block text-[11px] text-red-600 mt-1">{erros.dataLiquidacao}</span> : null}
            </label>
            {erros.geral ? <p className="text-[12px] text-red-600">{erros.geral}</p> : null}
            {travado ? <p className="text-[12px] text-amber-800">{MSG_ESTORNO_RECEBIMENTO_RESULTADO_DESCONHECIDO}</p> : null}
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
                disabled={salvando || bloqueadoAlcance}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 bg-red-700"
              >
                {salvando ? "Estornando..." : travado ? "Tentar de novo" : "Continuar"}
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
