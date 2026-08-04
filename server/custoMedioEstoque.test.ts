import { describe, it, expect } from "vitest";
import {
  calcularCustoMedioPonderado,
  formatCustoMedio,
  parseCustoMedio,
} from "./custoMedioEstoque";

describe("custoMedioEstoque", () => {
  it("parseCustoMedio rejeita zero, negativo e inválido", () => {
    expect(parseCustoMedio(null)).toBeNull();
    expect(parseCustoMedio("")).toBeNull();
    expect(parseCustoMedio("0")).toBeNull();
    expect(parseCustoMedio("-10")).toBeNull();
    expect(parseCustoMedio("abc")).toBeNull();
    expect(parseCustoMedio("106.67")).toBe(106.67);
  });

  it("calcula custo médio ponderado do exemplo da especificação", () => {
    const medio = calcularCustoMedioPonderado({
      quantidadeAnterior: 10,
      custoMedioAnterior: 100,
      quantidadeEntrada: 5,
      valorTotalEntrada: 600,
    });
    expect(medio).not.toBeNull();
    expect(formatCustoMedio(medio!)).toBe("106.67");
  });

  it("primeira entrada define o custo médio unitário", () => {
    const medio = calcularCustoMedioPonderado({
      quantidadeAnterior: 0,
      custoMedioAnterior: null,
      quantidadeEntrada: 4,
      valorTotalEntrada: 400,
    });
    expect(medio).toBe(100);
  });

  it("entrada sem valor não altera o custo médio vigente", () => {
    expect(
      calcularCustoMedioPonderado({
        quantidadeAnterior: 10,
        custoMedioAnterior: 85,
        quantidadeEntrada: 5,
        valorTotalEntrada: 0,
      }),
    ).toBe(85);
  });
});
