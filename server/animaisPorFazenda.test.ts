import { describe, expect, it } from "vitest";
import {
  animalCompativelComFazendaLote,
  animalPertenceFazenda,
  buildLoteFazendaContext,
  filterAnimaisPorFazenda,
  resolveAnimalLocalizacaoFromLote,
  resolveLoteFazendaId,
} from "./animaisPorFazenda";

describe("animaisPorFazenda", () => {
  it("inclui animal pelo lote quando fazendaId do animal está vazio", () => {
    const { loteFazendaById } = buildLoteFazendaContext(
      [{ id: 10, fazendaId: 2 }, { id: 20, fazendaId: 3 }],
      [],
    );
    const animal = { fazendaId: null, loteId: 10 };
    expect(animalPertenceFazenda(animal, 2, loteFazendaById)).toBe(true);
    expect(filterAnimaisPorFazenda([animal], 2, loteFazendaById)).toHaveLength(1);
  });

  it("resolve fazenda do lote pela subdivisão quando lote.fazendaId está vazio", () => {
    const pastoFazendaMap = new Map([[5, 2]]);
    expect(resolveLoteFazendaId({ id: 10, fazendaId: null, pastoAtualId: 5 }, pastoFazendaMap)).toBe(2);
  });

  it("inclui animal pelo lote vinculado ao pasto da fazenda", () => {
    const { loteFazendaById } = buildLoteFazendaContext(
      [{ id: 10, fazendaId: null, pastoAtualId: 5 }],
      [{ id: 5, fazendaId: 2 }],
    );
    const animal = { fazendaId: null, loteId: 10 };
    expect(animalPertenceFazenda(animal, 2, loteFazendaById)).toBe(true);
  });

  it("exclui animal de outra fazenda sem lote correspondente", () => {
    const { loteFazendaById } = buildLoteFazendaContext([{ id: 10, fazendaId: 2 }], []);
    const animal = { fazendaId: null, loteId: 99 };
    expect(animalPertenceFazenda(animal, 2, loteFazendaById)).toBe(false);
  });

  it("resolve localização do animal a partir do lote e subdivisão", () => {
    const pastoMap = new Map([[5, 2]]);
    expect(resolveAnimalLocalizacaoFromLote(
      { id: 10, fazendaId: null, pastoAtualId: 5 },
      pastoMap,
    )).toEqual({ fazendaId: 2, pastoId: 5 });
  });

  it("permite animal sem fazendaId entrar no lote da fazenda", () => {
    expect(animalCompativelComFazendaLote({ fazendaId: null }, 2)).toBe(true);
    expect(animalCompativelComFazendaLote({ fazendaId: 2 }, 2)).toBe(true);
    expect(animalCompativelComFazendaLote({ fazendaId: 3 }, 2)).toBe(false);
  });

  it("inclui animal só com fazendaId, sem lote nem subdivisão", () => {
    const { loteFazendaById } = buildLoteFazendaContext([], []);
    const animal = { fazendaId: 2, loteId: null };
    expect(animalPertenceFazenda(animal, 2, loteFazendaById)).toBe(true);
    expect(filterAnimaisPorFazenda([animal], 2, loteFazendaById)).toHaveLength(1);
    expect(animalPertenceFazenda(animal, 3, loteFazendaById)).toBe(false);
  });
});
