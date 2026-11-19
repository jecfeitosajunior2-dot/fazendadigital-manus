import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  CAMPOS_EDICAO_CADASTRAL,
  CAMPOS_EDICAO_ESTRUTURAL,
  MSG_STATUS_ALTERACAO_DIRETA,
  PERMISSAO_EDITAR_ANIMAL,
  campoEstruturalAlterado,
  concluirEdicaoNoEspelho,
  type AnimalParaEdicao,
} from "./editarAnimalAutorizado";

const animal: AnimalParaEdicao = {
  id: 50,
  userId: 1,
  fazendaId: 10,
  loteId: 100,
  pastoId: 1000,
  status: "ativo",
  sexo: "femea",
  castrado: null,
  brinco: "BR-50",
  brincoEletronico: null,
  pesoAtual: "300.00",
  dataDesmama: null,
  maeId: null,
  paiId: null,
};

describe("classificação da edição de animal", () => {
  it("usa a permissão animais.editar do catálogo", () => {
    expect(permissaoPorId(PERMISSAO_EDITAR_ANIMAL)?.id).toBe("animais.editar");
    expect(CAMPOS_EDICAO_CADASTRAL).toContain("pesoEntrada");
    expect(CAMPOS_EDICAO_ESTRUTURAL).toContain("pesoAtual");
  });

  it("aceita a fazenda reenviada pela tela quando ela não muda", () => {
    expect(campoEstruturalAlterado(animal, { id: 50, fazendaId: 10, raca: "Nelore" })).toBeNull();
  });

  it("aponta troca de fazenda, lote, pasto, peso atual e status", () => {
    expect(campoEstruturalAlterado(animal, { id: 50, fazendaId: 20 })).toBe("fazendaId");
    expect(campoEstruturalAlterado(animal, { id: 50, loteId: 200 })).toBe("loteId");
    expect(campoEstruturalAlterado(animal, { id: 50, pastoId: 2000 })).toBe("pastoId");
    expect(campoEstruturalAlterado(animal, { id: 50, pesoAtual: "310" })).toBe("pesoAtual");
    expect(campoEstruturalAlterado(animal, { id: 50, status: "vendido" })).toBe("status");
  });

  it("não grava o espelho quando a edição é recusada", async () => {
    const chamadas: number[] = [];
    await concluirEdicaoNoEspelho({
      async atualizar(userId) {
        chamadas.push(userId);
      },
    }, { ok: false, motivo: "situacao_preservada", mensagem: MSG_STATUS_ALTERACAO_DIRETA });
    expect(chamadas).toEqual([]);
  });
});
