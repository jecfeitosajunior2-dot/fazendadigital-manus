import { describe, expect, it } from "vitest";
import { MSG_BAIXA_DATA_FUTURA, MSG_VENDA_VIA_MANEJO_BLOQUEADA } from "../shared/animalBaixa";
import { MSG_ANIMAL_EXCLUSAO_BLOQUEADA } from "../shared/animalExclusao";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  PERMISSAO_BAIXA_ANIMAL,
  baixarAnimalAutorizado,
  type IoBaixaAnimal,
  type PedidoBaixaAnimal,
} from "./baixarAnimalAutorizado";

describe("baixa e exclusão de animal", () => {
  it("usa a permissão do catálogo e não cria outra", () => {
    expect(permissaoPorId(PERMISSAO_BAIXA_ANIMAL)?.descricao).toBe("Excluir animal ou registrar baixa");
    expect(permissaoPorId("animais.baixar")).toBeNull();
    expect(PERMISSAO_BAIXA_ANIMAL).not.toBe("lotes.editar");
    expect(MSG_ANIMAL_EXCLUSAO_BLOQUEADA).toContain("histórico");
  });

  it("recusa venda e data futura antes de abrir transação", async () => {
    const io: IoBaixaAnimal = {
      async emTransacao() {
        throw new Error("não deveria gravar");
      },
    };
    const base: PedidoBaixaAnimal = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        fazendaId: 10,
        animalId: 51,
        dataBaixa: "2026-11-10",
        tipo: "venda",
        destino: "Comprador",
      },
    };
    await expect(baixarAnimalAutorizado(io, base)).resolves.toMatchObject({
      ok: false,
      motivo: "venda_comercial",
      mensagem: MSG_VENDA_VIA_MANEJO_BLOQUEADA,
    });
    await expect(baixarAnimalAutorizado(io, {
      ...base,
      input: { ...base.input, tipo: "morte", motivo: "doenca", dataBaixa: "2099-01-01" },
    })).resolves.toMatchObject({
      ok: false,
      mensagem: MSG_BAIXA_DATA_FUTURA,
    });
  });
});
