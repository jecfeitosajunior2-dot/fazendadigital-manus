export type SemenConsumoInvalidationInput = {
  partidaId: number;
};

export type SemenInvalidationTargetsAfterConsumo = {
  invalidateList: true;
  invalidateListDisponiveis: true;
  invalidateListReprodutoresExternos: true;
  invalidateListUtilizado: true;
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
    invalidateListReprodutoresExternos: true,
    invalidateListUtilizado: true,
    getByIdPartidaId: partidaId,
  };
}

type SemenTrpcUtils = {
  semen: {
    list: { invalidate: () => Promise<void> };
    getById: { invalidate: (input: { id: number }) => Promise<void> };
    listDisponiveisParaInseminacao: { invalidate: () => Promise<void> };
    listReprodutoresExternosDisponiveis: { invalidate: () => Promise<void> };
    listCatalogoExternos?: { invalidate: () => Promise<void> };
    getEntradaResumo?: { invalidate: () => Promise<void> };
    listUtilizado?: { invalidate: () => Promise<void> };
    getUtilizado?: { invalidate: () => Promise<void> };
  };
};

export async function invalidateSemenUtilizadoQueries(utils: SemenTrpcUtils): Promise<void> {
  await Promise.all([
    utils.semen.listUtilizado?.invalidate() ?? Promise.resolve(),
    utils.semen.getUtilizado?.invalidate() ?? Promise.resolve(),
    utils.semen.listCatalogoExternos?.invalidate() ?? Promise.resolve(),
  ]);
}

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
    utils.semen.listReprodutoresExternosDisponiveis.invalidate(),
    utils.semen.getById.invalidate({ id: targets.getByIdPartidaId }),
    invalidateSemenUtilizadoQueries(utils),
  ]);
}

/** Invalida listagem, detalhe, IA e resumo após correção auditável de entrada. */
export async function invalidateSemenQueriesAfterCorrecao(
  utils: SemenTrpcUtils,
  input: SemenConsumoInvalidationInput,
): Promise<void> {
  await invalidateSemenQueriesAfterConsumo(utils, input);
  if (utils.semen.getEntradaResumo) {
    await utils.semen.getEntradaResumo.invalidate();
  }
}

/** Invalida as mesmas fontes após ajuste prospectivo de estoque/custo. */
export async function invalidateSemenQueriesAfterAjuste(
  utils: SemenTrpcUtils,
  input: SemenConsumoInvalidationInput,
): Promise<void> {
  await invalidateSemenQueriesAfterCorrecao(utils, input);
}
