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

export const UNIDADES_BASE = [
  "Unidade",
  "Litro",
  "Mililitro",
  "Quilograma",
  "Grama",
  "Saco",
  "Frasco",
  "Dose",
] as const;

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
