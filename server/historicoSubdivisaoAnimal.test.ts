import { describe, it, expect } from "vitest";
import {
  buildHistoricoSubdivisaoAnimal,
  buildLotePeriodsForAnimal,
  dateInLotePeriod,
} from "../shared/historicoSubdivisaoAnimal";

describe("buildLotePeriodsForAnimal", () => {
  it("sem transferências usa lote atual", () => {
    expect(buildLotePeriodsForAnimal(10, [])).toEqual([
      { loteId: 10, fromInclusive: null, toExclusive: null },
    ]);
  });

  it("com transferência divide períodos", () => {
    const periods = buildLotePeriodsForAnimal(20, [
      {
        id: 1,
        loteOrigemId: 10,
        loteDestinoId: 20,
        pastoOrigemId: 1,
        pastoDestinoId: 2,
        dataMovimentacao: "2026-01-15",
      },
    ]);
    expect(periods).toEqual([
      { loteId: 10, fromInclusive: null, toExclusive: "2026-01-15" },
      { loteId: 20, fromInclusive: "2026-01-15", toExclusive: null },
    ]);
  });
});

describe("buildHistoricoSubdivisaoAnimal", () => {
  const pastoMap = { 1: "Pasto A", 2: "Pasto B", 3: "Pasto C" };

  it("inclui movimentações do lote atual", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 10,
      transfers: [],
      lotePastoMovs: [
        {
          id: 1,
          loteId: 10,
          pastoOrigemId: null,
          pastoDestinoId: 1,
          dataEntrada: "2026-01-01",
          dataSaida: "2026-01-07",
        },
        {
          id: 2,
          loteId: 10,
          pastoOrigemId: 1,
          pastoDestinoId: 2,
          dataEntrada: "2026-01-08",
          dataSaida: null,
        },
      ],
      pastoMap,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].pastoDestinoNome).toBe("Pasto B");
    expect(rows[1].pastoDestinoNome).toBe("Pasto A");
  });

  it("inclui histórico de lote anterior após transferência", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 20,
      transfers: [
        {
          id: 5,
          loteOrigemId: 10,
          loteDestinoId: 20,
          pastoOrigemId: 1,
          pastoDestinoId: 3,
          dataMovimentacao: "2026-01-15",
          usuarioNome: "Paulo",
        },
      ],
      lotePastoMovs: [
        {
          id: 1,
          loteId: 10,
          pastoOrigemId: null,
          pastoDestinoId: 1,
          dataEntrada: "2026-01-01",
          dataSaida: null,
        },
        {
          id: 2,
          loteId: 20,
          pastoOrigemId: null,
          pastoDestinoId: 3,
          dataEntrada: "2026-01-16",
          dataSaida: null,
        },
      ],
      pastoMap,
    });

    const lote10 = rows.filter(r => r.loteId === 10 || r.pastoDestinoId === 1);
    expect(lote10.some(r => r.tipo === "lote_pasto" && r.pastoDestinoNome === "Pasto A")).toBe(true);
    expect(rows.some(r => r.tipo === "transferencia_lote" && r.responsavel === "Paulo")).toBe(true);
    expect(rows.some(r => r.loteId === 20 && r.pastoDestinoNome === "Pasto C")).toBe(true);
  });

  it("exclui movimentação de lote fora do período do animal", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 20,
      transfers: [
        {
          id: 1,
          loteOrigemId: 10,
          loteDestinoId: 20,
          pastoOrigemId: 1,
          pastoDestinoId: 2,
          dataMovimentacao: "2026-01-15",
        },
      ],
      lotePastoMovs: [
        {
          id: 99,
          loteId: 10,
          pastoOrigemId: 1,
          pastoDestinoId: 2,
          dataEntrada: "2026-02-01",
          dataSaida: null,
        },
      ],
      pastoMap,
    });

    expect(rows.every(r => r.dataEntrada !== "2026-02-01")).toBe(true);
  });

  it("sempre inclui troca de lote mesmo sem mudança de pasto", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 20,
      transfers: [
        {
          id: 7,
          loteOrigemId: 10,
          loteDestinoId: 20,
          pastoOrigemId: 1,
          pastoDestinoId: 1,
          dataMovimentacao: "2026-08-28",
          usuarioNome: "Pedro",
          observacoes: "Movido após desmama.",
        },
      ],
      lotePastoMovs: [],
      pastoMap,
      loteNomeMap: { 10: "Bezerros", 20: "Novilhos" },
    });

    const troca = rows.find(r => r.tipo === "transferencia_lote");
    expect(troca).toMatchObject({
      loteOrigemNome: "Bezerros",
      loteDestinoNome: "Novilhos",
      responsavel: "Pedro",
      observacoes: "Movido após desmama.",
    });
  });

  it("animal sem lote registra origem nula", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 10,
      transfers: [
        {
          id: 8,
          loteOrigemId: null,
          loteDestinoId: 10,
          dataMovimentacao: "2026-08-28",
        },
      ],
      lotePastoMovs: [],
      pastoMap,
      loteNomeMap: { 10: "Bezerros" },
    });

    expect(rows.some(r => r.tipo === "transferencia_lote" && r.loteOrigemId == null)).toBe(true);
    expect(rows.find(r => r.tipo === "transferencia_lote")?.loteDestinoNome).toBe("Bezerros");
  });

  it("ordena trocas de lote da mais recente para a mais antiga", () => {
    const rows = buildHistoricoSubdivisaoAnimal({
      currentLoteId: 30,
      transfers: [
        {
          id: 1,
          loteOrigemId: 10,
          loteDestinoId: 20,
          dataMovimentacao: "2026-07-15",
        },
        {
          id: 2,
          loteOrigemId: 20,
          loteDestinoId: 30,
          dataMovimentacao: "2026-08-28",
        },
      ],
      lotePastoMovs: [],
      pastoMap,
      loteNomeMap: { 10: "Bezerros", 20: "Novilhos", 30: "Recria" },
    });

    const trocas = rows.filter(r => r.tipo === "transferencia_lote");
    expect(trocas.map(r => r.dataEntrada)).toEqual(["2026-08-28", "2026-07-15"]);
    expect(trocas[0].loteOrigemNome).toBe("Novilhos");
    expect(trocas[0].loteDestinoNome).toBe("Recria");
  });
});

describe("dateInLotePeriod", () => {
  it("respeita limites inclusivo/exclusivo", () => {
    const period = { loteId: 1, fromInclusive: "2026-01-15", toExclusive: null };
    expect(dateInLotePeriod("2026-01-14", period)).toBe(false);
    expect(dateInLotePeriod("2026-01-15", period)).toBe(true);
  });
});
