import { describe, expect, it } from "vitest";
import { dinheiroIgual, somarDinheiro, toCentavos } from "./financeiroMoeda";
import {
  calcularSaldoConta,
  caixaDaAlocacao,
  derivarApropriacao,
  derivarSaldoParcela,
  montarAlcanceTitulosLiquidacao,
  retryEstornoBateComPedido,
  retryPagamentoBateComPedido,
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

  it("origem manutencao exige OS e chave oficina", () => {
    const r = validarOrigemTitulo({
      origemTipo: "manutencao",
      origemId: 54,
      origemItemChave: "oficina",
    });
    expect(r).toEqual({
      ok: true,
      origemTipo: "manutencao",
      origemId: 54,
      origemItemChave: "oficina",
    });
  });

  it("retry de estorno só vale para o mesmo usuário, tipo de estorno e liquidação original", () => {
    const existente = { userId: 10, tipo: "estorno_pagamento", liquidacaoOriginalId: 11 };
    expect(retryEstornoBateComPedido(existente, { userId: 10, liquidacaoId: 11 })).toBe(true);
    expect(retryEstornoBateComPedido({ ...existente, tipo: "pagamento" }, { userId: 10, liquidacaoId: 11 })).toBe(false);
    expect(retryEstornoBateComPedido(existente, { userId: 10, liquidacaoId: 12 })).toBe(false);
    expect(retryEstornoBateComPedido(existente, { userId: 99, liquidacaoId: 11 })).toBe(false);
  });

  it("retry de pagamento compara a identidade persistida com o pedido", () => {
    const existente = {
      userId: 10,
      tipo: "pagamento",
      contaId: 3,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: "4000.00",
      formaPagamento: null,
      referencia: null,
      observacoes: null,
    };
    const alocs = [{ parcelaId: 1, principalLiquidado: "4000.00", desconto: "0.00", juros: "0.00", multa: "0.00" }];
    const pedido = {
      userId: 10,
      tipo: "pagamento" as const,
      contaId: 3,
      dataLiquidacao: "2026-03-02",
      valorMovimentado: 4000,
      alocacoes: [{ parcelaId: 1, principalLiquidado: 4000 }],
    };
    expect(retryPagamentoBateComPedido(existente, alocs, pedido)).toBe(true);
    expect(retryPagamentoBateComPedido(existente, alocs, { ...pedido, valorMovimentado: 5000 })).toBe(false);
    expect(retryPagamentoBateComPedido(existente, alocs, { ...pedido, contaId: 9 })).toBe(false);
    expect(retryPagamentoBateComPedido(existente, alocs, { ...pedido, tipo: "recebimento" })).toBe(false);
    expect(retryPagamentoBateComPedido(existente, alocs, {
      ...pedido,
      alocacoes: [{ parcelaId: 1, principalLiquidado: 4000, juros: 10 }],
    })).toBe(false);
  });

  it("alcance da liquidação agrupa títulos, inclusive caixa zero", () => {
    const alcance = montarAlcanceTitulosLiquidacao({
      alocacoes: [
        { parcelaId: 1, principalLiquidado: 40 },
        { parcelaId: 2, principalLiquidado: 60 },
        { parcelaId: 3, principalLiquidado: 50, desconto: 50 },
      ],
      parcelas: [
        { id: 1, tituloId: 1 },
        { id: 2, tituloId: 1 },
        { id: 3, tituloId: 2 },
      ],
      titulos: [
        { id: 1, descricao: "Título A" },
        { id: 2, descricao: "Título B" },
      ],
    });
    expect(alcance.alcanceCompleto).toBe(true);
    expect(alcance.quantidadeTitulosNaLiquidacao).toBe(2);
    expect(alcance.titulosNaLiquidacao).toEqual([
      { tituloId: 1, descricao: "Título A", valorAlocado: 100 },
      { tituloId: 2, descricao: "Título B", valorAlocado: 0 },
    ]);
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
