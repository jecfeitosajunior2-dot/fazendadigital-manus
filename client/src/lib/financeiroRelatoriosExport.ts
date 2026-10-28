import type { RelatorioFinanceiroV2 } from "@shared/financeiroRelatoriosV2";
import { rotuloOrigemTitulo } from "./contasAPagarListagem";
import type { ExportRow } from "./exportList";

export function periodoRelatorioTexto(de: string, ate: string) {
  return `Período: ${de} a ${ate}`;
}

/** API relatorioFinanceiro devolve reais (5000 = R$ 5.000,00). Não são centavos. */
export function formatarValorRelatorioV2(valor: number | string): string {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function linhasExportVisao(rel: RelatorioFinanceiroV2): ExportRow[] {
  return [
    ["Saldo em Caixa e Bancos", rel.visao.saldoCaixaBancos],
    ["Total a receber", rel.visao.totalAReceber],
    ["Total a pagar", rel.visao.totalAPagar],
    ["Recebimentos do período", rel.visao.recebimentosPeriodo],
    ["Pagamentos do período", rel.visao.pagamentosPeriodo],
    ["Resultado financeiro realizado", rel.visao.resultadoRealizado],
  ];
}

export function linhasExportFluxo(rel: RelatorioFinanceiroV2): ExportRow[] {
  const linhas: ExportRow[] = rel.fluxoRealizado.linhas.map(l => [
    l.data,
    l.descricao,
    l.tipo,
    l.natureza,
    l.contaNome,
    l.valor,
  ]);
  linhas.push(["", "Total entradas", "", "", "", rel.fluxoRealizado.entradas]);
  linhas.push(["", "Total saídas", "", "", "", rel.fluxoRealizado.saidas]);
  linhas.push(["", "Resultado líquido", "", "", "", rel.fluxoRealizado.resultado]);
  return linhas;
}

export function linhasExportTitulos(
  linhas: RelatorioFinanceiroV2["receber"]["linhas"],
): ExportRow[] {
  return linhas.map(l => [
    l.pessoa,
    rotuloOrigemTitulo(l.origemTipo),
    l.descricao,
    l.vencimento ?? "",
    l.valorOriginal,
    l.valorLiquidado,
    l.saldoPendente,
    l.situacao,
  ]);
}
