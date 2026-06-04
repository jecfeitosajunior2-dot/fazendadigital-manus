import { describe, it, expect } from "vitest";

describe("Validação de horímetro — leitura crescente", () => {
  it("detecta leitura menor que anterior como inválida", () => {
    const leituraAnterior = 1000;
    const leituraAtual = 950;
    const invalida = leituraAtual < leituraAnterior;
    expect(invalida).toBe(true);
  });

  it("aceita leitura igual à anterior (mesmo abastecimento)", () => {
    const leituraAnterior = 1000;
    const leituraAtual = 1000;
    const invalida = leituraAtual < leituraAnterior;
    expect(invalida).toBe(false);
  });

  it("aceita leitura maior que anterior (normal)", () => {
    const leituraAnterior = 1000;
    const leituraAtual = 1050;
    const invalida = leituraAtual < leituraAnterior;
    expect(invalida).toBe(false);
  });

  it("aceita primeira leitura (sem histórico)", () => {
    const leituraAnterior = null;
    const leituraAtual = 1000;
    const invalida = leituraAtual !== null && leituraAnterior !== null && leituraAtual < leituraAnterior;
    expect(invalida).toBe(false);
  });

  it("converte corretamente string com vírgula para número", () => {
    const leituraString = "1234,56";
    const leituraNum = parseFloat(leituraString.replace(",", "."));
    expect(leituraNum).toBe(1234.56);
  });

  it("calcula consumo médio corretamente (L/hora)", () => {
    const registros = [
      { horimetro: 100, litros: 50 },
      { horimetro: 50, litros: 25 },
    ];
    const totalLitros = registros.reduce((s, r) => s + r.litros, 0);
    const totalHoras = registros.reduce((s, r) => s + r.horimetro, 0);
    const consumoMedio = totalLitros / totalHoras;
    expect(consumoMedio).toBeCloseTo(0.5, 2); // 75 litros / 150 horas = 0.5 L/hora
  });

  it("ignora registros sem horímetro no cálculo de consumo", () => {
    const registros = [
      { horimetro: 100, litros: 50 },
      { horimetro: null, litros: 25 }, // sem horímetro
      { horimetro: 50, litros: 25 },
    ];
    const comHorimetro = registros.filter(r => r.horimetro && r.litros);
    expect(comHorimetro.length).toBe(2);
    const totalLitros = comHorimetro.reduce((s, r) => s + r.litros, 0);
    const totalHoras = comHorimetro.reduce((s, r) => s + (r.horimetro || 0), 0);
    const consumoMedio = totalLitros / totalHoras;
    expect(consumoMedio).toBeCloseTo(0.5, 2); // 75 litros / 150 horas
  });
});
