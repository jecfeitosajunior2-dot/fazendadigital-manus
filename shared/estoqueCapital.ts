/**
 * Motor de capital do estoque (Fase 2A.1A).
 * Quantidade + valor_total_estoque são a verdade.
 * Custo médio é derivado. Nunca reconstrói capital por médio arredondado.
 *
 * Dinheiro em centavos inteiros. Quantidade em centésimos inteiros.
 * Não usa o domínio financeiroV2 — só o mesmo padrão decimal.
 */

export const ESTOQUE_CAPITAL_CASAS_QUANTIDADE = 2;
export const ESTOQUE_CAPITAL_CASAS_MEDIO = 6;

export const MSG_ESTOQUE_CAPITAL_NAO_INICIALIZADO =
  "O capital deste estoque ainda não foi inicializado.";
export const MSG_ESTOQUE_SAIDA_ACIMA_SALDO =
  "Quantidade em estoque insuficiente para esta saída.";
export const MSG_ESTOQUE_SAIDA_ACIMA_CAPITAL =
  "A saída retiraria mais capital do que existe neste estoque.";
export const MSG_ESTOQUE_CAPITAL_NEGATIVO =
  "O capital do estoque não pode ficar negativo.";
export const MSG_ESTOQUE_CAPITAL_USO_IMEDIATO =
  "Produto de uso imediato não possui capital de estoque.";
export const MSG_ESTOQUE_VALOR_UNITARIO_DERIVADO =
  "Com o capital inicializado, o custo médio deixa de ser campo livre.";
export const MSG_TRANSFERENCIA_CAPITAL_ASSIMETRICA =
  "Não é possível transferir entre um estoque com capital inicializado e outro ainda no modo legado.";
export const MSG_TRANSFERENCIA_MESMA_FAZENDA =
  "A fazenda de destino precisa ser diferente da origem.";
export const MSG_ESTOQUE_EDICAO_CAPITAL =
  "Com o capital inicializado, esta movimentação não pode ser editada. Estorne e lance de novo.";
export const MSG_ESTOQUE_EXCLUSAO_CAPITAL =
  "Com o capital inicializado, a exclusão direta não é permitida. Use o estorno.";
export const MSG_ESTOQUE_ZERAR_CAPITAL =
  "Com o capital inicializado, o saldo não pode ser zerado sem movimentação oficial.";
export const MSG_ESTORNO_CAPITAL_SEM_SNAPSHOT =
  "Esta movimentação é anterior ao controle de capital e não possui valor histórico suficiente para estorno automático.";
export const MSG_MANUT_CAPITAL_REVERSAO =
  "Com o capital inicializado, editar ou estornar peças desta OS exige o valor histórico da baixa. Esta ordem não possui snapshot confiável para reversão automática.";

export class EstoqueCapitalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EstoqueCapitalError";
  }
}

function toCentavos(valor: number | string): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  if (!Number.isFinite(n)) throw new EstoqueCapitalError("Valor monetário inválido.");
  return Math.round((n + Number.EPSILON) * 100);
}

function fromCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

function toCentesimos(quantidade: number | string): number {
  const n = typeof quantidade === "string" ? Number(quantidade.replace(",", ".")) : quantidade;
  if (!Number.isFinite(n)) throw new EstoqueCapitalError("Quantidade inválida.");
  return Math.round((n + Number.EPSILON) * 100);
}

function fromCentesimos(centesimos: number): number {
  return Math.round(centesimos) / 100;
}

export function persistirCapital(valor: number | string): string {
  return fromCentavos(toCentavos(valor)).toFixed(2);
}

export function persistirQuantidadeEstoque(quantidade: number | string): string {
  return fromCentesimos(toCentesimos(quantidade)).toFixed(2);
}

/** Cache técnico. Não usar para reconstruir capital. */
export function persistirCustoMedioTecnico(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return "0.000000";
  const fator = 10 ** ESTOQUE_CAPITAL_CASAS_MEDIO;
  return (Math.round(valor * fator) / fator).toFixed(ESTOQUE_CAPITAL_CASAS_MEDIO);
}

export function capitalEstaInicializado(input: {
  capitalInicializadoEm?: Date | string | null;
}): boolean {
  const raw = input.capitalInicializadoEm;
  if (raw == null) return false;
  if (raw instanceof Date) return !Number.isNaN(raw.getTime());
  return String(raw).trim() !== "";
}

export function valorUnitarioEhCampoLivre(capitalInicializado: boolean): boolean {
  return !capitalInicializado;
}

/** Transferência nova já é bilateral. O cutover real ainda depende de autorização. */
export function transferenciaPodeAtivarCapital(): true {
  return true;
}

export type EstadoCapital = {
  quantidade: number;
  capital: number;
};

export type ResultadoMovimentoCapital = EstadoCapital & {
  valorMovimentado: number;
  custoMedioTecnico: number | null;
};

export function calcularCustoMedioTecnico(capital: number, quantidade: number): number | null {
  const q = toCentesimos(quantidade);
  if (q <= 0) return null;
  return toCentavos(capital) / q;
}

function custoMedioDoEstado(estado: EstadoCapital): number | null {
  return calcularCustoMedioTecnico(estado.capital, estado.quantidade);
}

export function assertInvariantesCapital(estado: EstadoCapital): void {
  const q = toCentesimos(estado.quantidade);
  const c = toCentavos(estado.capital);
  if (c < 0) throw new EstoqueCapitalError(MSG_ESTOQUE_CAPITAL_NEGATIVO);
  if (q < 0) throw new EstoqueCapitalError(MSG_ESTOQUE_SAIDA_ACIMA_SALDO);
  if (q === 0 && c !== 0) {
    throw new EstoqueCapitalError("Estoque zerado precisa ter capital zero.");
  }
}

function fecharEstado(qCentesimos: number, cCentavos: number, valorMovimentadoCentavos: number): ResultadoMovimentoCapital {
  if (qCentesimos === 0) cCentavos = 0;
  if (cCentavos < 0) throw new EstoqueCapitalError(MSG_ESTOQUE_CAPITAL_NEGATIVO);
  const estado: EstadoCapital = {
    quantidade: fromCentesimos(qCentesimos),
    capital: fromCentavos(cCentavos),
  };
  assertInvariantesCapital(estado);
  return {
    ...estado,
    valorMovimentado: fromCentavos(valorMovimentadoCentavos),
    custoMedioTecnico: custoMedioDoEstado(estado),
  };
}

/** Entrada com valor informado (compra, produção com valor). V pode ser 0. */
export function aplicarEntradaCapital(
  estado: EstadoCapital,
  quantidadeEntrada: number | string,
  valorEntrada: number | string,
): ResultadoMovimentoCapital {
  const qEnt = toCentesimos(quantidadeEntrada);
  if (qEnt <= 0) throw new EstoqueCapitalError("A quantidade de entrada precisa ser maior que zero.");
  const vEnt = toCentavos(valorEntrada);
  if (vEnt < 0) throw new EstoqueCapitalError("O valor da entrada não pode ser negativo.");
  const qAnt = toCentesimos(estado.quantidade);
  const cAnt = toCentavos(estado.capital);
  return fecharEstado(qAnt + qEnt, cAnt + vEnt, vEnt);
}

/**
 * Saída física: retira fatia proporcional do capital.
 * Última quantidade leva o capital restante inteiro.
 */
export function aplicarSaidaCapital(
  estado: EstadoCapital,
  quantidadeSaida: number | string,
): ResultadoMovimentoCapital {
  const qSai = toCentesimos(quantidadeSaida);
  if (qSai <= 0) throw new EstoqueCapitalError("A quantidade de saída precisa ser maior que zero.");
  const qAnt = toCentesimos(estado.quantidade);
  const cAnt = toCentavos(estado.capital);
  if (qSai > qAnt) throw new EstoqueCapitalError(MSG_ESTOQUE_SAIDA_ACIMA_SALDO);
  const valorSai = qSai === qAnt
    ? cAnt
    : Math.round((cAnt * qSai) / qAnt);
  if (valorSai > cAnt) throw new EstoqueCapitalError(MSG_ESTOQUE_SAIDA_ACIMA_CAPITAL);
  return fecharEstado(qAnt - qSai, cAnt - valorSai, valorSai);
}

/** Estorno desfaz o snapshot histórico. sinalEntrada=true devolve quantidade e capital. */
export function aplicarEstornoCapital(
  estado: EstadoCapital,
  quantidadeOriginal: number | string,
  valorSnapshot: number | string,
): ResultadoMovimentoCapital {
  const qOrig = toCentesimos(quantidadeOriginal);
  if (qOrig === 0) throw new EstoqueCapitalError("Movimentação original sem quantidade.");
  const vSnap = toCentavos(valorSnapshot);
  if (vSnap < 0) throw new EstoqueCapitalError("Snapshot de capital inválido.");
  const qAnt = toCentesimos(estado.quantidade);
  const cAnt = toCentavos(estado.capital);

  if (qOrig > 0) {
    if (qAnt < qOrig) throw new EstoqueCapitalError(MSG_ESTOQUE_SAIDA_ACIMA_SALDO);
    if (cAnt < vSnap) throw new EstoqueCapitalError(MSG_ESTOQUE_SAIDA_ACIMA_CAPITAL);
    return fecharEstado(qAnt - qOrig, cAnt - vSnap, vSnap);
  }

  const qDevolve = Math.abs(qOrig);
  return fecharEstado(qAnt + qDevolve, cAnt + vSnap, vSnap);
}

export function aplicarAjusteEntradaSemValor(
  estado: EstadoCapital,
  quantidadeEntrada: number | string,
): ResultadoMovimentoCapital {
  return aplicarEntradaCapital(estado, quantidadeEntrada, 0);
}

export function aplicarAjusteSaidaCapital(
  estado: EstadoCapital,
  quantidadeSaida: number | string,
): ResultadoMovimentoCapital {
  return aplicarSaidaCapital(estado, quantidadeSaida);
}

export function aplicarProducaoPropriaCapital(
  estado: EstadoCapital,
  quantidadeEntrada: number | string,
  valorInformado: number | string | null | undefined,
): ResultadoMovimentoCapital {
  const valor = valorInformado == null || valorInformado === "" ? 0 : valorInformado;
  return aplicarEntradaCapital(estado, quantidadeEntrada, valor);
}

/** Transfere quantidade e EXATAMENTE o capital retirado da origem. */
export function aplicarTransferenciaCapital(
  origem: EstadoCapital,
  destino: EstadoCapital,
  quantidade: number | string,
): { origem: ResultadoMovimentoCapital; destino: ResultadoMovimentoCapital; valorTransferido: number } {
  const saida = aplicarSaidaCapital(origem, quantidade);
  const entrada = aplicarEntradaCapital(destino, quantidade, saida.valorMovimentado);
  return { origem: saida, destino: entrada, valorTransferido: saida.valorMovimentado };
}

export function capitalSeAplica(controlarSaldo: boolean | null | undefined): boolean {
  return controlarSaldo !== false;
}

export function valorPatrimonialExibicao(item: {
  quantidade?: number | string | null;
  valorUnitario?: number | string | null;
  valorTotalEstoque?: number | string | null;
  capitalInicializadoEm?: Date | string | null;
}): number {
  if (capitalEstaInicializado(item) && item.valorTotalEstoque != null && item.valorTotalEstoque !== "") {
    return fromCentavos(toCentavos(item.valorTotalEstoque));
  }
  const q = Number(String(item.quantidade ?? 0).replace(",", "."));
  const u = Number(String(item.valorUnitario ?? 0).replace(",", "."));
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return q * u;
}

/** Fonte do custo médio para Nutrição / máquinas / sanitário. */
export function custoMedioFonteTecnica(item: {
  quantidade?: number | string | null;
  valorUnitario?: number | string | null;
  valorTotalEstoque?: number | string | null;
  capitalInicializadoEm?: Date | string | null;
}): number | null {
  if (capitalEstaInicializado(item) && item.valorTotalEstoque != null && item.valorTotalEstoque !== "") {
    const q = Number(String(item.quantidade ?? 0).replace(",", "."));
    if (!(q > 0)) return null;
    return calcularCustoMedioTecnico(Number(item.valorTotalEstoque), q);
  }
  const u = Number(String(item.valorUnitario ?? "").replace(",", "."));
  return Number.isFinite(u) && u > 0 ? u : null;
}

export type PatchCapitalEstoque = {
  quantidade: string;
  valorTotalEstoque: string;
  valorUnitario: string | undefined;
  valorEstoqueMovimentado: string;
};

export function patchPersistenciaCapital(resultado: ResultadoMovimentoCapital): PatchCapitalEstoque {
  return {
    quantidade: persistirQuantidadeEstoque(resultado.quantidade),
    valorTotalEstoque: persistirCapital(resultado.capital),
    valorUnitario: resultado.custoMedioTecnico == null
      ? undefined
      : persistirCustoMedioTecnico(resultado.custoMedioTecnico),
    valorEstoqueMovimentado: persistirCapital(resultado.valorMovimentado),
  };
}
