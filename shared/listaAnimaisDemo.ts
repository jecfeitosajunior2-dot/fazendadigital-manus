/** 6 animais da Lista de Animais (print Manus) — compartilhado client + server dev */
export type ListaAnimaisPrintRow = {
  id: number;
  brinco: string;
  sexo: "macho" | "femea";
  categoria: string;
  lote: string;
  idadeMeses: number;
  diasNaFazenda: number;
  pesoAtual?: string;
  ganhoKg?: number;
  gmd?: number;
};

export const LISTA_ANIMAIS_PRINT: ListaAnimaisPrintRow[] = [
  { id: 1, brinco: "02", sexo: "macho", categoria: "Novilho", lote: "Reprodutores", idadeMeses: 17, diasNaFazenda: 534, pesoAtual: "180", ganhoKg: 30, gmd: 30 },
  { id: 2, brinco: "03", sexo: "femea", categoria: "Vaca", lote: "Vazias", idadeMeses: 41, diasNaFazenda: 1265 },
  { id: 3, brinco: "04", sexo: "macho", categoria: "Bezerro", lote: "Bezerros", idadeMeses: 5, diasNaFazenda: 169 },
  { id: 4, brinco: "05", sexo: "femea", categoria: "Vaca", lote: "Prenhas", idadeMeses: 48, diasNaFazenda: 1478 },
  { id: 5, brinco: "25", sexo: "macho", categoria: "Bezerro", lote: "Reprodutores", idadeMeses: 0, diasNaFazenda: 18 },
  { id: 6, brinco: "55", sexo: "macho", categoria: "Boi", lote: "Reprodutores", idadeMeses: 41, diasNaFazenda: 1265, pesoAtual: "220", ganhoKg: 20, gmd: 20 },
];

export type ListaAnimaisDemoItem = {
  id: number;
  brinco: string | null;
  brincoEletronico: string | null;
  categoria: string | null;
  loteNome: string | null;
  sexo: "macho" | "femea";
  idadeMeses: number | null;
  diasNaFazenda: number | null;
  ultimoPeso: number | null;
  ganhoKg: number | null;
  gmd: number | null;
  emCarencia: boolean;
  raca: string | null;
  status: "ativo";
};

/** Resposta enriquecida para exibição na lista (fallback client-side) */
export const LISTA_ANIMAIS_DEMO: ListaAnimaisDemoItem[] = LISTA_ANIMAIS_PRINT.map(row => ({
  id: row.id,
  brinco: row.brinco,
  brincoEletronico: null,
  categoria: row.categoria,
  loteNome: row.lote,
  sexo: row.sexo,
  idadeMeses: row.idadeMeses,
  diasNaFazenda: row.diasNaFazenda,
  ultimoPeso: row.pesoAtual ? Number(row.pesoAtual) : null,
  ganhoKg: row.ganhoKg ?? null,
  gmd: row.gmd ?? null,
  emCarencia: false,
  raca: row.brinco === "25" ? null : "Nelore",
  status: "ativo",
}));

export const REBANHO_SEED_VERSION = 3;

export const BRINCOS_LISTA_MANUS = ["02", "03", "04", "05", "25", "55"] as const;

export function isListaManusDemo(data: { brinco?: string | null }[] | undefined): boolean {
  if (!data?.length) return false;
  const brincos = new Set(data.map(a => a.brinco).filter(Boolean));
  return BRINCOS_LISTA_MANUS.every(b => brincos.has(b));
}

export const LISTA_LOTES_DEMO = [
  { id: 1, nome: "Reprodutores", fazendaId: 1 as number | null },
  { id: 2, nome: "Vazias", fazendaId: 1 as number | null },
  { id: 3, nome: "Bezerros", fazendaId: 1 as number | null },
  { id: 4, nome: "Prenhas", fazendaId: 1 as number | null },
];

export const LISTA_FAZENDAS_DEMO = [{ id: 1, nome: "Minha Fazenda" }];

/** Filtra lista (demo ou API) pelos filtros principais da tela */
export function filterListaAnimais<T extends {
  brinco?: string | null;
  sexo?: string;
  categoria?: string | null;
  loteNome?: string | null;
}>(
  items: T[],
  filters: { sexo?: string; categoria?: string; loteId?: string; fazendaId?: string },
  search: string,
  lotes: { id: number; nome: string }[] = LISTA_LOTES_DEMO,
): T[] {
  let list = items;
  if (filters.sexo) list = list.filter(a => a.sexo === filters.sexo);
  if (filters.categoria) list = list.filter(a => a.categoria === filters.categoria);
  if (filters.loteId) {
    const lote = lotes.find(l => String(l.id) === filters.loteId);
    if (lote) list = list.filter(a => a.loteNome === lote.nome);
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(a => (a.brinco ?? "").toLowerCase().includes(q));
  }
  return list;
}
