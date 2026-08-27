/** Data efetiva da movimentação: campo operacional `dataEntrada` (Entrada e SAIDA_IA). */
export function getSemenMovimentacaoDataEfetiva(mov: {
  dataEntrada?: string | Date | null;
  createdAt?: string | Date | null;
}): string {
  const operacional = toDateKey(mov.dataEntrada);
  if (operacional) return operacional;
  return toDateKey(mov.createdAt);
}

export type SemenMovimentacaoSortInput = {
  partidaId: number;
  id: number;
  dataEntrada?: string | Date | null;
  createdAt?: string | Date | null;
};

export type SemenUltimaMovimentacao = {
  dataEfetiva: string;
  createdAtKey: string;
  id: number;
};

export function buildUltimaMovimentacaoPorPartida(
  movimentacoes: readonly SemenMovimentacaoSortInput[],
): Map<number, SemenUltimaMovimentacao> {
  const map = new Map<number, SemenUltimaMovimentacao>();
  for (const mov of movimentacoes) {
    const next: SemenUltimaMovimentacao = {
      dataEfetiva: getSemenMovimentacaoDataEfetiva(mov),
      createdAtKey: toTimestampKey(mov.createdAt),
      id: mov.id,
    };
    const prev = map.get(mov.partidaId);
    if (!prev || compareUltimaMovimentacao(next, prev) > 0) {
      map.set(mov.partidaId, next);
    }
  }
  return map;
}

export function sortSemenPartidasByMovimentacoes<T extends { id: number }>(
  partidas: readonly T[],
  movimentacoes: readonly SemenMovimentacaoSortInput[],
): T[] {
  return sortSemenPartidasByUltimaMovimentacao(
    partidas,
    buildUltimaMovimentacaoPorPartida(movimentacoes),
  );
}

/** Mais recente primeiro. Partidas sem movimentação ficam no final. */
export function sortSemenPartidasByUltimaMovimentacao<T extends { id: number }>(
  partidas: readonly T[],
  ultimaByPartidaId: ReadonlyMap<number, SemenUltimaMovimentacao>,
): T[] {
  return [...partidas].sort((a, b) => {
    const ma = ultimaByPartidaId.get(a.id);
    const mb = ultimaByPartidaId.get(b.id);
    if (ma && !mb) return -1;
    if (!ma && mb) return 1;
    if (!ma && !mb) return b.id - a.id;
    const byMov = compareUltimaMovimentacao(mb!, ma!);
    if (byMov !== 0) return byMov;
    return b.id - a.id;
  });
}

function compareUltimaMovimentacao(
  a: SemenUltimaMovimentacao,
  b: SemenUltimaMovimentacao,
): number {
  if (a.dataEfetiva !== b.dataEfetiva) return a.dataEfetiva.localeCompare(b.dataEfetiva);
  if (a.createdAtKey !== b.createdAtKey) return a.createdAtKey.localeCompare(b.createdAtKey);
  return a.id - b.id;
}

function toDateKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return "";
}

function toTimestampKey(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value);
}
