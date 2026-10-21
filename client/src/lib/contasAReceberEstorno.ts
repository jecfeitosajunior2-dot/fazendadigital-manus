/**
 * Estorno de recebimento no detalhe V2.
 * Usa só financeiroV2.liquidacaoEstornar. Não recalcula saldo.
 */

import { fromCentavos, toCentavos } from "@shared/financeiroMoeda";
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
  alcanceEstornoDaLiquidacao,
  linhasTitulosAlcanceEstorno,
  respostaEstornoConfirmaIntencao,
  type AlcanceEstorno,
  type PayloadLiquidacaoEstornarV2,
  type TituloAlcanceEstorno,
} from "./contasAPagarEstorno";
import {
  MSG_ACESSO_NEGADO,
  MSG_NAO_E_CONTA_A_RECEBER,
  MSG_TITULO_NAO_ENCONTRADO,
  rotuloParcelasHistorico,
  rotuloSituacaoEventoRecebimento,
  type EventoHistoricoPagamentoOficial,
} from "./contasAReceberDetalhe";
import { tituloEstaCancelado, type TituloV2DetalheOficial } from "./contasAPagarListagem";
import {
  MSG_RECEBIMENTO_OCUPADO,
  criarArmazenamentoRecebimentoMemoria,
  recebimentoResultadoDesconhecido,
  pendenciaFoiRecuperada,
} from "./contasAReceberRecebimento";
import {
  contasVisiveisParaUsuario,
  type ContaFinanceiraV2Oficial,
} from "./contasFinanceirasV2";
import type { ArmazenamentoPagamentoPendente } from "./contasAPagarPagamento";

export {
  alcanceEstornoDaLiquidacao,
  linhasTitulosAlcanceEstorno,
  respostaEstornoConfirmaIntencao,
};
export type { AlcanceEstorno, PayloadLiquidacaoEstornarV2, TituloAlcanceEstorno };

export const ROTULO_ESTORNAR_RECEBIMENTO = "Estornar recebimento";
export const PREFIXO_ESTORNO_RECEBIMENTO_PENDENTE = "fd.finv2.estrecpend.v1";
export const PREFIXO_CHAVE_ESTORNO_RECEBIMENTO = "est-rec-";

export const MSG_ESTORNO_RECEBIMENTO_REGISTRADO = "Estorno registrado.";
export const MSG_ESTORNO_RECEBIMENTO_DATA = "Informe uma data de estorno válida.";
export const MSG_ESTORNO_RECEBIMENTO_NAO_EFETIVO = "Só é possível estornar um recebimento que ainda está válido.";
export const MSG_ESTORNO_RECEBIMENTO_DO_ESTORNO = "Não é possível estornar um estorno.";
export const MSG_ESTORNO_RECEBIMENTO_RESULTADO_DESCONHECIDO =
  "Não foi possível confirmar se o estorno foi gravado. Consulte o saldo e o histórico oficiais. Se precisar, tente de novo com a mesma operação — não inicie outro estorno.";
export const MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE =
  "Esta operação ainda não teve resposta definitiva. A nova tentativa usa a mesma chave e os mesmos dados.";
export const MSG_ESTORNO_RECEBIMENTO_INTENCAO_TRAVADA =
  "Os dados desta tentativa ficam travados até o resultado oficial. Assim evitamos um segundo estorno.";
export const MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA =
  "Há um estorno desta liquidação que ainda não teve confirmação. Os dados estão travados. Repita a mesma operação — não inicie outro estorno.";
export const MSG_ESTORNO_RECEBIMENTO_HISTORICO_PARECIDO =
  "O histórico oficial tem um estorno com os mesmos dados. Isso não substitui a confirmação do servidor. Repita a mesma operação.";
export const MSG_ESTORNO_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA =
  "O histórico ainda não mostra este estorno. Isso não prova que ele deixou de ser gravado.";
export const MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO =
  "O estorno afeta somente este título.";
export const MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS =
  "O estorno será integral e afetará todos os títulos relacionados a este recebimento.";
export const MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO =
  "Não foi possível confirmar se este recebimento pertence só a este título. O estorno ficou bloqueado até a consulta oficial informar o alcance completo da liquidação.";
export const MSG_ESTORNO_RECEBIMENTO_CHAVE_COLIDIU =
  "A chave desta tentativa não pode ser usada para estorno. A operação não foi enviada de novo.";
export const MSG_ESTORNO_RECEBIMENTO_ENVIO_DUPLICADO = "O envio já está em andamento.";
export const MSG_CONFIRMAR_ESTORNO_RECEBIMENTO = "Confirmar estorno?";

export type MotivoEstornoRecebimentoIndisponivel =
  | "nao_efetivo"
  | "ja_estornado"
  | "evento_estorno"
  | "ocupado"
  | "acesso"
  | "nao_receber"
  | "cancelado"
  | "pendente"
  | "alcance_incompleto";

export type SnapshotConfirmacaoEstornoRecebimento = {
  liquidacaoId: number;
  cliente: string;
  dataRecebimentoOriginal: string;
  contaId: number;
  contaNome: string;
  valorMovimentado: string | number;
  valorNesteTitulo: number;
  parcelasTexto: string;
  abrangencia: "somente_este_titulo" | "varios_titulos";
  titulosNaLiquidacao: TituloAlcanceEstorno[];
};

export type IntencaoEstornoRecebimentoV2 = {
  chave: string;
  tituloId: number;
  liquidacaoId: number;
  assinatura: string;
  payload: PayloadLiquidacaoEstornarV2;
  snapshot: SnapshotConfirmacaoEstornoRecebimento;
};

export type ErrosEstornoRecebimento = Partial<Record<"dataLiquidacao" | "geral", string>>;

export type EstornoRecebimentoPendentePersistido = {
  versao: 1;
  userId: number;
  tituloId: number;
  liquidacaoId: number;
  chave: string;
  assinatura: string;
  payload: PayloadLiquidacaoEstornarV2;
  snapshot: SnapshotConfirmacaoEstornoRecebimento;
};

export function novaChaveIdempotenciaEstornoRecebimento(): string {
  const bruto = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 10)}`;
  return `${PREFIXO_CHAVE_ESTORNO_RECEBIMENTO}${bruto}`.slice(0, 80);
}

export function chaveIdempotenciaEstornoRecebimentoValida(chave: string): boolean {
  const texto = chave.trim();
  if (texto.length < PREFIXO_CHAVE_ESTORNO_RECEBIMENTO.length || texto.length > 80) return false;
  return texto.startsWith(PREFIXO_CHAVE_ESTORNO_RECEBIMENTO);
}

export function recebimentoEfetivoParaEstorno(
  evento: Pick<EventoHistoricoPagamentoOficial, "tipo" | "estornadaPorLiquidacaoId" | "liquidacaoOriginalId">,
): boolean {
  if (evento.tipo === "estorno_pagamento" || evento.tipo === "estorno_recebimento") return false;
  if (evento.liquidacaoOriginalId != null) return false;
  if (evento.estornadaPorLiquidacaoId != null) return false;
  if (evento.tipo && evento.tipo !== "recebimento") return false;
  return rotuloSituacaoEventoRecebimento(evento) === "Recebimento";
}

export function snapshotConfirmacaoEstornoRecebimento(
  evento: EventoHistoricoPagamentoOficial,
  alcance: Extract<AlcanceEstorno, { ok: true }>,
  cliente: string,
): SnapshotConfirmacaoEstornoRecebimento {
  return {
    liquidacaoId: evento.liquidacaoId,
    cliente: cliente.trim() || "Cliente não informado",
    dataRecebimentoOriginal: evento.dataLiquidacao,
    contaId: evento.contaId,
    contaNome: evento.contaNome.trim() || "—",
    valorMovimentado: evento.valorMovimentado,
    valorNesteTitulo: evento.valorAlocadoNesteTitulo,
    parcelasTexto: rotuloParcelasHistorico(evento.alocacoesDesteTitulo),
    abrangencia: alcance.abrangencia,
    titulosNaLiquidacao: alcance.titulos,
  };
}

export function podeEstornarRecebimento(input: {
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId">;
  evento: EventoHistoricoPagamentoOficial | null | undefined;
  userId: number | null | undefined;
  ocupado: boolean;
  pendenteOutraLiquidacao?: boolean;
}): { ok: true } | { ok: false; motivo: MotivoEstornoRecebimentoIndisponivel } {
  if (input.titulo.tipo !== "receber") return { ok: false, motivo: "nao_receber" };
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
  if (!recebimentoEfetivoParaEstorno(input.evento)) return { ok: false, motivo: "nao_efetivo" };
  return { ok: true };
}

export function mensagemBloqueioEstornoRecebimento(motivo: MotivoEstornoRecebimentoIndisponivel): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "ja_estornado") return MSG_FIN_LIQUIDACAO_JA_ESTORNADA;
  if (motivo === "evento_estorno") return MSG_ESTORNO_RECEBIMENTO_DO_ESTORNO;
  if (motivo === "ocupado") return MSG_RECEBIMENTO_OCUPADO;
  if (motivo === "pendente") return MSG_ESTORNO_RECEBIMENTO_PENDENTE_RECUPERADA;
  if (motivo === "acesso") return MSG_ACESSO_NEGADO;
  if (motivo === "alcance_incompleto") return MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO;
  if (motivo === "nao_receber") return MSG_NAO_E_CONTA_A_RECEBER;
  return MSG_ESTORNO_RECEBIMENTO_NAO_EFETIVO;
}

export function contaDoEstornoRecebimento(
  contas: readonly ContaFinanceiraV2Oficial[],
  contaId: number,
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial | undefined {
  return contasVisiveisParaUsuario(contas, userId).find(conta => conta.id === contaId);
}

export function assinaturaPayloadEstornoRecebimento(
  payload: Omit<PayloadLiquidacaoEstornarV2, "idempotencyKey">,
): string {
  return [payload.liquidacaoId, payload.dataLiquidacao].join("|");
}

export function chaveParaEnvioEstornoRecebimento(input: {
  chaveAtual: string;
  assinaturaAtual: string;
  intencao: IntencaoEstornoRecebimentoV2 | null;
  resultadoDesconhecido: boolean;
}): { ok: true; chave: string } | { ok: false; motivo: "travada" | "chave" } {
  if (input.resultadoDesconhecido) {
    if (!input.intencao) return { ok: false, motivo: "chave" };
    if (input.assinaturaAtual !== input.intencao.assinatura) return { ok: false, motivo: "travada" };
    if (!chaveIdempotenciaEstornoRecebimentoValida(input.intencao.chave)) return { ok: false, motivo: "chave" };
    return { ok: true, chave: input.intencao.chave };
  }
  const chave = input.chaveAtual.trim();
  if (!chaveIdempotenciaEstornoRecebimentoValida(chave)) return { ok: false, motivo: "chave" };
  return { ok: true, chave };
}

export function validarEstornoRecebimento(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado" | "contraparteNomeSnapshot">;
  evento: EventoHistoricoPagamentoOficial;
  contas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  dataLiquidacao: string;
  idempotencyKey: string;
  ocupado?: boolean;
  resultadoDesconhecido?: boolean;
  intencao?: IntencaoEstornoRecebimentoV2 | null;
}): { ok: true; payload: PayloadLiquidacaoEstornarV2; snapshot: SnapshotConfirmacaoEstornoRecebimento }
  | { ok: false; erros: ErrosEstornoRecebimento } {
  const disponibilidade = podeEstornarRecebimento({
    titulo: input.titulo,
    evento: input.evento,
    userId: input.userId,
    ocupado: Boolean(input.ocupado),
  });
  if (!disponibilidade.ok) {
    return { ok: false, erros: { geral: mensagemBloqueioEstornoRecebimento(disponibilidade.motivo) } };
  }

  const alcance = alcanceEstornoDaLiquidacao(input.evento);
  if (!alcance.ok) {
    return { ok: false, erros: { geral: MSG_ESTORNO_RECEBIMENTO_ALCANCE_INCOMPLETO } };
  }

  const erros: ErrosEstornoRecebimento = {};
  const conta = contaDoEstornoRecebimento(input.contas, input.evento.contaId, input.userId);
  if (!conta) erros.geral = MSG_FIN_CONTA_NAO_ENCONTRADA;
  else if (typeof input.userId === "number" && conta.userId !== input.userId) erros.geral = MSG_FIN_ESCOPO;
  else if (!conta.ativa) erros.geral = MSG_FIN_CONTA_INATIVA;

  const data = input.dataLiquidacao.trim();
  if (!vencimentoISOValido(data)) erros.dataLiquidacao = MSG_ESTORNO_RECEBIMENTO_DATA;
  else if (conta && movimentoAnteriorAAbertura(data, conta.dataSaldoAbertura)) {
    erros.dataLiquidacao = MSG_FIN_DATA_ANTES_ABERTURA;
  }

  if (Object.keys(erros).length) return { ok: false, erros };

  const payloadBase = {
    liquidacaoId: input.evento.liquidacaoId,
    dataLiquidacao: data,
  };
  const chave = chaveParaEnvioEstornoRecebimento({
    chaveAtual: input.idempotencyKey,
    assinaturaAtual: assinaturaPayloadEstornoRecebimento(payloadBase),
    intencao: input.intencao ?? null,
    resultadoDesconhecido: Boolean(input.resultadoDesconhecido),
  });
  if (!chave.ok) {
    return {
      ok: false,
      erros: {
        geral: chave.motivo === "travada"
          ? MSG_ESTORNO_RECEBIMENTO_INTENCAO_TRAVADA
          : MSG_FIN_IDEMPOTENCY,
      },
    };
  }

  return {
    ok: true,
    payload: { ...payloadBase, idempotencyKey: chave.chave },
    snapshot: snapshotConfirmacaoEstornoRecebimento(
      input.evento,
      alcance,
      input.titulo.contraparteNomeSnapshot,
    ),
  };
}

export function montarIntencaoEstornoRecebimento(
  tituloId: number,
  payload: PayloadLiquidacaoEstornarV2,
  snapshot: SnapshotConfirmacaoEstornoRecebimento,
): IntencaoEstornoRecebimentoV2 {
  const { idempotencyKey, ...resto } = payload;
  return {
    chave: idempotencyKey,
    tituloId,
    liquidacaoId: payload.liquidacaoId,
    assinatura: assinaturaPayloadEstornoRecebimento(resto),
    payload,
    snapshot,
  };
}

export function estornoRecebimentoRecusaDefinitiva(codigo?: string): boolean {
  return codigo === "BAD_REQUEST" || codigo === "NOT_FOUND";
}

export function estornoRecebimentoResultadoDesconhecido(input: { codigo?: string; mensagem?: string }): boolean {
  return recebimentoResultadoDesconhecido(input);
}

export function historicoSugereEstornoRecebimentoDaPendencia(input: {
  intencao: IntencaoEstornoRecebimentoV2;
  eventos: readonly Pick<EventoHistoricoPagamentoOficial, "tipo" | "liquidacaoOriginalId" | "dataLiquidacao">[] | undefined;
  historicoCarregando: boolean;
  historicoComErro: boolean;
}): "parecido" | "ausente" | "inconclusivo" {
  if (input.historicoCarregando || input.historicoComErro || !Array.isArray(input.eventos)) {
    return "inconclusivo";
  }
  const achou = input.eventos.some(evento => (
    evento.tipo === "estorno_recebimento"
    && evento.liquidacaoOriginalId === input.intencao.liquidacaoId
    && evento.dataLiquidacao === input.intencao.payload.dataLiquidacao
  ));
  return achou ? "parecido" : "ausente";
}

export function mensagemSituacaoPendenciaEstornoRecebimento(
  situacao: "parecido" | "ausente" | "inconclusivo",
): string {
  if (situacao === "parecido") return MSG_ESTORNO_RECEBIMENTO_HISTORICO_PARECIDO;
  if (situacao === "ausente") return MSG_ESTORNO_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA;
  return MSG_ESTORNO_RECEBIMENTO_RETRY_MESMA_CHAVE;
}

export function mensagemErroEstornoRecebimento(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return detalhe?.trim() || MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  if (extra && !pareceSqlBruto(extra)) return extra;
  return "Não foi possível registrar o estorno.";
}

export function textoAlcanceConfirmacaoEstornoRecebimento(
  abrangencia: "somente_este_titulo" | "varios_titulos",
): string {
  return abrangencia === "somente_este_titulo"
    ? MSG_ESTORNO_RECEBIMENTO_SOMENTE_ESTE_TITULO
    : MSG_ESTORNO_RECEBIMENTO_VARIOS_TITULOS;
}

export function textoConfirmacaoEstornoRecebimento(input: {
  cliente: string;
  dataRecebimentoOriginal: string;
  contaNome: string;
  valorTotal: string | number;
  valorNesteTitulo: number;
  parcelasTexto: string;
  dataEstorno: string;
  abrangencia: "somente_este_titulo" | "varios_titulos";
  titulos: TituloAlcanceEstorno[];
}): string {
  const linhas = [
    `Cliente: ${input.cliente.trim() || "Cliente não informado"}`,
    `Data do recebimento original: ${input.dataRecebimentoOriginal}`,
    `Conta financeira: ${input.contaNome.trim() || "—"}`,
    `Valor total recebido: ${formatarDinheiroConfirmacao(input.valorTotal)}`,
    `Valor atribuído ao título atual: ${formatarDinheiroConfirmacao(input.valorNesteTitulo)}`,
    `Parcelas envolvidas: ${input.parcelasTexto}`,
    `Data do estorno: ${input.dataEstorno}`,
  ];
  if (input.abrangencia === "varios_titulos") {
    linhas.push("Títulos envolvidos:");
    for (const titulo of linhasTitulosAlcanceEstorno(input.titulos)) {
      linhas.push(`- ${titulo.rotulo}: ${formatarDinheiroConfirmacao(titulo.valorAlocado)}`);
    }
  }
  linhas.push(textoAlcanceConfirmacaoEstornoRecebimento(input.abrangencia));
  return linhas.join("\n");
}

export function chaveArmazenamentoEstornoRecebimentoPendente(userId: number, liquidacaoId: number): string {
  return `${PREFIXO_ESTORNO_RECEBIMENTO_PENDENTE}:${userId}:${liquidacaoId}`;
}

export function gravarEstornoRecebimentoPendente(input: {
  userId: number;
  intencao: IntencaoEstornoRecebimentoV2;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return;
  const storage = input.storage ?? armazenamentoEstornoRecebimentoPendentePadrao();
  const registro: EstornoRecebimentoPendentePersistido = {
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
    chaveArmazenamentoEstornoRecebimentoPendente(input.userId, input.intencao.liquidacaoId),
    JSON.stringify(registro),
  );
}

export function lerEstornoRecebimentoPendente(input: {
  userId: number;
  liquidacaoId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoEstornoRecebimentoV2 | null {
  const storage = input.storage ?? armazenamentoEstornoRecebimentoPendentePadrao();
  const bruto = storage.getItem(chaveArmazenamentoEstornoRecebimentoPendente(input.userId, input.liquidacaoId));
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as EstornoRecebimentoPendentePersistido;
    if (lido?.versao !== 1) return null;
    if (lido.userId !== input.userId || lido.liquidacaoId !== input.liquidacaoId) return null;
    if (!chaveIdempotenciaEstornoRecebimentoValida(lido.chave)) return null;
    if (!lido.payload || lido.payload.idempotencyKey !== lido.chave) return null;
    if (lido.payload.liquidacaoId !== lido.liquidacaoId) return null;
    const { idempotencyKey, ...resto } = lido.payload;
    if (assinaturaPayloadEstornoRecebimento(resto) !== lido.assinatura) return null;
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

export function lerEstornoRecebimentoPendenteDoTitulo(input: {
  userId: number;
  tituloId: number;
  liquidacaoIds: readonly number[];
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoEstornoRecebimentoV2 | null {
  for (const liquidacaoId of input.liquidacaoIds) {
    const pendente = lerEstornoRecebimentoPendente({
      userId: input.userId,
      liquidacaoId,
      storage: input.storage,
    });
    if (pendente && pendente.tituloId === input.tituloId) return pendente;
  }
  return null;
}

export function apagarEstornoRecebimentoPendente(input: {
  userId: number;
  liquidacaoId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  const storage = input.storage ?? armazenamentoEstornoRecebimentoPendentePadrao();
  storage.removeItem(chaveArmazenamentoEstornoRecebimentoPendente(input.userId, input.liquidacaoId));
}

export function pendenciaEstornoRecebimentoFoiRecuperada(input: {
  persistido: Pick<IntencaoEstornoRecebimentoV2, "chave"> | null;
  chaveIniciadaNestaSessao: string | null;
}): boolean {
  return pendenciaFoiRecuperada(input);
}

export const criarArmazenamentoEstornoRecebimentoMemoria = criarArmazenamentoRecebimentoMemoria;

function armazenamentoEstornoRecebimentoPendentePadrao(): ArmazenamentoPagamentoPendente {
  try {
    if (typeof localStorage === "undefined") return criarArmazenamentoRecebimentoMemoria();
    return localStorage;
  } catch {
    return criarArmazenamentoRecebimentoMemoria();
  }
}

function formatarDinheiroConfirmacao(valor: string | number): string {
  return `R$ ${fromCentavos(toCentavos(valor)).toFixed(2).replace(".", ",")}`;
}

function pareceSqlBruto(texto: string): boolean {
  return /select\s|insert\s|update\s|delete\s|from\s|where\s|sql/i.test(texto);
}
