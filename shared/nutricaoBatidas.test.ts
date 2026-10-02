import { describe, expect, it } from "vitest";
import {
  alocarCustoBatidaNoFornecimento,
  batidaDisponivelParaDistribuicao,
  calcularPreviewBatida,
  calcularQuantidadeDistribuidaKg,
  calcularSaldoBatida,
  escalarIngredientesDieta,
  MSG_BATIDA_DIETA,
  MSG_BATIDA_DIETA_FAZENDA,
  MSG_BATIDA_QTD,
  MSG_BATIDA_SALDO,
  podeEstornarBatida,
  situacaoDistribuicaoBatida,
  validarBatidaInput,
} from "./nutricaoBatidas";
import { type NutricaoFornEstoqueRef } from "./nutricaoFornecimentos";
import { MSG_CONVERSAO_KG_INDISPONIVEL } from "./estoqueConversaoKg";
import { MSG_BATIDA_DIETA_PRONTA, MSG_DIETA_PRODUTO_FAZENDA } from "./nutricaoDietas";

const dieta = {
  id: 5, userId: 10, fazendaId: 1, nome: "Engorda 1", status: "ativa" as const,
  dataInicio: null, dataFim: null, baseQuantidade: 500,
  ingredientes: [
    { produtoId: 10, quantidadeKg: 300 },
    { produtoId: 11, quantidadeKg: 150 },
    { produtoId: 12, quantidadeKg: 50 },
  ],
};

const produtosPorId = new Map<number, NutricaoFornEstoqueRef>([
  [10, { estoqueId: 100, produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "1.00", quantidade: "1000", controlarSaldo: true, vinculadoFazenda: true }],
  [11, { estoqueId: 101, produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "2.00", quantidade: "800", controlarSaldo: true, vinculadoFazenda: true }],
  [12, { estoqueId: 102, produtoId: 12, nome: "Núcleo", unidade: "kg", valorUnitario: "4.00", quantidade: "400", controlarSaldo: true, vinculadoFazenda: true }],
]);

describe("escala e saldo da batida", () => {
  it("8/9: escala a receita sem exigir base 1000", () => {
    const ings = escalarIngredientesDieta(dieta, 1000);
    expect(ings.map(i => i.quantidadeKg)).toEqual([600, 300, 100]);
    expect(ings.map(i => i.proporcao)).toEqual([0.6, 0.3, 0.1]);
  });

  it("25/26: distribuída inicia em zero e saldo = preparada", () => {
    expect(calcularQuantidadeDistribuidaKg([])).toBe(0);
    expect(calcularSaldoBatida(1000, 0)).toBe(1000);
    expect(situacaoDistribuicaoBatida(1000, 0)).toBe("disponivel");
  });

  it("27/28: dois fornecimentos somam distribuição", () => {
    const dist = calcularQuantidadeDistribuidaKg([
      { quantidadeFornecidaKg: 600, status: "confirmado" },
      { quantidadeFornecidaKg: 300, status: "confirmado" },
      { quantidadeFornecidaKg: 50, status: "estornado" },
    ]);
    expect(dist).toBe(900);
    expect(calcularSaldoBatida(1000, dist)).toBe(100);
    expect(situacaoDistribuicaoBatida(1000, dist)).toBe("parcial");
    expect(situacaoDistribuicaoBatida(1000, 1000)).toBe("total");
  });
});

describe("validação e preview", () => {
  it("2/6/7: dieta obrigatória e quantidade inválida", () => {
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 0, data: "2026-10-01", quantidadePreparadaKg: 1000 },
      { hojeISO: "2026-10-01", produtosPorId },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_DIETA });
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 0 },
      { dieta, produtosPorId, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_QTD });
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: -10 },
      { dieta, produtosPorId, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_QTD });
  });

  it("3: dieta de outra fazenda bloqueada", () => {
    expect(validarBatidaInput(
      { fazendaId: 2, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta, produtosPorId, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_DIETA_FAZENDA });
  });

  it("5: dieta inativa bloqueada", () => {
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta: { ...dieta, status: "inativa" }, produtosPorId, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_DIETA });
  });

  it("10: produto sem vínculo bloqueia", () => {
    const sem = new Map(produtosPorId);
    sem.delete(12);
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta, produtosPorId: sem, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_DIETA_PRODUTO_FAZENDA });
  });

  it("11: unidade incompatível bloqueia", () => {
    const uns = new Map(produtosPorId);
    uns.set(10, { ...produtosPorId.get(10)!, unidade: "sc" });
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta, produtosPorId: uns, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_CONVERSAO_KG_INDISPONIVEL });
  });

  it("12: um ingrediente insuficiente bloqueia a batida inteira", () => {
    const baixo = new Map(produtosPorId);
    baixo.set(12, { ...produtosPorId.get(12)!, quantidade: "10" });
    const prev = calcularPreviewBatida({ quantidadePreparadaKg: 1000, dieta, produtosPorId: baixo });
    expect(prev.podeConfirmar).toBe(false);
    expect(prev.motivoBloqueio).toBe(MSG_BATIDA_SALDO);
  });

  it("20/21: custo completo calcula total e kg", () => {
    const prev = calcularPreviewBatida({ quantidadePreparadaKg: 1000, dieta, produtosPorId });
    expect(prev.podeConfirmar).toBe(true);
    expect(prev.custo.completo).toBe(true);
    expect(prev.custo.custoTotal).toBe(1600);
    expect(prev.custo.custoPorKg).toBe(1.6);
  });

  it("22/23: custo desconhecido não vira zero e ainda permite se houver saldo", () => {
    const semCusto = new Map(produtosPorId);
    semCusto.set(12, { ...produtosPorId.get(12)!, valorUnitario: null });
    const prev = calcularPreviewBatida({ quantidadePreparadaKg: 1000, dieta, produtosPorId: semCusto });
    expect(prev.podeConfirmar).toBe(true);
    expect(prev.custo.completo).toBe(false);
    expect(prev.custo.custoTotal).toBeNull();
    expect(prev.baixas.find(b => b.produtoId === 12)?.custoTotal).toBeNull();
  });
});

describe("regras derivadas", () => {
  it("34/35: estorno só sem fornecimento confirmado", () => {
    expect(podeEstornarBatida("confirmado", 1)).toMatchObject({ ok: false });
    expect(podeEstornarBatida("confirmado", 0).ok).toBe(true);
    expect(podeEstornarBatida("estornado", 0).ok).toBe(false);
  });

  it("40: batida estornada não serve para distribuição", () => {
    expect(batidaDisponivelParaDistribuicao({ status: "estornado", saldoDisponivelKg: 1000 })).toBe(false);
    expect(batidaDisponivelParaDistribuicao({ status: "confirmado", saldoDisponivelKg: 0 })).toBe(false);
    expect(batidaDisponivelParaDistribuicao({ status: "confirmado", saldoDisponivelKg: 100 })).toBe(true);
  });

  it("47: aloca custo proporcional sem nova despesa", () => {
    const out = alocarCustoBatidaNoFornecimento({ custoCompleto: true, custoPorKgSnapshot: 1.5 }, 600);
    expect(out.custoTotal).toBe(900);
    expect(out.completo).toBe(true);
  });

  it("48: custo incompleto permanece incompleto", () => {
    const out = alocarCustoBatidaNoFornecimento({ custoCompleto: false, custoPorKgSnapshot: null }, 600);
    expect(out.completo).toBe(false);
    expect(out.custoTotal).toBeNull();
  });
});

describe("forma de uso — batida", () => {
  it("E: dieta pronta para fornecer é bloqueada", () => {
    const out = validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta: { ...dieta, formaUso: "pronta_fornecer" }, produtosPorId, hojeISO: "2026-10-01" },
    );
    expect(out).toMatchObject({ ok: false, message: MSG_BATIDA_DIETA_PRONTA });
  });

  it("F: 1 ingrediente + preparo obrigatório pode gerar batida", () => {
    const uma = {
      ...dieta,
      formaUso: "preparo_obrigatorio",
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 10, quantidadeKg: 30 }],
    };
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 30 },
      { dieta: uma, produtosPorId, hojeISO: "2026-10-01" },
    )).toEqual({ ok: true });
  });

  it("G: 2 ingredientes + pronta para fornecer é bloqueada", () => {
    const duas = {
      ...dieta,
      formaUso: "pronta_fornecer",
      baseQuantidade: 100,
      ingredientes: [
        { produtoId: 10, quantidadeKg: 60 },
        { produtoId: 11, quantidadeKg: 40 },
      ],
    };
    expect(validarBatidaInput(
      { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
      { dieta: duas, produtosPorId, hojeISO: "2026-10-01" },
    )).toMatchObject({ ok: false, message: MSG_BATIDA_DIETA_PRONTA });
  });

  it("C/D: opcional, obrigatório e legado null podem gerar batida", () => {
    for (const formaUso of ["preparo_opcional", "preparo_obrigatorio", null, undefined] as const) {
      expect(validarBatidaInput(
        { fazendaId: 1, dietaId: 5, data: "2026-10-01", quantidadePreparadaKg: 100 },
        { dieta: { ...dieta, formaUso }, produtosPorId, hojeISO: "2026-10-01" },
      )).toEqual({ ok: true });
    }
  });
});
