export const REBANHO_VISAO_GERAL_PATH = "/rebanho/visao-geral";

/** URL de retorno para a Visão Geral do Rebanho (opcional: fazenda). */
export function buildRebanhoVisaoGeralRetorno(fazendaId?: string): string {
  const qs = new URLSearchParams();
  if (fazendaId) qs.set("fazendaId", fazendaId);
  const q = qs.toString();
  return `${REBANHO_VISAO_GERAL_PATH}${q ? `?${q}` : ""}`;
}

/** Anexa `retorno` à rota da lista de animais (navegação vinda da Visão Geral). */
export function listaAnimaisComRetornoVisaoGeral(
  listaPath: string,
  fazendaId?: string,
): string {
  return comRetornoVisaoGeralRebanho(listaPath, fazendaId);
}

/** Anexa `retorno` à rota do mapa do rebanho (navegação vinda da Visão Geral). */
export function mapaRebanhoComRetornoVisaoGeral(
  mapaPath: string,
  fazendaId?: string,
): string {
  return comRetornoVisaoGeralRebanho(mapaPath, fazendaId);
}

function comRetornoVisaoGeralRebanho(path: string, fazendaId?: string): string {
  const retorno = buildRebanhoVisaoGeralRetorno(fazendaId);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}retorno=${encodeURIComponent(retorno)}`;
}

export function isValidRebanhoVisaoGeralRetorno(retorno: string): boolean {
  try {
    const url = new URL(retorno, "http://local");
    return url.pathname === REBANHO_VISAO_GERAL_PATH;
  } catch {
    return false;
  }
}

export function parseRetornoRebanhoVisaoGeral(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return isValidRebanhoVisaoGeralRetorno(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
