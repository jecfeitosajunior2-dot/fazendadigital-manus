import { describe, expect, it } from "vitest";
import { analyzeMachoReproAlertas } from "./reproMachoAlertas";

describe("analyzeMachoReproAlertas", () => {
  it("marca inapto em reprodução", () => {
    const snap = analyzeMachoReproAlertas(
      [
        { tipo: "Uso como reprodutor", dataCobertura: "2026-01-01" },
        { tipo: "Exame andrológico", dataCobertura: "2026-02-01", resultado: "Inapto" },
      ],
      "macho",
      { diasValidadeExameAndrologico: 365 },
      "2026-03-01",
    );
    expect(snap?.flags).toContain("inapto_em_reproducao");
    expect(snap?.emReproducao).toBe(true);
  });

  it("marca exame vencido após prazo configurado", () => {
    const snap = analyzeMachoReproAlertas(
      [
        { tipo: "Uso como reprodutor", dataCobertura: "2024-01-01" },
        { tipo: "Exame andrológico", dataCobertura: "2024-06-01", resultado: "Apto" },
      ],
      "macho",
      { diasValidadeExameAndrologico: 30 },
      "2026-01-01",
    );
    expect(snap?.flags).toContain("exame_andrologico_vencido");
  });

  it("marca sem exame quando em reprodução", () => {
    const snap = analyzeMachoReproAlertas(
      [{ tipo: "Uso como reprodutor", dataCobertura: "2026-01-01" }],
      "macho",
      undefined,
      "2026-03-01",
    );
    expect(snap?.flags).toContain("sem_exame_andrologico");
  });

  it("retorna null para fêmea", () => {
    expect(analyzeMachoReproAlertas([], "femea")).toBeNull();
  });
});
