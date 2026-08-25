export type GenealogiaParentRef = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
};

export type GenealogiaSource = {
  maeId?: number | null;
  paiId?: number | null;
  mae?: string | null;
  pai?: string | null;
};

export type GenealogiaDisplay = {
  mae: string;
  pai: string;
};

/** Identificação legível do parente — brinco preferencial, depois nome. Nunca expõe PK interna. */
export function formatGenealogiaParentLabel(parent: GenealogiaParentRef): string {
  const brinco = parent.brinco?.trim();
  if (brinco) return brinco;
  const nome = parent.nome?.trim();
  if (nome) return nome;
  return "";
}

/**
 * Resolve exibição de um parente.
 * Prioridade: maeId/paiId estruturado > texto legado.
 */
export function resolveGenealogiaParentDisplay(
  parentId: number | null | undefined,
  legacyText: string | null | undefined,
  parentRef?: GenealogiaParentRef | null,
): string {
  if (parentId != null && parentId > 0) {
    if (parentRef) {
      const label = formatGenealogiaParentLabel(parentRef);
      if (label) return label;
    }
    return "";
  }
  return legacyText?.trim() || "";
}

export function resolveGenealogiaDisplay(
  source: GenealogiaSource,
  parentById: Map<number, GenealogiaParentRef>,
): GenealogiaDisplay {
  return {
    mae: resolveGenealogiaParentDisplay(
      source.maeId,
      source.mae,
      source.maeId ? parentById.get(source.maeId) : undefined,
    ),
    pai: resolveGenealogiaParentDisplay(
      source.paiId,
      source.pai,
      source.paiId ? parentById.get(source.paiId) : undefined,
    ),
  };
}

/** Monta mapa de parentes a partir de lista já carregada (sem I/O). */
export function buildGenealogiaParentMap(
  parentIds: number[],
  animais: GenealogiaParentRef[],
): Map<number, GenealogiaParentRef> {
  const wanted = new Set(parentIds.filter(id => id > 0));
  const map = new Map<number, GenealogiaParentRef>();
  for (const a of animais) {
    if (wanted.has(a.id)) map.set(a.id, a);
  }
  return map;
}

export function collectGenealogiaParentIds(source: GenealogiaSource): number[] {
  return [source.maeId, source.paiId].filter(
    (id): id is number => id != null && id > 0,
  );
}
