/** Abas suportadas na ficha do animal (`CattleDetailPageExpanded`). */
export const FICHA_ANIMAL_TABS = [
  "identificacao",
  "pesagens",
  "saude",
  "reproducao",
  "pastos",
  "observacoes",
] as const;

export type FichaAnimalTab = (typeof FICHA_ANIMAL_TABS)[number];

const FICHA_TAB_SET = new Set<string>(FICHA_ANIMAL_TABS);

export const FICHA_ANIMAL_DEFAULT_TAB: FichaAnimalTab = "identificacao";

export function isFichaAnimalTab(value: string | null | undefined): value is FichaAnimalTab {
  return value != null && FICHA_TAB_SET.has(value);
}

export function parseFichaAnimalTab(value: string | null | undefined): FichaAnimalTab {
  return isFichaAnimalTab(value) ? value : FICHA_ANIMAL_DEFAULT_TAB;
}

/** Rota da ficha com ID interno do animal e aba opcional. */
export function getFichaAnimalPath(animalId: number, tab?: FichaAnimalTab): string {
  const params = new URLSearchParams({ id: String(animalId) });
  if (tab && tab !== FICHA_ANIMAL_DEFAULT_TAB) {
    params.set("tab", tab);
  }
  return `/rebanho/detalhes-animal?${params.toString()}`;
}
