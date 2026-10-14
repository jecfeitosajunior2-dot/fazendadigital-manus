import { describe, expect, it } from "vitest";
import { dataCivilParaColunaDate } from "./dataCivil";

describe("dataCivilParaColunaDate", () => {
  it("A. 2026-10-13 permanece 2026-10-13", () => {
    expect(dataCivilParaColunaDate("2026-10-13")).toBe("2026-10-13");
  });

  it("B. 01/01/2026 permanece 2026-01-01", () => {
    expect(dataCivilParaColunaDate("2026-01-01")).toBe("2026-01-01");
  });

  it("C. 31/12/2026 permanece 2026-12-31", () => {
    expect(dataCivilParaColunaDate("2026-12-31")).toBe("2026-12-31");
  });

  it("D. new Date('2026-10-13') pode virar 12/10 no fuso; o helper não depende disso", () => {
    const legado = new Date("2026-10-13");
    expect(legado.toISOString()).toBe("2026-10-13T00:00:00.000Z");
    const localCivil = `${legado.getFullYear()}-${String(legado.getMonth() + 1).padStart(2, "0")}-${String(legado.getDate()).padStart(2, "0")}`;
    if (legado.getTimezoneOffset() > 0) {
      expect(localCivil).toBe("2026-10-12");
    }
    expect(dataCivilParaColunaDate("2026-10-13")).toBe("2026-10-13");
  });

  it("mantém o dia civil sem passar por UTC", () => {
    expect(dataCivilParaColunaDate("2026-09-23")).toBe("2026-09-23");
    expect(dataCivilParaColunaDate("2026-09-23T00:00:00.000Z")).toBe("2026-09-23");
  });

  it("rejeita valor que não é YYYY-MM-DD", () => {
    expect(() => dataCivilParaColunaDate("23/09/2026")).toThrow(/inválida/i);
  });
});
