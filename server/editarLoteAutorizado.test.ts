import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  CAMPOS_EDICAO_LOTE_CADASTRAL,
  CAMPOS_EDICAO_LOTE_ESTRUTURAL,
  MSG_EDICAO_LOTE_SITUACAO,
  PERMISSAO_EDITAR_LOTE,
  campoEstruturalLote,
  concluirEdicaoLoteNoEspelho,
  patchCadastralLote,
  type LoteParaEdicao,
} from "./editarLoteAutorizado";

const lote: LoteParaEdicao = {
  id: 100,
  userId: 1,
  fazendaId: 10,
  pastoAtualId: 1000,
  dataEntradaPasto: "2024-01-02",
  ativo: true,
};

describe("classificação da edição de lote", () => {
  it("usa a permissão lotes.editar do catálogo", () => {
    expect(permissaoPorId(PERMISSAO_EDITAR_LOTE)?.id).toBe("lotes.editar");
    expect(CAMPOS_EDICAO_LOTE_CADASTRAL).toContain("nome");
    expect(CAMPOS_EDICAO_LOTE_CADASTRAL).toContain("capacidade");
    expect(CAMPOS_EDICAO_LOTE_ESTRUTURAL).toEqual(["fazendaId", "pastoAtualId", "dataEntradaPasto", "ativo"]);
  });

  it("aceita fazenda e pasto reenviados quando não mudam", () => {
    expect(campoEstruturalLote(lote, { id: 100, fazendaId: 10, pastoAtualId: 1000, nome: "Sede" })).toBeNull();
    expect(campoEstruturalLote({ ...lote, ativo: 1 }, { id: 100, ativo: true })).toBeNull();
  });

  it("aponta troca de fazenda, pasto e situação", () => {
    expect(campoEstruturalLote(lote, { id: 100, fazendaId: 20 })).toBe("fazendaId");
    expect(campoEstruturalLote(lote, { id: 100, pastoAtualId: 2000 })).toBe("pastoAtualId");
    expect(campoEstruturalLote(lote, { id: 100, pastoAtualId: null })).toBe("pastoAtualId");
    expect(campoEstruturalLote(lote, { id: 100, dataEntradaPasto: "2024-02-01" })).toBe("dataEntradaPasto");
    expect(campoEstruturalLote(lote, { id: 100, dataEntradaPasto: "2024-01-02" })).toBeNull();
    expect(campoEstruturalLote(lote, { id: 100, ativo: false })).toBe("ativo");
  });

  it("trata sigla vazia como nula e não grava o espelho na recusa", async () => {
    expect(patchCadastralLote({ id: 100, sigla: "  " })).toEqual({ sigla: null });
    expect(patchCadastralLote({ id: 100, sigla: " ab " })).toEqual({ sigla: "ab" });
    const chamadas: number[] = [];
    await concluirEdicaoLoteNoEspelho({
      async atualizar(userId) {
        chamadas.push(userId);
      },
    }, { ok: false, motivo: "situacao_preservada", mensagem: MSG_EDICAO_LOTE_SITUACAO });
    expect(chamadas).toEqual([]);
  });
});
