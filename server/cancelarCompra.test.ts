import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

import {
  MSG_COMPRA_CANCELAR_COM_ANIMAIS,
  MSG_COMPRA_CANCELAR_JA_CANCELADA,
  MSG_COMPRA_CANCELAR_MOTIVO,
  MSG_COMPRA_CANCELAR_NAO_CONCLUIDA,
  MSG_COMPRA_CANCELAR_NAO_ENCONTRADA,
} from "../shared/compraCancelamento";
import { cancelarCompraComercial } from "./cancelarCompra";

type Op = { kind: "update" | "delete"; values?: Record<string, unknown> };

function makeTransaction(
  selectRows: unknown[][],
  ops: Op[],
  affectedCancelado = 1,
) {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = selectRows.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(async () => rows),
          });
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        ops.push({ kind: "delete" });
        throw new Error("cancelarCompra não deve apagar registros");
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          ops.push({ kind: "update", values });
          return [{ affectedRows: values.status === "cancelado" ? affectedCancelado : 0 }];
        }),
      })),
    })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return tx;
}

const inputBase = {
  compraId: 9001,
  motivo: "Compra lançada em duplicidade",
  canceladoPorUserId: 7,
  canceladoPorNome: "Pedro Gomes",
};

describe("cancelarCompraComercial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compra concluída + 0 identificados cancela e registra auditoria", async () => {
    const ops: Op[] = [];
    makeTransaction([[{ id: 9001, status: "concluido" }], []], ops);
    const result = await cancelarCompraComercial(7, inputBase);
    expect(result).toEqual({ success: true, compraId: 9001 });
    expect(ops).toHaveLength(1);
    expect(ops[0]?.values).toMatchObject({
      status: "cancelado",
      canceladoPorUserId: 7,
      canceladoPorNome: "Pedro Gomes",
      motivoCancelamento: "Compra lançada em duplicidade",
    });
    expect(ops[0]?.values?.canceladoEm).toBeInstanceOf(Date);
  });

  it("motivo vazio ou só espaços bloqueia", async () => {
    await expect(cancelarCompraComercial(7, { ...inputBase, motivo: "" })).rejects.toMatchObject({
      message: MSG_COMPRA_CANCELAR_MOTIVO,
    });
    await expect(cancelarCompraComercial(7, { ...inputBase, motivo: "   " })).rejects.toMatchObject({
      message: MSG_COMPRA_CANCELAR_MOTIVO,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("usuário errado não encontra a compra", async () => {
    makeTransaction([[]], []);
    await expect(cancelarCompraComercial(99, inputBase)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_COMPRA_CANCELAR_NAO_ENCONTRADA,
    });
  });

  it("1 animal vinculado bloqueia", async () => {
    makeTransaction([[{ id: 9001, status: "concluido" }], [{ id: 805 }]], []);
    await expect(cancelarCompraComercial(7, inputBase)).rejects.toMatchObject({
      message: expect.stringContaining(MSG_COMPRA_CANCELAR_COM_ANIMAIS),
    });
  });

  it("vários vinculados bloqueiam", async () => {
    makeTransaction(
      [[{ id: 9001, status: "concluido" }], [{ id: 805 }, { id: 806 }, { id: 807 }]],
      [],
    );
    await expect(cancelarCompraComercial(7, inputBase)).rejects.toMatchObject({
      message: expect.stringContaining(MSG_COMPRA_CANCELAR_COM_ANIMAIS),
    });
  });

  it("animal de outra compra ou sem compra não interfere", async () => {
    const ops: Op[] = [];
    makeTransaction([[{ id: 9001, status: "concluido" }], []], ops);
    await expect(cancelarCompraComercial(7, inputBase)).resolves.toEqual({
      success: true,
      compraId: 9001,
    });
  });

  it("compra já cancelada não cancela novamente", async () => {
    const ops: Op[] = [];
    makeTransaction([[{ id: 9001, status: "cancelado" }]], ops);
    await expect(cancelarCompraComercial(7, inputBase)).rejects.toMatchObject({
      message: MSG_COMPRA_CANCELAR_JA_CANCELADA,
    });
    expect(ops).toEqual([]);
  });

  it("status diferente de concluído bloqueia", async () => {
    makeTransaction([[{ id: 9001, status: "pendente" }]], []);
    await expect(cancelarCompraComercial(7, inputBase)).rejects.toMatchObject({
      message: MSG_COMPRA_CANCELAR_NAO_CONCLUIDA,
    });
  });

  it("não apaga compra, grupo, animal, pesagem ou movimentação", async () => {
    const ops: Op[] = [];
    const tx = makeTransaction([[{ id: 9001, status: "concluido" }], []], ops);
    await cancelarCompraComercial(7, inputBase);
    expect(tx.delete).not.toHaveBeenCalled();
    expect(ops.every(op => op.kind === "update")).toBe(true);

    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "cancelarCompra.ts"), "utf8");
    const routers = readFileSync(resolve(here, "routers.ts"), "utf8");
    expect(src).not.toMatch(/delete\(compraGrupos\)/);
    expect(src).not.toMatch(/delete\(compras\)/);
    expect(src).not.toMatch(/delete\(animais\)/);
    expect(src).not.toMatch(/delete\(pesagens\)/);
    expect(src).not.toMatch(/delete\(animalLoteMovimentacoes\)/);
    expect(src).not.toMatch(/delete\(compraDocumentos\)/);
    expect(src).not.toMatch(/compra_documentos/);
    expect(routers).toContain("excluirCompraLegada");
    expect(routers).toContain("cancelarCompraComercial");
  });
});
