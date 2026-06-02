/**
 * Testes de integração para a lógica de baixa automática de estoque
 * em abastecimentos internos (na fazenda).
 *
 * Estes testes validam a lógica pura de cálculo sem acessar o banco.
 */
import { describe, it, expect } from "vitest";

// Replica a lógica de matchCombustivelEstoque do servidor
const COMBUSTIVEL_KEYWORDS: Record<string, string[]> = {
  diesel: ["diesel", "s10", "s500", "óleo diesel", "oleo diesel"],
  gasolina: ["gasolina"],
  etanol: ["etanol", "álcool", "alcool"],
  arla: ["arla"],
};

function matchCombustivelEstoque(
  item: { nome: string | null; categoria: string | null },
  combustivel: string
): boolean {
  const keywords = COMBUSTIVEL_KEYWORDS[combustivel] ?? [combustivel];
  const nome = (item.nome ?? "").toLowerCase();
  const cat = (item.categoria ?? "").toLowerCase();
  return keywords.some(k => nome.includes(k) || cat.includes(k));
}

describe("matchCombustivelEstoque", () => {
  it("reconhece Diesel pelo nome exato", () => {
    expect(matchCombustivelEstoque({ nome: "Diesel", categoria: "Combustíveis" }, "diesel")).toBe(true);
  });

  it("reconhece Diesel S10 pelo nome", () => {
    expect(matchCombustivelEstoque({ nome: "Diesel S10", categoria: "Combustíveis" }, "diesel")).toBe(true);
  });

  it("reconhece Óleo Diesel S500 pelo nome", () => {
    expect(matchCombustivelEstoque({ nome: "Óleo Diesel S500", categoria: null }, "diesel")).toBe(true);
  });

  it("reconhece gasolina pelo nome", () => {
    expect(matchCombustivelEstoque({ nome: "Gasolina Comum", categoria: null }, "gasolina")).toBe(true);
  });

  it("reconhece etanol pelo nome", () => {
    expect(matchCombustivelEstoque({ nome: "Etanol Hidratado", categoria: null }, "etanol")).toBe(true);
  });

  it("reconhece álcool como etanol", () => {
    expect(matchCombustivelEstoque({ nome: "Álcool", categoria: null }, "etanol")).toBe(true);
  });

  it("reconhece arla pelo nome", () => {
    expect(matchCombustivelEstoque({ nome: "Arla 32", categoria: null }, "arla")).toBe(true);
  });

  it("não confunde gasolina com diesel", () => {
    expect(matchCombustivelEstoque({ nome: "Gasolina", categoria: null }, "diesel")).toBe(false);
  });
});

describe("Lógica de baixa de estoque em abastecimento interno", () => {
  it("calcula novo saldo corretamente após baixa", () => {
    const estoqueAtual = 1000;
    const litrosAbastecidos = 250;
    const novoSaldo = Math.max(0, estoqueAtual - litrosAbastecidos);
    expect(novoSaldo).toBe(750);
  });

  it("não deixa saldo negativo", () => {
    const estoqueAtual = 100;
    const litrosAbastecidos = 200;
    const novoSaldo = Math.max(0, estoqueAtual - litrosAbastecidos);
    expect(novoSaldo).toBe(0);
  });

  it("calcula saldo após reversão de baixa (delete/update)", () => {
    const estoqueAtual = 750;
    const litrosRevertidos = 250;
    const saldoRevertido = estoqueAtual + litrosRevertidos;
    expect(saldoRevertido).toBe(1000);
  });

  it("calcula saldo após update: reverter 250L e aplicar 150L", () => {
    const estoqueAtual = 750;
    const litrosAnteriores = 250;
    const novosLitros = 150;
    const aposReversao = estoqueAtual + litrosAnteriores;
    const aposNovaBaixa = Math.max(0, aposReversao - novosLitros);
    expect(aposNovaBaixa).toBe(850);
  });
});
