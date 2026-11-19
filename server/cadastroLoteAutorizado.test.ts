import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  PERMISSAO_CADASTRAR_LOTE,
  concluirCadastroLoteNoEspelho,
  dataCriacaoPadraoLote,
  type EspelhoCadastroLote,
  type SucessoCadastroLote,
} from "./cadastroLoteAutorizado";

function espelho(): EspelhoCadastroLote & { chamadas: number[] } {
  const chamadas: number[] = [];
  return {
    chamadas,
    async criar(userId) {
      chamadas.push(userId);
    },
  };
}

describe("espelho do cadastro de lote", () => {
  it("usa a permissão lotes.criar do catálogo", () => {
    expect(permissaoPorId(PERMISSAO_CADASTRAR_LOTE)?.id).toBe("lotes.criar");
  });

  it("mantém a data padrão do cadastro atual em UTC", () => {
    expect(dataCriacaoPadraoLote(new Date("2026-11-19T02:30:00.000Z"))).toBe("2026-11-19");
  });

  it("não grava o espelho quando a autorização recusa", async () => {
    const local = espelho();
    await concluirCadastroLoteNoEspelho(local, { ok: false, motivo: "sem_permissao" });
    expect(local.chamadas).toEqual([]);
  });

  it("grava o espelho na conta do titular", async () => {
    const local = espelho();
    const sucesso: SucessoCadastroLote = {
      ok: true,
      id: 4,
      userId: 1,
      executorUserId: 2,
      row: {
        userId: 1,
        nome: "Bezerras",
        dataCriacao: "2026-11-19",
        fazendaId: 10,
      },
    };
    await concluirCadastroLoteNoEspelho(local, sucesso);
    expect(local.chamadas).toEqual([1]);
  });
});
