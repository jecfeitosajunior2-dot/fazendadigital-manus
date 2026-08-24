import { describe, expect, it } from "vitest";
import { formatFemeaAlertaTexto } from "./dashboard-utils";

describe("formatFemeaAlertaTexto", () => {
  it("prioriza brinco visual", () => {
    expect(formatFemeaAlertaTexto(15, { brinco: "58", nome: "Mimosa" })).toBe("Fêmea 58");
  });

  it("usa nome quando não há brinco", () => {
    expect(formatFemeaAlertaTexto(15, { brinco: "", nome: "Mimosa" })).toBe("Fêmea Mimosa");
  });

  it("cai no ID interno como fallback", () => {
    expect(formatFemeaAlertaTexto(15, null)).toBe("Fêmea #15");
  });
});
