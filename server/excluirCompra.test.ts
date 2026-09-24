import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  deleted: 0,
}));

vi.mock("./db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = mocks.selectRows.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: async () => rows,
          });
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        mocks.deleted += 1;
        return [{ affectedRows: 1 }];
      },
    }),
  },
}));

import {
  MSG_COMPRA_EXCLUIR_CANCELADA,
  MSG_COMPRA_EXCLUIR_COM_ANIMAIS,
  MSG_COMPRA_EXCLUIR_CONCLUIDA,
} from "../shared/compraCancelamento";
import { excluirCompraLegada } from "./excluirCompra";

describe("DELETE legado de compra", () => {
  beforeEach(() => {
    mocks.selectRows = [];
    mocks.deleted = 0;
  });

  it("não apaga compra concluída", async () => {
    mocks.selectRows = [[{ id: 9001, status: "concluido" }], [{ id: 1 }], []];
    await expect(excluirCompraLegada(7, 9001)).rejects.toMatchObject({
      message: MSG_COMPRA_EXCLUIR_CONCLUIDA,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("não apaga compra com animal vinculado", async () => {
    mocks.selectRows = [[{ id: 9001, status: "pendente" }], [], [{ id: 805 }]];
    await expect(excluirCompraLegada(7, 9001)).rejects.toMatchObject({
      message: MSG_COMPRA_EXCLUIR_COM_ANIMAIS,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("não apaga compra já cancelada", async () => {
    mocks.selectRows = [[{ id: 9001, status: "cancelado" }], [{ id: 1 }], []];
    await expect(excluirCompraLegada(7, 9001)).rejects.toMatchObject({
      message: MSG_COMPRA_EXCLUIR_CANCELADA,
    });
    expect(mocks.deleted).toBe(0);
  });

  it("usuário errado não encontra a compra", async () => {
    mocks.selectRows = [[]];
    await expect(excluirCompraLegada(99, 9001)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mocks.deleted).toBe(0);
  });
});
