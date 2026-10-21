/**
 * Registro de recebimento de uma parcela no detalhe V2.
 * Usa financeiroV2.liquidacaoReceber. Não recalcula saldo.
 * A chave de idempotência cobre timeout depois da gravação.
 */

import { dinheiroPositivo, fromCentavos, toCentavos } from "@shared/financeiroMoeda";
import {
  MSG_FIN_CONTA_INATIVA,
  MSG_FIN_CONTA_NAO_ENCONTRADA,
  MSG_FIN_DATA_ANTES_ABERTURA,
  MSG_FIN_ESCOPO,
  MSG_FIN_FORMULA_CAIXA,
  MSG_FIN_IDEMPOTENCY,
  MSG_FIN_OVERPAYMENT,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_VALOR_POSITIVO,
  movimentoAnteriorAAbertura,
} from "@shared/financeiroNucleo";
import { MSG_ACESSO_NEGADO, MSG_TITULO_NAO_ENCONTRADO } from "./contasAReceberDetalhe";
import { vencimentoISOValido } from "./contasAPagarCondicao";
import {
  chaveParaEnvioPagamento,
  criarArmazenamentoPagamentoMemoria,
  pagamentoRecusaDefinitiva,
  pagamentoResultadoDesconhecido,
  parcelaTemSaldoAberto,
  pendenciaFoiRecuperada,
  type ArmazenamentoPagamentoPendente,
  type PayloadLiquidacaoPagarV2,
} from "./contasAPagarPagamento";
import {
  contasVisiveisParaUsuario,
  type ContaFinanceiraV2Oficial,
} from "./contasFinanceirasV2";
import { tituloEstaCancelado, type ParcelaV2Oficial, type TituloV2DetalheOficial } from "./contasAPagarListagem";

export const ROTULO_REGISTRAR_RECEBIMENTO = "Registrar recebimento";
export const MSG_RECEBIMENTO_REGISTRADO = "Recebimento registrado.";
export const MSG_RECEBIMENTO_CONTA = "Selecione a conta do caixa.";
export const MSG_RECEBIMENTO_DATA = "Informe uma data de recebimento válida.";
export const MSG_RECEBIMENTO_PARCELA_RECEBIDA = "Esta parcela já está integralmente recebida.";
export const MSG_RECEBIMENTO_SEM_PARCELAS = "Defina as parcelas antes de registrar um recebimento.";
export const MSG_RECEBIMENTO_RESULTADO_DESCONHECIDO =
  "Não foi possível confirmar se o recebimento foi gravado. Consulte o saldo e o histórico oficiais. Se precisar, tente de novo com a mesma operação — não inicie outro recebimento.";
export const MSG_RECEBIMENTO_RETRY_MESMA_CHAVE =
  "Esta operação ainda não teve resposta definitiva. A nova tentativa usa a mesma chave e os mesmos dados.";
export const MSG_RECEBIMENTO_INTENCAO_TRAVADA =
  "Os dados desta tentativa ficam travados até o resultado oficial. Assim evitamos um segundo recebimento.";
export const MSG_RECEBIMENTO_OCUPADO = "Aguarde a confirmação em andamento.";
export const MSG_RECEBIMENTO_ENVIO_DUPLICADO = "O envio já está em andamento.";
export const MSG_RECEBIMENTO_PENDENTE_RECUPERADA =
  "Há um recebimento desta conta que ainda não teve confirmação. Os dados estão travados. Repita a mesma operação — não inicie outro recebimento.";
export const MSG_RECEBIMENTO_HISTORICO_PARECIDO =
  "O histórico oficial tem um recebimento com os mesmos dados. Isso não substitui a confirmação do servidor. Repita a mesma operação.";
export const MSG_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA =
  "O histórico ainda não mostra este recebimento. Isso não prova que ele deixou de ser gravado.";
export const MSG_CONFIRMAR_RECEBIMENTO = "Confirmar recebimento?";
export const PREFIXO_RECEBIMENTO_PENDENTE = "fd.finv2.recpend.v1";

export type PayloadLiquidacaoReceberV2 = PayloadLiquidacaoPagarV2;

export type RascunhoRecebimentoParcela = {
  parcelaId: number;
  valor: string;
  contaId: string;
  dataLiquidacao: string;
};

export type ErrosRecebimentoParcela = Partial<Record<
  "valor" | "contaId" | "dataLiquidacao" | "geral",
  string
>>;

export type IntencaoRecebimentoV2 = {
  chave: string;
  tituloId: number;
  parcelaId: number;
  assinatura: string;
  payload: PayloadLiquidacaoReceberV2;
};

export type MotivoRecebimentoIndisponivel =
  | "cancelado"
  | "recebida"
  | "sem_parcelas"
  | "sem_conta"
  | "ocupado"
  | "acesso"
  | "nao_receber"
  | "pendente";

export type RecebimentoPendentePersistido = {
  versao: 1;
  userId: number;
  tituloId: number;
  parcelaId: number;
  chave: string;
  assinatura: string;
  payload: PayloadLiquidacaoReceberV2;
};

export {
  criarArmazenamentoPagamentoMemoria as criarArmazenamentoRecebimentoMemoria,
  pagamentoRecusaDefinitiva as recebimentoRecusaDefinitiva,
  pagamentoResultadoDesconhecido as recebimentoResultadoDesconhecido,
  parcelaTemSaldoAberto,
  pendenciaFoiRecuperada,
};

export function novaChaveIdempotenciaRecebimento(): string {
  const bruto = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 10)}`;
  return `rec-${bruto}`.slice(0, 80);
}

export function chaveIdempotenciaRecebimentoValida(chave: string): boolean {
  const texto = chave.trim();
  return texto.length >= 1 && texto.length <= 80;
}

export function contasAtivasParaRecebimento(
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial[] {
  return contasVisiveisParaUsuario(contas, userId).filter(conta => conta.ativa);
}

export function podeRegistrarRecebimentoParcela(input: {
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId" | "parcelas">;
  parcela: Pick<ParcelaV2Oficial, "id" | "quitada" | "saldoPrincipal"> | null | undefined;
  contasAtivas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  ocupado: boolean;
  pendenteDestaParcela?: boolean;
  pendenteOutraParcela?: boolean;
}): { ok: true } | { ok: false; motivo: MotivoRecebimentoIndisponivel } {
  if (input.titulo.tipo !== "receber") return { ok: false, motivo: "nao_receber" };
  if (typeof input.userId === "number" && input.titulo.userId !== input.userId) {
    return { ok: false, motivo: "acesso" };
  }
  if (tituloEstaCancelado(input.titulo) || input.titulo.estado !== "ativo") {
    return { ok: false, motivo: "cancelado" };
  }
  if (input.titulo.parcelas.length === 0) return { ok: false, motivo: "sem_parcelas" };
  if (input.ocupado) return { ok: false, motivo: "ocupado" };
  if (input.pendenteOutraParcela) return { ok: false, motivo: "pendente" };
  if (input.contasAtivas.length === 0 && !input.pendenteDestaParcela) return { ok: false, motivo: "sem_conta" };
  if (!input.parcela || !input.titulo.parcelas.some(item => item.id === input.parcela!.id)) {
    return { ok: false, motivo: "sem_parcelas" };
  }
  if (!input.pendenteDestaParcela && !parcelaTemSaldoAberto(input.parcela)) return { ok: false, motivo: "recebida" };
  return { ok: true };
}

export function formatarValorDigitadoRecebimento(valor: string | number): string {
  const centavos = toCentavos(valor);
  if (!Number.isFinite(centavos)) return "";
  return fromCentavos(centavos).toFixed(2).replace(".", ",");
}

export function rascunhoInicialRecebimento(input: {
  parcela: Pick<ParcelaV2Oficial, "id" | "saldoPrincipal">;
  dataLiquidacao: string;
  contaId?: number | null;
}): RascunhoRecebimentoParcela {
  return {
    parcelaId: input.parcela.id,
    valor: formatarValorDigitadoRecebimento(input.parcela.saldoPrincipal),
    contaId: input.contaId != null ? String(input.contaId) : "",
    dataLiquidacao: input.dataLiquidacao,
  };
}

export function parseValorRecebimento(raw: string): { ok: true; valor: number } | { ok: false } {
  const normalizado = normalizarValorDigitado(raw);
  if (!normalizado || !dinheiroPositivo(normalizado)) return { ok: false };
  return { ok: true, valor: fromCentavos(toCentavos(normalizado)) };
}

export function assinaturaPayloadRecebimento(payload: Omit<PayloadLiquidacaoReceberV2, "idempotencyKey">): string {
  const aloc = payload.alocacoes[0];
  return [
    payload.contaId,
    payload.dataLiquidacao,
    toCentavos(payload.valorMovimentado),
    aloc?.parcelaId ?? "",
    toCentavos(aloc?.principalLiquidado ?? 0),
  ].join("|");
}

export function validarRecebimentoParcela(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado" | "parcelas">;
  parcela: Pick<ParcelaV2Oficial, "id" | "quitada" | "saldoPrincipal">;
  contas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  rascunho: RascunhoRecebimentoParcela;
  idempotencyKey: string;
  ocupado?: boolean;
  resultadoDesconhecido?: boolean;
  intencao?: IntencaoRecebimentoV2 | null;
}): { ok: true; payload: PayloadLiquidacaoReceberV2 } | { ok: false; erros: ErrosRecebimentoParcela } {
  const contasAtivas = contasAtivasParaRecebimento(input.contas, input.userId);
  const disponibilidade = podeRegistrarRecebimentoParcela({
    titulo: input.titulo,
    parcela: input.parcela,
    contasAtivas,
    userId: input.userId,
    ocupado: Boolean(input.ocupado),
    pendenteDestaParcela: Boolean(input.resultadoDesconhecido),
  });
  if (!disponibilidade.ok && disponibilidade.motivo !== "sem_conta") {
    return { ok: false, erros: { geral: mensagemBloqueioRecebimento(disponibilidade.motivo) } };
  }

  const erros: ErrosRecebimentoParcela = {};
  const valor = parseValorRecebimento(input.rascunho.valor);
  if (!valor.ok) erros.valor = MSG_FIN_VALOR_POSITIVO;
  else if (!input.resultadoDesconhecido && toCentavos(valor.valor) > toCentavos(input.parcela.saldoPrincipal)) {
    erros.valor = MSG_FIN_OVERPAYMENT;
  }

  const contaId = Number.parseInt(input.rascunho.contaId, 10);
  if (!Number.isInteger(contaId) || contaId <= 0) erros.contaId = MSG_RECEBIMENTO_CONTA;
  const conta = Number.isInteger(contaId)
    ? input.contas.find(item => item.id === contaId)
    : undefined;
  if (Number.isInteger(contaId) && contaId > 0) {
    if (!conta) erros.contaId = MSG_FIN_CONTA_NAO_ENCONTRADA;
    else if (typeof input.userId === "number" && conta.userId !== input.userId) erros.contaId = MSG_FIN_ESCOPO;
    else if (!conta.ativa) erros.contaId = MSG_FIN_CONTA_INATIVA;
  }

  const data = input.rascunho.dataLiquidacao.trim();
  if (!vencimentoISOValido(data)) erros.dataLiquidacao = MSG_RECEBIMENTO_DATA;
  else if (conta && movimentoAnteriorAAbertura(data, conta.dataSaldoAbertura)) {
    erros.dataLiquidacao = MSG_FIN_DATA_ANTES_ABERTURA;
  }

  if (Object.keys(erros).length || !valor.ok || !Number.isInteger(contaId) || contaId <= 0) {
    return { ok: false, erros };
  }

  const payloadBase: Omit<PayloadLiquidacaoReceberV2, "idempotencyKey"> = {
    contaId,
    dataLiquidacao: data,
    valorMovimentado: valor.valor,
    formaPagamento: null,
    referencia: null,
    observacoes: null,
    alocacoes: [{ parcelaId: input.parcela.id, principalLiquidado: valor.valor }],
  };
  if (toCentavos(payloadBase.valorMovimentado) !== toCentavos(payloadBase.alocacoes[0]!.principalLiquidado)) {
    return { ok: false, erros: { geral: MSG_FIN_FORMULA_CAIXA } };
  }

  const chave = chaveParaEnvioPagamento({
    chaveAtual: input.idempotencyKey,
    assinaturaAtual: assinaturaPayloadRecebimento(payloadBase),
    intencao: input.intencao ?? null,
    resultadoDesconhecido: Boolean(input.resultadoDesconhecido),
  });
  if (!chave.ok) {
    return {
      ok: false,
      erros: { geral: chave.motivo === "travada" ? MSG_RECEBIMENTO_INTENCAO_TRAVADA : MSG_FIN_IDEMPOTENCY },
    };
  }

  return {
    ok: true,
    payload: { ...payloadBase, idempotencyKey: chave.chave },
  };
}

export function montarIntencaoRecebimento(
  tituloId: number,
  payload: PayloadLiquidacaoReceberV2,
): IntencaoRecebimentoV2 {
  const { idempotencyKey, ...resto } = payload;
  return {
    chave: idempotencyKey,
    tituloId,
    parcelaId: payload.alocacoes[0]!.parcelaId,
    assinatura: assinaturaPayloadRecebimento(resto),
    payload,
  };
}

export function mensagemBloqueioRecebimento(motivo: MotivoRecebimentoIndisponivel): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "recebida") return MSG_RECEBIMENTO_PARCELA_RECEBIDA;
  if (motivo === "sem_parcelas") return MSG_RECEBIMENTO_SEM_PARCELAS;
  if (motivo === "sem_conta") return "Cadastre uma conta financeira para registrar recebimentos.";
  if (motivo === "ocupado") return MSG_RECEBIMENTO_OCUPADO;
  if (motivo === "pendente") return MSG_RECEBIMENTO_PENDENTE_RECUPERADA;
  if (motivo === "acesso") return MSG_ACESSO_NEGADO;
  return MSG_TITULO_NAO_ENCONTRADO;
}

export function mensagemErroRecebimento(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return detalhe?.trim() || MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  if (extra && !pareceSqlBruto(extra)) return extra;
  return "Não foi possível registrar o recebimento.";
}

export function rascunhoDeIntencaoRecebimento(intencao: IntencaoRecebimentoV2): RascunhoRecebimentoParcela {
  return {
    parcelaId: intencao.parcelaId,
    valor: formatarValorDigitadoRecebimento(intencao.payload.valorMovimentado),
    contaId: String(intencao.payload.contaId),
    dataLiquidacao: intencao.payload.dataLiquidacao,
  };
}

export function chaveArmazenamentoRecebimentoPendente(userId: number, tituloId: number): string {
  return `${PREFIXO_RECEBIMENTO_PENDENTE}:${userId}:${tituloId}`;
}

export function armazenamentoRecebimentoPendentePadrao(): ArmazenamentoPagamentoPendente {
  try {
    if (typeof localStorage === "undefined") return criarArmazenamentoPagamentoMemoria();
    return localStorage;
  } catch {
    return criarArmazenamentoPagamentoMemoria();
  }
}

export function gravarRecebimentoPendente(input: {
  userId: number;
  intencao: IntencaoRecebimentoV2;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return;
  const storage = input.storage ?? armazenamentoRecebimentoPendentePadrao();
  const registro: RecebimentoPendentePersistido = {
    versao: 1,
    userId: input.userId,
    tituloId: input.intencao.tituloId,
    parcelaId: input.intencao.parcelaId,
    chave: input.intencao.chave,
    assinatura: input.intencao.assinatura,
    payload: input.intencao.payload,
  };
  storage.setItem(
    chaveArmazenamentoRecebimentoPendente(input.userId, input.intencao.tituloId),
    JSON.stringify(registro),
  );
}

export function lerRecebimentoPendente(input: {
  userId: number;
  tituloId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoRecebimentoV2 | null {
  const storage = input.storage ?? armazenamentoRecebimentoPendentePadrao();
  const bruto = storage.getItem(chaveArmazenamentoRecebimentoPendente(input.userId, input.tituloId));
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as RecebimentoPendentePersistido;
    if (lido?.versao !== 1) return null;
    if (lido.userId !== input.userId || lido.tituloId !== input.tituloId) return null;
    if (!chaveIdempotenciaRecebimentoValida(lido.chave)) return null;
    if (!lido.payload || lido.payload.idempotencyKey !== lido.chave) return null;
    if (lido.parcelaId !== lido.payload.alocacoes?.[0]?.parcelaId) return null;
    const { idempotencyKey, ...resto } = lido.payload;
    if (assinaturaPayloadRecebimento(resto) !== lido.assinatura) return null;
    return {
      chave: lido.chave,
      tituloId: lido.tituloId,
      parcelaId: lido.parcelaId,
      assinatura: lido.assinatura,
      payload: lido.payload,
    };
  } catch {
    return null;
  }
}

export function apagarRecebimentoPendente(input: {
  userId: number;
  tituloId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  const storage = input.storage ?? armazenamentoRecebimentoPendentePadrao();
  storage.removeItem(chaveArmazenamentoRecebimentoPendente(input.userId, input.tituloId));
}

export function historicoSugereRecebimentoDaPendencia(input: {
  intencao: IntencaoRecebimentoV2;
  eventos: readonly {
    tipo?: string;
    contaId: number;
    dataLiquidacao: string;
    estornadaPorLiquidacaoId?: number | null;
    alocacoesDesteTitulo: Array<{
      parcelaId: number;
      principalLiquidado: string | number;
    }>;
  }[] | undefined;
  historicoCarregando: boolean;
  historicoComErro: boolean;
}): "parecido" | "ausente" | "inconclusivo" {
  if (input.historicoCarregando || input.historicoComErro || !Array.isArray(input.eventos)) {
    return "inconclusivo";
  }
  const alvo = input.intencao.payload.alocacoes[0];
  if (!alvo) return "inconclusivo";
  const achou = input.eventos.some(evento => {
    if (evento.tipo && evento.tipo !== "recebimento") return false;
    if (evento.estornadaPorLiquidacaoId != null) return false;
    if (evento.contaId !== input.intencao.payload.contaId) return false;
    if (evento.dataLiquidacao !== input.intencao.payload.dataLiquidacao) return false;
    return evento.alocacoesDesteTitulo.some(aloc => (
      aloc.parcelaId === alvo.parcelaId
      && toCentavos(aloc.principalLiquidado) === toCentavos(alvo.principalLiquidado)
    ));
  });
  return achou ? "parecido" : "ausente";
}

export function mensagemSituacaoPendenciaRecebimento(situacao: "parecido" | "ausente" | "inconclusivo"): string {
  if (situacao === "parecido") return MSG_RECEBIMENTO_HISTORICO_PARECIDO;
  if (situacao === "ausente") return MSG_RECEBIMENTO_HISTORICO_VAZIO_NAO_PROVA;
  return MSG_RECEBIMENTO_RETRY_MESMA_CHAVE;
}

export function textoConfirmacaoRecebimento(input: {
  cliente: string;
  parcelaNumero: number;
  contaNome: string;
  dataLiquidacao: string;
  valor: number;
}): string {
  return [
    `Cliente: ${input.cliente.trim() || "Cliente não informado"}`,
    `Parcela: ${input.parcelaNumero}`,
    `Conta financeira: ${input.contaNome.trim() || "—"}`,
    `Data: ${input.dataLiquidacao}`,
    `Valor a receber: R$ ${fromCentavos(toCentavos(input.valor)).toFixed(2).replace(".", ",")}`,
  ].join("\n");
}

function pareceSqlBruto(texto: string): boolean {
  return /select\s|insert\s|update\s|delete\s|from\s|where\s|sql/i.test(texto);
}

function normalizarValorDigitado(raw: string): string {
  const texto = raw.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!texto) return "";
  if (texto.includes(",") && texto.includes(".")) return texto.replace(/\./g, "").replace(",", ".");
  if (texto.includes(",")) return texto.replace(",", ".");
  return texto;
}
