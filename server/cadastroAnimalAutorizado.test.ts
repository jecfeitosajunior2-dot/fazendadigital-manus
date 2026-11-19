import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  PERMISSAO_CADASTRAR_ANIMAL,
  concluirCadastroNoEspelho,
  type EspelhoCadastroAnimal,
  type SucessoCadastroAnimal,
} from "./cadastroAnimalAutorizado";

function espelho(): EspelhoCadastroAnimal & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async atualizar(userId) {
      chamadas.push(`animal:${userId}`);
    },
    async historico(entrada) {
      chamadas.push(`historico:${entrada.userId}`);
    },
  };
}

describe("espelho do cadastro", () => {
  it("usa a permissão animais.criar do catálogo", () => {
    expect(permissaoPorId(PERMISSAO_CADASTRAR_ANIMAL)?.id).toBe("animais.criar");
  });

  it("não grava o espelho quando a autorização recusa", async () => {
    const local = espelho();
    await concluirCadastroNoEspelho(local, { ok: false, motivo: "sem_permissao" });
    expect(local.chamadas).toEqual([]);
  });

  it("grava o espelho no titular, com o nome de quem executou", async () => {
    const local = espelho();
    const sucesso: SucessoCadastroAnimal = {
      ok: true,
      id: 9,
      userId: 1,
      executorUserId: 2,
      row: {
        userId: 1,
        sexo: "femea",
        castrado: null,
        fazendaId: 10,
        loteId: 100,
        pastoId: undefined,
      },
      loteDestinoId: 100,
      dataMovimentacao: "2026-11-19",
      usuarioNome: "Funcionario Curral",
    };
    await concluirCadastroNoEspelho(local, sucesso);
    expect(local.chamadas).toEqual(["animal:1", "historico:1"]);
  });
});
