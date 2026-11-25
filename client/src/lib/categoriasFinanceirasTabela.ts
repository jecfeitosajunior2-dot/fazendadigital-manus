export type CategoriaFinanceiraLista = {
  id: number;
  nome: string;
  tipo: string;
  categoriaPaiId: number | null;
  ativa: boolean;
};

const porNome = (a: CategoriaFinanceiraLista, b: CategoriaFinanceiraLista) =>
  a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true });

/** Ordem do quadro de receitas. Pai que não está aqui vai para o fim, em ordem de nome. */
export const ORDEM_PAIS_RECEITA = [
  "Vendas de Animais",
  "Leite e Derivados",
  "Serviços e Parcerias",
  "Subprodutos e Agricultura",
  "Outras Receitas",
] as const;

/** Ordem do quadro de despesas. Pai que não está aqui vai para o fim, em ordem de nome. */
export const ORDEM_PAIS_DESPESA = [
  "Nutrição",
  "Sanidade",
  "Reprodução",
  "Pastagens e Agricultura",
  "Compra de Animais (Reposição)",
  "Mão de Obra e Encargos",
  "Máquinas, Combustível e Manutenção",
  "Frete e Comercialização",
  "Administrativo e Utilidades",
  "Financeiro",
  "Investimento",
  "Arrendamento",
] as const;

function compararPorOrdem(ordem: readonly string[]) {
  return (a: CategoriaFinanceiraLista, b: CategoriaFinanceiraLista) => {
    const indiceA = ordem.indexOf(a.nome);
    const indiceB = ordem.indexOf(b.nome);
    if (indiceA === -1 && indiceB === -1) return porNome(a, b);
    if (indiceA === -1) return 1;
    if (indiceB === -1) return -1;
    return indiceA - indiceB;
  };
}

/** Pais primeiro, filhos logo abaixo do pai. Filho sem pai fica no fim. */
export function ordenarCategoriasComPai(
  lista: CategoriaFinanceiraLista[],
  compararPais: (a: CategoriaFinanceiraLista, b: CategoriaFinanceiraLista) => number = porNome,
): CategoriaFinanceiraLista[] {
  const pais = lista.filter((item) => item.categoriaPaiId == null).sort(compararPais);
  const filhos = lista.filter((item) => item.categoriaPaiId != null);
  const usadas = new Set<number>();
  const ordem: CategoriaFinanceiraLista[] = [];
  for (const pai of pais) {
    ordem.push(pai);
    for (const filho of filhos.filter((item) => item.categoriaPaiId === pai.id).sort(porNome)) {
      ordem.push(filho);
      usadas.add(filho.id);
    }
  }
  for (const filho of filhos.filter((item) => !usadas.has(item.id)).sort(porNome)) {
    ordem.push(filho);
  }
  return ordem;
}

export function separarCategoriasFinanceiras(lista: CategoriaFinanceiraLista[]) {
  return {
    receitas: ordenarCategoriasComPai(
      lista.filter((item) => item.tipo === "entrada"),
      compararPorOrdem(ORDEM_PAIS_RECEITA),
    ),
    despesas: ordenarCategoriasComPai(
      lista.filter((item) => item.tipo === "saida"),
      compararPorOrdem(ORDEM_PAIS_DESPESA),
    ),
  };
}

export type CategoriaVisivel = {
  categoria: CategoriaFinanceiraLista;
  filha: boolean;
  temFilhos: boolean;
  aberta: boolean;
};

/** A seta começa aberta. `fechadas` guarda só os pais que o usuário recolheu. */
export function categoriasVisiveis(
  lista: CategoriaFinanceiraLista[],
  fechadas: ReadonlySet<number>,
): CategoriaVisivel[] {
  const pais = new Set(lista.filter((item) => item.categoriaPaiId == null).map((item) => item.id));
  const comFilhos = new Set(
    lista
      .filter((item) => item.categoriaPaiId != null && pais.has(item.categoriaPaiId))
      .map((item) => item.categoriaPaiId as number),
  );
  return lista.flatMap((categoria) => {
    const filha = categoria.categoriaPaiId != null && pais.has(categoria.categoriaPaiId);
    if (filha && fechadas.has(categoria.categoriaPaiId as number)) return [];
    const temFilhos = comFilhos.has(categoria.id);
    return [{
      categoria,
      filha,
      temFilhos,
      aberta: temFilhos && !fechadas.has(categoria.id),
    }];
  });
}

export function linhasDaTabelaCategorias(
  receitas: CategoriaFinanceiraLista[],
  despesas: CategoriaFinanceiraLista[],
) {
  const total = Math.max(receitas.length, despesas.length);
  return Array.from({ length: total }, (_, indice) => ({
    receita: receitas[indice] ?? null,
    despesa: despesas[indice] ?? null,
  }));
}
