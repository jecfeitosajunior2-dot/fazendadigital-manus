import { describe, expect, it } from "vitest";
import {
  getReproTipoOptionsElegiveis,
  hasCategoriaIdadeMismatchRepro,
  isFemeaReprodutivamenteMadura,
  isMachoReprodutivamenteMaduro,
  isReproTipoPermitidoParaAnimal,
} from "../shared/reproElegibilidade";
import { REPRO_TIPOS_MACHO } from "../shared/reproRegistroMeta";

describe("reproElegibilidade — idade prioritária sobre categoria manual", () => {
  it("macho Bezerro 19 meses é elegível (animal 16)", () => {
    const animal = { sexo: "macho" as const, categoria: "Bezerro", idadeMeses: 19 };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(true);
    expect(getReproTipoOptionsElegiveis(animal)).toEqual([...REPRO_TIPOS_MACHO]);
    expect(hasCategoriaIdadeMismatchRepro(animal)).toBe(true);
  });

  it("macho Boi 19 meses continua elegível (animal 28)", () => {
    const animal = { sexo: "macho" as const, categoria: "Boi", idadeMeses: 19 };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(true);
    expect(getReproTipoOptionsElegiveis(animal)).toEqual([...REPRO_TIPOS_MACHO]);
    expect(hasCategoriaIdadeMismatchRepro(animal)).toBe(false);
  });

  it("macho ~2 meses (54 dias) permanece bloqueado", () => {
    const animal = { sexo: "macho" as const, categoria: "Bezerro", idadeMeses: 2 };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(false);
    expect(getReproTipoOptionsElegiveis(animal)).toEqual([]);
  });

  it("macho jovem com categoria adulta errada (Boi) permanece bloqueado", () => {
    const animal = { sexo: "macho" as const, categoria: "Boi", idadeMeses: 5 };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(false);
    expect(isReproTipoPermitidoParaAnimal(animal, "Exame andrológico")).toBe(false);
  });

  it("macho Novilho >= 12 meses é elegível", () => {
    const animal = { sexo: "macho" as const, categoria: "Novilho", idadeMeses: 19 };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(true);
  });

  it("macho Boi sem idade conhecida mantém fallback por categoria adulta", () => {
    const animal = { sexo: "macho" as const, categoria: "Boi", idadeMeses: null };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(true);
  });

  it("macho Bezerro sem idade conhecida permanece bloqueado", () => {
    const animal = { sexo: "macho" as const, categoria: "Bezerro", idadeMeses: null };
    expect(isMachoReprodutivamenteMaduro(animal)).toBe(false);
  });

  it("fêmea jovem com categoria adulta permanece bloqueada", () => {
    const animal = { sexo: "femea" as const, categoria: "Vaca", idadeMeses: 5 };
    expect(isFemeaReprodutivamenteMadura(animal)).toBe(false);
    expect(isReproTipoPermitidoParaAnimal(animal, "Cio")).toBe(false);
  });

  it("fêmea Bezerra >= 12 meses não é bloqueada só pela categoria juvenil", () => {
    const animal = { sexo: "femea" as const, categoria: "Bezerra", idadeMeses: 19 };
    expect(isFemeaReprodutivamenteMadura(animal)).toBe(true);
    expect(isReproTipoPermitidoParaAnimal(animal, "Cio")).toBe(true);
    expect(hasCategoriaIdadeMismatchRepro(animal)).toBe(true);
  });

  it("fêmea Novilha jovem permanece bloqueada", () => {
    const animal = { sexo: "femea" as const, categoria: "Novilha", idadeMeses: 8 };
    expect(isFemeaReprodutivamenteMadura(animal)).toBe(false);
  });
});
