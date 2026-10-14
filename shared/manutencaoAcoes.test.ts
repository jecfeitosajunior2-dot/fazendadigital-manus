import { describe, expect, it } from "vitest";
import { decidirEstornoManutencao } from "./manutencaoEstoque";
import { estornoCompletoSemMovimentacao } from "./manutencaoPecasOrigem";
import {
  acoesMenuManutencao,
  MSG_MANUT_EXCLUSAO_CONCLUIDA,
  MSG_MANUT_EXCLUSAO_ESTORNADA,
  recusarExclusaoManutencao,
} from "./manutencaoAcoes";

const pecaOficina = {
  nome: "Rolamento 54897",
  quantidade: 1,
  estoqueId: null,
  origem: "oficina",
};

const pecaEstoqueVinculo = {
  nome: "Parafuso do Eixo",
  quantidade: 1,
  estoqueId: 33,
  estoqueMovimentacaoId: 156,
};

const pecaEstoqueLegado = {
  nome: "Parafuso do Eixo",
  quantidade: 1,
  estoqueId: 33,
};

describe("menu da lista", () => {
  it("OS 54 — concluída só com oficina: Estornar, sem Excluir", () => {
    expect(acoesMenuManutencao("concluida")).toEqual({
      podeEstornar: true,
      podeExcluir: false,
    });
    expect(decidirEstornoManutencao({ status: "concluida", pecas: [pecaOficina] }).kind).toBe(
      "sem_consumo",
    );
    expect(estornoCompletoSemMovimentacao("sem_consumo")).toBe(true);
  });

  it("OS só com mão de obra: Estornar, sem Excluir", () => {
    expect(acoesMenuManutencao("concluida")).toEqual({
      podeEstornar: true,
      podeExcluir: false,
    });
    expect(decidirEstornoManutencao({ status: "concluida", pecas: [] }).kind).toBe("sem_consumo");
  });

  it("OS só com peça do estoque: Estornar, sem Excluir — independente de consumiuEstoque", () => {
    expect(acoesMenuManutencao("concluida")).toEqual({
      podeEstornar: true,
      podeExcluir: false,
    });
    expect(
      decidirEstornoManutencao({ status: "concluida", pecas: [pecaEstoqueVinculo] }).kind,
    ).toBe("com_vinculo");
  });

  it("OS com as duas origens: Estornar, sem Excluir", () => {
    expect(acoesMenuManutencao("concluida")).toEqual({
      podeEstornar: true,
      podeExcluir: false,
    });
    expect(
      decidirEstornoManutencao({
        status: "concluida",
        pecas: [pecaEstoqueVinculo, pecaOficina],
      }).kind,
    ).toBe("com_vinculo");
  });

  it("OS já estornada: sem Estornar e sem Excluir", () => {
    expect(acoesMenuManutencao("estornado")).toEqual({
      podeEstornar: false,
      podeExcluir: false,
    });
    expect(
      decidirEstornoManutencao({ status: "estornado", pecas: [pecaOficina] }).kind,
    ).toBe("ja_estornado");
  });

  it("OS antiga sem vínculo patrimonial: menu oferece Estornar; servidor classifica o legado", () => {
    expect(acoesMenuManutencao("concluida").podeEstornar).toBe(true);
    expect(
      decidirEstornoManutencao({
        status: "concluida",
        pecas: [pecaEstoqueLegado],
        algumEstoqueComCapital: true,
      }).kind,
    ).toBe("legado_bloqueado");
    expect(
      decidirEstornoManutencao({
        status: "concluida",
        pecas: [pecaEstoqueLegado],
        algumEstoqueComCapital: false,
      }).kind,
    ).toBe("legado_sem_capital");
  });
});

describe("proteção de exclusão no servidor", () => {
  it("recusa exclusão de OS concluída e orienta o estorno", () => {
    expect(recusarExclusaoManutencao("concluida")).toEqual({
      recusar: true,
      message: MSG_MANUT_EXCLUSAO_CONCLUIDA,
    });
  });

  it("recusa exclusão de OS estornada", () => {
    expect(recusarExclusaoManutencao("estornado")).toEqual({
      recusar: true,
      message: MSG_MANUT_EXCLUSAO_ESTORNADA,
    });
  });

  it("segundo estorno permanece ja_estornado, sem novo movimento", () => {
    const primeiro = decidirEstornoManutencao({ status: "concluida", pecas: [pecaOficina] });
    expect(primeiro.kind).toBe("sem_consumo");
    const segundo = decidirEstornoManutencao({ status: "estornado", pecas: [pecaOficina] });
    expect(segundo.kind).toBe("ja_estornado");
    expect(estornoCompletoSemMovimentacao(segundo.kind)).toBe(false);
  });
});
