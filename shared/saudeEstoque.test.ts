import { describe, expect, it } from "vitest";
import { custoMedioFonteTecnica } from "./estoqueCapital";
import {
  custoEstimadoManejoSanitarioUi,
  decidirEstornoSaude,
  deveBloquearEstornoGenericoSanitario,
  grupoEstornoSaude,
  grupoMovimentacaoSaude,
  MSG_ESTORNO_GENERICO_SANITARIO,
  MSG_SAUDE_ESTORNO_DUPLO,
  MSG_SAUDE_ESTORNO_LEGADO,
  origemMovimentacaoESanitaria,
  saudeRegistroEstaEstornado,
} from "./saudeEstoque";

describe("saudeEstoque — decisão de estorno", () => {
  it("bloqueia duplo estorno", () => {
    expect(decidirEstornoSaude({
      status: "estornado",
      estoqueMovimentacaoId: 10,
      estoqueId: 1,
      quantidadeConsumo: "2",
    })).toEqual({ kind: "ja_estornado" });
    expect(saudeRegistroEstaEstornado("estornado")).toBe(true);
  });

  it("usa o vínculo oficial quando existe", () => {
    expect(decidirEstornoSaude({
      status: "ativo",
      estoqueMovimentacaoId: 88,
      estoqueId: 1,
      quantidadeConsumo: "2",
    })).toEqual({ kind: "com_estoque", movimentacaoId: 88 });
    expect(grupoMovimentacaoSaude(12)).toBe("saude-12");
    expect(grupoEstornoSaude(12)).toBe("e-saude-12");
  });

  it("bloqueia legado sem estoque_movimentacao_id", () => {
    const d = decidirEstornoSaude({
      status: "ativo",
      estoqueMovimentacaoId: null,
      estoqueId: 26,
      quantidadeConsumo: "2.00",
    });
    expect(d).toEqual({ kind: "legado_bloqueado" });
    expect(MSG_SAUDE_ESTORNO_LEGADO).toMatch(/não inventamos/i);
    expect(MSG_SAUDE_ESTORNO_DUPLO).toMatch(/já foi estornado/i);
  });

  it("permite cancelar manejo sem produto (só histórico)", () => {
    expect(decidirEstornoSaude({
      status: "ativo",
      estoqueMovimentacaoId: null,
      estoqueId: null,
      quantidadeConsumo: null,
    })).toEqual({ kind: "somente_registro" });
  });
});

describe("bloqueio do estorno genérico sanitário", () => {
  it("A. vínculo explícito bloqueia mesmo sem campo manejo", () => {
    expect(deveBloquearEstornoGenericoSanitario({
      movimentacoes: [{ id: 121, manejo: null, grupoId: "g-avulsa" }],
      movimentacaoIdsComVinculoSaude: [121],
    })).toBe(true);
    expect(MSG_ESTORNO_GENERICO_SANITARIO).toMatch(/Manejo Sanitário/i);
  });

  it("B. origem Sanitário bloqueia sem vínculo", () => {
    expect(origemMovimentacaoESanitaria({ manejo: "Sanitário", grupoId: null })).toBe(true);
    expect(deveBloquearEstornoGenericoSanitario({
      movimentacoes: [{ id: 99, manejo: "Sanitário", grupoId: null }],
    })).toBe(true);
  });

  it("C. movimentação genérica permanece liberada", () => {
    expect(deveBloquearEstornoGenericoSanitario({
      movimentacoes: [{ id: 50, manejo: "Consumo interno", grupoId: "consumo-1" }],
      movimentacaoIdsComVinculoSaude: [121],
    })).toBe(false);
  });
});

describe("custo de referência sanitário", () => {
  it("A. CAPITAL usa capital / quantidade e ignora unitário legado", () => {
    const custo = custoMedioFonteTecnica({
      quantidade: "5",
      valorTotalEstoque: "10.25",
      valorUnitario: "1.02",
      capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
    });
    expect(custo).toBeCloseTo(2.05, 6);
    expect(custo).not.toBe(1.02);
  });

  it("B. legado sem capital usa valorUnitario", () => {
    expect(custoMedioFonteTecnica({
      quantidade: "5",
      valorTotalEstoque: null,
      valorUnitario: "1.02",
      capitalInicializadoEm: null,
    })).toBe(1.02);
  });

  it("C. CAPITAL com quantidade zero não divide", () => {
    expect(custoMedioFonteTecnica({
      quantidade: "0",
      valorTotalEstoque: "0.00",
      valorUnitario: "1.02",
      capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
    })).toBeNull();
  });

  it("D. Monovim 5 ml / R$ 10,25 e dose 5 ml estima R$ 10,25", () => {
    const custo = custoMedioFonteTecnica({
      quantidade: "5.00",
      valorTotalEstoque: "10.25",
      valorUnitario: "1.02",
      capitalInicializadoEm: "2026-10-09T23:01:19.000Z",
    });
    expect(custo).toBeCloseTo(2.05, 6);
    expect(custoEstimadoManejoSanitarioUi(custo!, 5)).toBe(10.25);
  });
});

