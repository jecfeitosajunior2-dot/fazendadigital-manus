import { describe, expect, it } from "vitest";
import {
  analyzeMachoReproAlertas,
  formatMachoReproAlertaCurralTexto,
  getMachoReproAlertasParaFichaAnimal,
  shouldShowMachoReproAlertaCurral,
} from "./reproMachoAlertas";

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

  it("filtra espelhos ao calcular alertas na ficha do touro", () => {
    const snap = getMachoReproAlertasParaFichaAnimal(
      [
        {
          id: 1,
          femeaId: 7,
          machoId: 7,
          tipo: "Uso como reprodutor",
          dataCobertura: "2026-01-01",
        },
        {
          id: 2,
          femeaId: 27,
          machoId: 7,
          tipo: "Exposição à monta",
          dataCobertura: "2026-09-10",
          observacoes: "\n__fd_repro__{\"esp\":1}__end__",
        },
      ],
      7,
      "macho",
      "2026-09-10",
    );
    expect(snap?.flags).toContain("sem_exame_andrologico");
  });

  it("monta texto do banner do curral", () => {
    expect(formatMachoReproAlertaCurralTexto(["sem_exame_andrologico"])).toContain(
      "Registre o exame",
    );
  });

  it("oculta banner ao registrar exame andrológico", () => {
    expect(
      shouldShowMachoReproAlertaCurral("Exame andrológico", ["sem_exame_andrologico"]),
    ).toBe(false);
    expect(shouldShowMachoReproAlertaCurral("", ["sem_exame_andrologico"])).toBe(true);
    expect(
      shouldShowMachoReproAlertaCurral("Estação de monta", ["sem_exame_andrologico"]),
    ).toBe(true);
  });
});
