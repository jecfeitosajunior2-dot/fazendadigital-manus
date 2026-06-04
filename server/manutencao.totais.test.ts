/**
 * Testes para a lógica de cálculo de totais de manutenção
 * (peças, mão de obra e total geral), exportada de routers.ts.
 */
import { describe, it, expect } from "vitest";
import { calcularTotaisManutencao } from "./routers";

describe("calcularTotaisManutencao", () => {
  it("soma peças (quantidade x valor unitário) corretamente", () => {
    const r = calcularTotaisManutencao(
      [
        { quantidade: 2, valorUnitario: 50 },
        { quantidade: 1, valorUnitario: 120 },
      ],
      0
    );
    expect(r.valorPecas).toBe(220);
  });

  it("inclui mão de obra no total geral", () => {
    const r = calcularTotaisManutencao(
      [{ quantidade: 3, valorUnitario: 30 }],
      200
    );
    expect(r.valorPecas).toBe(90);
    expect(r.valorMaoObra).toBe(200);
    expect(r.valorTotal).toBe(290);
  });

  it("trata lista de peças vazia como zero", () => {
    const r = calcularTotaisManutencao([], 150);
    expect(r.valorPecas).toBe(0);
    expect(r.valorTotal).toBe(150);
  });

  it("trata peças indefinidas como zero", () => {
    const r = calcularTotaisManutencao(undefined, 0);
    expect(r.valorPecas).toBe(0);
    expect(r.valorMaoObra).toBe(0);
    expect(r.valorTotal).toBe(0);
  });

  it("trata mão de obra indefinida como zero", () => {
    const r = calcularTotaisManutencao(
      [{ quantidade: 1, valorUnitario: 80 }],
      undefined
    );
    expect(r.valorMaoObra).toBe(0);
    expect(r.valorTotal).toBe(80);
  });

  it("lida com quantidades fracionadas (ex. 1,5 litros de óleo)", () => {
    const r = calcularTotaisManutencao(
      [{ quantidade: 1.5, valorUnitario: 40 }],
      0
    );
    expect(r.valorPecas).toBe(60);
  });

  it("calcula um cenário completo: 3 peças + mão de obra", () => {
    const pecas = [
      { quantidade: 4, valorUnitario: 25 }, // 100
      { quantidade: 2, valorUnitario: 60 }, // 120
      { quantidade: 1, valorUnitario: 15 }, // 15
    ];
    const r = calcularTotaisManutencao(pecas, 350);
    expect(r.valorPecas).toBe(235);
    expect(r.valorMaoObra).toBe(350);
    expect(r.valorTotal).toBe(585);
  });

  it("formata os totais em string com 2 casas decimais (compatível com decimal SQL)", () => {
    const r = calcularTotaisManutencao(
      [{ quantidade: 3, valorUnitario: 33.33 }],
      10
    );
    // 3 * 33.33 = 99.99
    expect(r.valorPecas.toFixed(2)).toBe("99.99");
    expect(r.valorTotal.toFixed(2)).toBe("109.99");
  });
});
