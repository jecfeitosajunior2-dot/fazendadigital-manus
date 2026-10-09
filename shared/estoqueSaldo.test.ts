import { describe, expect, it } from "vitest";
import { aplicarTransferenciaCapital } from "./estoqueCapital";
import { decidirPatchSaldo, valorEntradaCapitalizavel } from "./estoqueSaldo";

const iniciado = { capitalInicializadoEm: new Date("2026-10-01") };

describe("estoqueSaldo — writers no motor único", () => {
  it("Nutrição / consumo interno retira quantidade e capital juntos", () => {
    const r = decidirPatchSaldo(
      { quantidade: 10, valorTotalEstoque: 100, controlarSaldo: true, ...iniciado },
      { tipoOp: "saida", quantidade: 2 },
    );
    expect(r.usaCapital).toBe(true);
    expect(r.quantidade).toBe("8.00");
    expect(r.valorTotalEstoque).toBe("80.00");
    expect(r.valorEstoqueMovimentado).toBe("20.00");
  });

  it("Abastecimento / perda retira capital proporcional", () => {
    const r = decidirPatchSaldo(
      { quantidade: 50.98, valorTotalEstoque: 6605.28, controlarSaldo: true, ...iniciado },
      { tipoOp: "saida", quantidade: 0.5 },
    );
    expect(Number(r.valorTotalEstoque)).toBeLessThan(6605.28);
    expect(Number(r.valorEstoqueMovimentado)).toBeGreaterThan(0);
  });

  it("Manutenção / sanitário usam a mesma saída", () => {
    const r = decidirPatchSaldo(
      { quantidade: 5, valorTotalEstoque: 25, controlarSaldo: true, ...iniciado },
      { tipoOp: "saida", quantidade: 1 },
    );
    expect(r.valorTotalEstoque).toBe("20.00");
    expect(r.valorEstoqueMovimentado).toBe("5.00");
  });

  it("Ajuste de saída retira capital", () => {
    const r = decidirPatchSaldo(
      { quantidade: 10, valorTotalEstoque: 100, controlarSaldo: true, ...iniciado },
      { tipoOp: "saida", quantidade: 3 },
    );
    expect(r).toMatchObject({ quantidade: "7.00", valorTotalEstoque: "70.00" });
  });

  it("Ajuste de entrada sem valor não inventa capital", () => {
    expect(valorEntradaCapitalizavel("Ajuste de entrada", 999)).toBe(0);
    const r = decidirPatchSaldo(
      { quantidade: 10, valorTotalEstoque: 100, controlarSaldo: true, ...iniciado },
      { tipoOp: "entrada", quantidade: 2, valorInformado: 999, tipoMov: "Ajuste de entrada" },
    );
    expect(r.quantidade).toBe("12.00");
    expect(r.valorTotalEstoque).toBe("100.00");
    expect(r.valorEstoqueMovimentado).toBe("0.00");
  });

  it("Produção própria sem valor incrementa capital zero", () => {
    const r = decidirPatchSaldo(
      { quantidade: 10, valorTotalEstoque: 1000, controlarSaldo: true, ...iniciado },
      { tipoOp: "entrada", quantidade: 2, tipoMov: "Produção própria" },
    );
    expect(r.valorTotalEstoque).toBe("1000.00");
    expect(r.valorEstoqueMovimentado).toBe("0.00");
  });

  it("Produção própria com valor recebe o valor", () => {
    const r = decidirPatchSaldo(
      { quantidade: 10, valorTotalEstoque: 1000, controlarSaldo: true, ...iniciado },
      { tipoOp: "entrada", quantidade: 2, valorInformado: 80, tipoMov: "Produção própria" },
    );
    expect(r.valorTotalEstoque).toBe("1080.00");
  });

  it("legado permanece qtd × médio quando capital não está inicializado", () => {
    const r = decidirPatchSaldo(
      { quantidade: 49.98, valorUnitario: 129.57, controlarSaldo: true },
      { tipoOp: "entrada", quantidade: 1, valorInformado: 139.37, tipoMov: "Compra" },
    );
    expect(r.usaCapital).toBe(false);
    expect(r.valorTotalEstoque).toBeUndefined();
    expect(r.quantidade).toBe("50.98");
  });
});

describe("estoqueSaldo — transferência pura", () => {
  it("A — origem 10/100 transfere 3 → 7/70 e destino +3/+30", () => {
    const r = aplicarTransferenciaCapital({ quantidade: 10, capital: 100 }, { quantidade: 0, capital: 0 }, 3);
    expect(r.origem).toMatchObject({ quantidade: 7, capital: 70 });
    expect(r.destino).toMatchObject({ quantidade: 3, capital: 30 });
    expect(r.valorTransferido).toBe(30);
  });

  it("B — destino 5/80 recebe 3/30 → 8/110", () => {
    const r = aplicarTransferenciaCapital({ quantidade: 10, capital: 100 }, { quantidade: 5, capital: 80 }, 3);
    expect(r.destino).toMatchObject({ quantidade: 8, capital: 110 });
  });

  it("C — mesmo capital sai e entra", () => {
    const r = aplicarTransferenciaCapital({ quantidade: 10, capital: 1000 }, { quantidade: 1, capital: 10 }, 2);
    expect(r.origem.valorMovimentado).toBe(r.destino.valorMovimentado);
    expect(r.origem.valorMovimentado).toBe(200);
  });

  it("G — última saída da origem zera quantidade e capital", () => {
    const r = aplicarTransferenciaCapital({ quantidade: 3, capital: 0.03 }, { quantidade: 0, capital: 0 }, 3);
    expect(r.origem).toMatchObject({ quantidade: 0, capital: 0 });
    expect(r.valorTransferido).toBe(0.03);
  });
});
