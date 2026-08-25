export type VinculoDescendente = "mae" | "pai" | "ambos";

export type DescendenteRow = {
  animalId: number;
  brinco: string | null;
  sexo: string | null;
  categoria: string | null;
  dataNascimento: string | null;
  status: string | null;
  vinculo: VinculoDescendente;
};

export type DescendenteSource = {
  id: number;
  maeId?: number | null;
  paiId?: number | null;
  brinco?: string | null;
  sexo?: string | null;
  categoria?: string | null;
  dataNascimento?: string | null;
  status?: string | null;
};

export function isDescendenteDireto(
  parentId: number,
  child: Pick<DescendenteSource, "maeId" | "paiId">,
): boolean {
  if (parentId <= 0) return false;
  const asMae = child.maeId != null && child.maeId > 0 && child.maeId === parentId;
  const asPai = child.paiId != null && child.paiId > 0 && child.paiId === parentId;
  return asMae || asPai;
}

export function resolveVinculoDescendente(
  parentId: number,
  maeId: number | null | undefined,
  paiId: number | null | undefined,
): VinculoDescendente {
  const asMae = maeId != null && maeId > 0 && maeId === parentId;
  const asPai = paiId != null && paiId > 0 && paiId === parentId;
  if (asMae && asPai) return "ambos";
  if (asMae) return "mae";
  return "pai";
}

export function mapToDescendenteRow(
  parentId: number,
  child: DescendenteSource,
): DescendenteRow {
  return {
    animalId: child.id,
    brinco: child.brinco ?? null,
    sexo: child.sexo ?? null,
    categoria: child.categoria ?? null,
    dataNascimento: child.dataNascimento ?? null,
    status: child.status ?? null,
    vinculo: resolveVinculoDescendente(parentId, child.maeId, child.paiId),
  };
}

/** Filhos diretos por `maeId` / `paiId` estruturados — sem inferência por texto. */
export function filterDescendentesDirectos(
  parentId: number,
  animais: DescendenteSource[],
): DescendenteSource[] {
  if (parentId <= 0) return [];
  const seen = new Set<number>();
  const result: DescendenteSource[] = [];
  for (const a of animais) {
    if (!isDescendenteDireto(parentId, a)) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    result.push(a);
  }
  return result;
}

/** Ordem determinística: nascimento mais recente primeiro; desempate por brinco e ID. */
export function sortDescendentes(rows: DescendenteRow[]): DescendenteRow[] {
  return [...rows].sort((a, b) => {
    const da = a.dataNascimento?.trim() || "";
    const db = b.dataNascimento?.trim() || "";
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    }
    const ba = (a.brinco ?? "").trim();
    const bb = (b.brinco ?? "").trim();
    if (ba !== bb) {
      if (!ba) return 1;
      if (!bb) return -1;
      return ba.localeCompare(bb, "pt-BR", { numeric: true });
    }
    return a.animalId - b.animalId;
  });
}

export function buildDescendentesList(
  parentId: number,
  animais: DescendenteSource[],
): DescendenteRow[] {
  const filtered = filterDescendentesDirectos(parentId, animais);
  const rows = filtered.map(c => mapToDescendenteRow(parentId, c));
  return sortDescendentes(rows);
}
