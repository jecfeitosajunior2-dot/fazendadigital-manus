/**
 * Estorno de pagamento no detalhe V2.
 * Usa só financeiroV2.liquidacaoEstornar. Não recalcula saldo.
 */

import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_ESCOPO,
  MSG_FIN_IDEMPOTENCY,
  MSG_FIN_LIQUIDACAO_JA_ESTORNADA,
  MSG_FIN_TITULO_CANCELADO,
  movimentoAnteriorAAbertura,
} from "@shared/financeiroNucleo";
import { vencimentoISOValido } from "./contasAPagarCondicao";
import {
  MSG_ACESSO_NEGADO,
  MSG_TITULO_NAO_ENCONTRADO,
  rotuloParcelasHistorico,
  rotuloSituacaoEventoPagamento,
  type EventoHistoricoPagamentoOficial,
} from "./contasAPagarDetalhe";
import { tituloEstaCancelado, type TituloV2DetalheOficial } from "./contasAPagarListagem";
import {
  MSG_PAGAMENTO_OCUPADO,
  criarArmazenamentoPagamentoMemoria,
  pagamentoResultadoDesconhecido,
  pendenciaFoiRecuperada,
  type ArmazenamentoPagamentoPendente,
} from "./contasAPagarPagamento";
import {
  contasVisiveisParaUsuario,
  type ContaFinanceiraV2Oficial,
} from "./contasFinanceirasV2";

export const ROTULO_ESTORNAR_PAGAMENTO = "Estornar pagamento";
export const PREFIXO_ESTORNO_PENDENTE = "fd.finv2.estpend.v1";
export const PREFIXO_CHAVE_ESTORNO = "est-pag-";

export const MSG_ESTORNO_REGISTRADO = "Estorno registrado.";
export const MSG_ESTORNO_DATA = "Informe uma data de estorno válida.";
export const MSG_ESTORNO_NAO_EFETIVO = "Só é possível estornar um pagamento que ainda está válido.";
export const MSG_ESTORNO_DO_ESTORNO = "Não é possível estornar um estorno.";
export const MSG_ESTORNO_RESULTADO_DESCONHECIDO =
  "Não foi possível confirmar se o estorno foi gravado. Consulte o saldo e o histórico oficiais. Se precisar, tente de novo com a mesma operação — não inicie outro estorno.";
export const MSG_ESTORNO_RETRY_MESMA_CHAVE =
  "Esta operação ainda não teve resposta definitiva. A nova tentativa usa a mesma chave e os mesmos dados.";
export const MSG_ESTORNO_INTENCAO_TRAVADA =
  "Os dados desta tentativa ficam travados até o resultado oficial. Assim evitamos um segundo estorno.";
export const MSG_ESTORNO_PENDENTE_RECUPERADA =
  "Há um estorno desta liquidação que ainda não teve confirmação. Os dados estão travados. Repita a mesma operação — não inicie outro estorno.";
export const MSG_ESTORNO_HISTORICO_PARECIDO =
  "O histórico oficial tem um estorno com os mesmos dados. Isso não substitui a confirmação do servidor. Repita a mesma operação.";
export const MSG_ESTORNO_HISTORICO_VAZIO_NAO_PROVA =
  "O histórico ainda não mostra este estorno. Isso não prova que ele deixou de ser gravado.";
export const MSG_ESTORNO_SOMENTE_ESTE_TITULO =
  "O estorno afeta somente este título.";
export const MSG_ESTORNO_VARIOS_TITULOS =
  "O estorno será integral e afetará todos os títulos relacionados a este pagamento.";
export const MSG_ESTORNO_ALCANCE_INCOMPLETO =
  "Não foi possível confirmar se este pagamento pertence só a este título. O estorno ficou bloqueado até a consulta oficial informar o alcance completo da liquidação.";
export const MSG_ESTORNO_CHAVE_COLIDIU =
  "A chave desta tentativa não pode ser usada para estorno. A operação não foi enviada de novo.";
export const MSG_ESTORNO_ENVIO_DUPLICADO = "O envio já está em andamento.";

export type TituloAlcanceEstorno = {
  tituloId: number;
  descricao: string;
  valorAlocado: number;
};

export type AlcanceEstorno =
  | {
    ok: true;
    abrangencia: "somente_este_titulo" | "varios_titulos";
    titulos: TituloAlcanceEstorno[];
  }
  | { ok: false; motivo: "alcance_incompleto" };

export type MotivoEstornoIndisponivel =
  | "nao_efetivo"
  | "ja_estornado"
  | "evento_estorno"
  | "ocupado"
  | "acesso"
  | "nao_pagar"
  | "cancelado"
  | "pendente"
  | "alcance_incompleto";

export type PayloadLiquidacaoEstornarV2 = {
  liquidacaoId: number;
  idempotencyKey: string;
  dataLiquidacao: string;
};

export type SnapshotConfirmacaoEstorno = {
  liquidacaoId: number;
  dataPagamentoOriginal: string;
  contaId: number;
  contaNome: string;
  valorMovimentado: string | number;
  valorNesteTitulo: number;
  parcelasTexto: string;
  abrangencia: "somente_este_titulo" | "varios_titulos";
  titulosNaLiquidacao: TituloAlcanceEstorno[];
};

export type IntencaoEstornoV2 = {
  chave: string;
  tituloId: number;
  liquidacaoId: number;
  assinatura: string;
  payload: PayloadLiquidacaoEstornarV2;
  snapshot: SnapshotConfirmacaoEstorno;
};

export type ErrosEstornoPagamento = Partial<Record<"dataLiquidacao" | "geral", string>>;

export type EstornoPendentePersistido = {
  versao: 1;
  userId: number;
  tituloId: number;
  liquidacaoId: number;
  chave: string;
  assinatura: string;
  payload: PayloadLiquidacaoEstornarV2;
  snapshot: SnapshotConfirmacaoEstorno;
};

export function novaChaveIdempotenciaEstorno(): string {
  const bruto = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 10)}`;
  return `${PREFIXO_CHAVE_ESTORNO}${bruto}`.slice(0, 80);
}

export function chaveIdempotenciaEstornoValida(chave: string): boolean {
  const texto = chave.trim();
  if (texto.length < PREFIXO_CHAVE_ESTORNO.length || texto.length > 80) return false;
  if (!texto.startsWith(PREFIXO_CHAVE_ESTORNO)) return false;
  if (texto.startsWith("pag-") && !texto.startsWith(PREFIXO_CHAVE_ESTORNO)) return false;
  return true;
}

export function pagamentoEfetivoParaEstorno(
  evento: Pick<EventoHistoricoPagamentoOficial, "tipo" | "estornadaPorLiquidacaoId" | "liquidacaoOriginalId">,
): boolean {
  if (evento.tipo === "estorno_pagamento" || evento.tipo === "estorno_recebimento") return false;
  if (evento.liquidacaoOriginalId != null) return false;
  if (evento.estornadaPorLiquidacaoId != null) return false;
  if (evento.tipo && evento.tipo !== "pagamento") return false;
  return rotuloSituacaoEventoPagamento(evento) === "Pagamento";
}

export function alcanceEstornoDaLiquidacao(
  evento: Pick<
    EventoHistoricoPagamentoOficial,
    "alcanceCompleto" | "quantidadeTitulosNaLiquidacao" | "titulosNaLiquidacao"
  >,
): AlcanceEstorno {
  if (evento.alcanceCompleto !== true) {
    return { ok: false, motivo: "alcance_incompleto" };
  }
  const titulos = evento.titulosNaLiquidacao;
  const quantidade = evento.quantidadeTitulosNaLiquidacao;
  if (!Array.isArray(titulos) || typeof quantidade !== "number" || quantidade !== titulos.length || quantidade < 1) {
    return { ok: false, motivo: "alcance_incompleto" };
  }
  const ids = titulos.map(titulo => titulo.tituloId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, motivo: "alcance_incompleto" };
  }
  if (titulos.some(titulo => (
    !Number.isInteger(titulo.tituloId)
    || titulo.tituloId <= 0
    || typeof titulo.descricao !== "string"
    || typeof titulo.valorAlocado !== "number"
    || !Number.isFinite(titulo.valorAlocado)
  ))) {
    return { ok: false, motivo: "alcance_incompleto" };
  }
  return {
    ok: true,
    abrangencia: quantidade === 1 ? "somente_este_titulo" : "varios_titulos",
    titulos,
  };
}

export function linhasTitulosAlcanceEstorno(
  titulos: readonly TituloAlcanceEstorno[],
): Array<{ tituloId: number; rotulo: string; valorAlocado: number }> {
  return titulos.map(titulo => ({
    tituloId: titulo.tituloId,
    rotulo: titulo.descricao.trim() || `Título ${titulo.tituloId}`,
    valorAlocado: titulo.valorAlocado,
  }));
}

export function textoAlcanceConfirmacaoEstorno(
  abrangencia: "somente_este_titulo" | "varios_titulos",
): string {
  return abrangencia === "somente_este_titulo"
    ? MSG_ESTORNO_SOMENTE_ESTE_TITULO
    : MSG_ESTORNO_VARIOS_TITULOS;
}

export function snapshotConfirmacaoEstorno(
  evento: EventoHistoricoPagamentoOficial,
  alcance: Extract<AlcanceEstorno, { ok: true }>,
): SnapshotConfirmacaoEstorno {
  return {
    liquidacaoId: evento.liquidacaoId,
    dataPagamentoOriginal: evento.dataLiquidacao,
    contaId: evento.contaId,
    contaNome: evento.contaNome.trim() || "—",
    valorMovimentado: evento.valorMovimentado,
    valorNesteTitulo: evento.valorAlocadoNesteTitulo,
    parcelasTexto: rotuloParcelasHistorico(evento.alocacoesDesteTitulo),
    abrangencia: alcance.abrangencia,
    titulosNaLiquidacao: alcance.titulos,
  };
}

export function podeEstornarPagamento(input: {
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId">;
  evento: EventoHistoricoPagamentoOficial | null | undefined;
  userId: number | null | undefined;
  ocupado: boolean;
  pendenteOutraLiquidacao?: boolean;
}): { ok: true } | { ok: false; motivo: MotivoEstornoIndisponivel } {
  if (input.titulo.tipo !== "pagar") return { ok: false, motivo: "nao_pagar" };
  if (typeof input.userId === "number" && input.titulo.userId !== input.userId) {
    return { ok: false, motivo: "acesso" };
  }
  if (tituloEstaCancelado(input.titulo)) return { ok: false, motivo: "cancelado" };
  if (input.ocupado) return { ok: false, motivo: "ocupado" };
  if (input.pendenteOutraLiquidacao) return { ok: false, motivo: "pendente" };
  if (!input.evento) return { ok: false, motivo: "nao_efetivo" };
  if (input.evento.tipo === "estorno_pagamento" || input.evento.tipo === "estorno_recebimento") {
    return { ok: false, motivo: "evento_estorno" };
  }
  if (input.evento.estornadaPorLiquidacaoId != null) return { ok: false, motivo: "ja_estornado" };
  if (!pagamentoEfetivoParaEstorno(input.evento)) return { ok: false, motivo: "nao_efetivo" };
  return { ok: true };
}

export function mensagemBloqueioEstorno(motivo: MotivoEstornoIndisponivel): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "ja_estornado") return MSG_FIN_LIQUIDACAO_JA_ESTORNADA;
  if (motivo === "evento_estorno") return MSG_ESTORNO_DO_ESTORNO;
  if (motivo === "ocupado") return MSG_PAGAMENTO_OCUPADO;
  if (motivo === "pendente") return MSG_ESTORNO_PENDENTE_RECUPERADA;
  if (motivo === "acesso") return MSG_ACESSO_NEGADO;
  if (motivo === "alcance_incompleto") return MSG_ESTORNO_ALCANCE_INCOMPLETO;
  if (motivo === "nao_pagar") return MSG_TITULO_NAO_ENCONTRADO;
  return MSG_ESTORNO_NAO_EFETIVO;
}

export function contaDoEstorno(
  contas: readonly ContaFinanceiraV2Oficial[],
  contaId: number,
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial | undefined {
  return contasVisiveisParaUsuario(contas, userId).find(conta => conta.id === contaId);
}

export function assinaturaPayloadEstorno(payload: Omit<PayloadLiquidacaoEstornarV2, "idempotencyKey">): string {
  return [payload.liquidacaoId, payload.dataLiquidacao].join("|");
}

export function chaveParaEnvioEstorno(input: {
  chaveAtual: string;
  assinaturaAtual: string;
  intencao: IntencaoEstornoV2 | null;
  resultadoDesconhecido: boolean;
}): { ok: true; chave: string } | { ok: false; motivo: "travada" | "chave" } {
  if (input.resultadoDesconhecido) {
    if (!input.intencao) return { ok: false, motivo: "chave" };
    if (input.assinaturaAtual !== input.intencao.assinatura) return { ok: false, motivo: "travada" };
    if (!chaveIdempotenciaEstornoValida(input.intencao.chave)) return { ok: false, motivo: "chave" };
    return { ok: true, chave: input.intencao.chave };
  }
  const chave = input.chaveAtual.trim();
  if (!chaveIdempotenciaEstornoValida(chave)) return { ok: false, motivo: "chave" };
  return { ok: true, chave };
}

export function validarEstornoPagamento(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado">;
  evento: EventoHistoricoPagamentoOficial;
  contas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  dataLiquidacao: string;
  idempotencyKey: string;
  ocupado?: boolean;
  resultadoDesconhecido?: boolean;
  intencao?: IntencaoEstornoV2 | null;
}): { ok: true; payload: PayloadLiquidacaoEstornarV2; snapshot: SnapshotConfirmacaoEstorno }
  | { ok: false; erros: ErrosEstornoPagamento } {
  const disponibilidade = podeEstornarPagamento({
    titulo: input.titulo,
    evento: input.evento,
    userId: input.userId,
    ocupado: Boolean(input.ocupado),
  });
  if (!disponibilidade.ok) {
    return { ok: false, erros: { geral: mensagemBloqueioEstorno(disponibilidade.motivo) } };
  }

  const alcance = alcanceEstornoDaLiquidacao(input.evento);
  if (!alcance.ok) {
    return { ok: false, erros: { geral: MSG_ESTORNO_ALCANCE_INCOMPLETO } };
  }

  const erros: ErrosEstornoPagamento = {};
  const conta = contaDoEstorno(input.contas, input.evento.contaId, input.userId);
  if (!conta) erros.geral = MSG_FIN_CONTA_NAO_ENCONTRADA;
  else if (typeof input.userId === "number" && conta.userId !== input.userId) erros.geral = MSG_FIN_ESCOPO;
  else if (!conta.ativa) erros.geral = MSG_FIN_CONTA_INATIVA;

  const data = input.dataLiquidacao.trim();
  if (!vencimentoISOValido(data)) erros.dataLiquidacao = MSG_ESTORNO_DATA;
  else if (conta && movimentoAnteriorAAbertura(data, conta.dataSaldoAbertura)) {
    erros.dataLiquidacao = MSG_FIN_DATA_ANTES_ABERTURA;
  }

  if (Object.keys(erros).length) return { ok: false, erros };

  const payloadBase = {
    liquidacaoId: input.evento.liquidacaoId,
    dataLiquidacao: data,
  };
  const chave = chaveParaEnvioEstorno({
    chaveAtual: input.idempotencyKey,
    assinaturaAtual: assinaturaPayloadEstorno(payloadBase),
    intencao: input.intencao ?? null,
    resultadoDesconhecido: Boolean(input.resultadoDesconhecido),
  });
  if (!chave.ok) {
    return {
      ok: false,
      erros: { geral: chave.motivo === "travada" ? MSG_ESTORNO_INTENCAO_TRAVADA : MSG_FIN_IDEMPOTENCY },
    };
  }

  return {
    ok: true,
    payload: { ...payloadBase, idempotencyKey: chave.chave },
    snapshot: snapshotConfirmacaoEstorno(input.evento, alcance),
  };
}

export function montarIntencaoEstorno(
  tituloId: number,
  payload: PayloadLiquidacaoEstornarV2,
  snapshot: SnapshotConfirmacaoEstorno,
): IntencaoEstornoV2 {
  const { idempotencyKey, ...resto } = payload;
  return {
    chave: idempotencyKey,
    tituloId,
    liquidacaoId: payload.liquidacaoId,
    assinatura: assinaturaPayloadEstorno(resto),
    payload,
    snapshot,
  };
}

export function respostaEstornoConfirmaIntencao(input: {
  liquidacaoOriginalId: number;
  respostaId: number | null | undefined;
}): boolean {
  if (!Number.isInteger(input.respostaId) || (input.respostaId ?? 0) <= 0) return false;
  return input.respostaId !== input.liquidacaoOriginalId;
}

export function estornoRecusaDefinitiva(codigo?: string): boolean {
  return codigo === "BAD_REQUEST" || codigo === "NOT_FOUND";
}

export function estornoResultadoDesconhecido(input: { codigo?: string; mensagem?: string }): boolean {
  return pagamentoResultadoDesconhecido(input);
}

export function historicoSugereEstornoDaPendencia(input: {
  intencao: IntencaoEstornoV2;
  eventos: readonly Pick<EventoHistoricoPagamentoOficial, "tipo" | "liquidacaoOriginalId" | "dataLiquidacao">[] | undefined;
  historicoCarregando: boolean;
  historicoComErro: boolean;
}): "parecido" | "ausente" | "inconclusivo" {
  if (input.historicoCarregando || input.historicoComErro || !Array.isArray(input.eventos)) {
    return "inconclusivo";
  }
  const achou = input.eventos.some(evento => (
    (evento.tipo === "estorno_pagamento" || evento.tipo === "estorno_recebimento")
    && evento.liquidacaoOriginalId === input.intencao.liquidacaoId
    && evento.dataLiquidacao === input.intencao.payload.dataLiquidacao
  ));
  return achou ? "parecido" : "ausente";
}

export function mensagemSituacaoPendenciaEstorno(situacao: "parecido" | "ausente" | "inconclusivo"): string {
  if (situacao === "parecido") return MSG_ESTORNO_HISTORICO_PARECIDO;
  if (situacao === "ausente") return MSG_ESTORNO_HISTORICO_VAZIO_NAO_PROVA;
  return MSG_ESTORNO_RETRY_MESMA_CHAVE;
}

export function mensagemErroEstorno(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return detalhe?.trim() || MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  if (extra && !pareceSqlBruto(extra)) return extra;
  return "Não foi possível registrar o estorno.";
}

export function chaveArmazenamentoEstornoPendente(userId: number, liquidacaoId: number): string {
  return `${PREFIXO_ESTORNO_PENDENTE}:${userId}:${liquidacaoId}`;
}

export function gravarEstornoPendente(input: {
  userId: number;
  intencao: IntencaoEstornoV2;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return;
  const storage = input.storage ?? armazenamentoEstornoPendentePadrao();
  const registro: EstornoPendentePersistido = {
    versao: 1,
    userId: input.userId,
    tituloId: input.intencao.tituloId,
    liquidacaoId: input.intencao.liquidacaoId,
    chave: input.intencao.chave,
    assinatura: input.intencao.assinatura,
    payload: input.intencao.payload,
    snapshot: input.intencao.snapshot,
  };
  storage.setItem(
    chaveArmazenamentoEstornoPendente(input.userId, input.intencao.liquidacaoId),
    JSON.stringify(registro),
  );
}

export function lerEstornoPendente(input: {
  userId: number;
  liquidacaoId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoEstornoV2 | null {
  const storage = input.storage ?? armazenamentoEstornoPendentePadrao();
  const bruto = storage.getItem(chaveArmazenamentoEstornoPendente(input.userId, input.liquidacaoId));
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as EstornoPendentePersistido;
    if (lido?.versao !== 1) return null;
    if (lido.userId !== input.userId || lido.liquidacaoId !== input.liquidacaoId) return null;
    if (!chaveIdempotenciaEstornoValida(lido.chave)) return null;
    if (!lido.payload || lido.payload.idempotencyKey !== lido.chave) return null;
    if (lido.payload.liquidacaoId !== lido.liquidacaoId) return null;
    const { idempotencyKey, ...resto } = lido.payload;
    if (assinaturaPayloadEstorno(resto) !== lido.assinatura) return null;
    if (!lido.snapshot || lido.snapshot.liquidacaoId !== lido.liquidacaoId) return null;
    return {
      chave: lido.chave,
      tituloId: lido.tituloId,
      liquidacaoId: lido.liquidacaoId,
      assinatura: lido.assinatura,
      payload: lido.payload,
      snapshot: lido.snapshot,
    };
  } catch {
    return null;
  }
}

export function lerEstornoPendenteDoTitulo(input: {
  userId: number;
  tituloId: number;
  liquidacaoIds: readonly number[];
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoEstornoV2 | null {
  for (const liquidacaoId of input.liquidacaoIds) {
    const pendente = lerEstornoPendente({
      userId: input.userId,
      liquidacaoId,
      storage: input.storage,
    });
    if (pendente && pendente.tituloId === input.tituloId) return pendente;
  }
  return null;
}

export function apagarEstornoPendente(input: {
  userId: number;
  liquidacaoId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  const storage = input.storage ?? armazenamentoEstornoPendentePadrao();
  storage.removeItem(chaveArmazenamentoEstornoPendente(input.userId, input.liquidacaoId));
}

export function pendenciaEstornoFoiRecuperada(input: {
  persistido: Pick<IntencaoEstornoV2, "chave"> | null;
  chaveIniciadaNestaSessao: string | null;
}): boolean {
  return pendenciaFoiRecuperada(input);
}

function armazenamentoEstornoPendentePadrao(): ArmazenamentoPagamentoPendente {
  try {
    if (typeof localStorage === "undefined") return criarArmazenamentoPagamentoMemoria();
    return localStorage;
  } catch {
    return criarArmazenamentoPagamentoMemoria();
  }
}

function pareceSqlBruto(texto: string): boolean {
  return /select\s|insert\s|update\s|delete\s|from\s|where\s|sql/i.test(texto);
}
