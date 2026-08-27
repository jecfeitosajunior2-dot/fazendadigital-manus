import { describe, expect, it } from "vitest";
import {
  annotateSemenMovimentacoesHistorico,
  assertSemenEntradaElegivelParaCorrecao,
  evaluateSemenCorrecaoEntrada,
  hasSemenCorrecaoAlteracaoReal,
  MSG_SEMEN_CORRECAO_CONSUMO,
  MSG_SEMEN_CORRECAO_JA_CORRIGIDA,
  MSG_SEMEN_CORRECAO_MOTIVO,
  MSG_SEMEN_CORRECAO_MOTIVO_OUTRO,
  MSG_SEMEN_CORRECAO_SAIDA_IA,
  MSG_SEMEN_CORRECAO_SEM_ALTERACAO,
  replaySemenPartidaLedger,
  SEMEN_CORRECAO_MOTIVOS,
  validateSemenCorrecaoMotivo,
  type SemenLedgerMovimento,
} from "../shared/semenEstoqueLedger";
import {
  SEMEN_MOV_TIPO_ENTRADA,
  SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
  SEMEN_MOV_TIPO_SAIDA_IA,
} from "../shared/semenEstoque";

function mov(partial: Partial<SemenLedgerMovimento> & { id: number; tipo: string; quantidadeDoses: number; custoTotal: string | number }): SemenLedgerMovimento {
  return {
    createdAt: `2026-08-20T10:00:0${partial.id}Z`,
    movimentacaoOrigemId: null,
    grupoCorrecaoId: null,
    motivoCorrecao: null,
    ...partial,
  };
}

describe("replaySemenPartidaLedger", () => {
  it("reproduz entrada simples", () => {
    const r = replaySemenPartidaLedger([
      mov({ id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10, custoTotal: "1500.00" }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saldoDoses).toBe(10);
      expect(r.custoUnitario).toBe("150.00");
    }
  });

  it("pula entrada corrigida e aplica a nova no lugar cronológico", () => {
    const r = replaySemenPartidaLedger([
      mov({ id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10, custoTotal: "1500.00" }),
      mov({
        id: 2,
        tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
        quantidadeDoses: 10,
        custoTotal: "1500.00",
        movimentacaoOrigemId: 1,
        createdAt: "2026-08-26T10:00:00Z",
      }),
      mov({
        id: 3,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        quantidadeDoses: 8,
        custoTotal: "1200.00",
        movimentacaoOrigemId: 1,
        createdAt: "2026-08-26T10:00:01Z",
      }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saldoDoses).toBe(8);
      expect(r.custoUnitario).toBe("150.00");
    }
  });

  it("recalcula custo médio com duas entradas após corrigir a segunda", () => {
    const r = replaySemenPartidaLedger([
      mov({ id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10, custoTotal: "1000.00", createdAt: "2026-08-20T10:00:00Z" }),
      mov({ id: 2, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10, custoTotal: "2000.00", createdAt: "2026-08-21T10:00:00Z" }),
      mov({
        id: 3,
        tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
        quantidadeDoses: 10,
        custoTotal: "2000.00",
        movimentacaoOrigemId: 2,
        createdAt: "2026-08-26T10:00:00Z",
      }),
      mov({
        id: 4,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        quantidadeDoses: 10,
        custoTotal: "1800.00",
        movimentacaoOrigemId: 2,
        createdAt: "2026-08-26T10:00:01Z",
      }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.saldoDoses).toBe(20);
      expect(r.custoUnitario).toBe("140.00");
    }
  });

  it("falha se SAIDA_IA ficar sem saldo no replay", () => {
    const r = replaySemenPartidaLedger([
      mov({ id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 5, custoTotal: "500.00", createdAt: "2026-08-20T10:00:00Z" }),
      mov({ id: 2, tipo: SEMEN_MOV_TIPO_SAIDA_IA, quantidadeDoses: 5, custoTotal: "100.00", createdAt: "2026-08-21T10:00:00Z" }),
      mov({
        id: 3,
        tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
        quantidadeDoses: 5,
        custoTotal: "500.00",
        movimentacaoOrigemId: 1,
        createdAt: "2026-08-26T10:00:00Z",
      }),
      mov({
        id: 4,
        tipo: SEMEN_MOV_TIPO_ENTRADA,
        quantidadeDoses: 3,
        custoTotal: "300.00",
        movimentacaoOrigemId: 1,
        createdAt: "2026-08-26T10:00:01Z",
      }),
    ]);
    expect(r.ok).toBe(false);
  });
});

describe("assertSemenEntradaElegivelParaCorrecao", () => {
  it("bloqueia SAIDA_IA", () => {
    const r = assertSemenEntradaElegivelParaCorrecao({
      original: { id: 2, tipo: SEMEN_MOV_TIPO_SAIDA_IA, quantidadeDoses: 1 },
      movimentacoes: [],
      saldoAtual: 9,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_CORRECAO_SAIDA_IA);
  });

  it("bloqueia entrada já corrigida", () => {
    const r = assertSemenEntradaElegivelParaCorrecao({
      original: { id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10 },
      movimentacoes: [{ tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA, movimentacaoOrigemId: 1 }],
      saldoAtual: 10,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_CORRECAO_JA_CORRIGIDA);
  });

  it("bloqueia quando o saldo atual é menor que a quantidade a estornar", () => {
    const r = assertSemenEntradaElegivelParaCorrecao({
      original: { id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 5 },
      movimentacoes: [],
      saldoAtual: 0,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_CORRECAO_CONSUMO);
  });
});

describe("validateSemenCorrecaoMotivo", () => {
  it("exige motivo", () => {
    expect(validateSemenCorrecaoMotivo("").ok).toBe(false);
    const vazio = validateSemenCorrecaoMotivo("");
    if (!vazio.ok) expect(vazio.message).toBe(MSG_SEMEN_CORRECAO_MOTIVO);
  });

  it("exige descrição quando o motivo é Outro", () => {
    expect(validateSemenCorrecaoMotivo("outro", "  ").ok).toBe(false);
    const vazio = validateSemenCorrecaoMotivo("outro", "   ");
    if (!vazio.ok) expect(vazio.message).toBe(MSG_SEMEN_CORRECAO_MOTIVO_OUTRO);
    const ok = validateSemenCorrecaoMotivo("outro", "Nota duplicada na central");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.texto).toBe("Nota duplicada na central");
  });

  it("lista os cinco motivos de negócio na ordem combinada", () => {
    expect(SEMEN_CORRECAO_MOTIVOS.map(m => m.label)).toEqual([
      "Quantidade digitada incorretamente",
      "Valor da nota informado errado",
      "Lançamento duplicado",
      "Data informada incorretamente",
      "Outro",
    ]);
  });

  it("grava o rótulo humano dos motivos pré-definidos", () => {
    const r = validateSemenCorrecaoMotivo("quantidade_digitada_incorretamente");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe("Quantidade digitada incorretamente");
  });
});

describe("evaluateSemenCorrecaoEntrada", () => {
  it("10 doses R$ 1.500 → 8 doses R$ 1.200", () => {
    const original = mov({
      id: 1,
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      quantidadeDoses: 10,
      custoTotal: "1500.00",
    });
    const r = evaluateSemenCorrecaoEntrada({
      original: { ...original, custoUnitario: "150.00" },
      movimentacoes: [original],
      saldoAtual: 10,
      dadosNovos: {
        quantidadeDoses: 8,
        custoTotal: 1200,
        custoUnitario: "150.00",
        dataEntrada: "2026-08-20",
      },
      dataCorrecao: "2026-08-26",
      nowIso: "2026-08-26T12:00:00.000Z",
      nextEstornoId: 2,
      nextEntradaId: 3,
      grupoCorrecaoId: "grp-1",
      motivoTexto: "Quantidade digitada incorretamente",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estorno.tipo).toBe(SEMEN_MOV_TIPO_ESTORNO_ENTRADA);
      expect(r.estorno.quantidadeDoses).toBe(10);
      expect(r.estorno.movimentacaoOrigemId).toBe(1);
      expect(r.novaEntrada.tipo).toBe(SEMEN_MOV_TIPO_ENTRADA);
      expect(r.novaEntrada.quantidadeDoses).toBe(8);
      expect(r.novaEntrada.custoTotal).toBe("1200.00");
      expect(r.novaEntrada.grupoCorrecaoId).toBe("grp-1");
      expect(r.estadoFinal.saldoDoses).toBe(8);
      expect(r.estadoFinal.custoUnitario).toBe("150.00");
    }
  });

  it("recusa correção sem alteração real de quantidade, custo ou data", () => {
    const original = mov({
      id: 1,
      tipo: SEMEN_MOV_TIPO_ENTRADA,
      quantidadeDoses: 3,
      custoTotal: "450.00",
      dataEntrada: "2026-08-26",
    });
    const r = evaluateSemenCorrecaoEntrada({
      original: { ...original, custoUnitario: "150.00" },
      movimentacoes: [original],
      saldoAtual: 3,
      dadosNovos: {
        quantidadeDoses: 3,
        custoTotal: 450,
        custoUnitario: "150.00",
        dataEntrada: "2026-08-26",
      },
      dataCorrecao: "2026-08-26",
      nowIso: "2026-08-26T12:00:00.000Z",
      nextEstornoId: 2,
      nextEntradaId: 3,
      grupoCorrecaoId: "grp-noop",
      motivoTexto: "Quantidade digitada incorretamente",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe(MSG_SEMEN_CORRECAO_SEM_ALTERACAO);
  });
});

describe("hasSemenCorrecaoAlteracaoReal", () => {
  const original = {
    quantidadeDoses: 3,
    custoTotal: "450.00",
    dataEntrada: "2026-08-26",
  };

  it("trata máscara monetária, 'doses' e data BR como iguais", () => {
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: "3 doses",
        custoTotal: "R$ 450,00",
        dataEntrada: "26/08/2026",
      }),
    ).toBe(false);
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: "3",
        custoTotal: "450",
        dataEntrada: "2026-08-26",
      }),
    ).toBe(false);
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 3,
        custoTotal: "450,00",
        dataEntrada: "2026-08-26",
      }),
    ).toBe(false);
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 3,
        custoTotal: 450,
        dataEntrada: "2026-08-26",
      }),
    ).toBe(false);
  });

  it("reconhece mudança de quantidade, custo ou data", () => {
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 2,
        custoTotal: "R$ 450,00",
        dataEntrada: "2026-08-26",
      }),
    ).toBe(true);
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 3,
        custoTotal: "R$ 400,00",
        dataEntrada: "2026-08-26",
      }),
    ).toBe(true);
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 3,
        custoTotal: "R$ 450,00",
        dataEntrada: "2026-08-25",
      }),
    ).toBe(true);
  });

  it("não considera motivo — só os dados corrigíveis", () => {
    expect(
      hasSemenCorrecaoAlteracaoReal(original, {
        quantidadeDoses: 3,
        custoTotal: "450.00",
        dataEntrada: "2026-08-26",
      }),
    ).toBe(false);
  });
});

describe("annotateSemenMovimentacoesHistorico", () => {
  it("SAIDA_IA não pode ser corrigida por este fluxo", () => {
    const [row] = annotateSemenMovimentacoesHistorico([
      mov({ id: 2, tipo: SEMEN_MOV_TIPO_SAIDA_IA, quantidadeDoses: 1, custoTotal: "150.00" }),
    ]);
    expect(row?.podeCorrigir).toBe(false);
    expect(row?.acaoDesabilitadaMotivo).toBe(MSG_SEMEN_CORRECAO_SAIDA_IA);
  });

  it("entrada original corrigida fica marcada e sem ação", () => {
    const rows = annotateSemenMovimentacoesHistorico([
      mov({ id: 1, tipo: SEMEN_MOV_TIPO_ENTRADA, quantidadeDoses: 10, custoTotal: "1500.00" }),
      mov({
        id: 2,
        tipo: SEMEN_MOV_TIPO_ESTORNO_ENTRADA,
        quantidadeDoses: 10,
        custoTotal: "1500.00",
        movimentacaoOrigemId: 1,
        motivoCorrecao: "Quantidade digitada incorretamente",
      }),
    ]);
    expect(rows[0]?.jaCorrigida).toBe(true);
    expect(rows[0]?.podeCorrigir).toBe(false);
    expect(rows[0]?.motivoCorrecaoLabel).toBe("Quantidade digitada incorretamente");
  });
});
