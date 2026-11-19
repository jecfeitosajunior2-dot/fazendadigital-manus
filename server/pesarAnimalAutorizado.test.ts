import { describe, expect, it } from "vitest";
import { MSG_DESMAMA_DATA_FUTURA, MSG_DESMAMA_PESO } from "../shared/desmamaManejo";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  MSG_PESAGEM_DATA_FUTURA,
  MSG_PESO_INVALIDO,
  PERMISSAO_PESAGEM,
  desmamarAnimalAutorizado,
  pesarAnimalAutorizado,
  type IoPesagemAnimal,
} from "./pesarAnimalAutorizado";

describe("pesagem e desmama", () => {
  it("usa a permissão de pesagem que já existe no catálogo", () => {
    expect(permissaoPorId(PERMISSAO_PESAGEM)?.descricao).toBe("Registrar pesagem");
    expect(permissaoPorId("pesagens.desmamar")).toBeNull();
    expect(permissaoPorId("animais.desmamar")).toBeNull();
    expect(PERMISSAO_PESAGEM).not.toBe("animais.editar");
  });

  it("recusa peso e data inválidos antes de abrir transação", async () => {
    const io: IoPesagemAnimal = {
      async emTransacao() {
        throw new Error("não deveria gravar");
      },
    };
    await expect(pesarAnimalAutorizado(io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { animalId: 51, peso: "0", data: "2026-11-10" },
    })).resolves.toMatchObject({ ok: false, mensagem: MSG_PESO_INVALIDO });
    await expect(pesarAnimalAutorizado(io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { animalId: 51, peso: "320", data: "2099-01-01" },
    })).resolves.toMatchObject({ ok: false, mensagem: MSG_PESAGEM_DATA_FUTURA });
    await expect(desmamarAnimalAutorizado(io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { fazendaId: 10, animalId: 56, dataDesmama: "2099-01-01", pesoKg: "220" },
    })).resolves.toMatchObject({ ok: false, mensagem: MSG_DESMAMA_DATA_FUTURA });
    await expect(desmamarAnimalAutorizado(io, {
      executorId: 1,
      sessionVersionDaSessao: 3,
      input: { fazendaId: 10, animalId: 56, dataDesmama: "2026-11-10", pesoKg: "abc" },
    })).resolves.toMatchObject({ ok: false, mensagem: MSG_DESMAMA_PESO });
  });
});
