import { describe, it, expect } from "vitest";
import {
  getValorLitroEstoque,
  resolveValoresAbastecimento,
  getSaldoLitros,
} from "./combustivel-estoque";

const fazendaId = 90001;

const estoqueComPreco = [
  { id: 90001, fazendaId, nome: "Diesel", categoria: "Combustíveis", quantidade: 1000, valorUnitario: 5.5 },
];

const estoqueSemPreco = [
  { id: 90001, fazendaId, nome: "Diesel", categoria: "Combustíveis", quantidade: 1000, valorUnitario: null },
];

const movimentacoesCompra = [
  { estoqueId: 90001, tipo: "Compra", quantidade: 1000, valor: 5670 },
];

describe("getValorLitroEstoque", () => {
  it("usa o valorUnitario do produto quando disponível", () => {
    expect(getValorLitroEstoque(estoqueComPreco, fazendaId, "diesel")).toBeCloseTo(5.5, 4);
  });

  it("deriva o preço das movimentações de compra quando valorUnitario é nulo", () => {
    const v = getValorLitroEstoque(estoqueSemPreco, fazendaId, "diesel", movimentacoesCompra);
    expect(v).toBeCloseTo(5.67, 4); // 5670 / 1000
  });

  it("retorna null quando não há preço no produto nem movimentações", () => {
    expect(getValorLitroEstoque(estoqueSemPreco, fazendaId, "diesel", [])).toBeNull();
  });

  it("reconhece variações de nome de diesel (S10)", () => {
    const estoque = [
      { id: 1, fazendaId, nome: "Óleo Diesel S10", categoria: "Combustíveis", quantidade: 500, valorUnitario: 6 },
    ];
    expect(getValorLitroEstoque(estoque, fazendaId, "diesel")).toBeCloseTo(6, 4);
  });

  it("ignora movimentações de outro produto de estoque", () => {
    const movs = [{ estoqueId: 12345, tipo: "Compra", quantidade: 100, valor: 1000 }];
    expect(getValorLitroEstoque(estoqueSemPreco, fazendaId, "diesel", movs)).toBeNull();
  });
});

describe("resolveValoresAbastecimento", () => {
  it("preserva os valores salvos no registro quando existentes", () => {
    const r = { litros: 200, valorLitro: 5.78, valorTotal: 1156, abastecidoNaFazenda: false };
    const res = resolveValoresAbastecimento(r, estoqueComPreco);
    expect(res.valorLitro).toBeCloseTo(5.78, 4);
    expect(res.valorTotal).toBeCloseTo(1156, 2);
  });

  it("calcula valor/L e total para abastecimento interno via valorUnitario", () => {
    const r = {
      litros: 150,
      valorLitro: null,
      valorTotal: null,
      abastecidoNaFazenda: true,
      fazendaId,
      combustivel: "diesel",
    };
    const res = resolveValoresAbastecimento(r, estoqueComPreco);
    expect(res.valorLitro).toBeCloseTo(5.5, 4);
    expect(res.valorTotal).toBeCloseTo(825, 2); // 150 * 5.5
  });

  it("calcula valor/L e total via movimentações quando valorUnitario é nulo (caso real id=60004)", () => {
    const r = {
      litros: 150,
      valorLitro: null,
      valorTotal: null,
      abastecidoNaFazenda: true,
      fazendaId,
      combustivel: "diesel",
    };
    const res = resolveValoresAbastecimento(r, estoqueSemPreco, movimentacoesCompra);
    expect(res.valorLitro).toBeCloseTo(5.67, 4);
    expect(res.valorTotal).toBeCloseTo(850.5, 2); // 150 * 5.67
  });

  it("retorna nulos quando não há base para cálculo", () => {
    const r = {
      litros: 150,
      valorLitro: null,
      valorTotal: null,
      abastecidoNaFazenda: true,
      fazendaId,
      combustivel: "diesel",
    };
    const res = resolveValoresAbastecimento(r, estoqueSemPreco, []);
    expect(res.valorLitro).toBeNull();
    expect(res.valorTotal).toBeNull();
  });
});

describe("getSaldoLitros", () => {
  it("soma quantidade dos produtos de combustível da fazenda", () => {
    expect(getSaldoLitros(estoqueComPreco, fazendaId, "diesel")).toBe(1000);
  });
});
