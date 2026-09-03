import { describe, expect, it } from "vitest";
import {
  bucketsFluxoIntervalo,
  formatFemeaAlertaTexto,
  movimentoNoIntervalo,
  periodoPadrao90Dias,
} from "./dashboard-utils";

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

describe("periodoPadrao90Dias", () => {
  it("retorna intervalo de 91 dias inclusive", () => {
    const { inicio, fim } = periodoPadrao90Dias();
    expect(inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fim).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const di = new Date(`${inicio}T12:00:00`);
    const df = new Date(`${fim}T12:00:00`);
    const diff = Math.round((df.getTime() - di.getTime()) / 86_400_000);
    expect(diff).toBe(90);
  });
});

describe("movimentoNoIntervalo", () => {
  it("inclui datas nos limites do intervalo", () => {
    expect(movimentoNoIntervalo("2026-03-01", "2026-03-01", "2026-03-31")).toBe(true);
    expect(movimentoNoIntervalo("2026-03-31", "2026-03-01", "2026-03-31")).toBe(true);
    expect(movimentoNoIntervalo("2026-02-28", "2026-03-01", "2026-03-31")).toBe(false);
  });
});

describe("bucketsFluxoIntervalo", () => {
  it("gera buckets semanais em intervalos curtos", () => {
    const buckets = bucketsFluxoIntervalo("2026-03-01", "2026-03-20");
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.length).toBeLessThanOrEqual(4);
  });

  it("gera buckets mensais em intervalos longos", () => {
    const buckets = bucketsFluxoIntervalo("2026-01-01", "2026-06-30");
    expect(buckets.length).toBe(6);
  });
});
