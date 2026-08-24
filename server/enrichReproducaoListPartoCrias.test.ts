import { describe, expect, it } from "vitest";
import { attachPartoCriasToRegistros } from "./enrichReproducaoListPartoCrias";

describe("attachPartoCriasToRegistros", () => {
  const brincos = new Map<number, string>([
    [101, "301"],
    [102, "302"],
    [103, "303"],
  ]);

  it("anexa crias apenas em registros Parto com vínculo", () => {
    const registros = [
      { id: 1, tipo: "Parto" },
      { id: 2, tipo: "Diagnóstico" },
      { id: 3, tipo: "Parto" },
    ];
    const vinculos = [
      { partoRegistroId: 1, criaAnimalId: 101, ordem: 1 },
      { partoRegistroId: 3, criaAnimalId: 102, ordem: 1 },
      { partoRegistroId: 3, criaAnimalId: 103, ordem: 2 },
    ];

    const enriched = attachPartoCriasToRegistros(registros, vinculos, brincos);

    expect(enriched[0]?.crias).toEqual([{ animalId: 101, brinco: "301", ordem: 1 }]);
    expect(enriched[1]?.crias).toBeUndefined();
    expect(enriched[2]?.crias).toEqual([
      { animalId: 102, brinco: "302", ordem: 1 },
      { animalId: 103, brinco: "303", ordem: 2 },
    ]);
  });

  it("ordena crias por parto_crias.ordem, não alfabeticamente", () => {
    const registros = [{ id: 10, tipo: "Parto" }];
    const vinculos = [
      { partoRegistroId: 10, criaAnimalId: 102, ordem: 2 },
      { partoRegistroId: 10, criaAnimalId: 101, ordem: 1 },
    ];

    const enriched = attachPartoCriasToRegistros(registros, vinculos, brincos);
    expect(enriched[0]?.crias?.map(c => c.brinco)).toEqual(["301", "302"]);
  });

  it("Parto natimorto ou legado sem parto_crias não recebe crias", () => {
    const registros = [
      { id: 20, tipo: "Parto" },
      { id: 21, tipo: "Parto" },
    ];

    const enriched = attachPartoCriasToRegistros(registros, [], brincos);

    expect(enriched[0]?.crias).toBeUndefined();
    expect(enriched[1]?.crias).toBeUndefined();
  });

  it("usa brinco atual do animal, inclusive inativo", () => {
    const registros = [{ id: 30, tipo: "Parto" }];
    const vinculos = [{ partoRegistroId: 30, criaAnimalId: 999, ordem: 1 }];
    const brincoAtual = new Map<number, string>([[999, "BR-ALT"]]);

    const enriched = attachPartoCriasToRegistros(registros, vinculos, brincoAtual);
    expect(enriched[0]?.crias?.[0]?.brinco).toBe("BR-ALT");
  });

  it("fallback #id quando brinco ausente", () => {
    const registros = [{ id: 40, tipo: "Parto" }];
    const vinculos = [{ partoRegistroId: 40, criaAnimalId: 777, ordem: 1 }];

    const enriched = attachPartoCriasToRegistros(registros, vinculos, new Map());
    expect(enriched[0]?.crias?.[0]?.brinco).toBe("#777");
  });
});
