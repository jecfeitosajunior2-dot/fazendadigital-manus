import { describe, expect, it } from "vitest";
import {
  agruparLotesPorLocalizacaoVigente,
  movimentacaoExibivelHistorico,
  resolverLocalizacaoAtualLote,
} from "../shared/localizacaoAtualLote";

const HOJE = "2026-07-18";

describe("localizacaoAtualLote", () => {
  it("ignora destino futuro — lote permanece na subdivisão vigente anterior", () => {
    const loc = resolverLocalizacaoAtualLote(
      { pastoAtualId: 6, dataEntradaPasto: "2026-07-22" },
      [
        { pastoDestinoId: 5, dataEntrada: "2026-07-10", dataSaida: null },
        { pastoDestinoId: 6, dataEntrada: "2026-07-22", dataSaida: null },
      ],
      HOJE,
    );
    expect(loc).toEqual({ pastoId: 5, dataEntradaPasto: "2026-07-10" });
  });

  it("sem localização vigente — Sem Subdivisão", () => {
    const loc = resolverLocalizacaoAtualLote(
      { pastoAtualId: 6, dataEntradaPasto: "2026-07-22" },
      [{ pastoDestinoId: 6, dataEntrada: "2026-07-22", dataSaida: null }],
      HOJE,
    );
    expect(loc).toEqual({ pastoId: null, dataEntradaPasto: null });
  });

  it("usa campos do lote quando vigentes e sem movimentação aberta", () => {
    const loc = resolverLocalizacaoAtualLote(
      { pastoAtualId: 5, dataEntradaPasto: "2026-07-15" },
      [],
      HOJE,
    );
    expect(loc).toEqual({ pastoId: 5, dataEntradaPasto: "2026-07-15" });
  });

  it("filtra movimentações futuras do histórico", () => {
    expect(movimentacaoExibivelHistorico({ dataEntrada: "2026-07-22", dataSaida: null }, HOJE)).toBe(false);
    expect(movimentacaoExibivelHistorico({ dataEntrada: "2026-07-18", dataSaida: null }, HOJE)).toBe(true);
  });

  it("agrupa lotes pela localização vigente", () => {
    const lotes = [
      { id: 1, pastoAtualId: 6, dataEntradaPasto: "2026-07-22" },
      { id: 2, pastoAtualId: null, dataEntradaPasto: null },
    ];
    const movs = new Map([
      [1, [{ pastoDestinoId: 5, dataEntrada: "2026-07-10", dataSaida: null }]],
      [2, []],
    ]);
    const { porPasto, semSubdivisao, localizacaoPorLoteId } = agruparLotesPorLocalizacaoVigente(
      lotes,
      movs,
      HOJE,
    );
    expect(porPasto.get(5)?.map(l => l.id)).toEqual([1]);
    expect(semSubdivisao.map(l => l.id)).toEqual([2]);
    expect(localizacaoPorLoteId.get(1)?.pastoId).toBe(5);
  });
});
