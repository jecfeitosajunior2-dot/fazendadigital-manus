import { describe, expect, it } from "vitest";
import {
  calcularPreviewFornecimento,
  formatarDataHoraFornecimento,
  oferecidoPorCabeca,
  validarFornecimentoInput,
  MSG_FORN_ORIGEM_AMBOS,
  MSG_FORN_SALDO,
  MSG_FORN_SALDO_DIETA,
} from "./nutricaoFornecimentos";
import { kgParaQuantidadeUnidade } from "./nutricaoDietas";

const lote = { id: 1, fazendaId: 1 };
const produto = {
  estoqueId: 100,
  produtoId: 10,
  nome: "Sal mineral",
  unidade: "kg",
  valorUnitario: "3.20",
  quantidade: "50",
  controlarSaldo: true,
  vinculadoFazenda: true,
};
const dieta = {
  id: 5, userId: 10, fazendaId: 1, nome: "Mineral 90", status: "ativa" as const,
  dataInicio: null, dataFim: null, baseQuantidade: 1000,
  ingredientes: [
    { produtoId: 10, quantidadeKg: 600 },
    { produtoId: 11, quantidadeKg: 250 },
    { produtoId: 12, quantidadeKg: 150 },
  ],
};

describe("datas civis e kg/cabeça", () => {
  it("34: formata data/hora sem UTC", () => {
    expect(formatarDataHoraFornecimento("2026-06-03", null)).toBe("03/06/2026");
    expect(formatarDataHoraFornecimento("2026-06-03", "06:30")).toBe("03/06/2026 06:30");
  });

  it("19: população zero não divide", () => {
    expect(oferecidoPorCabeca(10, 0)).toBeNull();
    expect(oferecidoPorCabeca(10, 100)).toBe(0.1);
  });

  it("converte kg → g sem fator inventado", () => {
    expect(kgParaQuantidadeUnidade(15, "g")).toBe(15000);
    expect(kgParaQuantidadeUnidade(15, "sc")).toBeNull();
  });
});

describe("validação e preview", () => {
  it("bloqueia produto e dieta juntos", () => {
    const out = validarFornecimentoInput(
      {
        fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10, dietaId: 5,
        data: "2026-10-01", quantidadeFornecidaKg: 12,
      },
      { lote, produto, dieta, hojeISO: "2026-10-01" },
    );
    expect(out).toMatchObject({ ok: false, message: MSG_FORN_ORIGEM_AMBOS });
  });

  it("4/7: produto insuficiente bloqueia", () => {
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 80,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      produto,
    });
    expect(prev.podeConfirmar).toBe(false);
    expect(prev.motivoBloqueio).toBe(MSG_FORN_SALDO);
  });

  it("5/8: dieta baixa proporcional e um ingrediente insuficiente bloqueia tudo", () => {
    const produtosPorId = new Map([
      [10, { ...produto, produtoId: 10, estoqueId: 100, quantidade: "100", valorUnitario: "1.20" }],
      [11, { ...produto, produtoId: 11, estoqueId: 101, nome: "Farelo", quantidade: "100", valorUnitario: "2.10" }],
      [12, { ...produto, produtoId: 12, estoqueId: 102, nome: "Núcleo", quantidade: "10", valorUnitario: "4.00" }],
    ]);
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 100,
      tipoOrigem: "dieta",
      animalIds: [1],
      dieta,
      produtosPorId,
    });
    expect(prev.baixas.map(b => b.quantidadeKg)).toEqual([60, 25, 15]);
    expect(prev.podeConfirmar).toBe(false);
    expect(prev.motivoBloqueio).toBe(MSG_FORN_SALDO_DIETA);
  });

  it("16: custo desconhecido não vira zero", () => {
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 10,
      tipoOrigem: "produto",
      animalIds: [1],
      produto: { ...produto, valorUnitario: null, quantidade: "20" },
    });
    expect(prev.podeConfirmar).toBe(true);
    expect(prev.custo.completo).toBe(false);
    expect(prev.custo.custoTotal).toBeNull();
    expect(prev.custo.mensagem).toMatch(/incompleto/i);
  });

  it("20/21: ad libitum não calcula desvio", () => {
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 100,
      tipoOrigem: "produto",
      animalIds: [1],
      produto: { ...produto, quantidade: "200" },
      planejamento: {
        id: 1, fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10,
        modalidadeMeta: "ad_libitum", status: "ativo", dataInicio: "2026-10-01",
      },
    });
    expect(prev.planejamento?.adLibitum).toBe(true);
    expect(prev.planejamento?.diferencaKg).toBeNull();
  });

  it("batida: preview não baixa e bloqueia acima do saldo", () => {
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 150,
      tipoOrigem: "dieta",
      animalIds: [1],
      origemOperacional: "batida",
      batida: {
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Engorda",
        quantidadePreparadaKg: 1000, quantidadeDistribuidaKg: 900, saldoDisponivelKg: 100,
        status: "confirmado", custoCompleto: true, custoPorKgSnapshot: 1.5, custoTotalSnapshot: 1500,
      },
    });
    expect(prev.baixas).toHaveLength(0);
    expect(prev.podeConfirmar).toBe(false);
  });

  it("22: planejamento quantitativo mostra diferença", () => {
    const prev = calcularPreviewFornecimento({
      quantidadeKg: 12,
      tipoOrigem: "produto",
      animalIds: Array.from({ length: 100 }, (_, i) => i + 1),
      produto: { ...produto, quantidade: "50" },
      planejamento: {
        id: 1, fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10,
        modalidadeMeta: "g_cab_dia", valorMeta: 100, status: "ativo", dataInicio: "2026-10-01",
      },
    });
    expect(prev.planejamento?.necessidadeKg).toBe(10);
    expect(prev.planejamento?.diferencaKg).toBe(2);
    expect(prev.podeConfirmar).toBe(true);
  });
});
