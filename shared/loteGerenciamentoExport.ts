import {
  FAIXAS_IDADE_LOTE,
  FAIXA_IDADE_LOTE_LABELS,
  totalPorSexoFaixas,
  type ContagemPorFaixa,
} from "./lote-faixas-idade";
import type { ExportColumnAlign, GroupedTableHeader } from "./buildExportSpreadsheet";

export type LoteGerenciamentoExportInput = {
  nome: string;
  machos: ContagemPorFaixa;
  femeas: ContagemPorFaixa;
  machosSemIdade?: number;
  femeasSemIdade?: number;
};

export type LoteGerenciamentoPdfHeadCell =
  | string
  | { content: string; colSpan?: number; rowSpan?: number };

/** Colunas: Nome + 5 machos + 5 fêmeas + Total */
export const LOTE_GERENCIAMENTO_COL_COUNT = 1 + FAIXAS_IDADE_LOTE.length * 2 + 1;

export const LOTE_GERENCIAMENTO_FLAT_HEADERS = [
  "Nome do Lote",
  ...FAIXAS_IDADE_LOTE.map(f => `M ${FAIXA_IDADE_LOTE_LABELS[f]}`),
  ...FAIXAS_IDADE_LOTE.map(f => `F ${FAIXA_IDADE_LOTE_LABELS[f]}`),
  "Total",
] as const;

export const LOTE_GERENCIAMENTO_INTEGER_COLS = Array.from(
  { length: LOTE_GERENCIAMENTO_COL_COUNT - 1 },
  (_, i) => i + 1,
);

export const LOTE_GERENCIAMENTO_COLUMN_ALIGNS: ExportColumnAlign[] = [
  "center",
  ...Array.from({ length: LOTE_GERENCIAMENTO_COL_COUNT - 1 }, () => "center" as const),
];

export function formatLoteNomeExport(lote: LoteGerenciamentoExportInput): string {
  const sem = (lote.machosSemIdade ?? 0) + (lote.femeasSemIdade ?? 0);
  if (sem <= 0) return lote.nome;
  return `${lote.nome} (sem data nasc.: ${sem})`;
}

function faixaExportValue(value: number): number | "" {
  return value > 0 ? value : "";
}

export function buildLoteGerenciamentoExportRows(
  lotes: LoteGerenciamentoExportInput[],
): (string | number)[][] {
  return lotes.map(lote => {
    const totalMachos = totalPorSexoFaixas(lote.machos, lote.machosSemIdade ?? 0);
    const totalFemeas = totalPorSexoFaixas(lote.femeas, lote.femeasSemIdade ?? 0);
    const totalGeral = totalMachos + totalFemeas;
    return [
      formatLoteNomeExport(lote),
      ...FAIXAS_IDADE_LOTE.map(f => faixaExportValue(lote.machos[f] ?? 0)),
      ...FAIXAS_IDADE_LOTE.map(f => faixaExportValue(lote.femeas[f] ?? 0)),
      totalGeral > 0 ? totalGeral : "",
    ];
  });
}

export function loteGerenciamentoPdfHeadRows(): LoteGerenciamentoPdfHeadCell[][] {
  return [
    [
      { content: "Nome do Lote", rowSpan: 2 },
      { content: "Machos", colSpan: FAIXAS_IDADE_LOTE.length },
      { content: "Fêmeas", colSpan: FAIXAS_IDADE_LOTE.length },
      { content: "Total", rowSpan: 2 },
    ],
    [
      ...FAIXAS_IDADE_LOTE.map(f => FAIXA_IDADE_LOTE_LABELS[f]),
      ...FAIXAS_IDADE_LOTE.map(f => FAIXA_IDADE_LOTE_LABELS[f]),
    ],
  ];
}

export function loteGerenciamentoGroupedTableHeader(): GroupedTableHeader {
  return {
    topRow: [
      { text: "Nome do Lote", rowSpan: 2 },
      { text: "Machos", colSpan: FAIXAS_IDADE_LOTE.length },
      { text: "Fêmeas", colSpan: FAIXAS_IDADE_LOTE.length },
      { text: "Total", rowSpan: 2 },
    ],
    bottomRow: [
      ...FAIXAS_IDADE_LOTE.map(f => FAIXA_IDADE_LOTE_LABELS[f]),
      ...FAIXAS_IDADE_LOTE.map(f => FAIXA_IDADE_LOTE_LABELS[f]),
    ],
  };
}
