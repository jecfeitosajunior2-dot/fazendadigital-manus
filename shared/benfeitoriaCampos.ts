/**
 * Campos alinhados entre lista, cadastro, importação e exportação de benfeitorias.
 */

export const BENFEITORIA_TABELA_COLUNAS = [
  { key: "nome", label: "Nome", align: "left" as const },
  { key: "tipo", label: "Tipo", align: "left" as const },
  { key: "anoConstrucao", label: "Ano de Construção", align: "center" as const },
  { key: "vidaUtil", label: "Vida Útil", align: "center" as const },
  { key: "estado", label: "Estado", align: "center" as const },
  { key: "valor", label: "Valor", align: "center" as const },
] as const;

/** Colunas do relatório PDF — mesmas da lista na tela (sem Ações). */
export const BENFEITORIA_RELATORIO_COLUNAS = [...BENFEITORIA_TABELA_COLUNAS] as const;

export const BENFEITORIA_PDF_HEADERS = BENFEITORIA_RELATORIO_COLUNAS.map(c => c.label);
export const BENFEITORIA_PDF_COLUMN_ALIGNS = BENFEITORIA_RELATORIO_COLUNAS.map(() => "center" as const);
export const BENFEITORIA_PDF_VALOR_COL_INDEX = BENFEITORIA_RELATORIO_COLUNAS.findIndex(c => c.key === "valor");

/** Colunas da planilha Excel (valor alinhado à direita). */
export const BENFEITORIA_LISTAGEM_COLUNAS = [
  { key: "nome", label: "Nome", align: "left" as const },
  { key: "tipo", label: "Tipo", align: "left" as const },
  { key: "anoConstrucao", label: "Ano de Construção", align: "center" as const },
  { key: "vidaUtil", label: "Vida Útil", align: "center" as const },
  { key: "estado", label: "Estado", align: "center" as const },
  { key: "valor", label: "Valor", align: "right" as const },
];

export const BENFEITORIA_EXPORT_COLUMN_ALIGNS = BENFEITORIA_LISTAGEM_COLUNAS.map(() => "center" as const);

export const BENFEITORIA_EXPORT_ANO_COL_INDEX = BENFEITORIA_LISTAGEM_COLUNAS.findIndex(
  c => c.key === "anoConstrucao",
);
export const BENFEITORIA_EXPORT_VIDA_UTIL_COL_INDEX = BENFEITORIA_LISTAGEM_COLUNAS.findIndex(
  c => c.key === "vidaUtil",
);
export const BENFEITORIA_EXPORT_INTEGER_COL_INDEXES = [
  BENFEITORIA_EXPORT_ANO_COL_INDEX,
  BENFEITORIA_EXPORT_VIDA_UTIL_COL_INDEX,
];

/** Formato Excel: "1 ano" ou "N anos" (valor numérico preservado). */
export const BENFEITORIA_EXPORT_VIDA_UTIL_NUM_FMT = '[=1]0 " ano";0 " anos"';

export const BENFEITORIA_EXPORT_COLUMN_NUM_FMTS: Partial<Record<number, string>> = {
  [BENFEITORIA_EXPORT_VIDA_UTIL_COL_INDEX]: BENFEITORIA_EXPORT_VIDA_UTIL_NUM_FMT,
};

export type BenfeitoriaExportRowInput = {
  nome: string;
  tipo?: string | null;
  anoConstrucao?: number | null;
  vidaUtil?: string | null;
  estado?: string | null;
  valorEstimado?: string | number | null;
  observacoes?: string | null;
};

function formatVidaUtilAnosLabel(anos: number): string {
  return anos === 1 ? "1 ano" : `${anos} anos`;
}

function formatVidaUtilExport(vidaUtil: string | null | undefined): string | number {
  if (!vidaUtil?.trim()) return "";
  const raw = vidaUtil.trim();
  if (/ano/i.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return raw;
}

/** Formatação exibida na lista e no relatório PDF. */
export function formatVidaUtilListagem(vidaUtil: string | null | undefined): string {
  if (!vidaUtil?.trim()) return "—";
  const raw = vidaUtil.trim();
  if (/ano/i.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return formatVidaUtilAnosLabel(parseInt(raw, 10));
  return raw;
}

/** Formatação exibida na lista e no relatório PDF. */
export function formatValorListagem(
  valorEstimado: string | number | null | undefined,
  parseValor: (val: string | number | null | undefined) => number | null,
): string {
  const n = parseValor(valorEstimado);
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function celulaRelatorio(val: string | null | undefined): string {
  return val?.trim() ? val.trim() : "—";
}

/** Linha do relatório PDF — mesma apresentação da lista na tela. */
export function montarLinhaPdfBenfeitoria(
  row: BenfeitoriaExportRowInput,
  parseValor: (val: string | number | null | undefined) => number | null,
): string[] {
  return [
    row.nome,
    celulaRelatorio(row.tipo),
    row.anoConstrucao != null ? String(row.anoConstrucao) : "—",
    formatVidaUtilListagem(row.vidaUtil),
    celulaRelatorio(row.estado),
    formatValorListagem(row.valorEstimado, parseValor),
  ];
}

/** Ordem igual à lista visível na tela. */
export function montarLinhaExportacaoBenfeitoria(
  row: BenfeitoriaExportRowInput,
  parseValor: (val: string | number | null | undefined) => number | null,
): (string | number)[] {
  return [
    row.nome,
    row.tipo ?? "",
    row.anoConstrucao != null ? row.anoConstrucao : "",
    formatVidaUtilExport(row.vidaUtil),
    row.estado ?? "",
    parseValor(row.valorEstimado) ?? "",
  ];
}
