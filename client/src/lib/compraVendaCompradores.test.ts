import { describe, expect, it } from "vitest";
import { menuItems } from "./data";
import {
  COMPRA_VENDA_COMPRADORES_PATH,
  COMPRA_VENDA_VENDA_NOVA_PATH,
  COMPRA_VENDA_VENDAS_PATH,
  compraVendaVendaDetalhePath,
  nomeCompradorPorId,
  opcoesComprador,
} from "./compraVendaCompradores";

const compraVenda = menuItems.find(item => item.label === "Compra e Venda");

describe("Compra e Venda — compradores ficam dentro de Vendas", () => {
  it("a rota de gerenciar compradores é interna de Vendas, não um item da sidebar", () => {
    expect(COMPRA_VENDA_COMPRADORES_PATH.startsWith(`${COMPRA_VENDA_VENDAS_PATH}/`)).toBe(true);
    const labels = compraVenda?.children?.map(c => c.label) ?? [];
    const paths = compraVenda?.children?.map(c => c.path) ?? [];
    expect(labels).not.toContain("Compradores");
    expect(paths).not.toContain(COMPRA_VENDA_COMPRADORES_PATH);
  });

  it("não coloca Compradores em Compras", () => {
    const paths = compraVenda?.children?.map(c => c.path) ?? [];
    expect(paths.some(p => p?.includes("/compras/compradores"))).toBe(false);
  });

  it("resolve o nome do comprador selecionado para gravar na venda", () => {
    const pessoas = [
      { id: 1, nome: "Frigorífico Norte" },
      { id: 2, nome: "  João da Silva  " },
    ];
    expect(nomeCompradorPorId(pessoas, "2")).toBe("João da Silva");
    expect(nomeCompradorPorId(pessoas, "")).toBe("");
    expect(nomeCompradorPorId(pessoas, "99")).toBe("");
  });

  it("monta opções de seleção estruturada", () => {
    expect(opcoesComprador([{ id: 7, nome: "Cooperativa X" }])).toEqual([
      { value: "7", label: "Cooperativa X" },
    ]);
  });

  it("expõe rotas de Nova Venda e detalhe sem Sessão no Curral", () => {
    expect(COMPRA_VENDA_VENDA_NOVA_PATH).toBe("/compra-venda/vendas/nova");
    expect(compraVendaVendaDetalhePath(12)).toBe("/compra-venda/vendas/12");
    expect(COMPRA_VENDA_VENDA_NOVA_PATH.startsWith(`${COMPRA_VENDA_VENDAS_PATH}/`)).toBe(true);
  });
});
