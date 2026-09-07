type EstoqueItem = {
  id?: number | null;
  produtoId?: number | null;
  fazendaId?: number | null;
  nome?: string | null;
  categoria?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
  situacao?: string | null;
  controlarSaldo?: boolean | null;
};

export const COMBUSTIVEL_LABELS: Record<string, string> = {
  diesel: "Diesel",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla: "Arla",
};

export function getCombustivelLabel(combustivel: string): string {
  return COMBUSTIVEL_LABELS[combustivel] ?? combustivel;
}

/** Movimentação de estoque (compra/saída). O preço de compra fica em `valor` (total). */
export type MovimentacaoItem = {
  estoqueId?: number | null;
  fazendaId?: number | null;
  tipo?: string | null;
  quantidade?: string | number | null;
  valor?: string | number | null;
  status?: string | null;
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

/** Indica se o produto do estoque é combustível (por nome/categoria). */
export function isProdutoCombustivel(item: {
  nome?: string | null;
  categoria?: string | null;
  subcategoria?: string | null;
}): boolean {
  const nome = (item.nome ?? "").toLowerCase();
  const cat = `${item.categoria ?? ""} ${item.subcategoria ?? ""}`.toLowerCase();
  const blob = `${nome} ${cat}`;
  return Object.values(COMBUSTIVEL_KEYWORDS).some(keys => keys.some(k => blob.includes(k)));
}

/** Produtos de combustível da fazenda filtrados por tipo (ignora inativos). */
export function getCombustivelItens(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): EstoqueItem[] {
  const fid = Number(fazendaId);
  return estoque.filter(item => {
    if (Number(item.fazendaId) !== fid) return false;
    const situacao = String(item.situacao ?? "ativo").toLowerCase();
    if (situacao === "inativo") return false;
    return matchesCombustivel(item, combustivel);
  });
}

/** Indica se a fazenda tem cadastro válido do combustível (mesmo com saldo zero). */
export function temCombustivelCadastrado(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): boolean {
  return getCombustivelItens(estoque, fazendaId, combustivel).length > 0;
}

/** Primeiro item de combustível da fazenda (se existir). */
export function getItemCombustivelFazenda(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string
): EstoqueItem | null {
  return getCombustivelItens(estoque, fazendaId, combustivel)[0] ?? null;
}

/** Abastecimento interno exige produto estocável (controlarSaldo) na fazenda. */
export function fazendaControlaEstoqueCombustivel(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string,
  controlaSaldo: (flag: boolean | null | undefined) => boolean = flag => flag !== false
): boolean {
  const item = getItemCombustivelFazenda(estoque, fazendaId, combustivel);
  if (!item) return false;
  return controlaSaldo(item.controlarSaldo);
}

/** Primeiro item de estoque ativo do tipo, em qualquer fazenda (referência de catálogo). */
export function findCombustivelReferenciaCatalogo(
  estoque: EstoqueItem[],
  combustivel: string
): EstoqueItem | null {
  for (const item of estoque) {
    if (String(item.situacao ?? "ativo").toLowerCase() === "inativo") continue;
    if (matchesCombustivel(item, combustivel)) return item;
  }
  return null;
}

/** ID do produto no catálogo (produtoId), se existir em alguma fazenda. */
export function getProdutoIdCombustivelCatalogo(
  estoque: EstoqueItem[],
  combustivel: string
): number | undefined {
  const ref = findCombustivelReferenciaCatalogo(estoque, combustivel);
  const pid = ref?.produtoId;
  return pid != null && pid > 0 ? pid : undefined;
}

/** ID da linha de estoque em qualquer fazenda — usado para abrir o cadastro em modo edição. */
export function getEstoqueIdReferenciaCombustivel(
  estoque: EstoqueItem[],
  combustivel: string
): number | undefined {
  const ref = findCombustivelReferenciaCatalogo(estoque, combustivel);
  const id = ref?.id;
  return id != null && id > 0 ? id : undefined;
}

/** Saldo líquido em litros a partir das movimentações ativas dos produtos. */
export function getSaldoLitrosDeMovimentacoes(
  movimentacoes: MovimentacaoItem[],
  estoqueIds: Set<number>,
  fazendaId?: number
): number {
  let net = 0;
  for (const mov of movimentacoes) {
    const estId = mov.estoqueId != null ? Number(mov.estoqueId) : null;
    if (estId == null || !estoqueIds.has(estId)) continue;
    if (fazendaId != null && mov.fazendaId != null && Number(mov.fazendaId) !== Number(fazendaId)) {
      continue;
    }
    const status = String(mov.status ?? "ativa").toLowerCase();
    if (status === "estornada" || status === "estorno") continue;
    const q = parseFloat(String(mov.quantidade ?? 0));
    if (!Number.isFinite(q)) continue;
    net += q;
  }
  return Math.max(0, net);
}

/** Saldo total em litros do combustível na fazenda (apenas itens estocáveis). */
export function getSaldoLitros(
  estoque: EstoqueItem[],
  fazendaId: number,
  combustivel: string,
  movimentacoes: MovimentacaoItem[] = [],
  controlaSaldo: (flag: boolean | null | undefined) => boolean = flag => flag !== false
): number {
  const itens = getCombustivelItens(estoque, fazendaId, combustivel).filter(item =>
    controlaSaldo(item.controlarSaldo)
  );
  const saldoCadastro = itens.reduce(
    (sum, item) => sum + parseFloat(String(item.quantidade ?? 0)),
    0,
  );
  if (saldoCadastro > 0 || !movimentacoes.length || !itens.length) {
    return saldoCadastro;
  }
  const ids = new Set<number>();
  for (const item of itens) {
    if (item.id != null && item.id > 0) ids.add(Number(item.id));
  }
  return getSaldoLitrosDeMovimentacoes(movimentacoes, ids, fazendaId);
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
