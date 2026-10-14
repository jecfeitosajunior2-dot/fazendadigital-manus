export type SortKeyManutencaoListagem = "data" | "valor" | "maquina" | "tipo";

export type ManutencaoListagemOrdem = {
  id: number;
  data?: unknown;
  createdAt?: unknown;
  valorTotal?: unknown;
  tipo?: string | null;
};

function dataManutencaoIso(value: unknown): string {
  if (!value) return "";
  const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[0] : "";
}

function createdAtMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? t : null;
}

/** Desempate estável: criação DESC, depois ID DESC. Sem createdAt, só o ID. */
export function desempateRecenciaManutencao(
  a: Pick<ManutencaoListagemOrdem, "id" | "createdAt">,
  b: Pick<ManutencaoListagemOrdem, "id" | "createdAt">,
): number {
  const ca = createdAtMs(a.createdAt);
  const cb = createdAtMs(b.createdAt);
  if (ca != null && cb != null && ca !== cb) return cb - ca;
  return b.id - a.id;
}

export function compararManutencoesListagem<T extends ManutencaoListagemOrdem>(
  a: T,
  b: T,
  input: {
    sortKey: SortKeyManutencaoListagem;
    sortAsc: boolean;
    nomeMaquina?: (row: T) => string;
  },
): number {
  let cmp = 0;
  if (input.sortKey === "data") {
    cmp = dataManutencaoIso(a.data).localeCompare(dataManutencaoIso(b.data));
  } else if (input.sortKey === "valor") {
    cmp = (parseFloat(String(a.valorTotal ?? 0)) || 0) - (parseFloat(String(b.valorTotal ?? 0)) || 0);
  } else if (input.sortKey === "maquina") {
    const nome = input.nomeMaquina ?? (() => "");
    cmp = nome(a).localeCompare(nome(b), "pt-BR");
  } else if (input.sortKey === "tipo") {
    cmp = String(a.tipo ?? "").localeCompare(String(b.tipo ?? ""), "pt-BR");
  }
  if (cmp !== 0) return input.sortAsc ? cmp : -cmp;
  return desempateRecenciaManutencao(a, b);
}

export function ordenarManutencoesListagem<T extends ManutencaoListagemOrdem>(
  rows: readonly T[],
  input: {
    sortKey?: SortKeyManutencaoListagem;
    sortAsc?: boolean;
    nomeMaquina?: (row: T) => string;
  } = {},
): T[] {
  return [...rows].sort((a, b) =>
    compararManutencoesListagem(a, b, {
      sortKey: input.sortKey ?? "data",
      sortAsc: input.sortAsc ?? false,
      nomeMaquina: input.nomeMaquina,
    }),
  );
}

export function paginarManutencoesListagem<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const size = Math.max(1, pageSize);
  const atual = Math.max(1, page);
  return rows.slice((atual - 1) * size, atual * size);
}
