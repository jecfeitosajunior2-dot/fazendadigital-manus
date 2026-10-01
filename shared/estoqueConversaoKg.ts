/**
 * Resolvedor central: unidade de estoque + embalagem → kg.
 * Nutrição pergunta aqui. Não interpreta JSON de embalagem por conta própria.
 * Não cria segundo saldo. Não converte massa ↔ volume.
 */

export type MotivoConversaoKg = "indisponivel" | "ambigua" | "invalida" | "dimensao";

export type EmbalagemConversao = {
  nome?: string;
  volume?: number;
  unidade?: string;
};

export type ResolucaoConversaoKgOk = {
  ok: true;
  kgPorUnidadeEstoque: number;
  unidadeEstoque: string;
  conteudoPorUnidade: number;
  unidadeConteudo: string;
};

export type ResolucaoConversaoKgErro = {
  ok: false;
  motivo: MotivoConversaoKg;
};

export type ResolucaoConversaoKg = ResolucaoConversaoKgOk | ResolucaoConversaoKgErro;

export type SnapshotConversaoKg = {
  unidadeEstoqueSnapshot: string;
  conteudoPorUnidadeSnapshot: number;
  unidadeConteudoSnapshot: string;
  quantidadeFisicaSnapshot: number;
  unidadeFisicaSnapshot: "kg";
};

const ALIAS_UNIDADE: Record<string, string> = {
  kg: "kg",
  quilograma: "kg",
  g: "g",
  grama: "g",
  l: "L",
  litro: "L",
  ml: "ml",
  mililitro: "ml",
  sc: "sc",
  saco: "sc",
  un: "un",
  unidade: "un",
  fr: "fr",
  frasco: "fr",
  dose: "dose",
};

const FAMILIA: Record<string, "massa" | "volume" | "contagem"> = {
  kg: "massa",
  g: "massa",
  L: "volume",
  ml: "volume",
  sc: "contagem",
  un: "contagem",
  fr: "contagem",
  dose: "contagem",
};

const KG_POR_MASSA: Record<string, number> = {
  kg: 1,
  g: 0.001,
};

/** Casas do ledger de estoque (decimal 12,2). Não arredonda saco para inteiro. */
export function arredondarQuantidadeEstoque(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function arredondarKgConversao(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

export function normalizarUnidadeConversao(unidade: string | null | undefined): string {
  const raw = String(unidade ?? "").trim();
  if (!raw) return "";
  if (raw in ALIAS_UNIDADE) return ALIAS_UNIDADE[raw]!;
  const lower = raw.toLowerCase();
  if (lower in ALIAS_UNIDADE) return ALIAS_UNIDADE[lower]!;
  return raw;
}

function familiaUnidade(unidade: string): "massa" | "volume" | "contagem" | null {
  return FAMILIA[unidade] ?? null;
}

function kgPorUnidadeMassa(unidadeMassa: string, quantidade: number): number | null {
  const fator = KG_POR_MASSA[unidadeMassa];
  if (fator == null) return null;
  return quantidade * fator;
}

/** Aceita JSON string, array persistido ou lista já parseada. */
export function parseEmbalagensConversao(raw: unknown): EmbalagemConversao[] {
  if (raw == null || raw === "") return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(item => {
    if (typeof item === "string") {
      const extraido = extrairConteudoEmbalagem(item);
      return { nome: item, volume: extraido.volume, unidade: extraido.unidade };
    }
    if (item && typeof item === "object") {
      const o = item as EmbalagemConversao;
      const unidade = o.unidade ? normalizarUnidadeConversao(o.unidade) : undefined;
      const volume = o.volume != null ? Number(o.volume) : undefined;
      const nome = o.nome != null ? String(o.nome) : "";
      if ((volume == null || !Number.isFinite(volume) || !unidade) && nome) {
        const extraido = extrairConteudoEmbalagem(nome);
        return {
          nome,
          volume: volume != null && Number.isFinite(volume) ? volume : extraido.volume,
          unidade: unidade || extraido.unidade,
        };
      }
      return { nome, volume: Number.isFinite(volume) ? volume : undefined, unidade };
    }
    return { nome: String(item) };
  });
}

function extrairConteudoEmbalagem(texto: string): { volume?: number; unidade?: string } {
  const m = texto.trim().match(/(\d+(?:[.,]\d+)?)\s*(ml|mL|l|L|kg|g)\b/i);
  if (!m) return {};
  const volume = parseFloat(m[1]!.replace(",", "."));
  let unidade = m[2]!.toLowerCase();
  if (unidade === "l") unidade = "L";
  return {
    volume: Number.isNaN(volume) ? undefined : volume,
    unidade: normalizarUnidadeConversao(unidade),
  };
}

function erro(motivo: MotivoConversaoKg): ResolucaoConversaoKgErro {
  return { ok: false, motivo };
}

/**
 * Quantos kg existem em 1 unidade de estoque.
 * sc sem embalagem de massa inequívoca → não converte.
 */
export function resolverConversaoParaKg(
  unidadeEstoque: string | null | undefined,
  embalagens?: unknown,
): ResolucaoConversaoKg {
  const unidade = normalizarUnidadeConversao(unidadeEstoque);
  if (!unidade) return erro("indisponivel");

  const familia = familiaUnidade(unidade);
  if (familia === "massa") {
    const kg = KG_POR_MASSA[unidade];
    if (kg == null) return erro("indisponivel");
    return {
      ok: true,
      kgPorUnidadeEstoque: kg,
      unidadeEstoque: unidade,
      conteudoPorUnidade: 1,
      unidadeConteudo: unidade,
    };
  }

  if (familia === "volume") {
    return erro("dimensao");
  }

  const lista = parseEmbalagensConversao(embalagens);
  if (!lista.length) return erro("indisponivel");

  const massas: Array<{ kgPorUnidade: number; conteudo: number; unidadeConteudo: string }> = [];
  let viuVolume = false;
  let viuSemQuantidade = false;
  let viuQuantidadeZero = false;

  for (const emb of lista) {
    const unEmb = normalizarUnidadeConversao(emb.unidade);
    if (!unEmb) {
      viuSemQuantidade = true;
      continue;
    }
    const famEmb = familiaUnidade(unEmb);
    if (famEmb === "volume") {
      viuVolume = true;
      continue;
    }
    if (famEmb !== "massa") continue;
    if (emb.volume == null || !Number.isFinite(Number(emb.volume))) {
      viuSemQuantidade = true;
      continue;
    }
    const qtd = Number(emb.volume);
    if (qtd === 0) {
      viuQuantidadeZero = true;
      continue;
    }
    if (!(qtd > 0)) {
      viuQuantidadeZero = true;
      continue;
    }
    const kg = kgPorUnidadeMassa(unEmb, qtd);
    if (kg == null) continue;
    massas.push({
      kgPorUnidade: arredondarKgConversao(kg),
      conteudo: qtd,
      unidadeConteudo: unEmb,
    });
  }

  const unicas = new Map<string, (typeof massas)[number]>();
  for (const item of massas) {
    unicas.set(item.kgPorUnidade.toFixed(6), item);
  }

  if (unicas.size > 1) return erro("ambigua");
  if (unicas.size === 1) {
    const unica = [...unicas.values()][0]!;
    return {
      ok: true,
      kgPorUnidadeEstoque: unica.kgPorUnidade,
      unidadeEstoque: unidade,
      conteudoPorUnidade: unica.conteudo,
      unidadeConteudo: unica.unidadeConteudo,
    };
  }

  if (viuQuantidadeZero) return erro("invalida");
  if (viuVolume && !massas.length) return erro("dimensao");
  if (viuSemQuantidade) return erro("indisponivel");
  return erro("indisponivel");
}

export function quantidadeEstoqueParaKg(
  quantidadeEstoque: number,
  unidadeEstoque: string | null | undefined,
  embalagens?: unknown,
): number | null {
  if (!Number.isFinite(quantidadeEstoque)) return null;
  const resolucao = resolverConversaoParaKg(unidadeEstoque, embalagens);
  if (!resolucao.ok) return null;
  return arredondarKgConversao(quantidadeEstoque * resolucao.kgPorUnidadeEstoque);
}

export function kgParaQuantidadeEstoque(
  quantidadeKg: number,
  unidadeEstoque: string | null | undefined,
  embalagens?: unknown,
): number | null {
  if (!Number.isFinite(quantidadeKg)) return null;
  const resolucao = resolverConversaoParaKg(unidadeEstoque, embalagens);
  if (!resolucao.ok) return null;
  if (!(resolucao.kgPorUnidadeEstoque > 0)) return null;
  const raw = quantidadeKg / resolucao.kgPorUnidadeEstoque;
  const familia = familiaUnidade(resolucao.unidadeEstoque);
  if (familia === "massa") return arredondarKgConversao(raw);
  return arredondarQuantidadeEstoque(raw);
}

export function custoEstoqueParaCustoKg(
  custoMedioUnidadeEstoque: string | number | null | undefined,
  unidadeEstoque: string | null | undefined,
  embalagens?: unknown,
): number | null {
  if (custoMedioUnidadeEstoque == null || custoMedioUnidadeEstoque === "") return null;
  const valor =
    typeof custoMedioUnidadeEstoque === "number"
      ? custoMedioUnidadeEstoque
      : Number(String(custoMedioUnidadeEstoque).replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const resolucao = resolverConversaoParaKg(unidadeEstoque, embalagens);
  if (!resolucao.ok || !(resolucao.kgPorUnidadeEstoque > 0)) return null;
  return valor / resolucao.kgPorUnidadeEstoque;
}

export function montarSnapshotConversaoKg(params: {
  quantidadeEstoque: number;
  unidadeEstoque: string | null | undefined;
  embalagens?: unknown;
}): SnapshotConversaoKg | null {
  const resolucao = resolverConversaoParaKg(params.unidadeEstoque, params.embalagens);
  if (!resolucao.ok) return null;
  const qtdEstoque = params.quantidadeEstoque;
  const qtdKg = arredondarKgConversao(qtdEstoque * resolucao.kgPorUnidadeEstoque);
  return {
    unidadeEstoqueSnapshot: resolucao.unidadeEstoque,
    conteudoPorUnidadeSnapshot: resolucao.conteudoPorUnidade,
    unidadeConteudoSnapshot: resolucao.unidadeConteudo,
    quantidadeFisicaSnapshot: qtdKg,
    unidadeFisicaSnapshot: "kg",
  };
}

/** Estorno usa o snapshot gravado — nunca a embalagem atual do produto. */
export function quantidadeEstoqueDoSnapshot(quantidadeMovimento: string | number): number {
  return Math.abs(Number(quantidadeMovimento));
}

export const MSG_CONVERSAO_KG_INDISPONIVEL =
  "Só é possível usar este produto na Nutrição em kg ou g, ou em saco com uma única embalagem de massa (ex.: 30 kg/sc). Cadastre o conteúdo da embalagem em Insumos.";

export const MSG_CONVERSAO_KG_AMBIGUA =
  "Este produto tem mais de uma embalagem de massa. Deixe apenas uma (ex.: saco de 30 kg) em Insumos — o sistema não escolhe sozinho.";

export const MSG_CONVERSAO_KG_DIMENSAO =
  "Não é possível converter litro ou mililitro para kg sem densidade. Cadastre o conteúdo em kg ou g, ou use um produto em quilograma.";

export const MSG_CONVERSAO_KG_INVALIDA =
  "A quantidade por embalagem precisa ser maior que zero para converter saco em kg.";

export function mensagemConversaoKg(resolucao: ResolucaoConversaoKg | MotivoConversaoKg): string {
  const motivo = typeof resolucao === "string" ? resolucao : resolucao.ok ? null : resolucao.motivo;
  if (motivo === "ambigua") return MSG_CONVERSAO_KG_AMBIGUA;
  if (motivo === "dimensao") return MSG_CONVERSAO_KG_DIMENSAO;
  if (motivo === "invalida") return MSG_CONVERSAO_KG_INVALIDA;
  return MSG_CONVERSAO_KG_INDISPONIVEL;
}

export function conversaoDisponivelParaKg(
  unidadeEstoque: string | null | undefined,
  embalagens?: unknown,
): boolean {
  return resolverConversaoParaKg(unidadeEstoque, embalagens).ok;
}
