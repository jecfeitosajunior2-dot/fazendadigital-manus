export const NUTRICAO_VISAO_GERAL_PATH = "/nutricao/visao-geral";
export const NUTRICAO_PLANEJAMENTO_PATH = "/nutricao/planejamento";
export const NUTRICAO_DIETAS_PATH = "/nutricao/dietas";
export const NUTRICAO_FORNECIMENTOS_PATH = "/nutricao/fornecimentos";
export const NUTRICAO_BATIDAS_PATH = "/nutricao/batidas";
export const NUTRICAO_COCHOS_PATH = "/nutricao/cochos";
export const NUTRICAO_LEITURAS_PATH = "/nutricao/cochos/leituras";

/** Lista do módulo, preservando a fazenda quando ela já estiver escolhida. */
export function listaNutricaoComFazenda(path: string, fazendaId?: string | null): string {
  const id = String(fazendaId ?? "").trim();
  return id ? `${path}?fazendaId=${encodeURIComponent(id)}` : path;
}

export type NutricaoVisaoGeralFiltros = {
  fazendaId?: string;
  loteId?: string;
  de?: string;
  ate?: string;
};

/** URL de retorno para a Visão Geral da Nutrição (fazenda, lote e período, se houver). */
export function buildNutricaoVisaoGeralRetorno(filtros: NutricaoVisaoGeralFiltros = {}): string {
  const qs = new URLSearchParams();
  if (filtros.fazendaId) qs.set("fazendaId", filtros.fazendaId);
  if (filtros.loteId) qs.set("loteId", filtros.loteId);
  if (filtros.de) qs.set("de", filtros.de);
  if (filtros.ate) qs.set("ate", filtros.ate);
  const q = qs.toString();
  return `${NUTRICAO_VISAO_GERAL_PATH}${q ? `?${q}` : ""}`;
}

export function comRetornoNutricaoVisaoGeral(
  path: string,
  filtros: NutricaoVisaoGeralFiltros = {},
): string {
  const retorno = buildNutricaoVisaoGeralRetorno(filtros);
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}retorno=${encodeURIComponent(retorno)}`;
}

export function listaFornecimentosComRetornoVisaoGeral(
  filtros: NutricaoVisaoGeralFiltros = {},
): string {
  const qs = new URLSearchParams();
  if (filtros.fazendaId) qs.set("fazendaId", filtros.fazendaId);
  const q = qs.toString();
  const base = q ? `${NUTRICAO_FORNECIMENTOS_PATH}?${q}` : NUTRICAO_FORNECIMENTOS_PATH;
  return comRetornoNutricaoVisaoGeral(base, filtros);
}

export function listaLeiturasComRetornoVisaoGeral(
  filtros: NutricaoVisaoGeralFiltros = {},
): string {
  const qs = new URLSearchParams();
  if (filtros.fazendaId) qs.set("fazendaId", filtros.fazendaId);
  const q = qs.toString();
  const base = q ? `${NUTRICAO_LEITURAS_PATH}?${q}` : NUTRICAO_LEITURAS_PATH;
  return comRetornoNutricaoVisaoGeral(base, filtros);
}

/** Mantém o `retorno` ao trocar só a fazenda na lista. */
export function listUrlNutricaoPreservandoRetorno(
  listPath: string,
  fazendaId?: string,
  search?: string,
): string {
  const qs = new URLSearchParams();
  if (fazendaId) qs.set("fazendaId", fazendaId);
  const atual = new URLSearchParams((search ?? "").replace(/^\?/, ""));
  const retorno = atual.get("retorno");
  if (retorno) qs.set("retorno", retorno);
  const q = qs.toString();
  return q ? `${listPath}?${q}` : listPath;
}

export function isValidNutricaoVisaoGeralRetorno(retorno: string): boolean {
  try {
    const url = new URL(retorno, "http://local");
    return url.pathname === NUTRICAO_VISAO_GERAL_PATH;
  } catch {
    return false;
  }
}

export function parseRetornoNutricaoVisaoGeral(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return isValidNutricaoVisaoGeralRetorno(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

const DETALHE_NUTRICAO_RE = [
  /^\/nutricao\/planejamento\/\d+$/,
  /^\/nutricao\/dietas\/\d+$/,
  /^\/nutricao\/fornecimentos\/\d+$/,
  /^\/nutricao\/batidas\/\d+$/,
  /^\/nutricao\/cochos\/\d+$/,
  /^\/nutricao\/cochos\/leituras\/\d+$/,
];

/** Origem explícita segura dentro da Nutrição (visão geral, lista ou detalhe). */
export function isValidNutricaoRetorno(retorno: string): boolean {
  try {
    const url = new URL(retorno, "http://local");
    if (url.origin !== "http://local") return false;
    const p = url.pathname;
    if (
      p === NUTRICAO_VISAO_GERAL_PATH ||
      p === NUTRICAO_PLANEJAMENTO_PATH ||
      p === NUTRICAO_DIETAS_PATH ||
      p === NUTRICAO_FORNECIMENTOS_PATH ||
      p === NUTRICAO_BATIDAS_PATH ||
      p === NUTRICAO_COCHOS_PATH ||
      p === NUTRICAO_LEITURAS_PATH
    ) {
      return true;
    }
    return DETALHE_NUTRICAO_RE.some(re => re.test(p));
  } catch {
    return false;
  }
}

export function parseRetornoNutricao(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (!isValidNutricaoRetorno(decoded)) return null;
    const url = new URL(decoded, "http://local");
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function retornoNutricaoDaQuery(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return parseRetornoNutricao(new URLSearchParams(raw).get("retorno"));
}

export function comRetornoNutricao(path: string, origem: string): string {
  const retorno = parseRetornoNutricao(origem);
  if (!retorno) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}retorno=${encodeURIComponent(retorno)}`;
}

/** 1) origem explícita válida; 2) lista do módulo, com fazenda se houver. */
export function destinoVoltarNutricaoDetalhe(opts: {
  retorno?: string | null;
  listaPath: string;
  fazendaId?: string | number | null;
}): string {
  const origem = parseRetornoNutricao(opts.retorno);
  if (origem) return origem;
  return listaNutricaoComFazenda(opts.listaPath, opts.fazendaId);
}

export function filtrosNutricaoVisaoGeralDaQuery(search: string): NutricaoVisaoGeralFiltros | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const fazendaId = params.get("fazendaId") ?? "";
  const loteId = params.get("loteId") ?? "";
  const de = params.get("de") ?? "";
  const ate = params.get("ate") ?? "";
  if (!fazendaId && !loteId && !de && !ate) return null;
  return { fazendaId, loteId, de, ate };
}
