import { describe, expect, it } from "vitest";
import { dataCivilParaColunaDate } from "./dataCivil";

describe("dataCivilParaColunaDate", () => {
  it("mantém o dia civil sem passar por UTC", () => {
    expect(dataCivilParaColunaDate("2026-09-23")).toBe("2026-09-23");
    expect(dataCivilParaColunaDate("2026-09-23T00:00:00.000Z")).toBe("2026-09-23");
  });

  it("rejeita valor que não é YYYY-MM-DD", () => {
    expect(() => dataCivilParaColunaDate("23/09/2026")).toThrow(/inválida/i);
  });
});
