import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  MSG_TROCA_LOTE_DATA_FUTURA,
} from "../shared/transferirAnimaisEntreLotes";
import {
  ORDEM_BLOQUEIO_ANIMAIS_LOTE,
  PERMISSAO_ANIMAIS_LOTE,
  movimentarAnimaisLoteAutorizado,
} from "./movimentarAnimaisLoteAutorizado";

describe("permissão da entrada e da troca de animais", () => {
  it("usa lotes.editar e não cria permissão nova", () => {
    expect(permissaoPorId(PERMISSAO_ANIMAIS_LOTE)?.id).toBe("lotes.editar");
    expect(permissaoPorId("lotes.movimentar")).toBeNull();
    expect(ORDEM_BLOQUEIO_ANIMAIS_LOTE[0]).toContain("lotes");
    expect(ORDEM_BLOQUEIO_ANIMAIS_LOTE[3]).toContain("animais");
  });

  it("recusa data futura antes de abrir a transação", async () => {
    const resultado = await movimentarAnimaisLoteAutorizado({
      async emTransacao() {
        throw new Error("não deveria abrir transação");
      },
    }, {
      executorId: 1,
      executorNome: "Administrador da conta",
      input: { loteDestinoId: 110, animalIds: [50], dataMovimentacao: "2099-01-01" },
    });
    expect(resultado).toMatchObject({ ok: false, motivo: "data_futura", mensagem: MSG_TROCA_LOTE_DATA_FUTURA });
  });
});
