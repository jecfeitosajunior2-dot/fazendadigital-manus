export const SEMEN_ESTOQUE_PATH = "/reproducao/estoque-semen";

export function isValidSemenMovimentacaoId(id: unknown): id is number {
  return typeof id === "number" && Number.isFinite(id) && id > 0;
}

export function semenEntradaResumoPath(movimentacaoId: number): string {
  if (!isValidSemenMovimentacaoId(movimentacaoId)) {
    throw new Error("movimentacaoId inválido para rota de resumo");
  }
  return `${SEMEN_ESTOQUE_PATH}/entrada/${movimentacaoId}`;
}

export function parseSemenMovimentacaoIdFromRoute(raw: string | undefined): number | null {
  if (!raw || raw === "undefined" || raw === "null") return null;
  const n = Number(raw);
  return isValidSemenMovimentacaoId(n) ? n : null;
}

export function semenPartidaDetalhePath(partidaId: number): string {
  return `${SEMEN_ESTOQUE_PATH}/${partidaId}`;
}
