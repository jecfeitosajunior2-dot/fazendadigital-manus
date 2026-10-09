import { describe, expect, it } from "vitest";
import { dinheiroIgual, somarDinheiro, toCentavos } from "./financeiroMoeda";
import {
  calcularSaldoConta,
  caixaDaAlocacao,
  derivarApropriacao,
  derivarSaldoParcela,
  validarOrigemTitulo,
  validarSomaParcelas,
} from "./financeiroNucleo";

describe("financeiroMoeda / domínio puro", () => {
  it("soma em centavos sem erro binário", () => {
    expect(somarDinheiro(10.1, 0.2)).toBe(10.3);
    expect(toCentavos("10.20")).toBe(1020);
    expect(dinheiroIgual("10.20", 10.2)).toBe(true);
  });

  it("CASO A — soma das parcelas fecha o título", () => {
    expect(validarSomaParcelas(30000, [
      { valorOriginal: 10000 },
      { valorOriginal: 10000 },
      { valorOriginal: 10000 },
    ])).toBe(true);
  });

  it("CASO C/D — fórmula de caixa", () => {
    expect(caixaDaAlocacao({ principalLiquidado: 10000, juros: 200 })).toBe(10200);
    expect(caixaDaAlocacao({ principalLiquidado: 10000, desconto: 200 })).toBe(9800);
  });

  it("CASO M — saldo derivado", () => {
    expect(calcularSaldoConta({
      saldoAbertura: 50000,
      movimentos: [
        { direcao: "entrada", valor: 10000 },
        { direcao: "saida", valor: 7000 },
      ],
    })).toBe(53000);
  });

  it("estorno devolve o saldo da parcela", () => {
    const saldo = derivarSaldoParcela(10000, [
      { tipoLiquidacao: "pagamento", principalLiquidado: 4000 },
      { tipoLiquidacao: "estorno_pagamento", principalLiquidado: 4000 },
    ]);
    expect(saldo.saldoPrincipal).toBe(10000);
    expect(saldo.quitada).toBe(false);
  });

  it("origem automática sem chave é inválida", () => {
    const r = validarOrigemTitulo({ origemTipo: "compra_animais", origemId: 15, origemItemChave: null });
    expect(r.ok).toBe(false);
  });

  it("apropriação pendente e completa são derivadas", () => {
    const parcial = derivarApropriacao(10000, [{ valor: 7000 }]);
    expect(parcial.valorApropriado).toBe(7000);
    expect(parcial.valorPendenteApropriacao).toBe(3000);
    expect(parcial.apropriacaoCompleta).toBe(false);
    const completa = derivarApropriacao(10000, [{ valor: 7000 }, { valor: 3000 }]);
    expect(completa.apropriacaoCompleta).toBe(true);
  });

  it("título manual não exige origem_id", () => {
    const r = validarOrigemTitulo({ origemTipo: "manual" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.origemId).toBeNull();
      expect(r.origemItemChave).toBeNull();
    }
  });
});
