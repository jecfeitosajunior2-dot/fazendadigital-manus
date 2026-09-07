/** Categorias em que o saldo deve ser controlado por padrão (rebanho / manejo). */
export const CATEGORIAS_SALDO_OBRIGATORIO = ["Farmácia", "Nutricionais"] as const;

export type CategoriaSaldoObrigatorio = (typeof CATEGORIAS_SALDO_OBRIGATORIO)[number];

/** Categorias de insumo consumidas na manutenção de máquinas — exigem estoque estocável. */
export const CATEGORIAS_MANUTENCAO_ESTOQUE = ["Peças", "Lubrificantes"] as const;

export type CategoriaManutencaoEstoque = (typeof CATEGORIAS_MANUTENCAO_ESTOQUE)[number];

/** Combustíveis — saldo configurável por fazenda (estocável ou uso imediato). */
export const CATEGORIAS_COMBUSTIVEL = ["Combustíveis"] as const;

export type CategoriaCombustivel = (typeof CATEGORIAS_COMBUSTIVEL)[number];

function categoriaNormalizada(categoria: string | null | undefined): string {
  return String(categoria ?? "").trim();
}

function categoriaNaLista(categoria: string, lista: readonly string[]): boolean {
  const c = categoria.toLowerCase();
  return lista.some(item => item.toLowerCase() === c);
}

/** Produtos destas categorias não podem ser cadastrados como uso imediato. */
export function categoriaExigeEstocavelManutencao(categoria: string | null | undefined): boolean {
  return categoriaNaLista(categoriaNormalizada(categoria), CATEGORIAS_MANUTENCAO_ESTOQUE);
}

/** Identifica categoria Combustíveis (configuração de saldo é por fazenda). */
export function categoriaExigeEstocavelCombustivel(categoria: string | null | undefined): boolean {
  return categoriaNaLista(categoriaNormalizada(categoria), CATEGORIAS_COMBUSTIVEL);
}

/** Sugere controle de saldo ao cadastrar produto conforme a categoria. */
export function categoriaControlaSaldoPorPadrao(categoria: string | null | undefined): boolean {
  const c = categoriaNormalizada(categoria);
  if (!c) return true;
  if (categoriaNaLista(c, CATEGORIAS_SALDO_OBRIGATORIO)) return true;
  if (categoriaExigeEstocavelManutencao(c)) return true;
  return false;
}

/**
 * Resolve se o produto controla saldo nesta fazenda.
 * `undefined`/`null` → true (legado: mantém comportamento anterior).
 */
export function produtoControlaSaldo(controlarSaldo: boolean | null | undefined): boolean {
  return controlarSaldo !== false;
}
