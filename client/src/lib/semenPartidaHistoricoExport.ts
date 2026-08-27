import { formatDateBR } from "./date-utils";
import { parseValorDecimalBanco } from "@shared/parseMoedaBr";
import { calcularValorAtualEstoqueSemen } from "@shared/semenEstoqueValor";
import type { SemenLedgerMovimento } from "@shared/semenEstoqueLedger";
import {
  formatSemenMovimentacaoQuantidadeLabel,
  formatSemenMovimentacaoTipoLabel,
  shouldShowSemenMovimentacaoCustoTotal,
} from "@shared/semenMovimentacaoDisplay";
import { isSemenMovimentacaoAjusteEstoque } from "@shared/semenEstoqueAjuste";

export const SEMEN_PARTIDA_HISTORICO_EXPORT_HEADERS = [
  "Data",
  "Tipo",
  "Quantidade",
  "Custo por dose",
  "Custo total",
  "Situação",
  "Data da correção",
  "Motivo da correção",
  "Contexto",
] as const;

/** Custo por dose e Custo total. */
export const SEMEN_PARTIDA_HISTORICO_EXPORT_CURRENCY_COLS = [3, 4];
export const SEMEN_PARTIDA_HISTORICO_EXPORT_TEXT_COLS = [0, 1, 2, 5, 6, 7, 8];

export type SemenPartidaHistoricoExportRow = {
  tipo: string;
  tipoLabel?: string;
  quantidadeDoses?: number;
  quantidadeLabel?: string;
  dataEntrada?: string;
  custoTotal?: string | number | null;
  custoUnitario?: string | number | null;
  contextoDisplay?: string | null;
  jaCorrigida?: boolean;
  dataCorrecaoIso?: string | null;
  motivoCorrecaoExport?: string | null;
  movimentacaoOrigemId?: number | null;
  observacoes?: string | null;
};

export type SemenPartidaHistoricoExportCabecalho = {
  partida: string;
  saldoDoses: number;
  custoUnitario: string | number | null;
};

export const SEMEN_PARTIDA_HISTORICO_EXPORT_COLUMN_WIDTHS = [
  12, 22, 14, 16, 14, 14, 16, 28, 28,
];

function custoExcel(val: string | number | null | undefined): number | "" {
  const n = parseValorDecimalBanco(val);
  return n == null ? "" : n;
}

function textoOuTraco(val: string | null | undefined): string {
  const t = String(val ?? "").trim();
  return t || "—";
}

function dosesLabel(saldo: number): string {
  const n = Math.max(0, Math.trunc(Number(saldo) || 0));
  return n === 1 ? "1 dose" : `${n} doses`;
}

/** Título no mesmo formato da Lista de Produtos: Fazenda — relatório — partida. */
export function buildSemenPartidaHistoricoExportTitle(opts: {
  fazendaNome?: string | null;
  partida: string;
}): string {
  const partida = opts.partida?.trim() || "partida";
  const fazenda = opts.fazendaNome?.trim();
  if (fazenda) return `${fazenda} — Histórico de sêmen — ${partida}`;
  return `Histórico de sêmen — ${partida}`;
}

/** Exporta a visão simplificada já ordenada — não relê o ledger. */
export function buildSemenPartidaHistoricoExportRows(
  visuais: readonly SemenPartidaHistoricoExportRow[],
): (string | number)[][] {
  return visuais.map(row => {
    const tipo =
      String(row.tipoLabel ?? "").trim() ||
      formatSemenMovimentacaoTipoLabel(row.tipo, row.movimentacaoOrigemId);
    const quantidade =
      String(row.quantidadeLabel ?? "").trim() ||
      formatSemenMovimentacaoQuantidadeLabel(Number(row.quantidadeDoses) || 0, row.tipo, row.observacoes);
    const isAjuste = isSemenMovimentacaoAjusteEstoque(row.tipo);
    const corrigida = !isAjuste && Boolean(
      row.jaCorrigida || row.dataCorrecaoIso || row.motivoCorrecaoExport,
    );
    return [
      formatDateBR(row.dataEntrada),
      tipo,
      quantidade,
      custoExcel(row.custoUnitario),
      isAjuste || shouldShowSemenMovimentacaoCustoTotal(row.tipo) ? custoExcel(row.custoTotal) : "",
      corrigida ? "Corrigida" : "—",
      row.dataCorrecaoIso ? formatDateBR(row.dataCorrecaoIso) : "—",
      textoOuTraco(row.motivoCorrecaoExport),
      textoOuTraco(row.contextoDisplay),
    ];
  });
}

/** Rodapé no mesmo espírito do "Valor total" da Lista de Produtos. */
export function buildSemenPartidaHistoricoExportFooterRow(
  partida: SemenPartidaHistoricoExportCabecalho,
  movimentacoes: readonly SemenLedgerMovimento[],
): (string | number)[] {
  return [
    "Valor atual em estoque",
    "",
    dosesLabel(partida.saldoDoses),
    custoExcel(partida.custoUnitario),
    calcularValorAtualEstoqueSemen(movimentacoes),
    "",
    "",
    "",
    "",
  ];
}

export function appendSemenPartidaHistoricoExportFooter(
  rows: (string | number)[][],
  partida: SemenPartidaHistoricoExportCabecalho,
  movimentacoes: readonly SemenLedgerMovimento[],
): (string | number)[][] {
  if (rows.length === 0) return rows;
  return [...rows, buildSemenPartidaHistoricoExportFooterRow(partida, movimentacoes)];
}

export function semenPartidaHistoricoExportFilenameBase(partida: string): string {
  const slug =
    (partida || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "partida";
  return `historico-semen-${slug}`;
}

export function semenPartidaHistoricoExportDisabled(opts: {
  loading: boolean;
  totalItems: number;
}): boolean {
  if (opts.loading) return true;
  return opts.totalItems <= 0;
}

export function semenPartidaHistoricoExportDisabledTitle(opts: { totalItems: number }): string {
  if (opts.totalItems <= 0) return "Nenhuma movimentação para exportar.";
  return "Exportar";
}
