import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  MSG_REPRO_MACHO_IGUAL_MATRIZ,
  MSG_REPRO_MACHO_ID_TIPO_INVALIDO,
  MSG_REPRO_MACHO_INATIVO,
  MSG_REPRO_MACHO_NAO_E_MACHO,
  validateReproMachoIdForFemeaEvent,
} from "./validateReproMachoId";
import { MSG_REPRO_INELEGIVEL } from "../shared/reproElegibilidade";

const mockAssertAnimalNaFazenda = vi.fn();

vi.mock("./manejoContexto", () => ({
  assertAnimalNaFazenda: (...args: unknown[]) => mockAssertAnimalNaFazenda(...args),
}));

describe("validateReproMachoIdForFemeaEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertAnimalNaFazenda.mockResolvedValue({
      id: 16,
      sexo: "macho",
      status: "ativo",
      categoria: "Boi",
      dataNascimento: "2020-01-01",
    });
  });

  it("aceita macho interno elegível", async () => {
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 16,
        tipo: "Cobertura",
      }),
    ).resolves.toBeUndefined();
  });

  it("aceita Inseminação com macho interno", async () => {
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 16,
        tipo: "Inseminação",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejeita machoId em Parto", async () => {
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 16,
        tipo: "Parto",
      }),
    ).rejects.toMatchObject({
      message: MSG_REPRO_MACHO_ID_TIPO_INVALIDO,
    });
  });

  it("rejeita matriz igual ao reprodutor", async () => {
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 58,
        tipo: "Cobertura",
      }),
    ).rejects.toMatchObject({
      message: MSG_REPRO_MACHO_IGUAL_MATRIZ,
    });
  });

  it("rejeita animal feminino como machoId", async () => {
    mockAssertAnimalNaFazenda.mockResolvedValue({
      id: 20,
      sexo: "femea",
      status: "ativo",
      categoria: "Vaca",
      dataNascimento: "2020-01-01",
    });
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 20,
        tipo: "Cobertura",
      }),
    ).rejects.toMatchObject({
      message: MSG_REPRO_MACHO_NAO_E_MACHO,
    });
  });

  it("rejeita macho inativo", async () => {
    mockAssertAnimalNaFazenda.mockResolvedValue({
      id: 16,
      sexo: "macho",
      status: "vendido",
      categoria: "Boi",
      dataNascimento: "2020-01-01",
    });
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 16,
        tipo: "Cobertura",
      }),
    ).rejects.toMatchObject({
      message: MSG_REPRO_MACHO_INATIVO,
    });
  });

  it("rejeita macho jovem/ineligível", async () => {
    mockAssertAnimalNaFazenda.mockResolvedValue({
      id: 16,
      sexo: "macho",
      status: "ativo",
      categoria: "Bezerro",
      idadeMeses: 6,
    });
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 16,
        tipo: "Cobertura",
      }),
    ).rejects.toMatchObject({
      message: MSG_REPRO_INELEGIVEL,
    });
  });

  it("propaga erro quando macho não existe / outra fazenda", async () => {
    mockAssertAnimalNaFazenda.mockRejectedValue(
      new TRPCError({
        code: "BAD_REQUEST",
        message: "O animal não pertence à Fazenda selecionada.",
      }),
    );
    await expect(
      validateReproMachoIdForFemeaEvent(1, {
        matrizId: 58,
        fazendaId: 1,
        machoId: 999,
        tipo: "Cobertura",
      }),
    ).rejects.toThrow("O animal não pertence à Fazenda selecionada.");
  });
});
