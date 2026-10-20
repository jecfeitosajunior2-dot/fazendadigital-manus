/**
 * Registro de pagamento de uma parcela no detalhe V2.
 * Usa financeiroV2.liquidacaoPagar. Não recalcula saldo.
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
  MSG_FIN_PARCELA_NAO_ENCONTRADA,
  MSG_FIN_TITULO_CANCELADO,
  MSG_FIN_VALOR_POSITIVO,
  movimentoAnteriorAAbertura,
} from "@shared/financeiroNucleo";
import { MSG_ACESSO_NEGADO, MSG_TITULO_NAO_ENCONTRADO } from "./contasAPagarDetalhe";
import { vencimentoISOValido } from "./contasAPagarCondicao";
import {
  contasVisiveisParaUsuario,
  type ContaFinanceiraV2Oficial,
} from "./contasFinanceirasV2";
import { tituloEstaCancelado, type ParcelaV2Oficial, type TituloV2DetalheOficial } from "./contasAPagarListagem";

export const ROTULO_REGISTRAR_PAGAMENTO = "Registrar pagamento";
export const MSG_PAGAMENTO_REGISTRADO = "Pagamento registrado.";
export const MSG_PAGAMENTO_CONTA = "Selecione a conta do caixa.";
export const MSG_PAGAMENTO_DATA = "Informe uma data de pagamento válida.";
export const MSG_PAGAMENTO_PARCELA_QUITADA = "Esta parcela já está quitada.";
export const MSG_PAGAMENTO_SEM_PARCELAS = "Defina a condição de pagamento antes de registrar um pagamento.";
export const MSG_PAGAMENTO_RESULTADO_DESCONHECIDO =
  "Não foi possível confirmar se o pagamento foi gravado. Consulte o saldo e o histórico oficiais. Se precisar, tente de novo com a mesma operação — não inicie outro pagamento.";
export const MSG_PAGAMENTO_RETRY_MESMA_CHAVE =
  "Esta operação ainda não teve resposta definitiva. A nova tentativa usa a mesma chave e os mesmos dados.";
export const MSG_PAGAMENTO_INTENCAO_TRAVADA =
  "Os dados desta tentativa ficam travados até o resultado oficial. Assim evitamos um segundo pagamento.";
export const MSG_PAGAMENTO_OCUPADO = "Aguarde a confirmação em andamento.";
export const MSG_PAGAMENTO_ENVIO_DUPLICADO = "O envio já está em andamento.";
export const MSG_PAGAMENTO_PENDENTE_RECUPERADA =
  "Há um pagamento desta conta que ainda não teve confirmação. Os dados estão travados. Repita a mesma operação — não inicie outro pagamento.";
export const MSG_PAGAMENTO_HISTORICO_PARECIDO =
  "O histórico oficial tem um pagamento com os mesmos dados. Isso não substitui a confirmação do servidor. Repita a mesma operação.";
export const MSG_PAGAMENTO_HISTORICO_VAZIO_NAO_PROVA =
  "O histórico ainda não mostra este pagamento. Isso não prova que ele deixou de ser gravado.";
export const PREFIXO_PAGAMENTO_PENDENTE = "fd.finv2.pagpend.v1";

export type RascunhoPagamentoParcela = {
  parcelaId: number;
  valor: string;
  contaId: string;
  dataLiquidacao: string;
  formaPagamento: string;
  referencia: string;
  observacoes: string;
};

export type PayloadLiquidacaoPagarV2 = {
  contaId: number;
  dataLiquidacao: string;
  valorMovimentado: number;
  idempotencyKey: string;
  formaPagamento: string | null;
  referencia: string | null;
  observacoes: string | null;
  alocacoes: Array<{
    parcelaId: number;
    principalLiquidado: number;
  }>;
};

export type ErrosPagamentoParcela = Partial<Record<
  "valor" | "contaId" | "dataLiquidacao" | "formaPagamento" | "referencia" | "observacoes" | "geral",
  string
>>;

export type IntencaoPagamentoV2 = {
  chave: string;
  tituloId: number;
  parcelaId: number;
  assinatura: string;
  payload: PayloadLiquidacaoPagarV2;
};

export type MotivoPagamentoIndisponivel =
  | "cancelado"
  | "quitada"
  | "sem_parcelas"
  | "sem_conta"
  | "ocupado"
  | "acesso"
  | "nao_pagar"
  | "pendente";

export type ArmazenamentoPagamentoPendente = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PagamentoPendentePersistido = {
  versao: 1;
  userId: number;
  tituloId: number;
  parcelaId: number;
  chave: string;
  assinatura: string;
  payload: PayloadLiquidacaoPagarV2;
};

export function novaChaveIdempotenciaPagamento(): string {
  const bruto = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}${Math.random().toString(36).slice(2, 10)}`;
  return `pag-${bruto}`.slice(0, 80);
}

export function chaveIdempotenciaPagamentoValida(chave: string): boolean {
  const texto = chave.trim();
  return texto.length >= 1 && texto.length <= 80;
}

export function contasAtivasParaPagamento(
  contas: readonly ContaFinanceiraV2Oficial[],
  userId: number | null | undefined,
): ContaFinanceiraV2Oficial[] {
  return contasVisiveisParaUsuario(contas, userId).filter(conta => conta.ativa);
}

export function parcelaTemSaldoAberto(parcela: Pick<ParcelaV2Oficial, "quitada" | "saldoPrincipal">): boolean {
  if (parcela.quitada) return false;
  const saldo = toCentavos(parcela.saldoPrincipal);
  return Number.isFinite(saldo) && saldo > 0;
}

export function podeRegistrarPagamentoParcela(input: {
  titulo: Pick<TituloV2DetalheOficial, "tipo" | "estado" | "userId" | "parcelas">;
  parcela: Pick<ParcelaV2Oficial, "id" | "quitada" | "saldoPrincipal"> | null | undefined;
  contasAtivas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  ocupado: boolean;
  pendenteDestaParcela?: boolean;
  pendenteOutraParcela?: boolean;
}): { ok: true } | { ok: false; motivo: MotivoPagamentoIndisponivel } {
  if (input.titulo.tipo !== "pagar") return { ok: false, motivo: "nao_pagar" };
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
  if (!input.pendenteDestaParcela && !parcelaTemSaldoAberto(input.parcela)) return { ok: false, motivo: "quitada" };
  return { ok: true };
}

export function rascunhoInicialPagamento(input: {
  parcela: Pick<ParcelaV2Oficial, "id" | "saldoPrincipal">;
  dataLiquidacao: string;
  contaId?: number | null;
}): RascunhoPagamentoParcela {
  return {
    parcelaId: input.parcela.id,
    valor: formatarValorDigitadoPagamento(input.parcela.saldoPrincipal),
    contaId: input.contaId != null ? String(input.contaId) : "",
    dataLiquidacao: input.dataLiquidacao,
    formaPagamento: "",
    referencia: "",
    observacoes: "",
  };
}

export function formatarValorDigitadoPagamento(valor: string | number): string {
  const centavos = toCentavos(valor);
  if (!Number.isFinite(centavos)) return "";
  return fromCentavos(centavos).toFixed(2).replace(".", ",");
}

export function parseValorPagamento(raw: string): { ok: true; valor: number } | { ok: false } {
  const normalizado = normalizarValorDigitado(raw);
  if (!normalizado || !dinheiroPositivo(normalizado)) return { ok: false };
  return { ok: true, valor: fromCentavos(toCentavos(normalizado)) };
}

export function assinaturaPayloadPagamento(payload: Omit<PayloadLiquidacaoPagarV2, "idempotencyKey">): string {
  const aloc = payload.alocacoes[0];
  return [
    payload.contaId,
    payload.dataLiquidacao,
    toCentavos(payload.valorMovimentado),
    aloc?.parcelaId ?? "",
    toCentavos(aloc?.principalLiquidado ?? 0),
    payload.formaPagamento ?? "",
    payload.referencia ?? "",
    payload.observacoes ?? "",
  ].join("|");
}

export function devePreservarChaveIdempotencia(input: {
  chaveAtual: string;
  assinaturaAtual: string;
  intencao: IntencaoPagamentoV2 | null;
  resultadoDesconhecido: boolean;
}): boolean {
  if (!input.intencao) return false;
  if (!chaveIdempotenciaPagamentoValida(input.chaveAtual)) return false;
  if (input.resultadoDesconhecido) return true;
  return input.intencao.chave === input.chaveAtual && input.intencao.assinatura === input.assinaturaAtual;
}

export function chaveParaEnvioPagamento(input: {
  chaveAtual: string;
  assinaturaAtual: string;
  intencao: IntencaoPagamentoV2 | null;
  resultadoDesconhecido: boolean;
}): { ok: true; chave: string } | { ok: false; motivo: "travada" | "chave" } {
  if (input.resultadoDesconhecido) {
    if (!input.intencao) return { ok: false, motivo: "chave" };
    if (input.assinaturaAtual !== input.intencao.assinatura) return { ok: false, motivo: "travada" };
    return { ok: true, chave: input.intencao.chave };
  }
  const chave = input.chaveAtual.trim();
  if (!chaveIdempotenciaPagamentoValida(chave)) return { ok: false, motivo: "chave" };
  return { ok: true, chave };
}

export function pagamentoResultadoDesconhecido(input: {
  codigo?: string;
  mensagem?: string;
}): boolean {
  const codigo = input.codigo?.trim();
  if (codigo === "BAD_REQUEST" || codigo === "NOT_FOUND" || codigo === "FORBIDDEN" || codigo === "UNAUTHORIZED") {
    return false;
  }
  if (!codigo) return true;
  return codigo === "TIMEOUT" || codigo === "CLIENT_CLOSED_REQUEST" || codigo === "INTERNAL_SERVER_ERROR";
}

export function validarPagamentoParcela(input: {
  titulo: Pick<TituloV2DetalheOficial, "id" | "userId" | "tipo" | "estado" | "parcelas">;
  parcela: Pick<ParcelaV2Oficial, "id" | "quitada" | "saldoPrincipal">;
  contas: readonly ContaFinanceiraV2Oficial[];
  userId: number | null | undefined;
  rascunho: RascunhoPagamentoParcela;
  idempotencyKey: string;
  ocupado?: boolean;
  resultadoDesconhecido?: boolean;
  intencao?: IntencaoPagamentoV2 | null;
}): { ok: true; payload: PayloadLiquidacaoPagarV2 } | { ok: false; erros: ErrosPagamentoParcela } {
  const contasAtivas = contasAtivasParaPagamento(input.contas, input.userId);
  const disponibilidade = podeRegistrarPagamentoParcela({
    titulo: input.titulo,
    parcela: input.parcela,
    contasAtivas,
    userId: input.userId,
    ocupado: Boolean(input.ocupado),
    pendenteDestaParcela: Boolean(input.resultadoDesconhecido),
  });
  if (!disponibilidade.ok && disponibilidade.motivo !== "sem_conta") {
    return { ok: false, erros: { geral: mensagemBloqueioPagamento(disponibilidade.motivo) } };
  }

  const erros: ErrosPagamentoParcela = {};
  const valor = parseValorPagamento(input.rascunho.valor);
  if (!valor.ok) erros.valor = MSG_FIN_VALOR_POSITIVO;
  else if (!input.resultadoDesconhecido && toCentavos(valor.valor) > toCentavos(input.parcela.saldoPrincipal)) {
    erros.valor = MSG_FIN_OVERPAYMENT;
  }

  const contaId = Number.parseInt(input.rascunho.contaId, 10);
  if (!Number.isInteger(contaId) || contaId <= 0) erros.contaId = MSG_PAGAMENTO_CONTA;
  const conta = Number.isInteger(contaId)
    ? input.contas.find(item => item.id === contaId)
    : undefined;
  if (Number.isInteger(contaId) && contaId > 0) {
    if (!conta) erros.contaId = MSG_FIN_CONTA_NAO_ENCONTRADA;
    else if (typeof input.userId === "number" && conta.userId !== input.userId) erros.contaId = MSG_FIN_ESCOPO;
    else if (!conta.ativa) erros.contaId = MSG_FIN_CONTA_INATIVA;
  }

  const data = input.rascunho.dataLiquidacao.trim();
  if (!vencimentoISOValido(data)) erros.dataLiquidacao = MSG_PAGAMENTO_DATA;
  else if (conta && movimentoAnteriorAAbertura(data, conta.dataSaldoAbertura)) {
    erros.dataLiquidacao = MSG_FIN_DATA_ANTES_ABERTURA;
  }

  const formaPagamento = input.rascunho.formaPagamento.trim() || null;
  if (formaPagamento && formaPagamento.length > 40) {
    erros.formaPagamento = "A forma de pagamento pode ter no máximo 40 caracteres.";
  }
  const referencia = input.rascunho.referencia.trim() || null;
  if (referencia && referencia.length > 80) {
    erros.referencia = "A referência pode ter no máximo 80 caracteres.";
  }
  const observacoes = input.rascunho.observacoes.trim() || null;

  if (Object.keys(erros).length || !valor.ok || !Number.isInteger(contaId) || contaId <= 0) {
    return { ok: false, erros };
  }

  const payloadBase: Omit<PayloadLiquidacaoPagarV2, "idempotencyKey"> = {
    contaId,
    dataLiquidacao: data,
    valorMovimentado: valor.valor,
    formaPagamento,
    referencia,
    observacoes,
    alocacoes: [{ parcelaId: input.parcela.id, principalLiquidado: valor.valor }],
  };
  if (toCentavos(payloadBase.valorMovimentado) !== toCentavos(payloadBase.alocacoes[0]!.principalLiquidado)) {
    return { ok: false, erros: { geral: MSG_FIN_FORMULA_CAIXA } };
  }

  const chave = chaveParaEnvioPagamento({
    chaveAtual: input.idempotencyKey,
    assinaturaAtual: assinaturaPayloadPagamento(payloadBase),
    intencao: input.intencao ?? null,
    resultadoDesconhecido: Boolean(input.resultadoDesconhecido),
  });
  if (!chave.ok) {
    return {
      ok: false,
      erros: { geral: chave.motivo === "travada" ? MSG_PAGAMENTO_INTENCAO_TRAVADA : MSG_FIN_IDEMPOTENCY },
    };
  }

  return {
    ok: true,
    payload: { ...payloadBase, idempotencyKey: chave.chave },
  };
}

export function montarIntencaoPagamento(
  tituloId: number,
  payload: PayloadLiquidacaoPagarV2,
): IntencaoPagamentoV2 {
  const { idempotencyKey, ...resto } = payload;
  return {
    chave: idempotencyKey,
    tituloId,
    parcelaId: payload.alocacoes[0]!.parcelaId,
    assinatura: assinaturaPayloadPagamento(resto),
    payload,
  };
}

export function mensagemBloqueioPagamento(motivo: MotivoPagamentoIndisponivel): string {
  if (motivo === "cancelado") return MSG_FIN_TITULO_CANCELADO;
  if (motivo === "quitada") return MSG_PAGAMENTO_PARCELA_QUITADA;
  if (motivo === "sem_parcelas") return MSG_PAGAMENTO_SEM_PARCELAS;
  if (motivo === "sem_conta") return "Cadastre uma conta financeira para registrar pagamentos.";
  if (motivo === "ocupado") return MSG_PAGAMENTO_OCUPADO;
  if (motivo === "pendente") return MSG_PAGAMENTO_PENDENTE_RECUPERADA;
  if (motivo === "acesso") return MSG_ACESSO_NEGADO;
  return MSG_TITULO_NAO_ENCONTRADO;
}

export function mensagemErroPagamento(codigo?: string, detalhe?: string): string {
  if (codigo === "FORBIDDEN") return MSG_ACESSO_NEGADO;
  if (codigo === "NOT_FOUND") return detalhe?.trim() || MSG_TITULO_NAO_ENCONTRADO;
  const extra = detalhe?.trim();
  if (extra && !pareceSqlBruto(extra)) return extra;
  return "Não foi possível registrar o pagamento.";
}

export function rascunhoDeIntencaoPagamento(intencao: IntencaoPagamentoV2): RascunhoPagamentoParcela {
  return {
    parcelaId: intencao.parcelaId,
    valor: formatarValorDigitadoPagamento(intencao.payload.valorMovimentado),
    contaId: String(intencao.payload.contaId),
    dataLiquidacao: intencao.payload.dataLiquidacao,
    formaPagamento: intencao.payload.formaPagamento ?? "",
    referencia: intencao.payload.referencia ?? "",
    observacoes: intencao.payload.observacoes ?? "",
  };
}

export function chaveArmazenamentoPagamentoPendente(userId: number, tituloId: number): string {
  return `${PREFIXO_PAGAMENTO_PENDENTE}:${userId}:${tituloId}`;
}

/** Recuperação = pendência persistida que esta sessão ainda não iniciou. */
export function pendenciaFoiRecuperada(input: {
  persistido: Pick<IntencaoPagamentoV2, "chave"> | null;
  chaveIniciadaNestaSessao: string | null;
}): boolean {
  if (!input.persistido) return false;
  if (!input.chaveIniciadaNestaSessao) return true;
  return input.persistido.chave !== input.chaveIniciadaNestaSessao;
}

export function criarArmazenamentoPagamentoMemoria(
  inicial: Record<string, string> = {},
): ArmazenamentoPagamentoPendente {
  const mapa = new Map(Object.entries(inicial));
  return {
    getItem: chave => mapa.get(chave) ?? null,
    setItem: (chave, valor) => { mapa.set(chave, valor); },
    removeItem: chave => { mapa.delete(chave); },
  };
}

export function armazenamentoPagamentoPendentePadrao(): ArmazenamentoPagamentoPendente {
  try {
    if (typeof localStorage === "undefined") return criarArmazenamentoPagamentoMemoria();
    return localStorage;
  } catch {
    return criarArmazenamentoPagamentoMemoria();
  }
}

export function gravarPagamentoPendente(input: {
  userId: number;
  intencao: IntencaoPagamentoV2;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return;
  const storage = input.storage ?? armazenamentoPagamentoPendentePadrao();
  const registro: PagamentoPendentePersistido = {
    versao: 1,
    userId: input.userId,
    tituloId: input.intencao.tituloId,
    parcelaId: input.intencao.parcelaId,
    chave: input.intencao.chave,
    assinatura: input.intencao.assinatura,
    payload: input.intencao.payload,
  };
  storage.setItem(
    chaveArmazenamentoPagamentoPendente(input.userId, input.intencao.tituloId),
    JSON.stringify(registro),
  );
}

export function lerPagamentoPendente(input: {
  userId: number;
  tituloId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): IntencaoPagamentoV2 | null {
  const storage = input.storage ?? armazenamentoPagamentoPendentePadrao();
  const bruto = storage.getItem(chaveArmazenamentoPagamentoPendente(input.userId, input.tituloId));
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as PagamentoPendentePersistido;
    if (lido?.versao !== 1) return null;
    if (lido.userId !== input.userId || lido.tituloId !== input.tituloId) return null;
    if (!chaveIdempotenciaPagamentoValida(lido.chave)) return null;
    if (!lido.payload || lido.payload.idempotencyKey !== lido.chave) return null;
    if (lido.parcelaId !== lido.payload.alocacoes?.[0]?.parcelaId) return null;
    const { idempotencyKey, ...resto } = lido.payload;
    if (assinaturaPayloadPagamento(resto) !== lido.assinatura) return null;
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

export function apagarPagamentoPendente(input: {
  userId: number;
  tituloId: number;
  storage?: ArmazenamentoPagamentoPendente;
}): void {
  const storage = input.storage ?? armazenamentoPagamentoPendentePadrao();
  storage.removeItem(chaveArmazenamentoPagamentoPendente(input.userId, input.tituloId));
}

export function pagamentoRecusaDefinitiva(codigo?: string): boolean {
  return codigo === "BAD_REQUEST" || codigo === "NOT_FOUND";
}

export function historicoSugerePagamentoDaPendencia(input: {
  intencao: IntencaoPagamentoV2;
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
    if (evento.tipo && evento.tipo !== "pagamento") return false;
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

export function mensagemSituacaoPendencia(situacao: "parecido" | "ausente" | "inconclusivo"): string {
  if (situacao === "parecido") return MSG_PAGAMENTO_HISTORICO_PARECIDO;
  if (situacao === "ausente") return MSG_PAGAMENTO_HISTORICO_VAZIO_NAO_PROVA;
  return MSG_PAGAMENTO_RETRY_MESMA_CHAVE;
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
