export const INSUMOS_VISAO_GERAL_PATH = "/insumos/visao-geral";

/** URL de retorno para a Visão Geral (opcional: fazenda e grupo de alerta). */
export function buildInsumosVisaoGeralRetorno(
  fazendaId?: string,
  grupo?: string,
): string {
  const qs = new URLSearchParams();
  if (fazendaId) qs.set("fazendaId", fazendaId);
  if (grupo) qs.set("grupo", grupo);
  const q = qs.toString();
  return `${INSUMOS_VISAO_GERAL_PATH}${q ? `?${q}` : ""}`;
}

/** Anexa `retorno` à rota da lista de produtos (navegação vinda da Visão Geral). */
export function listaProdutosComRetornoVisaoGeral(
  listaPath: string,
  fazendaId?: string,
  grupo?: string,
): string {
  const retorno = buildInsumosVisaoGeralRetorno(fazendaId, grupo);
  const sep = listaPath.includes("?") ? "&" : "?";
  return `${listaPath}${sep}retorno=${encodeURIComponent(retorno)}`;
}

/** Anexa `retorno` à rota de movimentações (navegação vinda da Visão Geral). */
export function movimentacaoComRetornoVisaoGeral(
  movPath: string,
  fazendaId?: string,
  grupo?: string,
): string {
  const retorno = buildInsumosVisaoGeralRetorno(fazendaId, grupo);
  const sep = movPath.includes("?") ? "&" : "?";
  return `${movPath}${sep}retorno=${encodeURIComponent(retorno)}`;
}

export function isValidInsumosVisaoGeralRetorno(retorno: string): boolean {
  try {
    const url = new URL(retorno, "http://local");
    return url.pathname === INSUMOS_VISAO_GERAL_PATH;
  } catch {
    return false;
  }
}

export function parseRetornoVisaoGeral(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return isValidInsumosVisaoGeralRetorno(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
