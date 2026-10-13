import { describe, it, expect } from "vitest";
import { formatDateBR, formatDateInputLocal, parseLocalDate, toLocalDateISO } from "./date-utils";

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

describe("formatDateInputLocal", () => {
  it("formata 01/01/2026 com zero-padding", () => {
    expect(formatDateInputLocal(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("formata 09/10/2026 com zero-padding de mês e dia", () => {
    expect(formatDateInputLocal(new Date(2026, 8, 9))).toBe("2026-09-09");
    expect(formatDateInputLocal(new Date(2026, 9, 9))).toBe("2026-10-09");
  });

  it("mantém 12/10/2026 às 22:30 no dia civil local", () => {
    const local2230 = new Date(2026, 9, 12, 22, 30, 0);
    expect(formatDateInputLocal(local2230)).toBe("2026-10-12");
  });

  it("mantém 31/12/2026 às 23:59 no dia civil local", () => {
    const local2359 = new Date(2026, 11, 31, 23, 59, 0);
    expect(formatDateInputLocal(local2359)).toBe("2026-12-31");
  });

  it("não usa toISOString para obter a data civil (regressão 12/10 22:30 UTC-3)", () => {
    // Em Brasília (UTC-3) já é 13/10 01:30 UTC, mas o calendário local ainda é 12/10.
    const utcJaDia13 = new Date("2026-10-13T01:30:00.000Z");
    expect(utcJaDia13.toISOString().slice(0, 10)).toBe("2026-10-13");
    const y = utcJaDia13.getFullYear();
    const m = String(utcJaDia13.getMonth() + 1).padStart(2, "0");
    const d = String(utcJaDia13.getDate()).padStart(2, "0");
    expect(formatDateInputLocal(utcJaDia13)).toBe(`${y}-${m}-${d}`);
    if (utcJaDia13.getTimezoneOffset() > 90) {
      expect(formatDateInputLocal(utcJaDia13)).toBe("2026-10-12");
    }
  });

  it("toLocalDateISO reutiliza o mesmo helper local", () => {
    const d = new Date(2026, 9, 12, 22, 30);
    expect(toLocalDateISO(d)).toBe(formatDateInputLocal(d));
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

/** Réplica da conversão dd/mm/aaaa digitada no FormDatePicker (Novo Lote / manejos). */
function formDatePickerDigitsToISO(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : iso;
}

describe("FormDatePicker — contrato operacional dos manejos", () => {
  it("exibe DD/MM/AAAA a partir de ISO interno", () => {
    expect(formatDateBR("2026-08-25")).toBe("25/08/2026");
  });

  it("converte digitação 25082026 para ISO YYYY-MM-DD", () => {
    expect(formDatePickerDigitsToISO("25082026")).toBe("2026-08-25");
  });

  it("não desloca o dia por timezone (25/08/2026 permanece 25)", () => {
    expect(formatDateBR("2026-08-25")).toBe("25/08/2026");
    expect(formatDateBR("2026-08-25")).not.toBe("24/08/2026");
    expect(formatDateBR("2026-08-25")).not.toBe("26/08/2026");
  });
});
