/** Avaliação de estoque para estorno de movimentações de insumos. */

export type EstornoProdutoInsuficiente = {
  produto: string;
  quantidadeNecessaria: number;
  saldoAtual: number;
  quantidadeInsuficiente: number;
  unidade?: string | null;
};

export type ItemEstornoCheck = {
  estoqueId: number;
  quantidade: string | number;
  nome?: string | null;
  unidade?: string | null;
};

export type SaldoEstoqueCheck = {
  quantidade: number;
  nome: string;
  unidade?: string | null;
};

/**
 * Agrega quantidades por produto e verifica se a reversão (quantidade * -1)
 * deixaria o estoque negativo.
 */
export function avaliarEstornoEstoque(
  itens: ItemEstornoCheck[],
  saldos: Map<number, SaldoEstoqueCheck>,
): EstornoProdutoInsuficiente[] {
  const somaPorProduto = new Map<number, { qty: number; nome: string; unidade?: string | null }>();

  for (const it of itens) {
    const q = Number(it.quantidade);
    if (!Number.isFinite(q) || q === 0) continue;
    const prev = somaPorProduto.get(it.estoqueId);
    const saldo = saldos.get(it.estoqueId);
    const nome = it.nome?.trim() || saldo?.nome || `Produto #${it.estoqueId}`;
    const unidade = it.unidade ?? saldo?.unidade ?? null;
    if (prev) {
      prev.qty += q;
    } else {
      somaPorProduto.set(it.estoqueId, { qty: q, nome, unidade });
    }
  }

  const insuficientes: EstornoProdutoInsuficiente[] = [];
  for (const [estoqueId, agg] of somaPorProduto) {
    const inversa = -agg.qty;
    // Só reduz estoque quando a inversa é negativa (original foi entrada).
    if (inversa >= 0) continue;
    const necessario = -inversa;
    const saldo = saldos.get(estoqueId);
    const saldoAtual = saldo?.quantidade ?? 0;
    if (saldoAtual < necessario) {
      insuficientes.push({
        produto: saldo?.nome || agg.nome,
        quantidadeNecessaria: necessario,
        saldoAtual,
        quantidadeInsuficiente: necessario - saldoAtual,
        unidade: saldo?.unidade ?? agg.unidade,
      });
    }
  }
  return insuficientes;
}

export function montarMotivoEstorno(motivo: string, observacao?: string | null): string {
  const base = motivo.trim();
  const obs = observacao?.trim();
  if (!obs) return base.slice(0, 255);
  return `${base} — ${obs}`.slice(0, 255);
}

/** Erros de regra de negócio do estorno (não confundir com SQL que cita motivo_estorno). */
export function isEstornoBusinessError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message;
  if (/Failed query:/i.test(msg)) return false;
  return (
    /Movimentação não encontrada/i.test(msg) ||
    /já foi estornada/i.test(msg) ||
    /lançamento de estorno/i.test(msg) ||
    /estoque atual de um ou mais produtos é insuficiente/i.test(msg) ||
    /Informe o motivo do estorno/i.test(msg) ||
    /Usuário autenticado inválido/i.test(msg) ||
    /Produto não encontrado/i.test(msg) ||
    /Não é possível estornar/i.test(msg)
  );
}
