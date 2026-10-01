/** Entrada inicial em lote: origem = Sem lote (loteOrigemId nulo). */

export function loteIdEfetivoParaHistorico(loteId?: number | null): number | null {
  return loteId != null && Number(loteId) > 0 ? Number(loteId) : null;
}

export function buildEntradaInicialLoteMovimentacao(input: {
  userId: number;
  animalId: number;
  loteDestinoId: number;
  dataMovimentacao: string;
  usuarioNome: string;
  pastoOrigemId?: number | null;
  pastoDestinoId?: number | null;
  fazendaId?: number | null;
  observacoes?: string | null;
}) {
  return {
    userId: input.userId,
    animalId: input.animalId,
    loteOrigemId: null as number | null,
    loteDestinoId: input.loteDestinoId,
    pastoOrigemId: input.pastoOrigemId ?? null,
    pastoDestinoId: input.pastoDestinoId ?? null,
    fazendaId: input.fazendaId ?? null,
    dataMovimentacao: input.dataMovimentacao,
    usuarioNome: input.usuarioNome,
    observacoes: input.observacoes ?? null,
  };
}
