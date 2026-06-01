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

/** Unidades base — siglas exibidas no cadastro (reconhecimento rápido). */
export const UNIDADES_OPCOES = [
  { sigla: "un", legenda: "unidade" },
  { sigla: "L", legenda: "litro" },
  { sigla: "ml", legenda: "mililitro" },
  { sigla: "kg", legenda: "quilograma" },
  { sigla: "g", legenda: "grama" },
  { sigla: "sc", legenda: "saco" },
  { sigla: "fr", legenda: "frasco" },
  { sigla: "dose", legenda: "dose" },
] as const;

export const UNIDADES_BASE = UNIDADES_OPCOES.map(u => u.sigla);

/** Converte nomes antigos (cadastros legados) para sigla. */
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
    unidade: "un",
    litro: "L",
    mililitro: "ml",
    quilograma: "kg",
    grama: "g",
    saco: "sc",
    frasco: "fr",
  };
  const trimmed = unidade.trim();
  if (UNIDADES_BASE.includes(trimmed as typeof UNIDADES_BASE[number])) return trimmed;
  return map[trimmed] ?? map[trimmed.toLowerCase()] ?? trimmed;
};

export const siglaUnidade = (unidade: string | null | undefined): string =>
  normalizarUnidade(unidade);

/** Rótulo para exibição: "Mililitro (ml)". */
export const rotuloUnidade = (unidade: string | null | undefined): string => {
  const sigla = normalizarUnidade(unidade);
  if (!sigla) return "";
  const opt = UNIDADES_OPCOES.find(u => u.sigla === sigla);
  if (!opt) return sigla;
  const nome = opt.legenda.charAt(0).toUpperCase() + opt.legenda.slice(1);
  return `${nome} (${opt.sigla})`;
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
