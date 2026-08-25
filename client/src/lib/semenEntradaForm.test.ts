import { describe, expect, it } from "vitest";
import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_PARTIDA_SEM_LOTE,
  calcSemenCustoUnitarioEntrada,
  formatSemenCustoTotalDisplay,
  formatSemenCustoTotalOnBlur,
  isSemenEntradaFormSubmittable,
  normalizeSemenPartida,
  parseSemenCustoTotal,
  sanitizeSemenCustoTotalInput,
} from "@shared/semenEstoque";

const REF_DATE = new Date("2026-08-25T12:00:00");

function internoCompleto(overrides: Record<string, unknown> = {}) {
  return {
    origem: SEMEN_ORIGEM_INTERNO as typeof SEMEN_ORIGEM_INTERNO,
    machoId: 16,
    partida: "P-16",
    quantidadeDoses: "10",
    custoTotal: "1.000,00",
    dataEntrada: "2026-08-25",
    ...overrides,
  };
}

function externoCompleto(overrides: Record<string, unknown> = {}) {
  return {
    origem: SEMEN_ORIGEM_EXTERNO as typeof SEMEN_ORIGEM_EXTERNO,
    reprodutorTexto: "GSC-7117",
    partida: "P-889",
    quantidadeDoses: "10",
    custoTotal: "500,00",
    dataEntrada: "2026-08-25",
    ...overrides,
  };
}

describe("semen entrada — moeda", () => {
  it("A) 1000 → valor estrutural 1000", () => {
    expect(parseSemenCustoTotal("1000")).toBe(1000);
  });

  it('B) "1.000,00" → 1000', () => {
    expect(parseSemenCustoTotal("1.000,00")).toBe(1000);
  });

  it('C) display → "R$ 1.000,00"', () => {
    expect(formatSemenCustoTotalDisplay(1000)).toBe("R$ 1.000,00");
    expect(formatSemenCustoTotalDisplay("1.000,00")).toBe("R$ 1.000,00");
  });

  it("D) prefixo R$ não entra no payload", () => {
    const n = parseSemenCustoTotal("R$ 1.000,00");
    expect(n).toBe(1000);
    expect(typeof n).toBe("number");
    expect(String(n)).not.toMatch(/R\$/);
  });

  it("E) 0 → inválido", () => {
    expect(parseSemenCustoTotal("0")).toBeNull();
    expect(parseSemenCustoTotal("0,00")).toBeNull();
  });

  it("F) negativo → inválido", () => {
    expect(parseSemenCustoTotal("-100")).toBeNull();
    expect(parseSemenCustoTotal("-100,00")).toBeNull();
  });

  it("G) 10 doses + R$1.000 → custo/dose R$100", () => {
    const unit = parseFloat(calcSemenCustoUnitarioEntrada(10, 1000));
    expect(formatSemenCustoTotalDisplay(unit)).toBe("R$ 100,00");
  });

  it("formata blur sem prefixo R$", () => {
    expect(formatSemenCustoTotalOnBlur("1000")).toBe("1.000,00");
    expect(formatSemenCustoTotalOnBlur("R$ 1.000,00")).toBe("1.000,00");
  });

  it("sanitize remove R$ digitado", () => {
    expect(sanitizeSemenCustoTotalInput("R$ 500,00")).toBe("500,00");
  });
});

describe("semen entrada — partida opcional", () => {
  it("vazio normaliza para Sem lote", () => {
    expect(normalizeSemenPartida("")).toBe(SEMEN_PARTIDA_SEM_LOTE);
    expect(normalizeSemenPartida("  ")).toBe(SEMEN_PARTIDA_SEM_LOTE);
  });

  it("informado preserva valor trimado", () => {
    expect(normalizeSemenPartida("  P-16 ")).toBe("P-16");
  });
});

describe("semen entrada — botão submittable", () => {
  it("A) inicial → desabilitado", () => {
    expect(isSemenEntradaFormSubmittable({ origem: "" }, REF_DATE)).toBe(false);
  });

  it("B) interno sem macho → desabilitado", () => {
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ machoId: null }),
        REF_DATE,
      ),
    ).toBe(false);
  });

  it("C) interno completo → habilitado", () => {
    expect(isSemenEntradaFormSubmittable(internoCompleto(), REF_DATE)).toBe(true);
  });

  it("D) externo sem reprodutor → desabilitado", () => {
    expect(
      isSemenEntradaFormSubmittable(
        externoCompleto({ reprodutorTexto: "" }),
        REF_DATE,
      ),
    ).toBe(false);
  });

  it("E) externo completo → habilitado", () => {
    expect(isSemenEntradaFormSubmittable(externoCompleto(), REF_DATE)).toBe(true);
  });

  it("F) quantidade inválida → desabilitado", () => {
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ quantidadeDoses: "0" }),
        REF_DATE,
      ),
    ).toBe(false);
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ quantidadeDoses: "1.5" }),
        REF_DATE,
      ),
    ).toBe(false);
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ quantidadeDoses: "abc" }),
        REF_DATE,
      ),
    ).toBe(false);
  });

  it("G) custo inválido → desabilitado", () => {
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ custoTotal: "0" }),
        REF_DATE,
      ),
    ).toBe(false);
    expect(
      isSemenEntradaFormSubmittable(
        internoCompleto({ custoTotal: "-100" }),
        REF_DATE,
      ),
    ).toBe(false);
  });

  it("H) partida vazia ainda permite envio", () => {
    const base = internoCompleto();
    expect(isSemenEntradaFormSubmittable(base, REF_DATE)).toBe(true);
    expect(
      isSemenEntradaFormSubmittable({ ...base, partida: "" }, REF_DATE),
    ).toBe(true);
  });

  it("H2) remover quantidade após formulário válido → desabilita", () => {
    const base = internoCompleto();
    expect(
      isSemenEntradaFormSubmittable({ ...base, quantidadeDoses: "" }, REF_DATE),
    ).toBe(false);
  });

  it("cenário manual: macho 16, P-16, 10 doses, R$ 1.000,00", () => {
    expect(
      isSemenEntradaFormSubmittable(
        {
          origem: SEMEN_ORIGEM_INTERNO,
          machoId: 16,
          partida: "P-16",
          quantidadeDoses: "10",
          custoTotal: "1.000,00",
          dataEntrada: "2026-08-25",
        },
        REF_DATE,
      ),
    ).toBe(true);
  });
});
