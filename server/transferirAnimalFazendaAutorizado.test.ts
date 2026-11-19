import { describe, expect, it } from "vitest";
import { alocacaoPedeOutraFazenda, MSG_ALOCACAO_SO_MESMA_FAZENDA } from "../shared/alocacaoVsTransferencia";
import { MSG_TRANSFERENCIA_DATA_FUTURA, MSG_TRANSFERENCIA_LOTE_OBRIGATORIO } from "../shared/transferenciaInternaAnimal";
import { permissaoPorId } from "./catalogoPermissoes";
import type { IoAnimaisLote } from "./movimentarAnimaisLoteAutorizado";
import {
  PERMISSAO_TRANSFERIR_ANIMAL,
  transferirAnimalFazendaAutorizado,
  type PedidoTransferenciaFazenda,
} from "./transferirAnimalFazendaAutorizado";

describe("transferência de animal entre fazendas", () => {
  it("usa a permissão do catálogo e não o editar de lote", () => {
    expect(permissaoPorId(PERMISSAO_TRANSFERIR_ANIMAL)?.descricao).toBe("Transferir animal entre fazendas");
    expect(permissaoPorId("lotes.editar")?.id).toBe("lotes.editar");
    expect(PERMISSAO_TRANSFERIR_ANIMAL).not.toBe("lotes.editar");
  });

  it("recusa data futura e lote ausente antes de abrir transação", async () => {
    const io: IoAnimaisLote = {
      async emTransacao() {
        throw new Error("não deveria gravar");
      },
    };
    const base: PedidoTransferenciaFazenda = {
      executorId: 1,
      sessionVersionDaSessao: 3,
      executorNome: "Administrador da conta",
      input: {
        fazendaOrigemId: 10,
        fazendaDestinoId: 20,
        animalId: 51,
        loteDestinoId: 200,
        dataTransferencia: "2099-01-01",
      },
    };
    await expect(transferirAnimalFazendaAutorizado(io, base)).resolves.toMatchObject({
      ok: false,
      mensagem: MSG_TRANSFERENCIA_DATA_FUTURA,
    });
    await expect(transferirAnimalFazendaAutorizado(io, {
      ...base,
      input: { ...base.input, dataTransferencia: "2026-11-10", loteDestinoId: null },
    })).resolves.toMatchObject({
      ok: false,
      mensagem: MSG_TRANSFERENCIA_LOTE_OBRIGATORIO,
    });
  });

  it("separa alocação da mesma fazenda e transferência entre fazendas", () => {
    expect(alocacaoPedeOutraFazenda(10, [10, null])).toBe(false);
    expect(alocacaoPedeOutraFazenda(20, [10])).toBe(true);
    expect(MSG_ALOCACAO_SO_MESMA_FAZENDA).toContain("Movimentação do Animal");
  });
});
