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

/** Nome da unidade como no iRancho (ex.: Quilograma). */
export const nomeUnidadeExibicao = (unidade: string | null | undefined): string => {
  const sigla = normalizarUnidade(unidade);
  if (!sigla) return "";
  const opt = UNIDADES_OPCOES.find(u => u.sigla === sigla);
  if (!opt) return sigla;
  return opt.legenda.charAt(0).toUpperCase() + opt.legenda.slice(1);
};

export const formatQuantidadeMov = (valor: string | number): string => {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
  if (Number.isNaN(n)) return String(valor);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatDataBr = (data: string | Date | null | undefined): string => {
  if (!data) return "";
  const d = typeof data === "string" ? new Date(data.includes("T") ? data : `${data}T12:00:00`) : data;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR");
};

/** Formato YYYY-MM-DD para inputs type="date". */
export const toDateInput = (val: string | Date | null | undefined): string => {
  if (!val) return "";
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    const d = new Date(val.includes("T") ? val : `${val}T12:00:00`);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return val.toISOString().slice(0, 10);
};

export type ObsMovimentacao = {
  modo: ModoQuantidadeMov;
  sinal?: "entrada" | "saida";
  unidades?: string;
  porUnidade?: string;
  unidade?: string;
  total?: number;
};

export function parseObsMovimentacao(obs: string | null | undefined): ObsMovimentacao | null {
  if (!obs) return null;
  try {
    const p = JSON.parse(obs) as ObsMovimentacao;
    if (p?.modo === "unidades" || p?.modo === "direto") return p;
  } catch {
    /* legado sem JSON */
  }
  return null;
}

/** Tipos de movimentação (iRancho) com o sinal que aplicam ao estoque. */
export const TIPOS_MOVIMENTACAO: { value: string; sinal: "entrada" | "saida" }[] = [
  { value: "Compra", sinal: "entrada" },
  { value: "Produção própria", sinal: "entrada" },
  { value: "Ajuste de entrada", sinal: "entrada" },
  { value: "Consumo interno", sinal: "saida" },
  { value: "Venda", sinal: "saida" },
  { value: "Transferência", sinal: "saida" },
  { value: "Perda/Descarte", sinal: "saida" },
  { value: "Ajuste de saída", sinal: "saida" },
];

export const sinalDoTipo = (tipo: string | null | undefined): "entrada" | "saida" => {
  const t = TIPOS_MOVIMENTACAO.find(x => x.value === tipo);
  return t?.sinal ?? "entrada";
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

export type EmbalagemProduto = {
  nome: string;
  volume?: number;
  unidade?: string;
};

/** Converte embalagens salvas (string[] legado ou EmbalagemProduto[]). */
export function parseEmbalagens(raw: string | null | undefined): EmbalagemProduto[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => {
      if (typeof item === "string") {
        const vol = extrairVolumeEmbalagem(item);
        return { nome: item, volume: vol.volume, unidade: vol.unidade };
      }
      if (item && typeof item === "object" && "nome" in item) {
        const o = item as EmbalagemProduto;
        return {
          nome: String(o.nome),
          volume: o.volume != null ? Number(o.volume) : undefined,
          unidade: o.unidade ? normalizarUnidade(o.unidade) : undefined,
        };
      }
      return { nome: String(item) };
    });
  } catch {
    return [];
  }
}

/** Tenta ler volume da descrição, ex.: "Frasco 500ml" → 500 ml. */
export function extrairVolumeEmbalagem(texto: string): { volume?: number; unidade?: string } {
  const m = texto.trim().match(/(\d+(?:[.,]\d+)?)\s*(ml|mL|l|L|kg|g|un)\b/i);
  if (!m) return {};
  const volume = parseFloat(m[1].replace(",", "."));
  let unidade = m[2].toLowerCase();
  if (unidade === "l") unidade = "L";
  if (unidade === "ml") unidade = "ml";
  return { volume: Number.isNaN(volume) ? undefined : volume, unidade: normalizarUnidade(unidade) };
}

export function serializarEmbalagens(lista: EmbalagemProduto[]): string {
  return JSON.stringify(lista);
}

/**
 * Fator de cada unidade em relação à unidade canônica da sua família.
 * volume: litro (L) = 1 · massa: quilograma (kg) = 1.
 * Unidades de contagem (un, sc, fr, dose) não se convertem entre si.
 */
const FATOR_UNIDADE: Record<string, { fator: number; familia: string }> = {
  L: { fator: 1, familia: "volume" },
  ml: { fator: 0.001, familia: "volume" },
  kg: { fator: 1, familia: "massa" },
  g: { fator: 0.001, familia: "massa" },
  un: { fator: 1, familia: "un" },
  sc: { fator: 1, familia: "sc" },
  fr: { fator: 1, familia: "fr" },
  dose: { fator: 1, familia: "dose" },
};

/** Duas unidades pertencem à mesma família (são conversíveis entre si)? */
export function unidadesCompativeis(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const ua = normalizarUnidade(a);
  const ub = normalizarUnidade(b);
  if (!ua || !ub) return true;
  if (ua === ub) return true;
  const fa = FATOR_UNIDADE[ua];
  const fb = FATOR_UNIDADE[ub];
  if (!fa || !fb) return false;
  return fa.familia === fb.familia;
}

/**
 * Converte uma quantidade da unidade de lançamento para a unidade base.
 * Retorna `null` quando as unidades são incompatíveis (famílias diferentes).
 */
export function converterUnidade(
  quantidade: number,
  de: string | null | undefined,
  para: string | null | undefined
): number | null {
  const ude = normalizarUnidade(de);
  const upara = normalizarUnidade(para);
  if (!ude || !upara || ude === upara) return quantidade;
  const fde = FATOR_UNIDADE[ude];
  const fpara = FATOR_UNIDADE[upara];
  if (!fde || !fpara || fde.familia !== fpara.familia) return null;
  return (quantidade * fde.fator) / fpara.fator;
}

export type ModoQuantidadeMov = "direto" | "unidades";

/** Calcula quantidade final na unidade base do produto. */
export function calcularQuantidadeMovimentacao(opts: {
  modo: ModoQuantidadeMov;
  sinal: "entrada" | "saida";
  quantidadeDireta?: string;
  quantidadeUnidades?: string;
  quantidadePorUnidade?: string;
  unidadeLancamento?: string;
  unidadeBaseProduto?: string;
}): { total: number; erro?: string } {
  const mult = opts.sinal === "saida" ? -1 : 1;

  if (opts.modo === "direto") {
    const n = parseFloat(String(opts.quantidadeDireta ?? "").replace(",", "."));
    if (Number.isNaN(n) || n === 0) return { total: 0, erro: "Informe a quantidade." };
    return { total: n * mult };
  }

  const un = parseFloat(String(opts.quantidadeUnidades ?? "").replace(",", "."));
  const por = parseFloat(String(opts.quantidadePorUnidade ?? "").replace(",", "."));
  if (Number.isNaN(un) || un === 0) return { total: 0, erro: "Informe a quantidade de unidades." };
  if (Number.isNaN(por) || por === 0) return { total: 0, erro: "Informe a quantidade por unidade." };

  const unidadeLanc = normalizarUnidade(opts.unidadeLancamento);
  const unidadeBase = normalizarUnidade(opts.unidadeBaseProduto);
  if (unidadeLanc && unidadeBase && unidadeLanc !== unidadeBase) {
    return {
      total: 0,
      erro: `A unidade do lançamento (${rotuloUnidade(unidadeLanc)}) deve ser igual à unidade base do produto (${rotuloUnidade(unidadeBase)}).`,
    };
  }

  return { total: un * por * mult };
}

export function formatTotalMovimentacao(total: number, unidadeBase?: string): string {
  const abs = Math.abs(total);
  const fmt = abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const un = unidadeBase ? ` ${nomeUnidadeExibicao(unidadeBase)}` : "";
  const sinal = total < 0 ? "−" : "";
  return `${sinal}${fmt}${un}`.trim();
}
