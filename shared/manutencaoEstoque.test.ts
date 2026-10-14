import { describe, expect, it } from "vitest";
import {
  decidirEstornoManutencao,
  deveBloquearEstornoGenericoManutencao,
  grupoMovimentacaoManutencao,
  MSG_ESTORNO_GENERICO_MANUTENCAO,
  origemMovimentacaoEManutencao,
  pecasConsumoIguais,
  valorUnitarioDeSnapshot,
} from "./manutencaoEstoque";

describe("identidade e bloqueio genérico da Manutenção", () => {
  it("reconhece manejo e grupo canônico", () => {
    expect(origemMovimentacaoEManutencao({ manejo: "Manutenção", grupoId: null })).toBe(true);
    expect(origemMovimentacaoEManutencao({
      manejo: null,
      grupoId: grupoMovimentacaoManutencao(12, 3),
    })).toBe(true);
    expect(origemMovimentacaoEManutencao({ manejo: "Consumo interno", grupoId: "consumo-1" })).toBe(false);
  });

  it("bloqueia por vínculo explícito mesmo sem manejo", () => {
    expect(deveBloquearEstornoGenericoManutencao({
      movimentacoes: [{ id: 88, manejo: null, grupoId: "g-avulsa" }],
      movimentacaoIdsComVinculoManutencao: [88],
    })).toBe(true);
    expect(MSG_ESTORNO_GENERICO_MANUTENCAO).toMatch(/módulo de Manutenção/i);
  });

  it("não bloqueia movimentação genérica", () => {
    expect(deveBloquearEstornoGenericoManutencao({
      movimentacoes: [{ id: 50, manejo: "Consumo interno", grupoId: "consumo-1" }],
      movimentacaoIdsComVinculoManutencao: [88],
    })).toBe(false);
  });
});

describe("decisão de estorno da OS", () => {
  it("já estornada é idempotente", () => {
    expect(decidirEstornoManutencao({
      status: "estornado",
      pecas: [{ estoqueId: 1, quantidade: "2", estoqueMovimentacaoId: 9 }],
    }).kind).toBe("ja_estornado");
  });

  it("com vínculo oficial usa as movimentações", () => {
    const d = decidirEstornoManutencao({
      status: "concluida",
      pecas: [
        { estoqueId: 1, quantidade: "2", estoqueMovimentacaoId: 9 },
        { estoqueId: 2, quantidade: "1", estoqueMovimentacaoId: 10 },
      ],
    });
    expect(d).toEqual({ kind: "com_vinculo", movimentacaoIds: [9, 10] });
  });

  it("legado com capital bloqueia; sem capital permanece no caminho antigo", () => {
    expect(decidirEstornoManutencao({
      status: "concluida",
      pecas: [{ estoqueId: 1, quantidade: "2", estoqueMovimentacaoId: null }],
      algumEstoqueComCapital: true,
    }).kind).toBe("legado_bloqueado");
    expect(decidirEstornoManutencao({
      status: "concluida",
      pecas: [{ estoqueId: 1, quantidade: "2", estoqueMovimentacaoId: null }],
      algumEstoqueComCapital: false,
    }).kind).toBe("legado_sem_capital");
  });
});

describe("snapshot da peça", () => {
  it("valorUnitario = snapshot / quantidade", () => {
    expect(valorUnitarioDeSnapshot("20.00", 2)).toBe("10.00");
  });

  it("peças iguais não disparam edição patrimonial", () => {
    expect(pecasConsumoIguais(
      [{ estoqueId: 1, quantidade: "2.00" }],
      [{ estoqueId: 1, quantidade: 2 }],
    )).toBe(true);
    expect(pecasConsumoIguais(
      [{ estoqueId: 1, quantidade: "2" }],
      [{ estoqueId: 1, quantidade: "3" }],
    )).toBe(false);
  });
});
