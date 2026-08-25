import { describe, expect, it } from "vitest";
import {
  isCoberturaRealizadaMacho,
  resolveReproducaoAnimalId,
  resolveReproducaoMachoIdPersistido,
} from "./reproducaoCreateInput";

describe("resolveReproducaoAnimalId", () => {
  it("prefere animalId", () => {
    expect(resolveReproducaoAnimalId({ animalId: 7, femeaId: 1 })).toBe(7);
  });

  it("aceita femeaId legado", () => {
    expect(resolveReproducaoAnimalId({ femeaId: 12 })).toBe(12);
  });

  it("retorna null sem identificador", () => {
    expect(resolveReproducaoAnimalId({})).toBeNull();
  });
});

describe("resolveReproducaoMachoIdPersistido", () => {
  it("macho principal persiste machoId igual ao animalId", () => {
    expect(resolveReproducaoMachoIdPersistido("macho", 16, undefined)).toBe(16);
  });

  it("fêmea principal usa machoId informado", () => {
    expect(resolveReproducaoMachoIdPersistido("femea", 27, 9)).toBe(9);
  });

  it("fêmea sem reprodutor informado fica undefined", () => {
    expect(resolveReproducaoMachoIdPersistido("femea", 27, undefined)).toBeUndefined();
  });

  it("registro legado textual (machoId ausente) persiste sem machoId estruturado", () => {
    expect(resolveReproducaoMachoIdPersistido("femea", 58, undefined)).toBeUndefined();
    expect(resolveReproducaoMachoIdPersistido("femea", 58, null)).toBeUndefined();
  });
});

describe("isCoberturaRealizadaMacho", () => {
  it("detecta cobertura realizada do reprodutor", () => {
    expect(isCoberturaRealizadaMacho("Cobertura realizada", "macho")).toBe(true);
  });

  it("não confunde cobertura feminina", () => {
    expect(isCoberturaRealizadaMacho("Cobertura", "femea")).toBe(false);
  });
});
