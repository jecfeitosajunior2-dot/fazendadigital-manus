type EstoqueItem = {
  id?: number | null;
  fazendaId?: number | null;
  nome?: string | null;
  categoria?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
};

/** Movimentação de estoque (compra/saída). O preço de compra fica em `valor` (total). */
export type MovimentacaoItem = {
  estoqueId?: number | null;
  tipo?: string | null;
  quantidade?: string | number | null;
  valor?: string | number | null;
};

const COMBUSTIVEL_KEYWORDS: Record<string, string[]> = {
  diesel: ["diesel", "s10", "s500", "óleo diesel", "oleo diesel"],
  gasolina: ["gasolina"],
  etanol: ["etanol", "álcool", "alcool"],
  arla: ["arla"],
};

function matchesCombustivel(item: EstoqueItem, combustivel: string): boolean {
  const keywords = COMBUSTIVEL_KEYWORDS[combustivel] ?? [combustivel];
  const nome = (item.nome ?? "").toLowerCase();
  const cat = (item.categoria ?? "").toLowerCase();
  return keywords.some(k => nome.includes(k) || cat.includes(k));
}

/** Produtos de combustível da fazenda filtrados por tipo. */
export function getCombustivelItens(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): EstoqueItem[] {
  return estoque.filter(
    item => item.fazendaId === fazendaId && matchesCombustivel(item, combustivel)
  );
}

/** Saldo total em litros do combustível na fazenda. */
export function getSaldoLitros(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): number {
  return getCombustivelItens(estoque, fazendaId, combustivel)
    .reduce((sum, item) => sum + parseFloat(String(item.quantidade ?? 0)), 0);
}

/**
 * Preço médio por litro derivado das movimentações de COMPRA de um produto.
 * `valor` na movimentação é o total da compra; dividimos pelo total de litros comprados.
 */
function getValorLitroDeMovimentacoes(
  movimentacoes: MovimentacaoItem[],
  estoqueIds: Set<number>
): number | null {
  let totalQtd = 0;
  let totalValor = 0;
  for (const mov of movimentacoes) {
    const estId = mov.estoqueId != null ? Number(mov.estoqueId) : null;
    if (estId == null || !estoqueIds.has(estId)) continue;
    const tipo = (mov.tipo ?? "").toLowerCase();
    // Considera apenas entradas de compra para precificação
    if (tipo && !tipo.includes("compra") && !tipo.includes("entrada")) continue;
    const qtd = Math.abs(parseFloat(String(mov.quantidade ?? 0)));
    const valor = parseFloat(String(mov.valor ?? 0));
    if (qtd > 0 && valor > 0) {
      totalQtd += qtd;
      totalValor += valor;
    }
  }
  if (totalQtd <= 0) return null;
  return totalValor / totalQtd;
}

/**
 * Preço médio ponderado por litro.
 * 1) Tenta o `valorUnitario` cadastrado no produto de estoque.
 * 2) Se ausente, deriva das movimentações de compra (valor total / litros).
 */
export function getValorLitroEstoque(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string,
  movimentacoes: MovimentacaoItem[] = []
): number | null {
  const itens = getCombustivelItens(estoque, fazendaId, combustivel);

  // 1) Preço médio ponderado a partir do valorUnitario do produto
  let totalQtd = 0;
  let totalValor = 0;
  for (const item of itens) {
    const qtd = parseFloat(String(item.quantidade ?? 0));
    const preco = parseFloat(String(item.valorUnitario ?? 0));
    if (qtd > 0 && preco > 0) {
      totalQtd += qtd;
      totalValor += qtd * preco;
    }
  }
  if (totalQtd > 0) {
    return totalValor / totalQtd;
  }

  // Sem saldo com preço: tenta primeiro produto com preço cadastrado
  const comPreco = itens.find(i => parseFloat(String(i.valorUnitario ?? 0)) > 0);
  if (comPreco) {
    return parseFloat(String(comPreco.valorUnitario));
  }

  // 2) Fallback: deriva o preço das movimentações de compra desses produtos
  if (movimentacoes.length && itens.length) {
    const ids = new Set<number>();
    for (const i of itens) {
      if (i.id != null) ids.add(Number(i.id));
    }
    if (ids.size) {
      return getValorLitroDeMovimentacoes(movimentacoes, ids);
    }
  }

  return null;
}

/** Resolve valor/litro e total — usa o registro salvo, o estoque ou as movimentações. */
export function resolveValoresAbastecimento(
  registro: {
    litros?: string | number | null;
    valorLitro?: string | number | null;
    valorTotal?: string | number | null;
    abastecidoNaFazenda?: boolean | null;
    fazendaId?: number | null;
    combustivel?: string | null;
  },
  estoque: EstoqueItem[],
  movimentacoes: MovimentacaoItem[] = []
): { valorLitro: number | null; valorTotal: number | null } {
  const litros = parseFloat(String(registro.litros ?? 0));
  let valorLitro = registro.valorLitro != null && registro.valorLitro !== ""
    ? parseFloat(String(registro.valorLitro))
    : null;
  let valorTotal = registro.valorTotal != null && registro.valorTotal !== ""
    ? parseFloat(String(registro.valorTotal))
    : null;

  if ((!valorLitro || Number.isNaN(valorLitro)) && registro.abastecidoNaFazenda && registro.fazendaId && registro.combustivel) {
    valorLitro = getValorLitroEstoque(estoque, registro.fazendaId, registro.combustivel, movimentacoes);
  }

  if ((!valorTotal || Number.isNaN(valorTotal)) && valorLitro && !Number.isNaN(litros) && litros > 0) {
    valorTotal = litros * valorLitro;
  }

  return {
    valorLitro: valorLitro && !Number.isNaN(valorLitro) ? valorLitro : null,
    valorTotal: valorTotal && !Number.isNaN(valorTotal) ? valorTotal : null,
  };
}
