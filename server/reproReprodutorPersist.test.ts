import { describe, expect, it } from "vitest";
import { buildReproReprodutorPayload } from "../shared/reproReprodutorPersist";

describe("buildReproReprodutorPayload", () => {
  it("Cobertura com macho interno persiste machoId e brinco", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Cobertura",
        animalSexo: "femea",
        machoId: 16,
        machoLabel: "16",
        origem: "interno",
      }),
    ).toEqual({ machoId: 16, reprodutorSemen: "16" });
  });

  it("Inseminação com macho interno persiste machoId", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        machoId: 7,
        machoLabel: "GSC-7117",
        origem: "interno",
      }),
    ).toEqual({ machoId: 7, reprodutorSemen: "GSC-7117" });
  });

  it("Inseminação externa mantém texto e machoId ausente", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        textoExterno: "Sêmen importado XYZ",
        origem: "externo",
      }),
    ).toEqual({ reprodutorSemen: "Sêmen importado XYZ" });
  });

  it("alternar para externo sem texto retorna vazio", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        origem: "externo",
      }),
    ).toEqual({});
  });

  it("alternar para interno sem macho não envia machoId nem texto externo", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Inseminação",
        animalSexo: "femea",
        textoExterno: "texto antigo",
        origem: "interno",
      }),
    ).toEqual({});
  });

  it("ignora machoId em tipos não aplicáveis", () => {
    expect(
      buildReproReprodutorPayload({
        tipo: "Parto",
        animalSexo: "femea",
        machoId: 16,
        machoLabel: "16",
      }),
    ).toEqual({});
  });
});
