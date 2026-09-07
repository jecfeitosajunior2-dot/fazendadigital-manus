import { describe, expect, it } from "vitest";
import {
  categoriaControlaSaldoPorPadrao,
  categoriaExigeEstocavelCombustivel,
  categoriaExigeEstocavelManutencao,
  produtoControlaSaldo,
} from "./estoqueControle";

describe("estoqueControle", () => {
  it("Farmácia e Nutricionais controlam saldo por padrão", () => {
    expect(categoriaControlaSaldoPorPadrao("Farmácia")).toBe(true);
    expect(categoriaControlaSaldoPorPadrao("Nutricionais")).toBe(true);
  });

  it("Peças e Lubrificantes são estocáveis por padrão (manutenção)", () => {
    expect(categoriaControlaSaldoPorPadrao("Peças")).toBe(true);
    expect(categoriaControlaSaldoPorPadrao("Lubrificantes")).toBe(true);
    expect(categoriaExigeEstocavelManutencao("Peças")).toBe(true);
    expect(categoriaExigeEstocavelManutencao("Lubrificantes")).toBe(true);
    expect(categoriaExigeEstocavelManutencao("Farmácia")).toBe(false);
  });

  it("Ferramentas, EPIs e Outros Insumos não exigem estocável para manutenção", () => {
    expect(categoriaExigeEstocavelManutencao("Ferramentas")).toBe(false);
    expect(categoriaExigeEstocavelManutencao("Epis")).toBe(false);
    expect(categoriaExigeEstocavelManutencao("Outros Insumos")).toBe(false);
    expect(categoriaControlaSaldoPorPadrao("Ferramentas")).toBe(false);
    expect(categoriaControlaSaldoPorPadrao("Epis")).toBe(false);
    expect(categoriaControlaSaldoPorPadrao("Outros Insumos")).toBe(false);
  });

  it("Combustíveis não controlam saldo por padrão (configurável por fazenda)", () => {
    expect(categoriaControlaSaldoPorPadrao("Combustíveis")).toBe(false);
    expect(categoriaExigeEstocavelCombustivel("Combustíveis")).toBe(true);
  });

  it("legado sem flag continua controlando saldo", () => {
    expect(produtoControlaSaldo(undefined)).toBe(true);
    expect(produtoControlaSaldo(null)).toBe(true);
  });

  it("consumo direto explícito não controla saldo", () => {
    expect(produtoControlaSaldo(false)).toBe(false);
  });
});
