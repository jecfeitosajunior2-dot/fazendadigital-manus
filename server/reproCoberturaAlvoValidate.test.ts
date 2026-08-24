import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS,
  MSG_REPRO_LOTE_INELEGIVEL,
  MSG_REPRO_MATRIZ_INELEGIVEL,
} from "../shared/reproCoberturaAlvo";

const USER_ID = 1;
const FAZENDA_ID = 1;
const LOTE_NOVILHOS_ID = 4;

type FixtureAnimal = {
  id: number;
  sexo: "macho" | "femea";
  brinco?: string | null;
  nome?: string | null;
  categoria?: string | null;
  dataNascimento?: string | null;
  status?: string | null;
  fazendaId?: number | null;
  loteId?: number | null;
};

const { animais, lotes, dbUnavailableError, createRejectingQuery } = vi.hoisted(() => {
  const dbUnavailableError = Object.assign(new Error("connect ECONNREFUSED"), {
    code: "ECONNREFUSED",
  });

  function createThenableReject() {
    const rejected = Promise.reject(dbUnavailableError);
    return Object.assign(rejected, {
      limit: () => rejected,
    });
  }

  function createRejectingQuery() {
    const chain = {
      from: () => chain,
      where: () => createThenableReject(),
      limit: () => Promise.reject(dbUnavailableError),
    };
    return chain;
  }

  const animais: Record<number, FixtureAnimal> = {
    1: {
      id: 1,
      sexo: "femea",
      brinco: "12",
      categoria: "Vaca",
      dataNascimento: "2025-01-01",
      status: "ativo",
      fazendaId: 1,
      loteId: 4,
    },
    6: {
      id: 6,
      sexo: "femea",
      brinco: "01",
      categoria: "Bezerra",
      dataNascimento: "2026-03-06",
      status: "ativo",
      fazendaId: 1,
      loteId: 4,
    },
    9: {
      id: 9,
      sexo: "macho",
      brinco: "10",
      categoria: "Boi",
      dataNascimento: "2024-01-01",
      status: "ativo",
      fazendaId: 1,
      loteId: 4,
    },
    10: {
      id: 10,
      sexo: "macho",
      brinco: "26",
      categoria: "Novilho",
      dataNascimento: "2026-07-01",
      status: "ativo",
      fazendaId: 1,
      loteId: 4,
    },
    12: {
      id: 12,
      sexo: "femea",
      brinco: "27",
      categoria: "Novilha",
      dataNascimento: "2024-01-01",
      status: "ativo",
      fazendaId: 1,
      loteId: 4,
    },
    20: {
      id: 20,
      sexo: "femea",
      brinco: "99",
      categoria: "Vaca",
      dataNascimento: "2024-01-01",
      status: "ativo",
      fazendaId: 1,
      loteId: 5,
    },
  };

  const lotes: Record<
    number,
    { id: number; nome: string; fazendaId: number; ativo: boolean; pastoAtualId?: number | null }
  > = {
    2: { id: 2, nome: "Bezerros", fazendaId: 2, ativo: true, pastoAtualId: 4 },
    4: { id: 4, nome: "Novilhos", fazendaId: 1, ativo: true, pastoAtualId: 3 },
    5: { id: 5, nome: "VacasSolteiras", fazendaId: 1, ativo: true, pastoAtualId: 3 },
  };

  return { animais, lotes, dbUnavailableError, createRejectingQuery };
});

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => createRejectingQuery()),
  },
}));

vi.mock("./localFallbackStore", async importOriginal => {
  const actual = await importOriginal<typeof import("./localFallbackStore")>();
  return {
    ...actual,
    getLocalAnimal: vi.fn(async (_userId: number, id: number) => animais[id] ?? null),
    getLocalLote: vi.fn(async (_userId: number, id: number) => lotes[id] ?? null),
    listLocalLotes: vi.fn(async () => Object.values(lotes)),
  };
});

import { resolveAndValidateCoberturaAlvo } from "./reproCoberturaAlvoValidate";

const basePorLote = {
  userId: USER_ID,
  fazendaId: FAZENDA_ID,
  coberturaSelecaoModo: "lote" as const,
  coberturaLoteId: LOTE_NOVILHOS_ID,
};

async function expectMatrizInelegivel(promise: Promise<unknown>) {
  await expect(promise).rejects.toSatisfy((err: unknown) => {
    expect(err).toBeInstanceOf(TRPCError);
    const trpcErr = err as TRPCError;
    expect(trpcErr.message).toBe(MSG_REPRO_MATRIZ_INELEGIVEL);
    return true;
  });
}

describe("resolveAndValidateCoberturaAlvo — bypass backend (Por lote)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TESTE A — rejeita macho id 10 (brinco 26) forçado como matriz", async () => {
    await expectMatrizInelegivel(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [10],
      }),
    );
  });

  it("TESTE A — rejeita macho id 9 (brinco 10) forçado como matriz", async () => {
    await expectMatrizInelegivel(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [9],
      }),
    );
  });

  it("TESTE B — rejeita payload misto (matriz válida + macho)", async () => {
    await expectMatrizInelegivel(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [12, 10],
      }),
    );
  });

  it("TESTE C — rejeita fêmea jovem inelegível (Bezerra)", async () => {
    await expectMatrizInelegivel(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [6],
      }),
    );
  });

  it("TESTE D — rejeita fêmea elegível de outro lote na mesma fazenda", async () => {
    await expectMatrizInelegivel(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [20],
      }),
    );
  });

  it("TESTE E — rejeita lote de outra fazenda", async () => {
    await expect(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaLoteId: 2,
        coberturaMatrizIds: [12],
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).message).toBe(MSG_REPRO_LOTE_INELEGIVEL);
      return true;
    });
  });

  it("TESTE F — rejeita array vazio de matrizes", async () => {
    await expect(
      resolveAndValidateCoberturaAlvo({
        ...basePorLote,
        coberturaMatrizIds: [],
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).message).toBe(MSG_REPRO_COBERTURA_MATRIZES_OBRIGATORIAS);
      return true;
    });
  });

  it("TESTE G — normaliza IDs duplicados sem persistir duplicidade", async () => {
    const result = await resolveAndValidateCoberturaAlvo({
      ...basePorLote,
      coberturaMatrizIds: [12, 12],
    });
    expect(result.animalIds).toEqual([12]);
    expect(result.labelsBrinco).toEqual(["27"]);
  });

  it("TESTE H — aceita payload válido com matrizes 12 e 27 (ids 1 e 12)", async () => {
    const result = await resolveAndValidateCoberturaAlvo({
      ...basePorLote,
      coberturaMatrizIds: [1, 12],
    });
    expect(result.selectionMode).toBe("lote");
    expect(result.animalIds).toEqual([1, 12]);
    expect(result.labelsBrinco).toEqual(["12", "27"]);
    expect(result.loteId).toBe(LOTE_NOVILHOS_ID);
    expect(result.labelLoteNome).toBe("Novilhos");
  });
});
