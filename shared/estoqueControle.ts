/** Categorias em que o saldo deve ser controlado por padrão (rebanho / manejo). */
export const CATEGORIAS_SALDO_OBRIGATORIO = ["Farmácia", "Nutricionais"] as const;

export type CategoriaSaldoObrigatorio = (typeof CATEGORIAS_SALDO_OBRIGATORIO)[number];

/** Sugere controle de saldo ao cadastrar produto conforme a categoria. */
export function categoriaControlaSaldoPorPadrao(categoria: string | null | undefined): boolean {
  if (!categoria?.trim()) return true;
  return (CATEGORIAS_SALDO_OBRIGATORIO as readonly string[]).includes(categoria.trim());
}

/**
 * Resolve se o produto controla saldo nesta fazenda.
 * `undefined`/`null` → true (legado: mantém comportamento anterior).
 */
export function produtoControlaSaldo(controlarSaldo: boolean | null | undefined): boolean {
  return controlarSaldo !== false;
}
