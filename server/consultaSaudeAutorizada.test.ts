import { describe, expect, it } from "vitest";
import { buildFimCarenciaPorAnimal } from "../shared/carenciaAnimal";
import { fazendasDoAtendimento } from "./consultaSaudeAutorizada";

const sede = { data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 };

describe("fazenda do atendimento sanitário", () => {
  it("sem transferência usa a fazenda atual", () => {
    expect(fazendasDoAtendimento({
      data: "2026-11-02",
      fazendaAtualId: 10,
      fazendaDoMovimentoId: null,
      movimentos: [],
    })).toEqual([10]);
  });

  it("a saída de estoque guarda a fazenda do dia, mesmo com o animal já transferido", () => {
    expect(fazendasDoAtendimento({
      data: "2026-12-02",
      fazendaAtualId: 20,
      fazendaDoMovimentoId: 10,
      movimentos: [sede],
    })).toEqual([10]);
  });

  it("castração antes da mudança fica na origem e depois no destino", () => {
    expect(fazendasDoAtendimento({
      data: "2026-10-01",
      fazendaAtualId: 20,
      fazendaDoMovimentoId: null,
      movimentos: [sede],
    })).toEqual([10]);
    expect(fazendasDoAtendimento({
      data: "2026-12-01",
      fazendaAtualId: 20,
      fazendaDoMovimentoId: null,
      movimentos: [sede],
    })).toEqual([20]);
  });

  it("no dia da mudança as duas fazendas entram", () => {
    expect(fazendasDoAtendimento({
      data: "2026-11-01",
      fazendaAtualId: 20,
      fazendaDoMovimentoId: null,
      movimentos: [{ data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 }],
    }).sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it("a fórmula da carência não conhece estorno", () => {
    const hoje = new Date(2026, 10, 19);
    const fim = buildFimCarenciaPorAnimal([
      { animalId: 70, medicamento: "Ivomec", dataRegistro: "2026-11-10", proximaData: "2026-12-01" },
    ], new Map(), hoje);
    expect(fim.get(70)?.getMonth()).toBe(11);
    expect(fim.get(70)?.getDate()).toBe(1);
  });
});
