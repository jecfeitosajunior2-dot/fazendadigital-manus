export type SemenConsumoInvalidationInput = {
  partidaId: number;
};

export type SemenInvalidationTargetsAfterConsumo = {
  invalidateList: true;
  invalidateListDisponiveis: true;
  getByIdPartidaId: number;
};

/** Procedimentos tRPC que devem ser invalidados após SAIDA_IA. */
export function getSemenInvalidationTargetsAfterConsumo(
  input: SemenConsumoInvalidationInput,
): SemenInvalidationTargetsAfterConsumo | null {
  const partidaId = Number(input.partidaId);
  if (!Number.isInteger(partidaId) || partidaId <= 0) return null;
  return {
    invalidateList: true,
    invalidateListDisponiveis: true,
    getByIdPartidaId: partidaId,
  };
}

type SemenTrpcUtils = {
  semen: {
    list: { invalidate: () => Promise<void> };
    getById: { invalidate: (input: { id: number }) => Promise<void> };
    listDisponiveisParaInseminacao: { invalidate: () => Promise<void> };
  };
};

/** Invalida cache de estoque após consumo de dose (SAIDA_IA). */
export async function invalidateSemenQueriesAfterConsumo(
  utils: SemenTrpcUtils,
  input: SemenConsumoInvalidationInput,
): Promise<void> {
  const targets = getSemenInvalidationTargetsAfterConsumo(input);
  if (!targets) return;

  await Promise.all([
    utils.semen.list.invalidate(),
    utils.semen.listDisponiveisParaInseminacao.invalidate(),
    utils.semen.getById.invalidate({ id: targets.getByIdPartidaId }),
  ]);
}
