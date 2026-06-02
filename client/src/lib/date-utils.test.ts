import { describe, it, expect } from "vitest";
import { formatDateBR, parseLocalDate } from "./date-utils";

describe("formatDateBR", () => {
  it("formata string YYYY-MM-DD sem regressão de timezone", () => {
    expect(formatDateBR("2026-06-03")).toBe("03/06/2026");
  });

  it("formata string YYYY-MM-DD com timestamp ISO", () => {
    expect(formatDateBR("2026-06-03T00:00:00.000Z")).toBe("03/06/2026");
  });

  it("retorna — para valor nulo", () => {
    expect(formatDateBR(null)).toBe("—");
  });

  it("retorna — para valor undefined", () => {
    expect(formatDateBR(undefined)).toBe("—");
  });

  it("retorna — para string vazia", () => {
    expect(formatDateBR("")).toBe("—");
  });

  it("formata objeto Date sem regressão (usa ISO slice)", () => {
    // Date UTC 2026-06-03T00:00:00Z → ISO slice = "2026-06-03" → "03/06/2026"
    const d = new Date("2026-06-03T00:00:00.000Z");
    expect(formatDateBR(d)).toBe("03/06/2026");
  });

  it("retorna — para string inválida", () => {
    expect(formatDateBR("nao-e-data")).toBe("—");
  });
});

describe("parseLocalDate", () => {
  it("parseia YYYY-MM-DD como data local sem UTC shift", () => {
    const d = parseLocalDate("2026-06-03");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5); // junho = 5 (0-indexed)
    expect(d!.getDate()).toBe(3);
  });

  it("retorna null para valor nulo", () => {
    expect(parseLocalDate(null)).toBeNull();
  });

  it("retorna null para string inválida", () => {
    expect(parseLocalDate("invalido")).toBeNull();
  });

  it("retorna o mesmo Date para objeto Date", () => {
    const d = new Date(2026, 5, 3); // local date
    const result = parseLocalDate(d);
    expect(result).toBe(d);
  });
});
