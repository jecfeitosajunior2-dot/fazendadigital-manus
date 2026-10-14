export type LeituraEstoqueMysql<T> =
  | { ok: true; rows: T[] }
  | { ok: false; error: unknown };

/**
 * Política de leitura de estoque.list e estoque.listByCategories:
 * MySQL saudável é a fonte oficial, inclusive quando volta [].
 * JSON/local só entra em erro real de acesso ao banco.
 */
export function resolverLeituraEstoqueList<T>(
  leitura: LeituraEstoqueMysql<T>,
  listarLocal: () => T[],
  bancoIndisponivel: (error: unknown) => boolean,
): T[] {
  if (leitura.ok) return leitura.rows;
  if (!bancoIndisponivel(leitura.error)) throw leitura.error;
  return listarLocal();
}
