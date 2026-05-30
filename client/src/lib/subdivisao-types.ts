/** Tipos de divisão — espelho do iRancho */
export const TIPOS_DIVISAO = [
  "Potreiro",
  "Invernada",
  "Piquete",
  "Pasto",
  "Baia de Confinamento",
  "Integração",
  "Integração Lavoura - Pecuária",
  "Integração Lavoura - Pecuária - Floresta",
] as const;

/** Tipos de pastagem — espelho do iRancho */
export const TIPOS_PASTAGEM = [
  "Braquiária",
  "Panicum",
  "Tifton",
  "Coast-cross",
  "Mombaça",
  "Colonião",
  "Andropogon",
  "Capim-sudão",
  "Natural",
  "Outro",
] as const;

export type TipoDivisao = (typeof TIPOS_DIVISAO)[number];
export type TipoPastagem = (typeof TIPOS_PASTAGEM)[number];
