import { describe, expect, it } from "vitest";
import {
  buildInsumosVisaoGeralRetorno,
  listaProdutosComRetornoVisaoGeral,
  movimentacaoComRetornoVisaoGeral,
  parseRetornoVisaoGeral,
} from "./insumosRoutes";

describe("insumosRoutes", () => {
  it("monta retorno com fazenda e grupo", () => {
    expect(buildInsumosVisaoGeralRetorno("3", "abaixo_minimo")).toBe(
      "/insumos/visao-geral?fazendaId=3&grupo=abaixo_minimo",
    );
  });

  it("anexa retorno à lista de produtos", () => {
    const path = listaProdutosComRetornoVisaoGeral(
      "/insumos/lista-produtos?status=ativo&alerta=abaixo_minimo",
      "3",
      "abaixo_minimo",
    );
    expect(path).toContain("retorno=");
    expect(parseRetornoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/insumos/visao-geral?fazendaId=3&grupo=abaixo_minimo",
    );
  });

  it("anexa retorno à movimentação", () => {
    const path = movimentacaoComRetornoVisaoGeral(
      "/insumos/movimentacao?fazendaId=2&tipo=Compra",
      "2",
      "compras_fornecedor",
    );
    expect(parseRetornoVisaoGeral(new URL(path, "http://local").searchParams.get("retorno"))).toBe(
      "/insumos/visao-geral?fazendaId=2&grupo=compras_fornecedor",
    );
  });

  it("rejeita retorno fora da visão geral", () => {
    expect(parseRetornoVisaoGeral("/insumos/lista-produtos")).toBeNull();
    expect(parseRetornoVisaoGeral(null)).toBeNull();
  });
});
