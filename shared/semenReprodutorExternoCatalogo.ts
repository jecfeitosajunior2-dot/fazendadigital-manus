import {
  SEMEN_ORIGEM_EXTERNO,
  buildSemenReprodutorKey,
  tryBuildSemenReprodutorKeyExterno,
} from "./semenEstoque";
import { SEMEN_REPRODUTOR_NAO_INFORMADO_KEY } from "./reproReprodutorDisplay";
import type { SemenUtilizadoUso } from "./semenUtilizado";

export const MSG_SEMEN_CATALOGO_NOME_OBRIGATORIO = "Informe o reprodutor / sêmen.";
export const MSG_SEMEN_CATALOGO_JA_CADASTRADO =
  "Este sêmen/reprodutor já está cadastrado. Ele já estará disponível na Inseminação.";
export const MSG_SEMEN_CATALOGO_IDENTIDADE_IMUTAVEL =
  "A identidade do reprodutor não pode mudar. Use o mesmo código.";
export const MSG_SEMEN_CATALOGO_NAO_ENCONTRADO = "Reprodutor externo não encontrado.";
export const MSG_SEMEN_CATALOGO_USADO_NAO_EXCLUI =
  "Este reprodutor já foi utilizado. Inative em vez de excluir.";

export type SemenReprodutorExternoCadastro = {
  id: number;
  userId: number;
  fazendaId: number;
  reprodutorKey: string;
  reprodutorTexto: string;
  centralPadrao: string | null;
  observacoes: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SemenReprodutorExternoHistoricoFonte = {
  reprodutorKey: string;
  reprodutorTexto: string;
  centralOrigem?: string | null;
  ultimoUso?: string | null;
};

export type SemenReprodutorExternoCatalogoItem = {
  id: number | null;
  reprodutorKey: string;
  reprodutorTexto: string;
  centralPadrao: string | null;
  observacoes: string | null;
  ativo: boolean;
  origem: "cadastro" | "historico";
  ultimoUso: string | null;
};

export type SemenReprodutorExternoCreateInput = {
  reprodutorTexto: string;
  centralPadrao?: string | null;
  observacoes?: string | null;
};

export type SemenReprodutorExternoCreateResult =
  | { status: "created"; item: SemenReprodutorExternoCatalogoItem }
  | {
      status: "already_exists";
      item: SemenReprodutorExternoCatalogoItem;
      message: string;
    }
  | { status: "invalid"; message: string };

export function normalizeSemenReprodutorExternoCatalogoTexto(raw: string): string {
  return String(raw ?? "").trim();
}

export function semenReprodutorExternoCatalogoKeyFromTexto(raw: string): string | null {
  return tryBuildSemenReprodutorKeyExterno(normalizeSemenReprodutorExternoCatalogoTexto(raw));
}

export function isSemenReprodutorExternoCatalogoKey(key: string): boolean {
  return key.startsWith("e:") && key.length > 2 && key !== SEMEN_REPRODUTOR_NAO_INFORMADO_KEY;
}

export function validateSemenReprodutorExternoCreate(
  input: SemenReprodutorExternoCreateInput,
): { ok: true; texto: string; key: string; centralPadrao: string | null; observacoes: string | null } | { ok: false; message: string } {
  const texto = normalizeSemenReprodutorExternoCatalogoTexto(input.reprodutorTexto);
  if (!texto) return { ok: false, message: MSG_SEMEN_CATALOGO_NOME_OBRIGATORIO };
  let key: string;
  try {
    key = buildSemenReprodutorKey({ origem: SEMEN_ORIGEM_EXTERNO, reprodutorTexto: texto });
  } catch {
    return { ok: false, message: MSG_SEMEN_CATALOGO_NOME_OBRIGATORIO };
  }
  if (!isSemenReprodutorExternoCatalogoKey(key)) {
    return { ok: false, message: MSG_SEMEN_CATALOGO_NOME_OBRIGATORIO };
  }
  return {
    ok: true,
    texto,
    key,
    centralPadrao: String(input.centralPadrao ?? "").trim() || null,
    observacoes: String(input.observacoes ?? "").trim() || null,
  };
}

export function historicoReprodutoresExternosDeUsos(
  usos: readonly SemenUtilizadoUso[],
): SemenReprodutorExternoHistoricoFonte[] {
  const map = new Map<string, SemenReprodutorExternoHistoricoFonte>();
  for (const uso of usos) {
    if (uso.origem !== SEMEN_ORIGEM_EXTERNO) continue;
    if (!isSemenReprodutorExternoCatalogoKey(uso.reprodutorKey)) continue;
    const existing = map.get(uso.reprodutorKey);
    if (!existing) {
      map.set(uso.reprodutorKey, {
        reprodutorKey: uso.reprodutorKey,
        reprodutorTexto: uso.reprodutorDisplay,
        centralOrigem: uso.central,
        ultimoUso: uso.dataIso,
      });
      continue;
    }
    if (uso.dataIso && (!existing.ultimoUso || uso.dataIso > existing.ultimoUso)) {
      existing.ultimoUso = uso.dataIso;
    }
    if (!existing.centralOrigem && uso.central) existing.centralOrigem = uso.central;
  }
  return [...map.values()];
}

export function historicoReprodutoresExternosDePartidas(
  partidas: ReadonlyArray<{
    origemReprodutor?: string | null;
    reprodutorKey: string;
    reprodutorTexto?: string | null;
    centralOrigem?: string | null;
  }>,
): SemenReprodutorExternoHistoricoFonte[] {
  const map = new Map<string, SemenReprodutorExternoHistoricoFonte>();
  for (const p of partidas) {
    if (String(p.origemReprodutor ?? "") !== SEMEN_ORIGEM_EXTERNO) continue;
    if (!isSemenReprodutorExternoCatalogoKey(p.reprodutorKey)) continue;
    if (map.has(p.reprodutorKey)) continue;
    map.set(p.reprodutorKey, {
      reprodutorKey: p.reprodutorKey,
      reprodutorTexto: String(p.reprodutorTexto ?? "").trim() || p.reprodutorKey.slice(2),
      centralOrigem: p.centralOrigem ?? null,
    });
  }
  return [...map.values()];
}

export function mergeSemenReprodutorExternoHistorico(
  ...groups: readonly SemenReprodutorExternoHistoricoFonte[][]
): SemenReprodutorExternoHistoricoFonte[] {
  const map = new Map<string, SemenReprodutorExternoHistoricoFonte>();
  for (const group of groups) {
    for (const item of group) {
      const existing = map.get(item.reprodutorKey);
      if (!existing) {
        map.set(item.reprodutorKey, { ...item });
        continue;
      }
      if (item.ultimoUso && (!existing.ultimoUso || item.ultimoUso > existing.ultimoUso)) {
        existing.ultimoUso = item.ultimoUso;
      }
      if (!existing.centralOrigem && item.centralOrigem) existing.centralOrigem = item.centralOrigem;
      if (item.reprodutorTexto && existing.reprodutorTexto === existing.reprodutorKey.slice(2)) {
        existing.reprodutorTexto = item.reprodutorTexto;
      }
    }
  }
  return [...map.values()];
}

export function mergeSemenReprodutorExternoCatalogo(
  cadastrados: readonly SemenReprodutorExternoCadastro[],
  historico: readonly SemenReprodutorExternoHistoricoFonte[],
): SemenReprodutorExternoCatalogoItem[] {
  const histByKey = new Map(historico.map(h => [h.reprodutorKey, h]));
  const items: SemenReprodutorExternoCatalogoItem[] = cadastrados.map(row => {
    const hist = histByKey.get(row.reprodutorKey);
    return {
      id: row.id,
      reprodutorKey: row.reprodutorKey,
      reprodutorTexto: row.reprodutorTexto,
      centralPadrao: row.centralPadrao,
      observacoes: row.observacoes,
      ativo: row.ativo,
      origem: "cadastro",
      ultimoUso: hist?.ultimoUso ?? null,
    };
  });
  const cadastradoKeys = new Set(cadastrados.map(r => r.reprodutorKey));
  for (const hist of historico) {
    if (cadastradoKeys.has(hist.reprodutorKey)) continue;
    items.push({
      id: null,
      reprodutorKey: hist.reprodutorKey,
      reprodutorTexto: hist.reprodutorTexto,
      centralPadrao: hist.centralOrigem ?? null,
      observacoes: null,
      ativo: true,
      origem: "historico",
      ultimoUso: hist.ultimoUso ?? null,
    });
  }
  return sortSemenReprodutorExternoCatalogo(items);
}

export function sortSemenReprodutorExternoCatalogo(
  items: readonly SemenReprodutorExternoCatalogoItem[],
): SemenReprodutorExternoCatalogoItem[] {
  return [...items].sort((a, b) => {
    if (a.ultimoUso && b.ultimoUso && a.ultimoUso !== b.ultimoUso) {
      return b.ultimoUso.localeCompare(a.ultimoUso);
    }
    if (a.ultimoUso && !b.ultimoUso) return -1;
    if (!a.ultimoUso && b.ultimoUso) return 1;
    return a.reprodutorTexto.localeCompare(b.reprodutorTexto, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export function filterSemenReprodutorExternoCatalogoSugestao(
  items: readonly SemenReprodutorExternoCatalogoItem[],
  search: string,
): SemenReprodutorExternoCatalogoItem[] {
  const q = search.trim().toLowerCase();
  const ativos = items.filter(i => i.ativo);
  if (!q) return ativos;
  return ativos.filter(i => i.reprodutorTexto.toLowerCase().includes(q));
}

export function findSemenReprodutorExternoCatalogoByKey(
  items: readonly SemenReprodutorExternoCatalogoItem[],
  key: string,
): SemenReprodutorExternoCatalogoItem | undefined {
  return items.find(i => i.reprodutorKey === key);
}

export function resolveSemenReprodutorExternoCreate(
  input: SemenReprodutorExternoCreateInput,
  catalogo: readonly SemenReprodutorExternoCatalogoItem[],
): SemenReprodutorExternoCreateResult {
  const valid = validateSemenReprodutorExternoCreate(input);
  if (!valid.ok) return { status: "invalid", message: valid.message };
  const existing = findSemenReprodutorExternoCatalogoByKey(catalogo, valid.key);
  if (existing) {
    return {
      status: "already_exists",
      item: existing,
      message: MSG_SEMEN_CATALOGO_JA_CADASTRADO,
    };
  }
  return {
    status: "created",
    item: {
      id: null,
      reprodutorKey: valid.key,
      reprodutorTexto: valid.texto,
      centralPadrao: valid.centralPadrao,
      observacoes: valid.observacoes,
      ativo: true,
      origem: "cadastro",
      ultimoUso: null,
    },
  };
}

export function canChangeSemenReprodutorExternoTexto(
  reprodutorKey: string,
  novoTexto: string,
): boolean {
  const nextKey = semenReprodutorExternoCatalogoKeyFromTexto(novoTexto);
  return nextKey === reprodutorKey;
}

export function formatSemenReprodutorExternoCatalogoSubtitulo(
  item: Pick<SemenReprodutorExternoCatalogoItem, "centralPadrao">,
): string {
  const central = String(item.centralPadrao ?? "").trim();
  return central ? `Externo · ${central}` : "Externo";
}
