import { describe, expect, it } from "vitest";
import {
  calcularPreviewFornecimento,
  formatarDataHoraFornecimento,
  formatarOferecidoPorCabeca,
  labelOrigemOperacionalForn,
  oferecidoPorCabeca,
  rotuloVinculoPlanejamentoForn,
  tooltipVinculoPlanejamentoForn,
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

describe("vínculo histórico com planejamento — independente da origem operacional", () => {
  it("A: direto com planejamento → Vinculado + Direto", () => {
    expect(rotuloVinculoPlanejamentoForn(7)).toBe("Vinculado");
    expect(labelOrigemOperacionalForn("direta")).toBe("Direto");
    expect(tooltipVinculoPlanejamentoForn({
      planejamentoId: 7,
      loteNome: "B01",
      planejamentoMetaSnapshot: "100 g/cab/dia",
    })).toBe("Planejamento do lote B01 · Meta: 100 g/cab/dia");
  });

  it("B: direto sem planejamento → Sem planejamento + Direto", () => {
    expect(rotuloVinculoPlanejamentoForn(null)).toBe("Sem planejamento");
    expect(rotuloVinculoPlanejamentoForn(undefined)).toBe("Sem planejamento");
    expect(labelOrigemOperacionalForn("direta")).toBe("Direto");
    expect(tooltipVinculoPlanejamentoForn({ planejamentoId: null, loteNome: "B01" })).toBeUndefined();
  });

  it("C: batida com planejamento → Vinculado + Batida", () => {
    expect(rotuloVinculoPlanejamentoForn(20)).toBe("Vinculado");
    expect(labelOrigemOperacionalForn("batida")).toBe("Batida");
  });

  it("D: batida sem planejamento → Sem planejamento + Batida", () => {
    expect(rotuloVinculoPlanejamentoForn(null)).toBe("Sem planejamento");
    expect(labelOrigemOperacionalForn("batida")).toBe("Batida");
  });

  it("E: estornado mantém o vínculo histórico do planejamentoId", () => {
    const estornadoComVinculo = { status: "estornado", planejamentoId: 8 };
    const estornadoSemVinculo = { status: "estornado", planejamentoId: null };
    expect(rotuloVinculoPlanejamentoForn(estornadoComVinculo.planejamentoId)).toBe("Vinculado");
    expect(rotuloVinculoPlanejamentoForn(estornadoSemVinculo.planejamentoId)).toBe("Sem planejamento");
  });

  it("F: planejamento encerrado/cancelado depois não muda o rótulo histórico", () => {
    const planejamentoIdGravado = 7;
    const statusAtualDoPlano = "encerrado";
    expect(statusAtualDoPlano).toBe("encerrado");
    expect(rotuloVinculoPlanejamentoForn(planejamentoIdGravado)).toBe("Vinculado");
  });

  it("G: planejamentoId null nunca é inferido retroativamente", () => {
    const planejamentoCompativelHoje = { id: 99, loteId: 1, produtoId: 10 };
    expect(planejamentoCompativelHoje.id).toBe(99);
    expect(rotuloVinculoPlanejamentoForn(null)).toBe("Sem planejamento");
  });
});

describe("formatarOferecidoPorCabeca — unidade da apresentação", () => {
  it("A: 0,6 kg / 6 cab com meta g/cab/dia → 100 g", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.6,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "g_cab_dia",
    })).toBe("100 g");
  });

  it("B: 0,75 kg / 6 cab com meta g/cab/dia → 125 g", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.75,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "g_cab_dia",
    })).toBe("125 g");
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.3,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "g_cab_dia",
    })).toBe("50 g");
  });

  it("C: 12 kg / 6 cab com meta kg/cab/dia → 2 kg", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 12,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "kg_cab_dia",
    })).toBe("2 kg");
  });

  it("D: % PV continua quantidade física em kg", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.6,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "pct_pv_dia",
    })).toBe("0,1 kg");
  });

  it("E: ad libitum continua em kg", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 12,
      populacao: 6,
      planejamentoId: 8,
      modalidadeSnapshot: "ad_libitum",
    })).toBe("2 kg");
  });

  it("F: sem planejamento fica em kg, mesmo com modalidade compatível no ar", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.6,
      populacao: 6,
      planejamentoId: null,
      modalidadeSnapshot: "g_cab_dia",
    })).toBe("0,1 kg");
  });

  it("G: população 0 não divide e não inventa valor", () => {
    expect(formatarOferecidoPorCabeca({
      quantidadeKg: 0.6,
      populacao: 0,
      planejamentoId: 7,
      modalidadeSnapshot: "g_cab_dia",
    })).toBe("—");
  });

  it("H: estorno não reinterpretar a quantidade histórica", () => {
    const historico = {
      quantidadeKg: 0.6,
      populacao: 6,
      planejamentoId: 7,
      modalidadeSnapshot: "g_cab_dia" as const,
      status: "estornado",
    };
    expect(historico.status).toBe("estornado");
    expect(formatarOferecidoPorCabeca(historico)).toBe("100 g");
  });

  it("caso homologado: 0,6 kg / 6 cab / 100 g/cab/dia → 100 g, sem /dia", () => {
    const texto = formatarOferecidoPorCabeca({
      quantidadeKg: 0.6,
      populacao: 6,
      planejamentoId: 1,
      modalidadeSnapshot: "g_cab_dia",
    });
    expect(texto).toBe("100 g");
    expect(texto).not.toContain("/dia");
    expect(texto).not.toContain("0,10");
  });
});
