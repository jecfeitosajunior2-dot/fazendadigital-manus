import { describe, it, expect } from "vitest";
import {
  calcDiasNoPastoISO,
  formatDiasNoPastoLabel,
  isEntradaPastoFutura,
  legendaEntradaPastoLote,
} from "../shared/entradaPastoDisplay";

const HOJE = "2026-07-18";

describe("legendaEntradaPastoLote", () => {
  it("sem data — Sem histórico", () => {
    expect(legendaEntradaPastoLote(null, HOJE)).toEqual({ tipo: "sem_historico" });
  });

  it("entrada hoje — 0 dias no pasto", () => {
    expect(legendaEntradaPastoLote(HOJE, HOJE)).toEqual({
      tipo: "dias_no_pasto",
      dataISO: HOJE,
      dias: 0,
    });
    expect(formatDiasNoPastoLabel(0)).toBe("0 dias no pasto");
  });

  it("entrada passada — 4 dias no pasto", () => {
    expect(legendaEntradaPastoLote("2026-07-14", HOJE)).toEqual({
      tipo: "dias_no_pasto",
      dataISO: "2026-07-14",
      dias: 4,
    });
  });

  it("entrada futura — Entrada futura", () => {
    expect(legendaEntradaPastoLote("2026-07-22", HOJE)).toEqual({
      tipo: "entrada_futura",
      dataISO: "2026-07-22",
    });
    expect(isEntradaPastoFutura("2026-07-22", HOJE)).toBe(true);
  });

  it("nunca retorna dias negativos", () => {
    expect(calcDiasNoPastoISO("2026-07-22", HOJE)).toBeNull();
    const legenda = legendaEntradaPastoLote("2026-07-22", HOJE);
    expect(legenda.tipo).toBe("entrada_futura");
  });
});
