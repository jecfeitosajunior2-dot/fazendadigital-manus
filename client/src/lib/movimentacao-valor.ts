import {
  freteLegadoDuplicadoNosItens,
  normalizarStatusMov,
  tipoExibicaoMov,
  type MovimentacaoItemRaw,
  type MovimentacaoResumo,
} from "@/lib/movimentacao-resumo";
import { sinalDoTipo } from "@/lib/produto-types";

export const numValMov = (v: unknown): number => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};

export type ProdutoValorRef = {
  id: number;
  valorUnitario?: string | number | null;
};

export type MovValorRef = {
  estoqueId: number;
  status?: string | null;
  tipo?: string | null;
  quantidade?: string | number | null;
  valor?: string | number | null;
  frete?: string | number | null;
};

/** Mapa de valor unitário cadastrado por produto (custo médio vigente). */
export function buildValorUnitMap(produtos: readonly ProdutoValorRef[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of produtos) {
    m.set(p.id, numValMov(p.valorUnitario));
  }
  return m;
}

/** Preço médio implícito das entradas ativas — fallback quando `valor` não foi lançado. */
export function buildPrecoMedioImplicit(movs: readonly MovValorRef[]): Map<number, number> {
  const totalQtd = new Map<number, number>();
  const totalVal = new Map<number, number>();
  for (const mv of movs) {
    const status = normalizarStatusMov(mv.status);
    if (status === "estornada" || status === "estorno") continue;
    if (mv.tipo && sinalDoTipo(mv.tipo) === "saida") continue;
    const qtd = numValMov(mv.quantidade);
    if (!(qtd > 0)) continue;
    const val = numValMov(mv.valor);
    if (val > 0) {
      totalQtd.set(mv.estoqueId, (totalQtd.get(mv.estoqueId) ?? 0) + qtd);
      totalVal.set(mv.estoqueId, (totalVal.get(mv.estoqueId) ?? 0) + val);
    }
  }
  const m = new Map<number, number>();
  for (const [id, qtd] of totalQtd.entries()) {
    const val = totalVal.get(id) ?? 0;
    m.set(id, qtd > 0 ? val / qtd : 0);
  }
  return m;
}

/** Indica se a compra tem valor lançado na movimentação (NF/formulário). */
export function compraTemValorGravado(mv: { valor?: string | number | null }): boolean {
  return numValMov(mv.valor) > 0;
}

/** Valor de uma linha (entrada/saída) — estima por qtd × preço quando `valor` está vazio. */
export function valorMovimentacaoLinha(
  mv: {
    estoqueId: number;
    quantidade: string | number;
    valor?: string | number | null;
  },
  valorUnitMap: Map<number, number>,
  precoMedioImplicit: Map<number, number>,
): number {
  const valor = numValMov(mv.valor);
  if (valor > 0) return valor;
  const qtd = Math.abs(numValMov(mv.quantidade));
  return qtd * (valorUnitMap.get(mv.estoqueId) ?? precoMedioImplicit.get(mv.estoqueId) ?? 0);
}

/** Valor da compra em R$ — `valor` já inclui frete rateado quando lançado pelo formulário. */
export function valorCompraMov(
  mv: {
    estoqueId: number;
    quantidade: string | number;
    valor?: string | number | null;
    frete?: string | number | null;
  },
  valorUnitMap: Map<number, number>,
  precoMedioImplicit: Map<number, number>,
): number {
  const valor = numValMov(mv.valor);
  if (valor > 0) return valor;
  const qtd = Math.abs(numValMov(mv.quantidade));
  const base = qtd * (valorUnitMap.get(mv.estoqueId) ?? precoMedioImplicit.get(mv.estoqueId) ?? 0);
  return base + Math.max(0, numValMov(mv.frete));
}

function isCompraTipo(tipo: string | null | undefined): boolean {
  return String(tipo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .includes("compra");
}

/** Valor efetivo de uma linha (com estimativa quando `valor` está vazio). */
export function valorItemMovimentacaoEfetivo(
  it: MovimentacaoItemRaw,
  valorUnitMap: Map<number, number>,
  precoMedioImplicit: Map<number, number>,
): number {
  const estoqueId = it.estoqueId ?? 0;
  if (!estoqueId) return 0;

  const valorGravado = numValMov(it.valor);
  if (valorGravado !== 0) return valorGravado;

  const tipo = tipoExibicaoMov(it);
  if (isCompraTipo(tipo)) {
    return valorCompraMov(
      {
        estoqueId,
        quantidade: it.quantidade ?? 0,
        valor: it.valor,
        frete: it.frete,
      },
      valorUnitMap,
      precoMedioImplicit,
    );
  }

  return valorMovimentacaoLinha(
    { estoqueId, quantidade: it.quantidade ?? 0, valor: it.valor },
    valorUnitMap,
    precoMedioImplicit,
  );
}

/**
 * Valor total efetivo de uma movimentação agrupada.
 * Usa o total gravado quando todas as linhas têm valor; caso contrário estima
 * linha a linha (mesma regra da Visão Geral).
 */
export function valorTotalResumoEfetivo(
  resumo: Pick<MovimentacaoResumo, "valorTotal" | "itens" | "freteLegado">,
  valorUnitMap: Map<number, number>,
  precoMedioImplicit: Map<number, number>,
): number | null {
  const faltaValor = resumo.itens.some(it => numValMov(it.valor) === 0);
  if (!faltaValor && resumo.valorTotal != null) {
    return resumo.valorTotal;
  }

  const freteLegado = resumo.freteLegado ?? freteLegadoDuplicadoNosItens(resumo.itens);
  let valorSum = 0;
  let freteSum = 0;
  let temValor = false;

  for (const it of resumo.itens) {
    const v = valorItemMovimentacaoEfetivo(it, valorUnitMap, precoMedioImplicit);
    if (v !== 0) {
      valorSum += v;
      temValor = true;
    }
    const f = numValMov(it.frete);
    if (freteLegado) {
      if (freteSum === 0 && f > 0) freteSum = f;
    } else {
      freteSum += f;
    }
  }

  if (!temValor && freteSum <= 0) return null;
  if (temValor) {
    return freteLegado ? valorSum + freteSum : valorSum;
  }
  return freteSum > 0 ? freteSum : null;
}
