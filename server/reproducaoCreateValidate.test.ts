import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReproducaoAnimalId } from "./reproducaoCreateInput";
import {
  getLocalDateISO,
  MSG_REPRO_DATA_FUTURA,
  MSG_REPRO_FAZENDA_OBRIGATORIA,
  validateReproDataCoberturaNaoFutura,
  validateReproducaoCreatePreconditions,
} from "./reproducaoCreateValidate";

const assertFazendaDoUsuario = vi.fn();
const assertAnimalNaFazenda = vi.fn();

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: (...args: unknown[]) => assertFazendaDoUsuario(...args),
  assertAnimalNaFazenda: (...args: unknown[]) => assertAnimalNaFazenda(...args),
}));

const USER_ID = 1;
const FAZENDA_1 = 1;
const FAZENDA_2 = 2;
const ANIMAL_ID = 12;

const animalFemea = {
  id: ANIMAL_ID,
  sexo: "femea" as const,
  categoria: "Vaca",
  dataNascimento: "2020-01-01",
  fazendaId: FAZENDA_1,
};

beforeEach(() => {
  vi.clearAllMocks();
  assertFazendaDoUsuario.mockResolvedValue(undefined);
  assertAnimalNaFazenda.mockResolvedValue(animalFemea);
});

describe("validateReproDataCoberturaNaoFutura", () => {
  const ref = new Date(2026, 7, 24); // 24/08/2026 local

  it("aceita data de hoje", () => {
    const r = validateReproDataCoberturaNaoFutura("2026-08-24", ref);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.dataISO).toBe("2026-08-24");
  });

  it("rejeita data de amanhã", () => {
    const r = validateReproDataCoberturaNaoFutura("2026-08-25", ref);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_REPRO_DATA_FUTURA);
  });

  it("aceita data passada", () => {
    const r = validateReproDataCoberturaNaoFutura("2026-08-23", ref);
    expect(r.ok).toBe(true);
  });

  it("virada de mês — último dia do mês é aceito", () => {
    const refMes = new Date(2026, 0, 31); // 31/01/2026
    expect(validateReproDataCoberturaNaoFutura("2026-01-31", refMes).ok).toBe(true);
    expect(validateReproDataCoberturaNaoFutura("2026-02-01", refMes).ok).toBe(false);
  });

  it("virada de ano — 31/12 aceito, 01/01 seguinte rejeitado", () => {
    const refAno = new Date(2025, 11, 31); // 31/12/2025
    expect(validateReproDataCoberturaNaoFutura("2025-12-31", refAno).ok).toBe(true);
    expect(validateReproDataCoberturaNaoFutura("2026-01-01", refAno).ok).toBe(false);
  });

  it("não desloca dia por timestamp UTC na comparação", () => {
    const ref = new Date(2026, 7, 24, 23, 59, 59);
    expect(getLocalDateISO(ref)).toBe("2026-08-24");
    expect(validateReproDataCoberturaNaoFutura("2026-08-24T00:00:00.000Z", ref).ok).toBe(true);
  });
});

describe("validateReproducaoCreatePreconditions", () => {
  const ref = new Date(2026, 7, 24);
  const baseInput = {
    animalId: ANIMAL_ID,
    fazendaId: FAZENDA_1,
    dataCobertura: "2026-08-24",
  };

  it("aceita animal da mesma fazenda", async () => {
    const r = await validateReproducaoCreatePreconditions(USER_ID, baseInput, ref);
    expect(r.animal).toEqual(animalFemea);
    expect(assertFazendaDoUsuario).toHaveBeenCalledWith(USER_ID, FAZENDA_1);
    expect(assertAnimalNaFazenda).toHaveBeenCalledWith(USER_ID, ANIMAL_ID, FAZENDA_1);
  });

  it("rejeita animal de outra fazenda", async () => {
    assertAnimalNaFazenda.mockRejectedValue(
      new TRPCError({
        code: "BAD_REQUEST",
        message: "O animal não pertence à Fazenda selecionada.",
      }),
    );

    await expect(
      validateReproducaoCreatePreconditions(
        USER_ID,
        { ...baseInput, fazendaId: FAZENDA_2 },
        ref,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "O animal não pertence à Fazenda selecionada.",
    });
  });

  it("rejeita animal inexistente", async () => {
    assertAnimalNaFazenda.mockRejectedValue(
      new TRPCError({ code: "NOT_FOUND", message: "Selecione um animal válido." }),
    );

    await expect(
      validateReproducaoCreatePreconditions(USER_ID, baseInput, ref),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Selecione um animal válido.",
    });
  });

  it("rejeita sem fazendaId", async () => {
    await expect(
      validateReproducaoCreatePreconditions(
        USER_ID,
        { ...baseInput, fazendaId: undefined },
        ref,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: MSG_REPRO_FAZENDA_OBRIGATORIA,
    });
    expect(assertAnimalNaFazenda).not.toHaveBeenCalled();
  });

  it("rejeita data futura após validar fazenda e animal", async () => {
    await expect(
      validateReproducaoCreatePreconditions(
        USER_ID,
        { ...baseInput, dataCobertura: "2026-08-25" },
        ref,
      ),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: MSG_REPRO_DATA_FUTURA,
    });
    expect(assertAnimalNaFazenda).toHaveBeenCalledWith(USER_ID, ANIMAL_ID, FAZENDA_1);
  });

  it("não persiste quando fazendaId ausente — falha antes do animal", async () => {
    await expect(
      validateReproducaoCreatePreconditions(
        USER_ID,
        { ...baseInput, fazendaId: undefined },
        ref,
      ),
    ).rejects.toThrow();
    expect(assertFazendaDoUsuario).not.toHaveBeenCalled();
    expect(assertAnimalNaFazenda).not.toHaveBeenCalled();
  });

  it("alias femeaId legado resolve animalId antes da validação de contexto", () => {
    expect(resolveReproducaoAnimalId({ femeaId: ANIMAL_ID })).toBe(ANIMAL_ID);
  });
});

describe("validateReproducaoCreatePreconditions — fluxos por sexo", () => {
  const ref = new Date(2026, 7, 24);

  it("fluxo feminino — animal fêmea aceito", async () => {
    assertAnimalNaFazenda.mockResolvedValue(animalFemea);
    const r = await validateReproducaoCreatePreconditions(
      USER_ID,
      { animalId: ANIMAL_ID, fazendaId: FAZENDA_1, dataCobertura: "2026-08-20" },
      ref,
    );
    expect(r.animal.sexo).toBe("femea");
  });

  it("fluxo masculino — animal macho aceito", async () => {
    assertAnimalNaFazenda.mockResolvedValue({
      ...animalFemea,
      id: 9,
      sexo: "macho",
      categoria: "Boi",
    });
    const r = await validateReproducaoCreatePreconditions(
      USER_ID,
      { animalId: 9, fazendaId: FAZENDA_1, dataCobertura: "2026-08-20" },
      ref,
    );
    expect(r.animal.sexo).toBe("macho");
  });
});
