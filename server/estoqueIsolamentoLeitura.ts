import { carregarAcessoPorExecutor } from "./acessoFazendasDb";
import { isDatabaseUnavailable, listLocalFazendas } from "./localFallbackStore";

/** Fazendas autorizadas no MySQL. O principal também enxerga o espelho local. */
export async function idsFazendasDoUsuarioParaEstoque(userId: number): Promise<number[]> {
  const ids = new Set<number>();
  try {
    const acesso = await carregarAcessoPorExecutor(userId);
    if (!acesso) return [];
    for (const id of acesso.fazendasAutorizadas) ids.add(id);
    if (acesso.papel !== "principal") return [...ids];
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  const locais = await listLocalFazendas(userId);
  for (const fazenda of locais) {
    if (fazenda.id > 0) ids.add(fazenda.id);
  }
  return [...ids];
}
