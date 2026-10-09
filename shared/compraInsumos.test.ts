import { describe, expect, it } from "vitest";
import {
  COMPRA_INSUMOS_CHAVE_FRETE,
  COMPRA_INSUMOS_CHAVE_MERCADORIAS,
  COMPRA_INSUMOS_CHAVE_PRINCIPAL,
  MSG_COMPRA_FORNECEDOR_OBRIGATORIO,
  MSG_COMPRA_FRETE_CREDOR,
  calcularValoresCompraInsumos,
  chaveGrupoPorOperacaoId,
  montarLinhasCompraInsumos,
  planejarTitulosCompraInsumos,
  ratearFreteCompraInsumos,
  validarConfirmacaoCompraInsumos,
  validarTotaisCompraInsumos,
} from "./compraInsumos";

const premix = { id: 1, nome: "Premix", ativo: true, tipo: "fornecedor" };
const transportes = { id: 2, nome: "Transportes X", ativo: true, tipo: "fornecedor" };

describe("compraInsumos — valores e títulos", () => {
  it("CASO A — sem frete gera chave principal 10.000", () => {
    const valores = calcularValoresCompraInsumos(10000, 0);
    expect(valores.valorComercialTotal).toBe(10000);
    const titulos = planejarTitulosCompraInsumos({
      fornecedor: premix,
      freteCredor: null,
      valores,
    });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]?.origemItemChave).toBe(COMPRA_INSUMOS_CHAVE_PRINCIPAL);
    expect(titulos[0]?.valorOriginal).toBe(10000);
  });

  it("CASO B — frete mesmo credor vira um título 11.000", () => {
    const valores = calcularValoresCompraInsumos(10000, 1000);
    const titulos = planejarTitulosCompraInsumos({
      fornecedor: premix,
      freteCredor: premix,
      valores,
    });
    expect(titulos).toHaveLength(1);
    expect(titulos[0]?.valorOriginal).toBe(11000);
    expect(titulos[0]?.origemItemChave).toBe(COMPRA_INSUMOS_CHAVE_PRINCIPAL);
  });

  it("CASO C — frete outro credor gera mercadorias + frete", () => {
    const valores = calcularValoresCompraInsumos(10000, 1000);
    const titulos = planejarTitulosCompraInsumos({
      fornecedor: premix,
      freteCredor: transportes,
      valores,
    });
    expect(titulos).toHaveLength(2);
    expect(titulos[0]?.origemItemChave).toBe(COMPRA_INSUMOS_CHAVE_MERCADORIAS);
    expect(titulos[0]?.valorOriginal).toBe(10000);
    expect(titulos[1]?.origemItemChave).toBe(COMPRA_INSUMOS_CHAVE_FRETE);
    expect(titulos[1]?.valorOriginal).toBe(1000);
  });

  it("CASO F / AA–AC — não soma frete duas vezes", () => {
    const linhas = montarLinhasCompraInsumos(
      [
        { estoqueId: 1, quantidade: 1, valorMercadoria: 8000 },
        { estoqueId: 2, quantidade: 1, valorMercadoria: 2000 },
      ],
      1000,
    );
    const valores = calcularValoresCompraInsumos(10000, 1000);
    expect(validarTotaisCompraInsumos(linhas, valores)).toBe(true);
    expect(linhas.reduce((s, l) => s + l.valorTotal, 0)).toBe(11000);
    expect(linhas.reduce((s, l) => s + l.valorFrete, 0)).toBe(1000);
    expect(linhas.reduce((s, l) => s + l.valorMercadoria, 0)).toBe(10000);
  });

  it("rateio fecha centavos no último item", () => {
    const shares = ratearFreteCompraInsumos(
      [{ valorMercadoria: 10 }, { valorMercadoria: 10 }, { valorMercadoria: 10 }],
      1,
    );
    const soma = Math.round(shares.reduce((s, n) => s + n, 0) * 100);
    expect(soma).toBe(100);
  });

  it("CASO G — sem fornecedor falha", () => {
    const r = validarConfirmacaoCompraInsumos({
      fornecedor: null,
      freteCredor: null,
      valorFrete: 0,
      itens: [{ estoqueId: 1, quantidade: 1, valorMercadoria: 100 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_COMPRA_FORNECEDOR_OBRIGATORIO);
  });

  it("CASO H — frete sem credor falha", () => {
    const r = validarConfirmacaoCompraInsumos({
      fornecedor: premix,
      freteCredor: null,
      valorFrete: 10,
      itens: [{ estoqueId: 1, quantidade: 1, valorMercadoria: 100 }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_COMPRA_FRETE_CREDOR);
  });

  it("identidade nova usa operacao_id", () => {
    expect(chaveGrupoPorOperacaoId(82)).toBe("op:82");
    expect(chaveGrupoPorOperacaoId(null)).toBeNull();
  });
});
