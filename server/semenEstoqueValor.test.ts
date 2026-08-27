import { describe, expect, it } from "vitest";
import { formatMoedaBrlExcel } from "../shared/parseMoedaBr";
import {
  calcularValorAtualEstoqueSemen,
  calcularValorEstoqueSemen,
  formatValorAtualEstoqueSemenDisplay,
  formatValorEstoqueSemenDisplay,
  formatValorTotalEstoqueSemenDisplay,
  somarValorEstoqueSemen,
} from "../shared/semenEstoqueValor";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
  SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
} from "../shared/semenEstoque";
import type { SemenLedgerMovimento } from "../shared/semenEstoqueLedger";

describe("calcularValorEstoqueSemen", () => {
  it("A) 3 × 150 = 450", () => {
    expect(calcularValorEstoqueSemen(3, "150.00")).toBe(450);
    expect(formatValorEstoqueSemenDisplay(3, "150.00")).toBe(formatMoedaBrlExcel(450));
    expect(formatValorEstoqueSemenDisplay(3, "150.00")).toBe("R$ 450,00");
  });

  it("B) saldo zero → 0 mesmo com custo/dose histórico", () => {
    expect(calcularValorEstoqueSemen(0, "100.00")).toBe(0);
    expect(formatValorEstoqueSemenDisplay(0, "100.00")).toBe("R$ 0,00");
  });

  it("C) 9 × 133,33 = 1.199,97 com precisão de centavos", () => {
    expect(calcularValorEstoqueSemen(9, "133.33")).toBe(1199.97);
    expect(formatValorEstoqueSemenDisplay(9, "133.33")).toBe("R$ 1.199,97");
  });

  it("4 × 200 = 800", () => {
    expect(calcularValorEstoqueSemen(4, 200)).toBe(800);
    expect(formatValorEstoqueSemenDisplay(4, "200.00")).toBe("R$ 800,00");
  });

  it("custo ausente com saldo positivo → 0", () => {
    expect(calcularValorEstoqueSemen(5, null)).toBe(0);
    expect(calcularValorEstoqueSemen(5, "")).toBe(0);
  });
});

describe("somarValorEstoqueSemen", () => {
  it("D) total filtrado soma todas as partidas", () => {
    expect(
      somarValorEstoqueSemen([
        { saldoDoses: 3, custoUnitario: "150.00" },
        { saldoDoses: 4, custoUnitario: "200.00" },
      ]),
    ).toBe(1250);
    expect(
      formatValorTotalEstoqueSemenDisplay([
        { saldoDoses: 3, custoUnitario: "150.00" },
        { saldoDoses: 4, custoUnitario: "200.00" },
      ]),
    ).toBe("R$ 1.250,00");
  });

  it("E) total ignora paginação — usa o conjunto completo", () => {
    const filtrados = Array.from({ length: 12 }, () => ({
      saldoDoses: 1,
      custoUnitario: "10.00",
    }));
    expect(somarValorEstoqueSemen(filtrados.slice(0, 10))).toBe(100);
    expect(somarValorEstoqueSemen(filtrados)).toBe(120);
  });

  it("lista vazia → R$ 0,00", () => {
    expect(somarValorEstoqueSemen([])).toBe(0);
    expect(formatValorTotalEstoqueSemenDisplay([])).toBe("R$ 0,00");
  });

  it("F) soma o valor contábil atual de cada partida, não o custo visual", () => {
    expect(
      somarValorEstoqueSemen([
        { saldoDoses: 3, custoUnitario: "83.33", valorAtualEstoque: 250 },
        { saldoDoses: 2, custoUnitario: "100.00", valorAtualEstoque: 200 },
      ]),
    ).toBe(450);
  });
});

describe("calcularValorAtualEstoqueSemen", () => {
  const original: SemenLedgerMovimento = {
    id: 1,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    quantidadeDoses: 4,
    custoTotal: "400.00",
    createdAt: "2026-08-20T10:00:00.000Z",
    dataEntrada: "2026-08-20",
    movimentacaoOrigemId: null,
  };
  const estorno: SemenLedgerMovimento = {
    id: 2,
    tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
    quantidadeDoses: 4,
    custoTotal: "400.00",
    createdAt: "2026-08-26T15:00:00.000Z",
    dataEntrada: "2026-08-26",
    movimentacaoOrigemId: 1,
  };
  const nova: SemenLedgerMovimento = {
    id: 3,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    quantidadeDoses: 4,
    custoTotal: "300.00",
    createdAt: "2026-08-26T15:00:01.000Z",
    dataEntrada: "2026-08-20",
    movimentacaoOrigemId: 1,
  };
  const recente: SemenLedgerMovimento = {
    id: 4,
    tipo: SEMEN_MOV_TIPO_ENTRADA,
    quantidadeDoses: 2,
    custoTotal: "200.00",
    createdAt: "2026-08-26T09:00:00.000Z",
    dataEntrada: "2026-08-26",
    movimentacaoOrigemId: null,
  };
  const saidasTres: SemenLedgerMovimento[] = [5, 6, 7].map(id => ({
    id,
    tipo: SEMEN_MOV_TIPO_SAIDA_IA,
    quantidadeDoses: 1,
    custoTotal: "83.33",
    createdAt: `2026-08-26T16:00:0${id}.000Z`,
    dataEntrada: "2026-08-26",
    movimentacaoOrigemId: null,
  }));
  const saidasCinco: SemenLedgerMovimento[] = [5, 6, 7, 8, 9].map(id => ({
    id,
    tipo: SEMEN_MOV_TIPO_SAIDA_IA,
    quantidadeDoses: 1,
    custoTotal: "83.33",
    createdAt: `2026-08-26T16:00:0${id}.000Z`,
    dataEntrada: "2026-08-26",
    movimentacaoOrigemId: null,
  }));

  it("D) 6 doses válidas = R$ 500,00 mesmo com custo médio visual 83,33", () => {
    const ledger = [original, estorno, nova, recente];
    expect(calcularValorAtualEstoqueSemen(ledger)).toBe(500);
    expect(calcularValorEstoqueSemen(6, "83.33")).toBe(499.98);
    expect(formatValorAtualEstoqueSemenDisplay(500)).toBe("R$ 500,00");
  });

  it("B) após 3 consumos resta R$ 250,00 — não 3 × 83,33", () => {
    const ledger = [original, estorno, nova, recente, ...saidasTres];
    expect(calcularValorAtualEstoqueSemen(ledger)).toBe(250);
    expect(calcularValorEstoqueSemen(3, "83.33")).toBe(249.99);
    expect(formatValorAtualEstoqueSemenDisplay(250)).toBe("R$ 250,00");
  });

  it("E) uma dose restante arredonda só no final", () => {
    const ledger = [original, estorno, nova, recente, ...saidasCinco];
    expect(calcularValorAtualEstoqueSemen(ledger)).toBe(83.33);
  });

  it("ajuste de valor SET o consolidado sem reescrever saídas anteriores", () => {
    const entrada: SemenLedgerMovimento = {
      id: 1,
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      quantidadeDoses: 9,
      custoTotal: "1250.01",
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    const saidas: SemenLedgerMovimento[] = [2, 3, 4].map(id => ({
      id,
      tipo: SEMEN_MOV_TIPO_SAIDA_IA,
      quantidadeDoses: 1,
      custoTotal: "138.89",
      custoUnitario: "138.89",
      createdAt: `2026-08-26T11:00:0${id}.000Z`,
    }));
    const ajuste: SemenLedgerMovimento = {
      id: 5,
      tipo: SEMEN_MOV_TIPO_AJUSTE_ESTOQUE,
      quantidadeDoses: 6,
      custoTotal: "540.00",
      custoUnitario: "90.00",
      createdAt: "2026-08-26T18:00:00.000Z",
    };
    expect(calcularValorAtualEstoqueSemen([entrada, ...saidas])).toBe(833.34);
    expect(calcularValorAtualEstoqueSemen([entrada, ...saidas, ajuste])).toBe(540);
  });

  it("entrada 9 doses / R$ 1.200 permanece R$ 1.200,00", () => {
    expect(
      calcularValorAtualEstoqueSemen([
        {
          id: 1,
          tipo: SEMEN_MOV_TIPO_ENTRADA,
          quantidadeDoses: 9,
          custoTotal: "1200.00",
          createdAt: "2026-08-20T10:00:00.000Z",
        },
      ]),
    ).toBe(1200);
    expect(calcularValorEstoqueSemen(9, "133.33")).toBe(1199.97);
  });
});
