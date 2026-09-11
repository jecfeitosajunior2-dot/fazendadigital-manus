import { describe, expect, it } from "vitest";
import {
  formatMatrizReproAlertaCurralTexto,
  getMatrizReproPipelineParaCurral,
  shouldShowMatrizReproAlertaCurral,
} from "./reproMatrizAlertas";

describe("reproMatrizAlertas", () => {
  const matrizId = 12;

  it("detecta DG vencido no curral", () => {
    const snapshot = getMatrizReproPipelineParaCurral(
      [
        {
          id: 1,
          femeaId: matrizId,
          tipo: "Inseminação",
          dataCobertura: "2026-01-01",
          observacoes: null,
        },
      ],
      matrizId,
      "femea",
      undefined,
      "2026-02-15",
    );
    expect(snapshot?.flags).toContain("dg_vencido");
    expect(formatMatrizReproAlertaCurralTexto(snapshot!)).toContain("Diagnóstico vencido");
  });

  it("oculta banner ao registrar DG", () => {
    expect(
      shouldShowMatrizReproAlertaCurral("Diagnóstico de prenhez", ["dg_vencido"]),
    ).toBe(false);
    expect(shouldShowMatrizReproAlertaCurral("", ["dg_vencido"])).toBe(true);
  });
});
