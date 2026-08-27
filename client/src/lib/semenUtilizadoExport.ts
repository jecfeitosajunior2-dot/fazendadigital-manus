import {
  calcularCustosSemenUtilizado,
  calcularSemenUtilizadoTotalGeral,
  formatSemenUtilizadoMatrizLabel,
  somarCustoTotalSemenUtilizado,
  sortSemenUtilizadoGruposExport,
  sortSemenUtilizadoUsosExport,
  type SemenUtilizadoGrupo,
  type SemenUtilizadoUso,
} from "@shared/semenUtilizado";
import type { ExportSpreadsheetRowMeta } from "@shared/buildExportSpreadsheet";

export const SEMEN_UTILIZADO_EXPORT_HEADERS = [
  "Reprodutor",
  "Partida",
  "Central",
  "Doses utilizadas",
  "Matrizes",
  "Custo médio",
  "Custo total",
  "Último uso",
] as const;

export const SEMEN_UTILIZADO_EXPORT_CURRENCY_COLS = [5, 6];
export const SEMEN_UTILIZADO_EXPORT_INTEGER_COLS = [3, 4];
export const SEMEN_UTILIZADO_EXPORT_COLUMN_ALIGNS = [
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
] as const;

/** PDF da listagem: centro em todas as colunas. Não reutilizar o alinhamento do Excel. */
export const SEMEN_UTILIZADO_PDF_COLUMN_ALIGNS = [
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
  "center",
] as const;

/** Primeira célula do rodapé — o PDF destaca linhas que começam com "Totais". */
export const SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL = "Totais";

export const SEMEN_UTILIZADO_DETALHE_EXPORT_HEADERS = [
  "Data",
  "Matriz",
  "Inseminador",
  "Custo da dose",
  "Resultado",
] as const;

export const SEMEN_UTILIZADO_DETALHE_EXPORT_CURRENCY_COLS = [3];
export const SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_ALIGNS = [
  "center",
  "center",
  "center",
  "center",
  "center",
] as const;
export const SEMEN_UTILIZADO_DETALHE_EXPORT_COLUMN_WIDTHS = [14, 16, 18, 16, 16];
export const SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL = "TOTAL GERAL";

function isoToBr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dashIfEmpty(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  return t || "—";
}

function custoCelula(custo: number | null | undefined): string | number {
  if (custo == null || !(custo > 0)) return "—";
  return custo;
}

export function isSemenUtilizadoDetalheTotalGeralRow(row: readonly (string | number)[]): boolean {
  return String(row[0] ?? "").trim().toUpperCase() === SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL;
}

export function buildSemenUtilizadoDetalheTotalGeralRow(
  usos: readonly SemenUtilizadoUso[],
): (string | number)[] {
  const total = calcularSemenUtilizadoTotalGeral(usos);
  return [
    SEMEN_UTILIZADO_DETALHE_TOTAL_GERAL_LABEL,
    "",
    "",
    custoCelula(total.custoTotal),
    "",
  ];
}

function usoToDetalheRow(u: SemenUtilizadoUso): (string | number)[] {
  return [
    isoToBr(u.dataIso),
    formatSemenUtilizadoMatrizLabel(u.matrizBrinco),
    dashIfEmpty(u.inseminador),
    custoCelula(u.custoDose),
    dashIfEmpty(u.resultado),
  ];
}

export function isSemenUtilizadoExportTotaisRow(row: readonly (string | number)[]): boolean {
  return /^totais\b/i.test(String(row[0] ?? "").trim());
}

export function buildSemenUtilizadoExportFooterRow(
  grupos: readonly SemenUtilizadoGrupo[],
): (string | number)[] {
  return [
    SEMEN_UTILIZADO_EXPORT_TOTAIS_LABEL,
    "",
    "",
    "",
    "",
    "",
    custoCelula(somarCustoTotalSemenUtilizado(grupos)),
    "",
  ];
}

/** Exporta a listagem consolidada de utilização — nunca saldo/estoque. */
export function buildSemenUtilizadoExportRows(
  grupos: readonly SemenUtilizadoGrupo[],
): (string | number)[][] {
  const rows = sortSemenUtilizadoGruposExport(grupos).map(g => [
    g.reprodutorDisplay,
    g.partida,
    dashIfEmpty(g.central),
    g.dosesUtilizadas,
    g.matrizes,
    custoCelula(g.custoMedioUso),
    custoCelula(g.custoTotalUtilizado),
    isoToBr(g.ultimoUso),
  ]);
  if (rows.length === 0) return rows;
  return [...rows, buildSemenUtilizadoExportFooterRow(grupos)];
}

/** Linhas de dados (uma por IA), sem faixa de dia. */
export function buildSemenUtilizadoDetalheExportRows(
  usos: readonly SemenUtilizadoUso[],
): (string | number)[][] {
  return sortSemenUtilizadoUsosExport(usos).map(usoToDetalheRow);
}

function appendDiaExcel(
  rows: (string | number)[][],
  rowMeta: ExportSpreadsheetRowMeta[],
  iso: string,
  dayUsos: SemenUtilizadoUso[],
) {
  const custos = calcularCustosSemenUtilizado(dayUsos.map(u => u.custoDose));
  rows.push([isoToBr(iso), "", "Custo total", custoCelula(custos.custoTotal), ""]);
  rowMeta.push({ section: true });
  for (const uso of dayUsos) {
    rows.push(usoToDetalheRow(uso));
    rowMeta.push({});
  }
}

/** Excel: faixa visual por dia + uma linha por IA. Sem mesclar células de dados. */
export function buildSemenUtilizadoDetalheExcelRows(usos: readonly SemenUtilizadoUso[]): {
  rows: (string | number)[][];
  rowMeta: ExportSpreadsheetRowMeta[];
} {
  const ordered = sortSemenUtilizadoUsosExport(usos);
  const rows: (string | number)[][] = [];
  const rowMeta: ExportSpreadsheetRowMeta[] = [];
  let dayIso = "";
  let dayUsos: SemenUtilizadoUso[] = [];
  for (const uso of ordered) {
    if (dayUsos.length > 0 && uso.dataIso !== dayIso) {
      appendDiaExcel(rows, rowMeta, dayIso, dayUsos);
      dayUsos = [];
    }
    dayIso = uso.dataIso;
    dayUsos.push(uso);
  }
  if (dayUsos.length > 0) {
    appendDiaExcel(rows, rowMeta, dayIso, dayUsos);
  }
  if (ordered.length > 0) {
    rows.push(buildSemenUtilizadoDetalheTotalGeralRow(usos));
    rowMeta.push({ section: true });
  }
  return { rows, rowMeta };
}

export function buildSemenUtilizadoDetalheExportTitle(params: {
  fazendaNome: string;
  reprodutor: string;
  partida: string;
}): string {
  const fazenda = String(params.fazendaNome ?? "").trim() || "Fazenda";
  const reprodutor = String(params.reprodutor ?? "").trim() || "Reprodutor";
  const partida = String(params.partida ?? "").trim() || "Partida";
  return `${fazenda} — Histórico de utilizações de sêmen — ${reprodutor} — ${partida}`;
}

/** Identificação humana do reprodutor e da partida (lote), sem IDs técnicos. */
export function buildSemenUtilizadoDetalheExportIdentificacao(params: {
  reprodutor: string;
  partida: string;
}): string {
  const reprodutor = String(params.reprodutor ?? "").trim() || "Não informado";
  const partida = String(params.partida ?? "").trim() || "—";
  return `Reprodutor: ${reprodutor} · Partida: ${partida}`;
}

function sanitizeExportFilenamePart(raw: string): string {
  return (
    String(raw ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "item"
  );
}

export function semenUtilizadoExportFilenameBase(fazendaNome: string): string {
  const slug =
    (fazendaNome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fazenda";
  return `semen-utilizado-${slug}`;
}

export function semenUtilizadoDetalheExportFilenameBase(
  fazendaNome: string,
  reprodutor: string,
  partida: string,
): string {
  const fazenda = sanitizeExportFilenamePart(fazendaNome || "Fazenda");
  const repro = sanitizeExportFilenamePart(reprodutor || "reprodutor");
  const part = sanitizeExportFilenamePart(partida || "partida");
  return `${fazenda}_Historico_Utilizacoes_Semen_${repro}_${part}`;
}

export function semenUtilizadoExportDisabled(opts: {
  hasFazenda: boolean;
  loading: boolean;
  totalItems: number;
}): boolean {
  if (!opts.hasFazenda) return true;
  if (opts.loading) return true;
  return opts.totalItems <= 0;
}

export function semenUtilizadoExportDisabledTitle(opts: {
  hasFazenda: boolean;
  totalItems: number;
}): string {
  if (!opts.hasFazenda) return "Selecione uma fazenda para exportar";
  if (opts.totalItems <= 0) return "Nenhum dado para exportar.";
  return "Exportar";
}

export function semenUtilizadoEmptyMessage(opts: {
  hasFazenda: boolean;
  loading: boolean;
  totalItems: number;
  hasActiveFilters: boolean;
}): string {
  if (!opts.hasFazenda) return "Selecione uma fazenda para ver o sêmen utilizado.";
  if (opts.loading) return "Carregando...";
  if (opts.totalItems > 0) return "";
  if (opts.hasActiveFilters) return "Nenhuma utilização encontrada no filtro.";
  return "Nenhuma inseminação registrada nesta fazenda.";
}
