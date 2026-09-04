import { describe, expect, it } from "vitest";
import {
  buildPrecoMedioImplicit,
  buildValorUnitMap,
  compraTemValorGravado,
  valorCompraMov,
  valorTotalResumoEfetivo,
} from "./movimentacao-valor";
import type { MovimentacaoResumo } from "./movimentacao-resumo";

describe("movimentacao-valor", () => {
  const produtos = [{ id: 25, valorUnitario: "1.76" }];
  const valorUnitMap = buildValorUnitMap(produtos);
  const precoMedioImplicit = buildPrecoMedioImplicit([
    { estoqueId: 25, tipo: "Compra", status: "ativa", quantidade: "100", valor: "166" },
  ]);

  it("compraTemValorGravado distingue lançado de estimado", () => {
    expect(compraTemValorGravado({ valor: "166" })).toBe(true);
    expect(compraTemValorGravado({ valor: null })).toBe(false);
  });

  it("valorCompraMov estima quando valor está null", () => {
    const v = valorCompraMov(
      { estoqueId: 25, quantidade: "5", valor: null, frete: null },
      valorUnitMap,
      precoMedioImplicit,
    );
    expect(v).toBeCloseTo(8.8, 2);
  });

  it("valorTotalResumoEfetivo inclui linha sem valor gravado", () => {
    const resumo: Pick<MovimentacaoResumo, "valorTotal" | "itens" | "freteLegado"> = {
      valorTotal: null,
      freteLegado: false,
      itens: [
        {
          id: 26,
          estoqueId: 25,
          tipo: "Compra",
          quantidade: "5",
          valor: null,
          frete: null,
        },
      ],
    };
    const total = valorTotalResumoEfetivo(resumo, valorUnitMap, precoMedioImplicit);
    expect(total).toBeCloseTo(8.8, 2);
  });

  it("valorTotalResumoEfetivo mantém total gravado quando todas as linhas têm valor", () => {
    const resumo: Pick<MovimentacaoResumo, "valorTotal" | "itens" | "freteLegado"> = {
      valorTotal: 166,
      freteLegado: false,
      itens: [
        {
          id: 1,
          estoqueId: 25,
          tipo: "Compra",
          quantidade: "100",
          valor: "166",
        },
      ],
    };
    expect(valorTotalResumoEfetivo(resumo, valorUnitMap, precoMedioImplicit)).toBe(166);
  });
});
