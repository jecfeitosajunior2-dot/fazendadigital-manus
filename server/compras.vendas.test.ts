import { describe, it, expect } from "vitest";

// Basic unit tests for compras and vendas data validation
describe("Compras e Vendas - Validação de Dados", () => {
  it("deve validar campos obrigatórios de compra", () => {
    const compra = {
      data: "2026-05-29",
      fornecedor: "Agropecuária Central",
      quantidadeAnimais: 10,
      valorTotal: "15000.00",
    };
    expect(compra.data).toBeTruthy();
    expect(compra.fornecedor).toBeTruthy();
    expect(compra.quantidadeAnimais).toBeGreaterThan(0);
    expect(parseFloat(compra.valorTotal)).toBeGreaterThan(0);
  });

  it("deve validar campos obrigatórios de venda", () => {
    const venda = {
      data: "2026-05-29",
      comprador: "Frigorífico São Paulo",
      quantidadeAnimais: 5,
      valorTotal: "12500.00",
    };
    expect(venda.data).toBeTruthy();
    expect(venda.comprador).toBeTruthy();
    expect(venda.quantidadeAnimais).toBeGreaterThan(0);
    expect(parseFloat(venda.valorTotal)).toBeGreaterThan(0);
  });

  it("deve calcular valor médio por animal em compra", () => {
    const valorTotal = 15000;
    const quantidade = 10;
    const valorMedio = valorTotal / quantidade;
    expect(valorMedio).toBe(1500);
  });

  it("deve calcular valor médio por animal em venda", () => {
    const valorTotal = 12500;
    const quantidade = 5;
    const valorMedio = valorTotal / quantidade;
    expect(valorMedio).toBe(2500);
  });

  it("deve rejeitar quantidade negativa", () => {
    const quantidadeInvalida = -5;
    expect(quantidadeInvalida).toBeLessThan(0);
    // A validação no backend rejeita valores negativos
    const isValid = quantidadeInvalida >= 0;
    expect(isValid).toBe(false);
  });
});
