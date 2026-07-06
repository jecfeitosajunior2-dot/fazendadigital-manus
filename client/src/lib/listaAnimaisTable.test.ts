import { describe, expect, it } from "vitest";
import {
  EM_CARENCIA_SIM_BADGE_CLASS,
  getEmCarenciaLabel,
  shouldHighlightEmCarencia,
} from "./listaAnimaisTable";

describe("Em Carência = Sim", () => {
  it("exibe rótulo Sim com badge de alerta sanitário discreto", () => {
    expect(getEmCarenciaLabel(true)).toBe("Sim");
    expect(shouldHighlightEmCarencia(true)).toBe(true);
    expect(EM_CARENCIA_SIM_BADGE_CLASS).toContain("amber-50");
    expect(EM_CARENCIA_SIM_BADGE_CLASS).toContain("amber-700");
    expect(EM_CARENCIA_SIM_BADGE_CLASS).toContain("border-amber-200");
  });
});
