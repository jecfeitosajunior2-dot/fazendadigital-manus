import { describe, expect, it } from "vitest";
import {
  animalPertenceFazenda,
  buildLoteIdsSetPorFazenda,
  filterAnimaisPorFazenda,
} from "./animaisPorFazenda";

describe("animaisPorFazenda", () => {
  it("inclui animal pelo lote quando fazendaId do animal está vazio", () => {
    const loteIds = buildLoteIdsSetPorFazenda(
      [{ id: 10, fazendaId: 2 }, { id: 20, fazendaId: 3 }],
      2,
    );
    const animal = { fazendaId: null, loteId: 10 };
    expect(animalPertenceFazenda(animal, 2, loteIds)).toBe(true);
    expect(filterAnimaisPorFazenda([animal], 2, loteIds)).toHaveLength(1);
  });

  it("exclui animal de outra fazenda sem lote correspondente", () => {
    const loteIds = buildLoteIdsSetPorFazenda([{ id: 10, fazendaId: 2 }], 2);
    const animal = { fazendaId: null, loteId: 99 };
    expect(animalPertenceFazenda(animal, 2, loteIds)).toBe(false);
  });
});
