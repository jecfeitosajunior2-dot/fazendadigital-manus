import { describe, expect, it, vi } from "vitest";
import {
  getSemenInvalidationTargetsAfterConsumo,
  invalidateSemenQueriesAfterConsumo,
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
      getByIdPartidaId: 2,
    });
  });
});

describe("invalidateSemenQueriesAfterConsumo", () => {
  it("dispara invalidação de list, getById e listDisponiveis", async () => {
    const listInvalidate = vi.fn(async () => undefined);
    const getByIdInvalidate = vi.fn(async () => undefined);
    const listDisponiveisInvalidate = vi.fn(async () => undefined);

    await invalidateSemenQueriesAfterConsumo(
      {
        semen: {
          list: { invalidate: listInvalidate },
          getById: { invalidate: getByIdInvalidate },
          listDisponiveisParaInseminacao: { invalidate: listDisponiveisInvalidate },
        },
      },
      { partidaId: 2 },
    );

    expect(listInvalidate).toHaveBeenCalledTimes(1);
    expect(listDisponiveisInvalidate).toHaveBeenCalledTimes(1);
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
        },
      },
      { partidaId: 0 },
    );
    expect(listInvalidate).not.toHaveBeenCalled();
  });
});
