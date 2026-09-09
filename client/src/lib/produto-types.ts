export const CATEGORIAS_PRODUTO = [
  "Farmácia",
  "Nutricionais",
  "Combustíveis",
  "Lubrificantes",
  "Ferramentas",
  "Peças",
  "Agrícolas",
  "Epis",
  "Outros Insumos",
] as const;

export {
  CATEGORIAS_SALDO_OBRIGATORIO,
  CATEGORIAS_MANUTENCAO_ESTOQUE,
  categoriaControlaSaldoPorPadrao,
  categoriaExigeEstocavelManutencao,
  produtoControlaSaldo,
} from "@shared/estoqueControle";

export const SUBCATEGORIAS: Record<string, string[]> = {
  Farmácia: [
    "Outros materiais cirúrgicos",
    "Lubrificante mineral",
    "Hormônio",
    "Ectocida",
    "Vermífugo",
    "Vacina",
    "Antibiótico",
    "Anti-inflamatório",
    "Modificador orgânico",
    "Antiséptico",
    "Anestesia",
    "Agulha",
    "Seringa",
    "Vidraria",
    "Luvas",
    "Material cirúrgico",
    "Equipamentos diversos",
    "Vitamina",
    "Antitóxico",
    "Soro Hidratante",
    "Anti-Hemorrágico",
    "Antiparasitário",
    "Anti-Viral",
    "Outros medicamentos",
    "Analgésico",
    "Antibactericida",
    "Anticoagulante",
    "Anticoccidiano",
    "Antidiarreico",
    "Anti-helmíntico",
    "Antiinfeccioso",
    "Antimicrobiano",
    "Brinco Mosquicida",
    "Carrapaticida",
    "Diurético",
    "Endectocida",
    "Sedativo",
    "Selante",
    "Larvicida",
  ],
  Nutricionais: [
    "Volumoso",
    "Concentrado",
    "Ração confinamento",
    "Ração semiconfinamento",
    "Suplemento mineral cria",
    "Suplemento mineral recria/engorda",
    "Suplemento mineral com uréia",
    "Suplemento proteico",
    "Suplemento proteico-energético",
    "Suplemento energético",
    "Insumo energético",
    "Insumo proteico",
    "Sal branco",
    "Premix micromineral/vitamínico/Aditivo",
    "Núcleo mineral",
    "Aditivo",
    "Insumo mineral",
    "Pré-mistura",
  ],
  Combustíveis: [
    "Diesel",
    "Etanol",
    "Gasolina",
    "Aviação",
  ],
  Lubrificantes: [
    "Mineral",
    "Sintético",
    "Semissintético",
  ],
  Ferramentas: [
    "Chave Philips",
    "Chave inglesa",
    "Chave de fenda",
    "Alicate",
    "Chave de boca",
    "Martelo",
    "Marreta",
    "Parafusadeira",
    "Broca",
    "Moto-serra",
    "Cortador de grama",
    "Enxada",
    "Pá",
    "Furadeira",
    "Cavadeira",
    "Jardinagem",
    "Diversos",
    "Acessórios",
  ],
  Peças: [
    "Máquinas",
    "Veículos",
    "Aeronave",
    "Implementos agrícolas",
    "Motos",
    "Canoas",
    "Diversos",
  ],
  Agrícolas: [
    "Fungicida",
    "Inseticida",
    "Nematicida",
    "Inoculante",
    "Adjuvante",
    "Herbicida",
    "Sementes",
    "Fertilizantes Foliar",
    "Fertilizantes Mineral",
    "Diversos",
  ],
  Epis: [
    "Capacete",
    "Óculos",
    "Máscara",
    "Luva",
    "Protetor auricular",
    "Capa protetora",
    "Diversos",
  ],
  "Outros Insumos": [
    "Arame",
    "Lasca",
    "Porteira",
    "Cocho",
    "Brinco eletrônico",
    "Brinco visual",
    "Leitor de brinco",
    "Aplicador de brinco",
    "Graxa",
    "Removedor",
    "Diversos",
    "Esticador",
    "Palanque",
    "Dobradiça",
    "Brinco SISBOV",
    "Peças de curral",
  ],
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
    mL: "ml",
    ML: "ml",
    Ml: "ml",
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

/**
 * Quantidade + sigla da unidade (ex.: "700 L", "2 un").
 * Preferível em listagens — evita "700 Litro" / "2 Unidade".
 */
export function formatQtdComSigla(
  qtd: number,
  unidade: string | null | undefined,
  opts?: { fractionDigits?: number },
): string {
  const abs = Math.abs(qtd);
  const isWhole = abs % 1 === 0;
  const digits = opts?.fractionDigits;
  const formatted = abs.toLocaleString("pt-BR", {
    minimumFractionDigits: digits ?? (isWhole ? 0 : 2),
    maximumFractionDigits: digits ?? (isWhole ? 0 : 2),
  });
  const signed = qtd < 0 ? `-${formatted}` : formatted;
  const sigla = siglaUnidade(unidade);
  return sigla ? `${signed} ${sigla}` : signed;
}

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
  "Agener União",
  "Bayer",
  "Biogénesis Bagó",
  "Boehringer Ingelheim",
  "Ceva",
  "Elanco",
  "Hipra",
  "MSD Saúde Animal",
  "Ourofino",
  "Phibro",
  "Syntec",
  "Vallée",
  "Virbac",
  "Zoetis",
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
  const un = unidadeBase ? ` ${siglaUnidade(unidadeBase) || nomeUnidadeExibicao(unidadeBase)}` : "";
  const sinal = total < 0 ? "−" : "";
  return `${sinal}${fmt}${un}`.trim();
}

/**
 * Converte dose sanitária (valor + unidade) para quantidade na unidade base do estoque.
 * Reutiliza converterUnidade; se o estoque for contagem (un/fr/sc), tenta volume da embalagem.
 * Não aproxima quando a conversão não é segura.
 */
export function calcularQuantidadeEstoquePorDose(opts: {
  doseValor: number;
  doseUnidade: string;
  unidadeEstoque: string | null | undefined;
  embalagensRaw?: string | null;
}): { quantidade: number } | { erro: string } {
  if (!(opts.doseValor > 0) || !Number.isFinite(opts.doseValor)) {
    return { erro: "Informe um valor de dose válido maior que zero." };
  }
  const uDose = normalizarUnidade(opts.doseUnidade);
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  if (!uDose) return { erro: "Informe a unidade da dose." };
  if (!uEst) {
    return { erro: "Produto sem unidade de estoque cadastrada. Ajuste o cadastro do insumo." };
  }

  const erroUnidade = validarUnidadeDoseSanitariaParaProduto({
    doseValor: opts.doseValor,
    doseUnidade: opts.doseUnidade,
    unidadeEstoque: opts.unidadeEstoque,
    embalagensRaw: opts.embalagensRaw,
  });
  if (erroUnidade) return { erro: erroUnidade };

  const direto = converterUnidade(opts.doseValor, uDose, uEst);
  if (direto != null && Number.isFinite(direto) && direto > 0) {
    return { quantidade: direto };
  }

  const unidadesContagem = new Set(["un", "fr", "sc"]);
  if (unidadesContagem.has(uEst)) {
    const embalagens = parseEmbalagens(opts.embalagensRaw);
    for (const emb of embalagens) {
      if (emb.volume == null || !(emb.volume > 0) || !emb.unidade) continue;
      const doseNaUnEmb = converterUnidade(opts.doseValor, uDose, emb.unidade);
      if (doseNaUnEmb == null || !(doseNaUnEmb > 0)) continue;
      const qtd = doseNaUnEmb / emb.volume;
      if (Number.isFinite(qtd) && qtd > 0) return { quantidade: qtd };
    }
  }

  return {
    erro: mensagemErroConversaoDoseSanitaria({
      doseValor: opts.doseValor,
      doseUnidade: opts.doseUnidade,
      unidadeEstoque: opts.unidadeEstoque,
      embalagensRaw: opts.embalagensRaw,
    }),
  };
}

/** Unidades de volume/massa/UI sempre disponíveis no dropdown de dose sanitária. */
export const UNIDADES_DOSE_SANITARIO_UI_BASE = [
  "mL",
  "L",
  "g",
  "kg",
  "mg",
  "UI",
  "dose",
] as const;

/** Unidades de contagem (incluídas quando o estoque do produto é un/fr/sc). */
export const UNIDADES_DOSE_CONTAGEM_UI = ["un", "fr", "sc"] as const;

/** Todas as unidades possíveis no dropdown de dose sanitária. */
export const UNIDADES_DOSE_SANITARIO_UI = [
  ...UNIDADES_DOSE_SANITARIO_UI_BASE,
  ...UNIDADES_DOSE_CONTAGEM_UI,
] as const;

export type UnidadeDoseSanitariaUi = (typeof UNIDADES_DOSE_SANITARIO_UI)[number];

const SIGLA_PARA_UI_DOSE_SANITARIA: Record<string, UnidadeDoseSanitariaUi> = {
  ml: "mL",
  L: "L",
  g: "g",
  kg: "kg",
  mg: "mg",
  UI: "UI",
  dose: "dose",
  un: "un",
  fr: "fr",
  sc: "sc",
};

function siglaParaUiDoseSanitaria(sigla: string): UnidadeDoseSanitariaUi | null {
  const n = normalizarUnidade(sigla);
  return SIGLA_PARA_UI_DOSE_SANITARIA[n] ?? null;
}

/**
 * Sugere a unidade da dose conforme o cadastro do insumo.
 * Estoque conversível (mL, L, kg…) → mesma família; contagem (un/fr/sc) → volume da embalagem.
 */
export function sugerirUnidadeDoseSanitaria(opts: {
  unidadeEstoque: string | null | undefined;
  embalagensRaw?: string | null;
}): UnidadeDoseSanitariaUi | null {
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  if (!uEst) return null;

  const unidadesContagem = new Set(["un", "fr", "sc"]);
  if (!unidadesContagem.has(uEst)) {
    return siglaParaUiDoseSanitaria(uEst);
  }

  for (const emb of parseEmbalagens(opts.embalagensRaw)) {
    if (emb.volume == null || !(emb.volume > 0) || !emb.unidade) continue;
    const ui = siglaParaUiDoseSanitaria(emb.unidade);
    if (ui) return ui;
  }

  return siglaParaUiDoseSanitaria(uEst);
}

/** Todas as unidades disponíveis no select de dose sanitária (curral e manejo pontual). */
export function listarUnidadesDoseSanitariaUiParaProduto(_opts?: {
  unidadeEstoque?: string | null;
}): UnidadeDoseSanitariaUi[] {
  return [...UNIDADES_DOSE_SANITARIO_UI];
}

export const OPCOES_UNIDADE_DOSE_SANITARIO: { value: UnidadeDoseSanitariaUi; label: string }[] =
  UNIDADES_DOSE_SANITARIO_UI.map(v => ({
    value: v,
    label: siglaUnidade(v) || v,
  }));

export function listarOpcoesUnidadeDoseSanitaria(_opts?: {
  unidadeEstoque?: string | null;
}): { value: UnidadeDoseSanitariaUi; label: string }[] {
  return OPCOES_UNIDADE_DOSE_SANITARIO;
}

/** Estoque por contagem (un/fr/sc) sem embalagem com volume cadastrada. */
export function produtoEstoqueContagemSemEmbalagem(opts: {
  unidadeEstoque: string | null | undefined;
  embalagensRaw?: string | null;
}): boolean {
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  const unidadesContagem = new Set<string>(UNIDADES_DOSE_CONTAGEM_UI);
  if (!uEst || !unidadesContagem.has(uEst)) return false;
  return primeiraEmbalagemComVolume(opts.embalagensRaw) == null;
}

/**
 * A dose deve usar a unidade sugerida pelo cadastro (ex.: estoque mL → dose mL, não L).
 * Evita conversões “válidas” porém confusas no curral (2 L vs 2 mL).
 */
export function validarUnidadeDoseSanitariaParaProduto(opts: {
  doseValor?: number;
  doseUnidade: string;
  unidadeEstoque: string | null | undefined;
  embalagensRaw?: string | null;
}): string | null {
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  const uDose = normalizarUnidade(opts.doseUnidade);
  const unidadesContagem = new Set<string>(UNIDADES_DOSE_CONTAGEM_UI);
  if (unidadesContagem.has(uEst) && uDose === uEst) return null;

  const esperada = sugerirUnidadeDoseSanitaria({
    unidadeEstoque: opts.unidadeEstoque,
    embalagensRaw: opts.embalagensRaw,
  });
  if (!esperada) return null;
  const doseUi = siglaParaUiDoseSanitaria(uDose);
  if (doseUi === esperada) return null;
  return mensagemErroUnidadeDoseDesalinhada({ ...opts, unidadeEsperada: esperada });
}

function mensagemErroUnidadeDoseDesalinhada(
  opts: {
    doseValor?: number;
    doseUnidade: string;
    unidadeEstoque: string | null | undefined;
    embalagensRaw?: string | null;
  } & { unidadeEsperada: UnidadeDoseSanitariaUi },
): string {
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  const rotuloEst = siglaUnidade(uEst) || uEst;
  const rotuloDoseUi =
    siglaParaUiDoseSanitaria(normalizarUnidade(opts.doseUnidade)) ||
    siglaUnidade(opts.doseUnidade) ||
    opts.doseUnidade;
  const unidadesContagem = new Set(["un", "fr", "sc"]);

  if (unidadesContagem.has(uEst)) {
    const emb = primeiraEmbalagemComVolume(opts.embalagensRaw);
    if (emb) {
      const volLabel = rotuloVolumeEmbalagem(emb);
      const exemploNegativo =
        opts.doseValor != null && opts.doseValor > 0
          ? `, não ${String(opts.doseValor).replace(".", ",")} ${rotuloDoseUi}`
          : `, não em ${rotuloDoseUi}`;
      return (
        `Unidade incompatível: o estoque é por ${rotuloEst}, com embalagem de ${volLabel}.\n` +
        `Troque a dose para ${opts.unidadeEsperada} (ex.: ${volLabel}${exemploNegativo}) para registrar.`
      );
    }
  }

  return (
    `Dose em ${rotuloDoseUi} não combina com estoque em ${rotuloEst}.\n` +
    `Use ${opts.unidadeEsperada} na dose (mesma unidade do estoque).`
  );
}

function primeiraEmbalagemComVolume(
  embalagensRaw?: string | null,
): { volume: number; unidade: string } | null {
  for (const emb of parseEmbalagens(embalagensRaw)) {
    if (emb.volume != null && emb.volume > 0 && emb.unidade) {
      return { volume: emb.volume, unidade: emb.unidade };
    }
  }
  return null;
}

function rotuloVolumeEmbalagem(emb: { volume: number; unidade: string }): string {
  const ui = siglaParaUiDoseSanitaria(emb.unidade) || siglaUnidade(emb.unidade) || emb.unidade;
  const volFmt = emb.volume.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return `${volFmt} ${ui}`;
}

/**
 * Mensagem contextual quando dose e estoque não convertem (curral / manejo pontual).
 * Duas linhas: problema + ação — sem atalho que altere movimentação.
 */
export function mensagemErroConversaoDoseSanitaria(opts: {
  doseValor?: number;
  doseUnidade: string;
  unidadeEstoque: string | null | undefined;
  embalagensRaw?: string | null;
}): string {
  const uDose = normalizarUnidade(opts.doseUnidade);
  const uEst = normalizarUnidade(opts.unidadeEstoque);
  const rotuloEst = siglaUnidade(uEst) || uEst;
  const rotuloDoseUi = siglaParaUiDoseSanitaria(uDose) || siglaUnidade(uDose) || uDose;
  const unidadesContagem = new Set(["un", "fr", "sc"]);

  if (unidadesContagem.has(uEst)) {
    const emb = primeiraEmbalagemComVolume(opts.embalagensRaw);
    if (emb) {
      const volLabel = rotuloVolumeEmbalagem(emb);
      const unidadeSugerida =
        sugerirUnidadeDoseSanitaria({
          unidadeEstoque: uEst,
          embalagensRaw: opts.embalagensRaw,
        }) || siglaParaUiDoseSanitaria(emb.unidade) || "mL";
      const exemploNegativo =
        opts.doseValor != null && opts.doseValor > 0
          ? `, não ${String(opts.doseValor).replace(".", ",")} ${rotuloDoseUi}`
          : `, não em ${rotuloDoseUi}`;
      return (
        `Unidade incompatível: o estoque é por ${rotuloEst}, com embalagem de ${volLabel}.\n` +
        `Troque a dose para ${unidadeSugerida} (ex.: ${volLabel}${exemploNegativo}) para registrar.`
      );
    }
    return (
      `Dose em ${rotuloDoseUi} não combina com estoque em ${rotuloEst}.\n` +
      `Use ${rotuloEst} na dose (ex.: 1 ${rotuloEst}), ou cadastre a embalagem em Insumos → Farmácia para informar mL.`
    );
  }

  const unidadeSugerida = siglaParaUiDoseSanitaria(uEst) || rotuloEst;
  return (
    `Dose em ${rotuloDoseUi} não combina com estoque em ${rotuloEst}.\n` +
    `Use ${unidadeSugerida} na dose (mesma unidade do estoque).`
  );
}

/**
 * Custo de referência por 1 unidade da dose (ex.: R$/mL), a partir do custo médio do estoque.
 * Usa a mesma conversão segura de `calcularQuantidadeEstoquePorDose`.
 */
export function calcularCustoReferenciaPorUnidadeDose(opts: {
  custoMedioEstoque: number;
  unidadeEstoque: string | null | undefined;
  unidadeDose: string;
  embalagensRaw?: string | null;
}): { custoPorUnidadeDose: number; rotuloUnidadeDose: string } | { erro: string } {
  if (!(opts.custoMedioEstoque > 0)) {
    return { erro: "Produto sem custo médio cadastrado." };
  }
  const conv = calcularQuantidadeEstoquePorDose({
    doseValor: 1,
    doseUnidade: opts.unidadeDose,
    unidadeEstoque: opts.unidadeEstoque,
    embalagensRaw: opts.embalagensRaw,
  });
  if ("erro" in conv) return { erro: conv.erro };
  const custo = opts.custoMedioEstoque * conv.quantidade;
  if (!Number.isFinite(custo) || !(custo > 0)) {
    return { erro: "Não foi possível calcular o custo para esta unidade." };
  }
  return {
    custoPorUnidadeDose: Math.round(custo * 10000) / 10000,
    rotuloUnidadeDose: siglaUnidade(opts.unidadeDose) || opts.unidadeDose,
  };
}
