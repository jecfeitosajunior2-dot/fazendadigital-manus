import { paginateSemenEstoqueList } from "./semenEstoqueListPagination";
import { parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { calcularValorEstoqueSemen, somarValorEstoqueSemen } from "@shared/semenEstoqueValor";

export const SEMEN_ESTOQUE_TITULO = "Estoque de Sêmen";

export const SEMEN_ESTOQUE_EXPORT_HEADERS = [
  "Reprodutor",
  "Partida",
  "Central",
  "Saldo",
  "Custo por dose",
  "Valor em estoque",
  "Status",
] as const;

/** Custo por dose e Valor em estoque. */
export const SEMEN_ESTOQUE_EXPORT_CURRENCY_COLS = [4, 5];
export const SEMEN_ESTOQUE_EXPORT_INTEGER_COLS = [3];
export const SEMEN_ESTOQUE_EXPORT_COLUMN_ALIGNS = [
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
] as const;
export const SEMEN_ESTOQUE_PDF_COLUMN_ALIGNS = [
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
] as const;

/** Primeira célula do rodapé — o PDF destaca linhas que começam com este texto. */
export const SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL = "Valor total em estoque";

export type SemenEstoqueExportItem = {
  reprodutorDisplay: string;
  partida: string;
  centralOrigem: string | null;
  saldoDoses: number;
  custoUnitario: string | number | null;
  statusLabel: string;
  valorAtualEstoque?: number | null;
};

export function isSemenEstoqueExportTotaisRow(row: readonly (string | number)[]): boolean {
  return String(row[0] ?? "").trim() === SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL;
}

export function buildSemenEstoqueExportFooterRow(
  items: readonly SemenEstoqueExportItem[],
): (string | number)[] {
  return [
    SEMEN_ESTOQUE_EXPORT_TOTAIS_LABEL,
    "",
    "",
    "",
    "",
    somarValorEstoqueSemen(items),
    "",
  ];
}

function itemToExportRow(p: SemenEstoqueExportItem): (string | number)[] {
  return [
    p.reprodutorDisplay,
    p.partida,
    p.centralOrigem || "",
    p.saldoDoses,
    parseValorDecimalBanco(p.custoUnitario) ?? 0,
    p.valorAtualEstoque != null
      ? p.valorAtualEstoque
      : calcularValorEstoqueSemen(p.saldoDoses, p.custoUnitario),
    p.statusLabel,
  ];
}

/** Exporta o conjunto filtrado na ordem recebida — não pagina. */
export function buildSemenEstoqueExportRows(
  items: readonly SemenEstoqueExportItem[],
): (string | number)[][] {
  const rows = items.map(itemToExportRow);
  if (rows.length === 0) return rows;
  return [...rows, buildSemenEstoqueExportFooterRow(items)];
}

export function semenEstoqueExportFilenameBase(fazendaNome: string): string {
  const slug =
    (fazendaNome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "estoque";
  return `estoque-semen-${slug}`;
}

export function semenEstoqueExportDisabled(opts: {
  hasFazenda: boolean;
  loading: boolean;
  totalItems: number;
}): boolean {
  if (!opts.hasFazenda) return true;
  if (opts.loading) return true;
  return opts.totalItems <= 0;
}

export function semenEstoqueExportDisabledTitle(opts: {
  hasFazenda: boolean;
  totalItems: number;
}): string {
  if (!opts.hasFazenda) return "Selecione uma fazenda para exportar";
  if (opts.totalItems <= 0) return "Nenhum dado para exportar.";
  return "Exportar";
}

/** Garante que a exportação usa a lista completa, não a página atual. */
export function semenEstoqueExportIgnoresPagination<T>(
  filtered: readonly T[],
  page: number,
  pageSize: number,
): { exportCount: number; pageCount: number } {
  const { pageItems } = paginateSemenEstoqueList(filtered, page, pageSize);
  return { exportCount: filtered.length, pageCount: pageItems.length };
}
