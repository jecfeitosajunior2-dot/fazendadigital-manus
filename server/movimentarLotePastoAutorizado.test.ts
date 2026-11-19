import { describe, expect, it } from "vitest";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  MSG_DATA_FUTURA,
  PERMISSAO_MOVIMENTAR_LOTE,
  movimentarLotePastoAutorizado,
} from "./movimentarLotePastoAutorizado";

describe("permissão da movimentação de lote", () => {
  it("usa lotes.editar porque o catálogo não separa a troca de pasto", () => {
    expect(permissaoPorId(PERMISSAO_MOVIMENTAR_LOTE)?.id).toBe("lotes.editar");
    expect(permissaoPorId("lotes.movimentar")).toBeNull();
    expect(permissaoPorId("pastos.editar")?.descricao).toBe("Alterar pasto ou coordenadas");
  });

  it("recusa data futura antes de abrir a transação", async () => {
    const resultado = await movimentarLotePastoAutorizado({
      async emTransacao() {
        throw new Error("não deveria abrir transação");
      },
    }, {
      executorId: 1,
      input: { loteId: 100, pastoId: 1100, dataEntrada: "2099-01-01" },
    });
    expect(resultado).toMatchObject({ ok: false, motivo: "data_futura", mensagem: MSG_DATA_FUTURA });
  });
});
