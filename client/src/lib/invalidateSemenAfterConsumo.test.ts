import { describe, expect, it, vi } from "vitest";
import {
  getSemenInvalidationTargetsAfterConsumo,
  invalidateSemenQueriesAfterConsumo,
  invalidateSemenQueriesAfterAjuste,
  invalidateSemenQueriesAfterCorrecao,
} from "./invalidateSemenAfterConsumo";

describe("getSemenInvalidationTargetsAfterConsumo", () => {
  it("retorna null para partidaId inválido", () => {
    expect(getSemenInvalidationTargetsAfterConsumo({ partidaId: 0 })).toBeNull();
    expect(getSemenInvalidationTargetsAfterConsumo({ partidaId: -1 })).toBeNull();
    expect(getSemenInvalidationTargetsAfterConsumo({ partidaId: NaN })).toBeNull();
  });

  it("retorna targets para partida válida", () => {
    const targets = getSemenInvalidationTargetsAfterConsumo({ partidaId: 2 });
    expect(targets).toEqual({
      invalidateList: true,
      invalidateListDisponiveis: true,
      invalidateListReprodutoresExternos: true,
      invalidateListUtilizado: true,
      getByIdPartidaId: 2,
    });
  });
});

describe("invalidateSemenQueriesAfterConsumo", () => {
  it("dispara invalidação de list, getById e listDisponiveis", async () => {
    const listInvalidate = vi.fn(async () => undefined);
    const getByIdInvalidate = vi.fn(async () => undefined);
    const listDisponiveisInvalidate = vi.fn(async () => undefined);
    const listExternosInvalidate = vi.fn(async () => undefined);

    await invalidateSemenQueriesAfterConsumo(
      {
        semen: {
          list: { invalidate: listInvalidate },
          getById: { invalidate: getByIdInvalidate },
          listDisponiveisParaInseminacao: { invalidate: listDisponiveisInvalidate },
          listReprodutoresExternosDisponiveis: { invalidate: listExternosInvalidate },
        },
      },
      { partidaId: 2 },
    );

    expect(listInvalidate).toHaveBeenCalledTimes(1);
    expect(listDisponiveisInvalidate).toHaveBeenCalledTimes(1);
    expect(listExternosInvalidate).toHaveBeenCalledTimes(1);
    expect(getByIdInvalidate).toHaveBeenCalledWith({ id: 2 });
  });

  it("não invalida quando partidaId é inválido", async () => {
    const listInvalidate = vi.fn(async () => undefined);
    await invalidateSemenQueriesAfterConsumo(
      {
        semen: {
          list: { invalidate: listInvalidate },
          getById: { invalidate: vi.fn(async () => undefined) },
          listDisponiveisParaInseminacao: { invalidate: vi.fn(async () => undefined) },
          listReprodutoresExternosDisponiveis: { invalidate: vi.fn(async () => undefined) },
        },
      },
      { partidaId: 0 },
    );
    expect(listInvalidate).not.toHaveBeenCalled();
  });
});

describe("invalidateSemenQueriesAfterCorrecao", () => {
  it("invalida listagem, detalhe, IA e resumo", async () => {
    const listInvalidate = vi.fn(async () => undefined);
    const getByIdInvalidate = vi.fn(async () => undefined);
    const listDisponiveisInvalidate = vi.fn(async () => undefined);
    const listExternosInvalidate = vi.fn(async () => undefined);
    const getEntradaResumoInvalidate = vi.fn(async () => undefined);

    await invalidateSemenQueriesAfterCorrecao(
      {
        semen: {
          list: { invalidate: listInvalidate },
          getById: { invalidate: getByIdInvalidate },
          listDisponiveisParaInseminacao: { invalidate: listDisponiveisInvalidate },
          listReprodutoresExternosDisponiveis: { invalidate: listExternosInvalidate },
          getEntradaResumo: { invalidate: getEntradaResumoInvalidate },
        },
      },
      { partidaId: 4 },
    );

    expect(listInvalidate).toHaveBeenCalledTimes(1);
    expect(getByIdInvalidate).toHaveBeenCalledWith({ id: 4 });
    expect(listDisponiveisInvalidate).toHaveBeenCalledTimes(1);
    expect(listExternosInvalidate).toHaveBeenCalledTimes(1);
    expect(getEntradaResumoInvalidate).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateSemenQueriesAfterAjuste", () => {
  it("invalida as mesmas fontes da correção após ajuste prospectivo", async () => {
    const listInvalidate = vi.fn(async () => undefined);
    const getByIdInvalidate = vi.fn(async () => undefined);
    const listDisponiveisInvalidate = vi.fn(async () => undefined);
    const listExternosInvalidate = vi.fn(async () => undefined);
    const getEntradaResumoInvalidate = vi.fn(async () => undefined);

    await invalidateSemenQueriesAfterAjuste(
      {
        semen: {
          list: { invalidate: listInvalidate },
          getById: { invalidate: getByIdInvalidate },
          listDisponiveisParaInseminacao: { invalidate: listDisponiveisInvalidate },
          listReprodutoresExternosDisponiveis: { invalidate: listExternosInvalidate },
          getEntradaResumo: { invalidate: getEntradaResumoInvalidate },
        },
      },
      { partidaId: 1 },
    );

    expect(listInvalidate).toHaveBeenCalledTimes(1);
    expect(getByIdInvalidate).toHaveBeenCalledWith({ id: 1 });
    expect(listDisponiveisInvalidate).toHaveBeenCalledTimes(1);
    expect(listExternosInvalidate).toHaveBeenCalledTimes(1);
    expect(getEntradaResumoInvalidate).toHaveBeenCalledTimes(1);
  });
});
