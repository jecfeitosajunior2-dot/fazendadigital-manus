import type { estoque, produtosCatalogo } from "../drizzle/schema";

export type EstoqueEmbalagemInput = {
  nome: string;
  volume?: number;
  unidade?: string;
};

/** Configuração operacional por fazenda (estoque próprio). */
export type EstoqueFazendaConfig = {
  fazendaId: number;
  produzidoNaFazenda?: boolean;
  monitorarEstoque?: boolean;
  quantidadeMinima?: string | null;
  quantidadeMaxima?: string | null;
};

export type EstoqueMutationInput = {
  fazendaId?: number;
  /** Fazendas para vincular estoque ao criar/atualizar o catálogo. */
  fazendaIds?: number[];
  /** Configuração por fazenda (produzido, monitorar, min/max). */
  estoquesConfig?: EstoqueFazendaConfig[];
  produtoId?: number;
  nome: string;
  categoria: string;
  subcategoria: string;
  unidade: string;
  /** Legado global — preferir estoquesConfig. */
  quantidadeMinima?: string;
  quantidadeMaxima?: string;
  fabricante?: string;
  identificadorUnico?: string;
  /** Legado: valor global. Preferir estoquesConfig. */
  produzidoNaFazenda?: boolean;
  /** Legado: valor global. Preferir estoquesConfig. */
  monitorarEstoque?: boolean;
  situacao?: "ativo" | "inativo";
  embalagens?: EstoqueEmbalagemInput[];
  possuiCarencia?: boolean;
  carenciaAbateDias?: number | null;
  carenciaAbateUnidade?: "d" | "h" | null;
  carenciaLeiteDias?: number | null;
  observacoesCarencia?: string | null;
  quantidade?: string;
  valorUnitario?: string;
  localizacao?: string;
  observacoes?: string;
};

export type EstoqueVinculadoDTO = {
  fazendaId: number;
  estoqueId: number;
  produzidoNaFazenda: boolean;
  monitorarEstoque: boolean;
  quantidadeMinima: string | null;
  quantidadeMaxima: string | null;
  quantidade: string | null;
};

export function chaveCatalogoProduto(input: {
  nome?: string | null;
  unidade?: string | null;
  categoria?: string | null;
}): string {
  return [
    (input.nome ?? "").trim().toLowerCase(),
    (input.unidade ?? "").trim().toLowerCase(),
    (input.categoria ?? "").trim().toLowerCase(),
  ].join("|");
}

function asFazendaId(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolverFazendaIds(input: EstoqueMutationInput): number[] {
  const ids = new Set<number>();
  for (const cfg of input.estoquesConfig ?? []) {
    const id = asFazendaId(cfg.fazendaId);
    if (id) ids.add(id);
  }
  for (const raw of input.fazendaIds ?? []) {
    const id = asFazendaId(raw);
    if (id) ids.add(id);
  }
  const single = asFazendaId(input.fazendaId);
  if (single) ids.add(single);
  return [...ids];
}

export function configParaFazenda(
  input: EstoqueMutationInput,
  fazendaId: number,
  fallback?: Partial<EstoqueFazendaConfig>,
): Required<
  Pick<
    EstoqueFazendaConfig,
    "fazendaId" | "produzidoNaFazenda" | "monitorarEstoque"
  >
> & {
  quantidadeMinima: string | null;
  quantidadeMaxima: string | null;
} {
    const cfg = (input.estoquesConfig ?? []).find(c => Number(c.fazendaId) === fazendaId);
  const monitorar =
    cfg?.monitorarEstoque ??
    fallback?.monitorarEstoque ??
    input.monitorarEstoque ??
    false;
  const produzido =
    cfg?.produzidoNaFazenda ??
    fallback?.produzidoNaFazenda ??
    input.produzidoNaFazenda ??
    false;

  let quantidadeMinima: string | null = null;
  let quantidadeMaxima: string | null = null;
  if (monitorar) {
    quantidadeMinima =
      cfg?.quantidadeMinima ??
      fallback?.quantidadeMinima ??
      input.quantidadeMinima ??
      "0";
    quantidadeMaxima =
      cfg?.quantidadeMaxima ??
      fallback?.quantidadeMaxima ??
      input.quantidadeMaxima ??
      null;
    if (quantidadeMinima === "") quantidadeMinima = "0";
    if (quantidadeMaxima === "") quantidadeMaxima = null;
  }

  return {
    fazendaId,
    produzidoNaFazenda: !!produzido,
    monitorarEstoque: !!monitorar,
    quantidadeMinima,
    quantidadeMaxima,
  };
}

/** @deprecated use configParaFazenda */
export function produzidoNaFazendaPara(
  input: EstoqueMutationInput,
  fazendaId: number,
  fallback = false,
): boolean {
  return configParaFazenda(input, fazendaId, { produzidoNaFazenda: fallback }).produzidoNaFazenda;
}

export function toCatalogoInsertValues(
  input: EstoqueMutationInput,
): typeof produtosCatalogo.$inferInsert {
  const possuiCarencia = input.possuiCarencia ?? false;
  // Campos operacionais no catálogo são legado; preferir config por fazenda no estoque.
  const monitorarAlguma =
    (input.estoquesConfig ?? []).some(c => c.monitorarEstoque) || !!input.monitorarEstoque;
  return {
    nome: input.nome.trim(),
    categoria: input.categoria || null,
    subcategoria: input.subcategoria?.trim() || null,
    unidade: input.unidade || null,
    fabricante: input.fabricante || null,
    identificadorUnico: input.identificadorUnico?.trim() || null,
    produzidoNaFazenda: false,
    monitorarEstoque: monitorarAlguma,
    situacao: input.situacao ?? "ativo",
    embalagens: input.embalagens?.length ? JSON.stringify(input.embalagens) : null,
    possuiCarencia,
    carenciaAbateDias: possuiCarencia ? (input.carenciaAbateDias ?? null) : null,
    carenciaAbateUnidade: possuiCarencia ? (input.carenciaAbateUnidade ?? "d") : null,
    carenciaLeiteDias: input.carenciaLeiteDias ?? null,
    observacoesCarencia: input.observacoesCarencia ?? null,
    observacoes: input.observacoes ?? null,
  };
}

/** Normaliza payload de create/update para colunas válidas da tabela estoque. */
export function toEstoqueInsertValues(
  input: EstoqueMutationInput,
): typeof estoque.$inferInsert {
  const possuiCarencia = input.possuiCarencia ?? false;
  const catalogo = toCatalogoInsertValues(input);
  const farmCfg =
    input.fazendaId != null
      ? configParaFazenda(input, input.fazendaId)
      : {
          produzidoNaFazenda: input.produzidoNaFazenda ?? false,
          monitorarEstoque: input.monitorarEstoque ?? false,
          quantidadeMinima: input.quantidadeMinima ?? "0",
          quantidadeMaxima: input.quantidadeMaxima ?? null,
        };

  return {
    produtoId: input.produtoId ?? null,
    fazendaId: input.fazendaId ?? null,
    nome: catalogo.nome,
    categoria: catalogo.categoria,
    subcategoria: catalogo.subcategoria,
    unidade: catalogo.unidade,
    quantidade: input.quantidade ?? "0",
    quantidadeMinima: farmCfg.monitorarEstoque ? (farmCfg.quantidadeMinima ?? "0") : "0",
    quantidadeMaxima: farmCfg.monitorarEstoque ? farmCfg.quantidadeMaxima : null,
    fabricante: catalogo.fabricante,
    identificadorUnico: catalogo.identificadorUnico,
    produzidoNaFazenda: farmCfg.produzidoNaFazenda,
    monitorarEstoque: farmCfg.monitorarEstoque,
    situacao: catalogo.situacao,
    embalagens: catalogo.embalagens,
    possuiCarencia: catalogo.possuiCarencia,
    carenciaAbateDias: catalogo.carenciaAbateDias,
    carenciaAbateUnidade: catalogo.carenciaAbateUnidade,
    carenciaLeiteDias: catalogo.carenciaLeiteDias,
    observacoesCarencia: catalogo.observacoesCarencia,
    valorUnitario: input.valorUnitario ?? null,
    localizacao: input.localizacao ?? null,
    observacoes: catalogo.observacoes,
  };
}

/** Campos de ficha sincronizados do catálogo para os estoques vinculados.
 *  Não inclui produzidoNaFazenda, monitorarEstoque, min/max nem situacao —
 *  situacao operacional é por fazenda; situacao do catálogo fica em produtos_catalogo. */
export function toEstoqueSyncFromCatalogo(
  catalogo: typeof produtosCatalogo.$inferSelect | typeof produtosCatalogo.$inferInsert,
): Partial<typeof estoque.$inferInsert> {
  return {
    nome: catalogo.nome,
    categoria: catalogo.categoria ?? null,
    subcategoria: catalogo.subcategoria ?? null,
    unidade: catalogo.unidade ?? null,
    fabricante: catalogo.fabricante ?? null,
    identificadorUnico: catalogo.identificadorUnico ?? null,
    embalagens: catalogo.embalagens ?? null,
    possuiCarencia: catalogo.possuiCarencia ?? false,
    carenciaAbateDias: catalogo.carenciaAbateDias ?? null,
    carenciaAbateUnidade: catalogo.carenciaAbateUnidade ?? "d",
    carenciaLeiteDias: catalogo.carenciaLeiteDias ?? null,
    observacoesCarencia: catalogo.observacoesCarencia ?? null,
    observacoes: catalogo.observacoes ?? null,
  };
}
