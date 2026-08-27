import { formatMoedaBrlExcel, parseValorDecimalBanco } from "./parseMoedaBr";
import {
  selectSemenLedgerMovimentosAplicaveis,
  type SemenLedgerMovimento,
} from "./semenEstoqueLedger";
import { SEMEN_MOV_TIPO_ENTRADA, SEMEN_MOV_TIPO_SAIDA_IA } from "./semenEstoque";
import { SEMEN_MOV_TIPO_AJUSTE_ESTOQUE } from "./semenEstoqueAjuste";

/**
 * Valor financeiro atual do saldo: saldo × custo/dose materializado (2 casas).
 * Não usar para valor econômico consolidado quando o custo médio foi arredondado.
 * Trabalha em centavos para evitar erro de ponto flutuante (ex.: 9 × 133,33 = 1.199,97).
 * Saldo zero (ou inválido) → 0, mesmo com custo/dose histórico.
 */
export function calcularValorEstoqueSemen(
  saldoDoses: number | null | undefined,
  custoUnitario: string | number | null | undefined,
): number {
  const saldo = Math.trunc(Number(saldoDoses));
  if (!Number.isFinite(saldo) || saldo <= 0) return 0;
  const custo = parseValorDecimalBanco(custoUnitario);
  if (custo == null || !(custo > 0)) return 0;
  const centavos = Math.round(custo * 100);
  return (centavos * saldo) / 100;
}

function custoTotalParaCentavos(custoTotal: string | number): number {
  const n = parseValorDecimalBanco(custoTotal);
  if (n == null || !(n > 0)) return 0;
  return Math.round(n * 100);
}

/**
 * Valor contábil atual da partida, derivado do ledger aplicável.
 * Mantém precisão do custo médio interno e só arredonda o resultado final em centavos.
 * Não usa o custo/dose já formatado (ex.: 3 × 83,33).
 */
export function calcularValorAtualEstoqueSemen(
  movimentacoes: readonly SemenLedgerMovimento[],
): number {
  const ordered = selectSemenLedgerMovimentosAplicaveis(movimentacoes);
  let saldo = 0;
  let valorCentavos = 0;

  for (const mov of ordered) {
    const qtd = Math.max(0, Math.trunc(Number(mov.quantidadeDoses) || 0));

    if (mov.tipo === SEMEN_MOV_TIPO_AJUSTE_ESTOQUE) {
      saldo = qtd;
      valorCentavos = custoTotalParaCentavos(mov.custoTotal);
      if (!(saldo > 0)) valorCentavos = 0;
      continue;
    }

    if (!(qtd > 0)) continue;

    if (mov.tipo === SEMEN_MOV_TIPO_ENTRADA) {
      valorCentavos += custoTotalParaCentavos(mov.custoTotal);
      saldo += qtd;
      continue;
    }

    if (mov.tipo === SEMEN_MOV_TIPO_SAIDA_IA) {
      if (saldo <= 0 || qtd > saldo) {
        valorCentavos = 0;
        saldo = 0;
        continue;
      }
      valorCentavos = (valorCentavos * (saldo - qtd)) / saldo;
      saldo -= qtd;
    }
  }

  if (!(saldo > 0) || !(valorCentavos > 0)) return 0;
  return Math.round(valorCentavos) / 100;
}

export function calcularValorAtualEstoqueSemenPorPartida(
  movimentacoes: ReadonlyArray<SemenLedgerMovimento & { partidaId: number }>,
): Map<number, number> {
  const byPartida = new Map<number, SemenLedgerMovimento[]>();
  for (const mov of movimentacoes) {
    const list = byPartida.get(mov.partidaId) ?? [];
    list.push(mov);
    byPartida.set(mov.partidaId, list);
  }
  const result = new Map<number, number>();
  for (const [partidaId, movs] of byPartida) {
    result.set(partidaId, calcularValorAtualEstoqueSemen(movs));
  }
  return result;
}

export function formatValorEstoqueSemenDisplay(
  saldoDoses: number | null | undefined,
  custoUnitario: string | number | null | undefined,
): string {
  return formatMoedaBrlExcel(calcularValorEstoqueSemen(saldoDoses, custoUnitario));
}

export function formatValorAtualEstoqueSemenDisplay(valor: number | null | undefined): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return formatMoedaBrlExcel(0);
  return formatMoedaBrlExcel(Math.round(n * 100) / 100);
}

/** Soma em centavos de todas as partidas (conjunto filtrado, não a página). */
export function somarValorEstoqueSemen(
  partidas: readonly {
    saldoDoses?: number | null;
    custoUnitario?: string | number | null;
    valorAtualEstoque?: number | null;
  }[],
): number {
  let centavos = 0;
  for (const p of partidas) {
    const valor =
      p.valorAtualEstoque != null && Number.isFinite(Number(p.valorAtualEstoque))
        ? Number(p.valorAtualEstoque)
        : calcularValorEstoqueSemen(p.saldoDoses, p.custoUnitario);
    centavos += Math.round(valor * 100);
  }
  return centavos / 100;
}

export function formatValorTotalEstoqueSemenDisplay(
  partidas: readonly {
    saldoDoses?: number | null;
    custoUnitario?: string | number | null;
    valorAtualEstoque?: number | null;
  }[],
): string {
  return formatMoedaBrlExcel(somarValorEstoqueSemen(partidas));
}
