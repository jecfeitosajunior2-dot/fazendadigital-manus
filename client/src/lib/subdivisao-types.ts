/** Tipos de divisão — espelho do iRancho */
export const TIPOS_DIVISAO = [
  "Pasto",
  "Piquete",
  "Curral",
  "Confinamento",
  "Retiro",
  "Reserva",
  "Área de manejo",
  "Área agrícola",
  "Sede",
  "Potreiro",
  "Invernada",
  "Baia de Confinamento",
  "Integração Lavoura - Pecuária",
  "Integração Lavoura - Pecuária - Floresta",
  "Outro",
] as const;

/** Tipos de pastagem — espelho do iRancho */
export const TIPOS_PASTAGEM = [
  "Braquiária",
  "Mombaça",
  "Massai",
  "Tanzânia",
  "Andropogon",
  "Humidícola",
  "Tifton",
  "Coast-cross",
  "Nativo",
  "Outro",
] as const;

export type TipoDivisao = (typeof TIPOS_DIVISAO)[number];
export type TipoPastagem = (typeof TIPOS_PASTAGEM)[number];
