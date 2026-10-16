import {
  dinheiroIgual,
  dinheiroNaoNegativo,
  dinheiroPositivo,
  formatarDinheiroPersistido,
  fromCentavos,
  somarDinheiro,
  subtrairDinheiro,
  toCentavos,
} from "./financeiroMoeda";

/**
 * Decisões da Fase 1 (compatíveis com o projeto):
 * - userId é int, como em pessoas/fazendas.
 * - Colunas novas em snake_case, no estilo de pessoas/compras.
 * - natureza e origem_tipo são varchar validados no domínio (evoluem sem migration de enum).
 * - UNIQUE(user_id, origem_tipo, origem_id, origem_item_chave): no MySQL, NULL ≠ NULL,
 *   então vários títulos manuais (origem_id NULL) convivem; automáticos com os 3 campos
 *   preenchidos não duplicam.
 * - Router: financeiroV2, para não colidir com o financeiro legado.
 * - Sem saldo_atual persistido. Sem DELETE físico de fatos confirmados.
 */

export const FINANCEIRO_CONTA_TIPOS = ["conta_corrente", "poupanca", "caixa", "investimento"] as const;
export type FinanceiroContaTipo = (typeof FINANCEIRO_CONTA_TIPOS)[number];

export const FINANCEIRO_TITULO_TIPOS = ["pagar", "receber"] as const;
export type FinanceiroTituloTipo = (typeof FINANCEIRO_TITULO_TIPOS)[number];

export const FINANCEIRO_TITULO_ESTADOS = ["ativo", "cancelado"] as const;
export type FinanceiroTituloEstado = (typeof FINANCEIRO_TITULO_ESTADOS)[number];

export const FINANCEIRO_CONDICOES = ["a_definir", "definida"] as const;
export type FinanceiroCondicaoStatus = (typeof FINANCEIRO_CONDICOES)[number];

export const FINANCEIRO_ORIGEM_MANUAL = "manual";
export const FINANCEIRO_ORIGEM_COMPRA_INSUMOS = "compra_insumos";
/** OS terceirizada. Ainda não emitida automaticamente (Fase 3B.1). */
export const FINANCEIRO_ORIGEM_MANUTENCAO = "manutencao";

export const FINANCEIRO_LIQUIDACAO_TIPOS = [
  "pagamento",
  "recebimento",
  "estorno_pagamento",
  "estorno_recebimento",
] as const;
export type FinanceiroLiquidacaoTipo = (typeof FINANCEIRO_LIQUIDACAO_TIPOS)[number];

export const FINANCEIRO_DIRECOES = ["entrada", "saida"] as const;
export type FinanceiroDirecao = (typeof FINANCEIRO_DIRECOES)[number];

export const FINANCEIRO_NATUREZAS = [
  "pagamento",
  "recebimento",
  "transferencia_saida",
  "transferencia_entrada",
  "aporte",
  "retirada",
  "emprestimo_recebido",
  "amortizacao_emprestimo",
  "adiantamento_pago",
  "adiantamento_recebido",
  "juros",
  "tarifa",
  "estorno_pagamento",
  "estorno_recebimento",
  "ajuste",
] as const;
export type FinanceiroNatureza = (typeof FINANCEIRO_NATUREZAS)[number];

export const FINANCEIRO_TRANSFERENCIA_ESTADOS = ["confirmada", "estornada"] as const;
export type FinanceiroTransferenciaEstado = (typeof FINANCEIRO_TRANSFERENCIA_ESTADOS)[number];

export const FINANCEIRO_CATEGORIA_TIPOS = ["entrada", "saida"] as const;
export type FinanceiroCategoriaTipo = (typeof FINANCEIRO_CATEGORIA_TIPOS)[number];

export const MSG_FIN_VALOR_POSITIVO = "Informe um valor maior que zero.";
export const MSG_FIN_CONTA_NAO_ENCONTRADA = "Conta financeira não encontrada.";
export const MSG_FIN_CONTA_INATIVA = "Esta conta está inativa e não aceita novos movimentos.";
export const MSG_FIN_CONTA_COM_MOVIMENTOS = "Conta com movimentos não pode ser excluída.";
export const MSG_FIN_CONTA_ABERTURA_TRAVADA = "Saldo ou data de abertura só podem ser alterados enquanto não houver movimentos.";
export const MSG_FIN_PESSOA_INVALIDA = "Pessoa não encontrada neste cadastro.";
export const MSG_FIN_FAZENDA_INVALIDA = "Fazenda não encontrada neste cadastro.";
export const MSG_FIN_TITULO_NAO_ENCONTRADO = "Título financeiro não encontrado.";
export const MSG_FIN_TITULO_CANCELADO = "Título cancelado não aceita esta operação.";
export const MSG_FIN_TITULO_COM_LIQUIDACAO = "Este título já possui liquidação e não pode ser reestruturado.";
export const MSG_FIN_PARCELAS_SOMA = "A soma das parcelas deve ser exatamente o valor original do título.";
export const MSG_FIN_PARCELA_NAO_ENCONTRADA = "Parcela não encontrada.";
export const MSG_FIN_TIPO_LIQUIDACAO = "Pagamento só quita títulos a pagar; recebimento só quita títulos a receber.";
export const MSG_FIN_PESSOAS_MISTURADAS = "Uma liquidação não pode misturar pessoas diferentes.";
export const MSG_FIN_TIPOS_MISTURADOS = "Uma liquidação não pode misturar títulos a pagar e a receber.";
export const MSG_FIN_OVERPAYMENT = "O principal liquidado não pode ultrapassar o saldo da parcela.";
export const MSG_FIN_FORMULA_CAIXA = "A soma das alocações deve ser exatamente o valor movimentado.";
export const MSG_FIN_IDEMPOTENCY = "Informe a chave de idempotência.";
export const MSG_FIN_TRANSFERENCIA_MESMA_CONTA = "A conta de origem e a de destino devem ser diferentes.";
export const MSG_FIN_TRANSFERENCIA_JA_ESTORNADA = "Esta transferência já foi estornada.";
export const MSG_FIN_LIQUIDACAO_JA_ESTORNADA = "Esta liquidação já foi estornada.";
export const MSG_FIN_LIQUIDACAO_NAO_ENCONTRADA = "Liquidação não encontrada.";
export const MSG_FIN_ORIGEM_DUPLICADA = "Já existe título financeiro para esta origem operacional.";
export const MSG_FIN_ESCOPO = "Você não tem acesso a este registro financeiro.";
export const MSG_FIN_CATEGORIA_DUPLICADA = "Já existe categoria de sistema com esta chave.";
export const MSG_FIN_APROPRIACAO_SOMA = "A soma das apropriações não pode ultrapassar o valor do título.";
export const MSG_FIN_CANCELAR_COM_LIQUIDACAO = "Título com liquidação não pode ser cancelado simplesmente.";
export const MSG_FIN_DATA_ANTES_ABERTURA =
  "A data do movimento não pode ser anterior à data de saldo de abertura da conta.";
export const MSG_FIN_ORIGEM_AUTOMATICA =
  "Origem automática exige identificador e chave do item.";
export const MSG_FIN_CATEGORIA_TIPO =
  "Título a pagar só aceita categoria de saída; título a receber só aceita categoria de entrada.";
export const MSG_FIN_CENTRO_FAZENDA =
  "O centro de custo pertence a outra Fazenda e não pode ser usado neste rateio.";
export const MSG_FIN_TRANSFERENCIA_PERNAS =
  "Transferência deve ter exatamente uma saída e uma entrada, no mesmo valor e nas contas declaradas.";
export const MSG_FIN_MOVIMENTO_LIQUIDACAO =
  "O movimento da liquidação deve ter o mesmo valor, a mesma conta e a direção correta.";

export function isFinanceiroContaTipo(v: string): v is FinanceiroContaTipo {
  return (FINANCEIRO_CONTA_TIPOS as readonly string[]).includes(v);
}

export function isFinanceiroNatureza(v: string): v is FinanceiroNatureza {
  return (FINANCEIRO_NATUREZAS as readonly string[]).includes(v);
}

export function direcaoDaLiquidacao(tipo: FinanceiroLiquidacaoTipo): FinanceiroDirecao {
  if (tipo === "pagamento" || tipo === "estorno_recebimento") return "saida";
  return "entrada";
}

export function naturezaDaLiquidacao(tipo: FinanceiroLiquidacaoTipo): FinanceiroNatureza {
  return tipo;
}

export function caixaDaAlocacao(input: {
  principalLiquidado: number | string;
  desconto?: number | string;
  juros?: number | string;
  multa?: number | string;
}): number {
  return fromCentavos(
    toCentavos(input.principalLiquidado)
      - toCentavos(input.desconto ?? 0)
      + toCentavos(input.juros ?? 0)
      + toCentavos(input.multa ?? 0),
  );
}

export function validarComponentesAlocacao(input: {
  principalLiquidado: number | string;
  desconto?: number | string;
  juros?: number | string;
  multa?: number | string;
}): { ok: true; caixa: number } | { ok: false; message: string } {
  if (!dinheiroPositivo(input.principalLiquidado) && toCentavos(input.principalLiquidado) !== 0) {
    return { ok: false, message: MSG_FIN_VALOR_POSITIVO };
  }
  if (toCentavos(input.principalLiquidado) < 0) return { ok: false, message: MSG_FIN_VALOR_POSITIVO };
  for (const campo of [input.desconto ?? 0, input.juros ?? 0, input.multa ?? 0]) {
    if (!dinheiroNaoNegativo(campo)) return { ok: false, message: MSG_FIN_VALOR_POSITIVO };
  }
  const caixa = fromCentavos(
    toCentavos(input.principalLiquidado) - toCentavos(input.desconto ?? 0)
      + toCentavos(input.juros ?? 0) + toCentavos(input.multa ?? 0),
  );
  if (caixa < 0) return { ok: false, message: MSG_FIN_FORMULA_CAIXA };
  return { ok: true, caixa };
}

export function validarSomaParcelas(
  valorOriginal: number | string,
  parcelas: Array<{ valorOriginal: number | string }>,
): boolean {
  const soma = parcelas.reduce((acc, p) => acc + toCentavos(p.valorOriginal), 0);
  return soma === toCentavos(valorOriginal);
}

export type ParcelaSaldoDerivado = {
  valorOriginal: number;
  principalLiquidado: number;
  saldoPrincipal: number;
  desconto: number;
  juros: number;
  multa: number;
  quitada: boolean;
};

export function derivarSaldoParcela(
  valorOriginal: number | string,
  alocacoes: Array<{
    tipoLiquidacao: FinanceiroLiquidacaoTipo;
    principalLiquidado: number | string;
    desconto?: number | string;
    juros?: number | string;
    multa?: number | string;
  }>,
): ParcelaSaldoDerivado {
  let principal = 0;
  let desconto = 0;
  let juros = 0;
  let multa = 0;
  for (const a of alocacoes) {
    const sinal = a.tipoLiquidacao.startsWith("estorno_") ? -1 : 1;
    principal += sinal * toCentavos(a.principalLiquidado);
    desconto += sinal * toCentavos(a.desconto ?? 0);
    juros += sinal * toCentavos(a.juros ?? 0);
    multa += sinal * toCentavos(a.multa ?? 0);
  }
  const original = toCentavos(valorOriginal);
  const saldo = original - principal;
  return {
    valorOriginal: fromCentavos(original),
    principalLiquidado: fromCentavos(principal),
    saldoPrincipal: fromCentavos(saldo),
    desconto: fromCentavos(desconto),
    juros: fromCentavos(juros),
    multa: fromCentavos(multa),
    quitada: saldo === 0 && original > 0,
  };
}

export type TituloSituacaoDerivada = "em_aberto" | "parcial" | "liquidado" | "vencido";

export function derivarSituacaoTitulo(input: {
  estado: FinanceiroTituloEstado;
  tipo: FinanceiroTituloTipo;
  condicaoStatus: FinanceiroCondicaoStatus;
  parcelas: Array<ParcelaSaldoDerivado & { vencimento: string }>;
  hojeISO: string;
}): TituloSituacaoDerivada {
  if (input.condicaoStatus === "a_definir" || input.parcelas.length === 0) return "em_aberto";
  const algumaPaga = input.parcelas.some(p => toCentavos(p.principalLiquidado) > 0);
  const todasQuitadas = input.parcelas.every(p => p.quitada);
  if (todasQuitadas) return "liquidado";
  const vencidaEmAberto = input.parcelas.some(
    p => !p.quitada && p.vencimento < input.hojeISO,
  );
  if (!algumaPaga && vencidaEmAberto) return "vencido";
  if (algumaPaga) return "parcial";
  if (vencidaEmAberto) return "vencido";
  return "em_aberto";
}

export function calcularSaldoConta(input: {
  saldoAbertura: number | string;
  movimentos: Array<{ direcao: FinanceiroDirecao; valor: number | string }>;
}): number {
  let saldo = toCentavos(input.saldoAbertura);
  for (const m of input.movimentos) {
    const v = toCentavos(m.valor);
    saldo += m.direcao === "entrada" ? v : -v;
  }
  return fromCentavos(saldo);
}

export function validarOrigemTitulo(input: {
  origemTipo: string;
  origemId?: number | null;
  origemItemChave?: string | null;
}): { ok: true; origemTipo: string; origemId: number | null; origemItemChave: string | null }
  | { ok: false; message: string } {
  const tipo = input.origemTipo.trim();
  if (!tipo) return { ok: false, message: "Informe a origem do título." };
  if (tipo === FINANCEIRO_ORIGEM_MANUAL) {
    return { ok: true, origemTipo: FINANCEIRO_ORIGEM_MANUAL, origemId: null, origemItemChave: null };
  }
  const origemId = input.origemId ?? null;
  const chave = (input.origemItemChave ?? "").trim() || null;
  if (origemId == null || origemId <= 0 || !chave) {
    return { ok: false, message: MSG_FIN_ORIGEM_AUTOMATICA };
  }
  return { ok: true, origemTipo: tipo, origemId, origemItemChave: chave };
}

export function movimentoAnteriorAAbertura(dataMovimento: string, dataSaldoAbertura: string): boolean {
  return dataMovimento < dataSaldoAbertura;
}

export function categoriaCompativelComTitulo(
  tipoTitulo: FinanceiroTituloTipo,
  tipoCategoria: string,
): boolean {
  if (tipoTitulo === "pagar") return tipoCategoria === "saida";
  return tipoCategoria === "entrada";
}

export function centroCompativelComFazenda(
  centroFazendaId: number | null | undefined,
  apropriacaoFazendaId: number | null | undefined,
): boolean {
  if (centroFazendaId == null || apropriacaoFazendaId == null) return true;
  return centroFazendaId === apropriacaoFazendaId;
}

export type ApropriacaoDerivada = {
  valorApropriado: number;
  valorPendenteApropriacao: number;
  apropriacaoCompleta: boolean;
};

export function derivarApropriacao(
  valorOriginal: number | string,
  apropriacoes: Array<{ valor: number | string }>,
): ApropriacaoDerivada {
  const valorApropriado = fromCentavos(
    apropriacoes.reduce((acc, item) => acc + toCentavos(item.valor), 0),
  );
  const valorPendenteApropriacao = fromCentavos(toCentavos(valorOriginal) - toCentavos(valorApropriado));
  return {
    valorApropriado,
    valorPendenteApropriacao,
    apropriacaoCompleta: toCentavos(valorPendenteApropriacao) === 0,
  };
}

export function validarPernasTransferencia(input: {
  contaOrigemId: number;
  contaDestinoId: number;
  valor: number | string;
  movimentos: Array<{
    contaId: number;
    direcao: FinanceiroDirecao;
    natureza: string;
    valor: number | string;
    transferenciaId: number | null;
  }>;
}): { ok: true } | { ok: false; message: string } {
  if (input.movimentos.length !== 2) return { ok: false, message: MSG_FIN_TRANSFERENCIA_PERNAS };
  const saida = input.movimentos.find(m => m.direcao === "saida" && m.natureza === "transferencia_saida");
  const entrada = input.movimentos.find(m => m.direcao === "entrada" && m.natureza === "transferencia_entrada");
  if (!saida || !entrada) return { ok: false, message: MSG_FIN_TRANSFERENCIA_PERNAS };
  if (saida.contaId !== input.contaOrigemId || entrada.contaId !== input.contaDestinoId) {
    return { ok: false, message: MSG_FIN_TRANSFERENCIA_PERNAS };
  }
  if (!dinheiroIgual(saida.valor, input.valor) || !dinheiroIgual(entrada.valor, input.valor)) {
    return { ok: false, message: MSG_FIN_TRANSFERENCIA_PERNAS };
  }
  return { ok: true };
}

export function persistirValor(valor: number | string): string {
  return formatarDinheiroPersistido(valor);
}

export function somaAlocacoesFecha(
  valorMovimentado: number | string,
  alocacoes: Array<{ caixa: number }>,
): boolean {
  return dinheiroIgual(valorMovimentado, somarDinheiro(...alocacoes.map(a => a.caixa)));
}

export { dinheiroIgual, dinheiroPositivo, dinheiroNaoNegativo, somarDinheiro, subtrairDinheiro, toCentavos };
