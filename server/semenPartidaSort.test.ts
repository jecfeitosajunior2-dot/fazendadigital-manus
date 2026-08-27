import { describe, expect, it } from "vitest";
import { paginateSemenEstoqueList } from "../client/src/lib/semenEstoqueListPagination";
import {
  buildUltimaMovimentacaoPorPartida,
  getSemenMovimentacaoDataEfetiva,
  sortSemenPartidasByUltimaMovimentacao,
} from "../shared/semenPartidaSort";

describe("getSemenMovimentacaoDataEfetiva", () => {
  it("usa dataEntrada operacional, não só createdAt", () => {
    expect(
      getSemenMovimentacaoDataEfetiva({
        dataEntrada: "2026-08-26",
        createdAt: "2026-08-01T10:00:00.000Z",
      }),
    ).toBe("2026-08-26");
  });
});

describe("sortSemenPartidasByUltimaMovimentacao", () => {
  const partidas = [{ id: 1, nome: "A" }, { id: 2, nome: "B" }, { id: 3, nome: "C" }];

  it("A) 26/08 vem antes de 25/08", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 1, id: 10, dataEntrada: "2026-08-25", createdAt: "2026-08-25T08:00:00.000Z" },
      { partidaId: 2, id: 11, dataEntrada: "2026-08-26", createdAt: "2026-08-26T08:00:00.000Z" },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas.slice(0, 2), map).map(p => p.id)).toEqual([
      2, 1,
    ]);
  });

  it("não usa updatedAt da partida", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 1, id: 1, dataEntrada: "2026-08-01" },
      { partidaId: 2, id: 2, dataEntrada: "2026-08-25" },
    ]);
    expect(
      sortSemenPartidasByUltimaMovimentacao(
        [
          { id: 1, updatedAt: "2026-08-26T23:00:00.000Z" },
          { id: 2, updatedAt: "2026-01-01T00:00:00.000Z" },
        ],
        map,
      ).map(p => p.id),
    ).toEqual([2, 1]);
  });

  it("B) SAIDA_IA conta como movimentação", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 1, id: 1, dataEntrada: "2026-08-20" },
      { partidaId: 1, id: 2, dataEntrada: "2026-08-26" },
      { partidaId: 2, id: 3, dataEntrada: "2026-08-25" },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas.slice(0, 2), map).map(p => p.id)).toEqual([
      1, 2,
    ]);
  });

  it("C) nova Entrada conta como movimentação", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 1, id: 1, dataEntrada: "2026-08-10" },
      { partidaId: 1, id: 9, dataEntrada: "2026-08-26" },
      { partidaId: 2, id: 2, dataEntrada: "2026-08-24" },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas.slice(0, 2), map).map(p => p.id)).toEqual([
      1, 2,
    ]);
  });

  it("D) mesma data usa desempate por createdAt e id da movimentação", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      {
        partidaId: 1,
        id: 10,
        dataEntrada: "2026-08-26",
        createdAt: "2026-08-26T10:00:00.000Z",
      },
      {
        partidaId: 2,
        id: 20,
        dataEntrada: "2026-08-26",
        createdAt: "2026-08-26T12:00:00.000Z",
      },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas.slice(0, 2), map).map(p => p.id)).toEqual([
      2, 1,
    ]);
  });

  it("mesma data e mesmo createdAt desempata por id da movimentação e partidaId", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 1, id: 5, dataEntrada: "2026-08-26", createdAt: "t" },
      { partidaId: 2, id: 9, dataEntrada: "2026-08-26", createdAt: "t" },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas.slice(0, 2), map).map(p => p.id)).toEqual([
      2, 1,
    ]);
  });

  it("E) partida sem movimentação vai para o final", () => {
    const map = buildUltimaMovimentacaoPorPartida([
      { partidaId: 2, id: 1, dataEntrada: "2026-08-01" },
    ]);
    expect(sortSemenPartidasByUltimaMovimentacao(partidas, map).map(p => p.id)).toEqual([2, 3, 1]);
  });

  it("G) paginação acontece depois da ordenação", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));
    const map = buildUltimaMovimentacaoPorPartida(
      muitos.map((p, i) => ({
        partidaId: p.id,
        id: 100 + p.id,
        dataEntrada: `2026-08-${String(i + 1).padStart(2, "0")}`,
      })),
    );
    const sorted = sortSemenPartidasByUltimaMovimentacao(muitos, map);
    expect(sorted[0]?.id).toBe(12);
    const page1 = paginateSemenEstoqueList(sorted, 1, 10);
    expect(page1.pageItems.map(p => p.id)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    const page2 = paginateSemenEstoqueList(sorted, 2, 10);
    expect(page2.pageItems.map(p => p.id)).toEqual([2, 1]);
  });
});
