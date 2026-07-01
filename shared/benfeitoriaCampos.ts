/**
 * Campos alinhados entre lista, cadastro, importação e exportação de benfeitorias.
 */

export const BENFEITORIA_LISTAGEM_COLUNAS = [
  { key: "nome", label: "Nome", align: "left" as const },
  { key: "anoConstrucao", label: "Ano de Construção", align: "center" as const },
  { key: "vidaUtil", label: "Vida Útil", align: "center" as const },
  { key: "valor", label: "Valor", align: "right" as const },
];

export type BenfeitoriaExportRowInput = {
  nome: string;
  anoConstrucao?: number | null;
  vidaUtil?: string | null;
  valorEstimado?: string | number | null;
  observacoes?: string | null;
};

/** Ordem igual à lista visível: Nome, Ano de Construção, Vida Útil, Valor */
export function montarLinhaExportacaoBenfeitoria(
  row: BenfeitoriaExportRowInput,
  parseValor: (val: string | number | null | undefined) => number | null,
): (string | number)[] {
  return [
    row.nome,
    row.anoConstrucao ?? "",
    row.vidaUtil ?? "",
    parseValor(row.valorEstimado) ?? "",
  ];
}
