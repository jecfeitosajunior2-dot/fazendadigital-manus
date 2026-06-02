import { describe, it, expect } from "vitest";

/**
 * Reproduz a normalização de data usada nas mutations de abastecimento
 * (server/routers.ts). A coluna `data` é do tipo MySQL DATE, que espera
 * o formato "YYYY-MM-DD". O bug original enviava um objeto Date completo
 * ("Tue Jun 02 2026 00:00:00 GMT+0000"), causando "Failed query".
 */
function normalizeDate(input: string): string {
  return new Date(input).toISOString().slice(0, 10);
}

describe("normalização de data do abastecimento", () => {
  it("converte string ISO completa para YYYY-MM-DD", () => {
    expect(normalizeDate("2026-06-02")).toBe("2026-06-02");
  });

  it("converte string de data com horário para YYYY-MM-DD", () => {
    expect(normalizeDate("2026-06-02T13:45:00.000Z")).toBe("2026-06-02");
  });

  it("nunca retorna formato de Date completo com timezone", () => {
    const result = normalizeDate("2026-06-02");
    expect(result).not.toContain("GMT");
    expect(result).not.toContain("Coordinated Universal Time");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("mantém o dia correto para data sem timezone", () => {
    expect(normalizeDate("2025-12-31")).toBe("2025-12-31");
  });

  it("produz string de exatamente 10 caracteres", () => {
    expect(normalizeDate("2026-01-15").length).toBe(10);
  });
});
