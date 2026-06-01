export const CATEGORIAS_PRODUTO = [
  "Medicamentos",
  "Vacinas",
  "Reprodução",
  "Combustíveis",
  "Rações e Suplementos",
  "Defensivos",
  "Material de Manejo",
  "Outros",
] as const;

export const SUBCATEGORIAS: Record<string, string[]> = {
  Medicamentos: ["Antibiótico", "Anti-inflamatório", "Vermífugo", "Hormônio", "Outro"],
  Vacinas: ["Clostridioses", "Reprodutiva", "Sanitária", "Outra"],
  Reprodução: ["Sêmen", "Embrião", "Implante", "Hormônio", "Outro"],
  Combustíveis: ["Diesel", "Gasolina", "Etanol", "Arla", "Outro"],
  "Rações e Suplementos": ["Mineral", "Proteico", "Energético", "Outro"],
  Defensivos: ["Herbicida", "Carrapaticida", "Outro"],
  "Material de Manejo": ["Identificação", "Equipamento", "Outro"],
  Outros: ["Geral"],
};

/** Unidades base — abreviações para reconhecimento rápido. */
export const UNIDADES_BASE = [
  "un",
  "L",
  "ml",
  "kg",
  "g",
  "sc",
  "fr",
  "dose",
] as const;

/** Converte nomes antigos (cadastros legados) para abreviação. */
export const normalizarUnidade = (unidade: string | null | undefined): string => {
  if (!unidade) return "";
  const map: Record<string, string> = {
    Unidade: "un",
    Litro: "L",
    Mililitro: "ml",
    Quilograma: "kg",
    Grama: "g",
    Saco: "sc",
    Frasco: "fr",
    Dose: "dose",
  };
  return map[unidade] ?? unidade;
};

export const FABRICANTES = [
  "Ourofino",
  "Zoetis",
  "Merck",
  "Bayer",
  "Virbac",
  "Ceva",
  "Outro",
] as const;

export const EMBALAGENS_PADRAO = [
  "Frasco 100ml",
  "Frasco 500ml",
  "Frasco 1L",
  "Saco 25kg",
  "Saco 40kg",
  "Caixa",
  "Unidade",
] as const;
