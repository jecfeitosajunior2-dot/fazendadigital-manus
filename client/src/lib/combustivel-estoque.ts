type EstoqueItem = {
  fazendaId?: number | null;
  nome?: string | null;
  categoria?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
};

const COMBUSTIVEL_KEYWORDS: Record<string, string[]> = {
  diesel: ["diesel"],
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

/** Preço médio ponderado por litro a partir do valor unitário cadastrado no estoque. */
export function getValorLitroEstoque(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): number | null {
  const itens = getCombustivelItens(estoque, fazendaId, combustivel);
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
  if (totalQtd <= 0) {
    // Sem saldo: usa o primeiro produto com preço cadastrado
    const comPreco = itens.find(i => parseFloat(String(i.valorUnitario ?? 0)) > 0);
    return comPreco ? parseFloat(String(comPreco.valorUnitario)) : null;
  }
  return totalValor / totalQtd;
}

/** Resolve valor/litro e total — usa DB ou calcula pelo estoque. */
export function resolveValoresAbastecimento(
  registro: {
    litros?: string | number | null;
    valorLitro?: string | number | null;
    valorTotal?: string | number | null;
    abastecidoNaFazenda?: boolean | null;
    fazendaId?: number | null;
    combustivel?: string | null;
  },
  estoque: EstoqueItem[]
): { valorLitro: number | null; valorTotal: number | null } {
  const litros = parseFloat(String(registro.litros ?? 0));
  let valorLitro = registro.valorLitro != null && registro.valorLitro !== ""
    ? parseFloat(String(registro.valorLitro))
    : null;
  let valorTotal = registro.valorTotal != null && registro.valorTotal !== ""
    ? parseFloat(String(registro.valorTotal))
    : null;

  if ((!valorLitro || Number.isNaN(valorLitro)) && registro.abastecidoNaFazenda && registro.fazendaId && registro.combustivel) {
    valorLitro = getValorLitroEstoque(estoque, registro.fazendaId, registro.combustivel);
  }

  if ((!valorTotal || Number.isNaN(valorTotal)) && valorLitro && !Number.isNaN(litros) && litros > 0) {
    valorTotal = litros * valorLitro;
  }

  return {
    valorLitro: valorLitro && !Number.isNaN(valorLitro) ? valorLitro : null,
    valorTotal: valorTotal && !Number.isNaN(valorTotal) ? valorTotal : null,
  };
}
