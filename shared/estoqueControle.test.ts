import { describe, expect, it } from "vitest";
import {
  categoriaControlaSaldoPorPadrao,
  produtoControlaSaldo,
} from "./estoqueControle";

describe("estoqueControle", () => {
  it("Farmácia e Nutricionais controlam saldo por padrão", () => {
    expect(categoriaControlaSaldoPorPadrao("Farmácia")).toBe(true);
    expect(categoriaControlaSaldoPorPadrao("Nutricionais")).toBe(true);
  });

  it("Peças e Lubrificantes não controlam saldo por padrão", () => {
    expect(categoriaControlaSaldoPorPadrao("Peças")).toBe(false);
    expect(categoriaControlaSaldoPorPadrao("Lubrificantes")).toBe(false);
  });

  it("legado sem flag continua controlando saldo", () => {
    expect(produtoControlaSaldo(undefined)).toBe(true);
    expect(produtoControlaSaldo(null)).toBe(true);
  });

  it("consumo direto explícito não controla saldo", () => {
    expect(produtoControlaSaldo(false)).toBe(false);
  });
});
