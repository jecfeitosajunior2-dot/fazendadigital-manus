import { describe, expect, it } from "vitest";
import {
  labelAnimalBusca,
  labelSexoAnimal,
  sexoDotClassName,
  subtituloAnimalBusca,
  subtituloMachoReprodutor,
  withSexoNoSubtitulo,
} from "../shared/animalBuscaDisplay";

const femea58 = {
  id: 15,
  brinco: "58",
  nome: "Estrela",
  sexo: "femea" as const,
};

const macho16 = {
  id: 7,
  brinco: "16",
  sexo: "macho" as const,
  categoria: "Boi",
};

const semSexo = {
  id: 99,
  brinco: "301",
  sexo: null,
};

describe("indicador visual de sexo", () => {
  it("A) fêmea → indicador rosa", () => {
    expect(sexoDotClassName("femea")).toBe("bg-pink-400");
    expect(labelSexoAnimal("femea")).toBe("Fêmea");
  });

  it("B) macho → indicador azul", () => {
    expect(sexoDotClassName("macho")).toBe("bg-blue-400");
    expect(labelSexoAnimal("macho")).toBe("Macho");
  });

  it("C) sexo desconhecido → sem indicador incorreto", () => {
    expect(sexoDotClassName(null)).toBeNull();
    expect(sexoDotClassName(undefined)).toBeNull();
    expect(sexoDotClassName("")).toBeNull();
    expect(sexoDotClassName("indefinido")).toBeNull();
    expect(labelSexoAnimal(null)).toBeNull();
    expect(sexoDotClassName(semSexo.sexo)).not.toBe("bg-pink-400");
    expect(sexoDotClassName(semSexo.sexo)).not.toBe("bg-blue-400");
  });

  it("D) label principal continua sendo o brinco", () => {
    expect(labelAnimalBusca(femea58)).toBe("58 · Estrela");
    expect(labelAnimalBusca(macho16)).toBe("16");
    expect(labelAnimalBusca(semSexo)).toBe("301");
  });

  it("E) PK interna não aparece no label quando há brinco", () => {
    expect(labelAnimalBusca(femea58)).not.toContain("#15");
    expect(labelAnimalBusca(femea58)).not.toMatch(/\bid\b/i);
    expect(labelAnimalBusca(macho16)).not.toContain("7");
    expect(labelAnimalBusca(macho16)).not.toContain("#7");
  });

  it("G) subtítulo contém sexo em texto", () => {
    expect(withSexoNoSubtitulo(femea58.sexo, subtituloAnimalBusca(femea58))).toBe(
      "Fêmea · Brinco visual 58",
    );
    expect(withSexoNoSubtitulo(macho16.sexo, subtituloAnimalBusca(macho16))).toBe(
      "Macho · Brinco visual 16",
    );
    expect(subtituloMachoReprodutor(macho16)).toBe("Macho · Boi · Brinco visual 16");
    expect(withSexoNoSubtitulo(macho16.sexo, subtituloMachoReprodutor(macho16))).toBe(
      "Macho · Boi · Brinco visual 16",
    );
    expect(withSexoNoSubtitulo(semSexo.sexo, subtituloAnimalBusca(semSexo))).toBe(
      "Brinco visual 301",
    );
  });
});
