/**
 * Custo médio ponderado do estoque.
 * Atualizado apenas em entradas com valor; saídas não recalculam.
 */

export function parseCustoMedio(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Novo custo médio =
 * (valor total saldo anterior + valor total nova entrada)
 * ÷ (quantidade anterior + quantidade da nova entrada)
 */
export function calcularCustoMedioPonderado(params: {
  quantidadeAnterior: number;
  custoMedioAnterior: number | null;
  quantidadeEntrada: number;
  valorTotalEntrada: number;
}): number | null {
  const qEnt = params.quantidadeEntrada;
  const valorEnt = params.valorTotalEntrada;
  if (!(qEnt > 0) || !(valorEnt > 0)) {
    return parseCustoMedio(params.custoMedioAnterior);
  }

  const qAnt = Math.max(0, Number(params.quantidadeAnterior) || 0);
  const custoAnt = parseCustoMedio(params.custoMedioAnterior) ?? 0;
  const valorAnt = qAnt * custoAnt;
  const qTotal = qAnt + qEnt;
  if (!(qTotal > 0)) return null;

  const medio = (valorAnt + valorEnt) / qTotal;
  return Number.isFinite(medio) && medio > 0 ? medio : null;
}

/** Arredonda para 2 casas (persistência decimal). */
export function formatCustoMedio(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2);
}
