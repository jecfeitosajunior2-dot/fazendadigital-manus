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
  cancelarVendaComercial,
  MSG_VENDA_CANCELAR_ANIMAL_ALTERADO,
  MSG_VENDA_CANCELAR_BAIXA_AUSENTE,
  MSG_VENDA_CANCELAR_JA_CANCELADA,
  MSG_VENDA_CANCELAR_MOTIVO,
  MSG_VENDA_CANCELAR_NAO_CONCLUIDA,
  MSG_VENDA_CANCELAR_NAO_ENCONTRADA,
  MSG_VENDA_CANCELAR_SEM_ITENS,
} from "./cancelarVenda";

type Op = { kind: "update"; values: Record<string, unknown> };

function makeTransaction(
  selectRows: unknown[][],
  ops: Op[],
  affectedByStatus: Record<string, number> = {},
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
        throw new Error("cancelarVenda não deve apagar baixa");
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          ops.push({ kind: "update", values });
          const key = String(values.status ?? "");
          return [{ affectedRows: affectedByStatus[key] ?? (key === "cancelado" ? 1 : 2) }];
        }),
      })),
    })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return tx;
}

const inputBase = {
  vendaId: 44,
  motivo: "Digitação incorreta do comprador",
  canceladoPorUserId: 1,
  canceladoPorNome: "Administrador",
};

function selectsFelizes() {
  return [
    [{ id: 44, status: "concluido" }],
    [{ animalId: 10 }, { animalId: 11 }],
    [
      { id: 10, brinco: "10", status: "vendido" },
      { id: 11, brinco: "28", status: "vendido" },
    ],
    [
      { id: 80, animalId: 10 },
      { id: 81, animalId: 11 },
    ],
  ];
}

describe("cancelarVendaComercial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("estorna baixas, devolve animais e registra auditoria sem apagar histórico", async () => {
    const ops: Op[] = [];
    makeTransaction(selectsFelizes(), ops);

    const result = await cancelarVendaComercial(1, inputBase);

    expect(result).toEqual({ success: true, vendaId: 44, quantidade: 2 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(ops[0]).toEqual({ kind: "update", values: { status: "estornada" } });
    expect(ops[1]).toEqual({ kind: "update", values: { status: "ativo" } });
    expect(ops[2]?.values).toMatchObject({
      status: "cancelado",
      canceladoPorUserId: 1,
      canceladoPorNome: "Administrador",
      motivoCancelamento: "Digitação incorreta do comprador",
    });
    expect(ops[2]?.values.canceladoEm).toBeInstanceOf(Date);
  });

  it("recusa venda inexistente do usuário (isolamento)", async () => {
    makeTransaction([[]], []);
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_VENDA_CANCELAR_NAO_ENCONTRADA,
    });
  });

  it("bloqueia segunda tentativa sem nova alteração", async () => {
    makeTransaction([[{ id: 44, status: "cancelado" }]], []);
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_JA_CANCELADA,
    });
  });

  it("recusa venda que não está concluída", async () => {
    makeTransaction([[{ id: 44, status: "pendente" }]], []);
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_NAO_CONCLUIDA,
    });
  });

  it("recusa venda sem itens individuais", async () => {
    makeTransaction([[{ id: 44, status: "concluido" }], []], []);
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_SEM_ITENS,
    });
  });

  it("aborta tudo se um animal estiver inconsistente", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 44, status: "concluido" }],
        [{ animalId: 10 }, { animalId: 11 }],
        [
          { id: 10, brinco: "10", status: "vendido" },
          { id: 11, brinco: "28", status: "ativo" },
        ],
      ],
      ops,
    );
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: expect.stringContaining(MSG_VENDA_CANCELAR_ANIMAL_ALTERADO),
    });
    expect(ops).toHaveLength(0);
  });

  it("aborta tudo se faltar baixa ativa da venda", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 44, status: "concluido" }],
        [{ animalId: 10 }, { animalId: 11 }],
        [
          { id: 10, brinco: "10", status: "vendido" },
          { id: 11, brinco: "28", status: "vendido" },
        ],
        [{ id: 80, animalId: 10 }],
      ],
      ops,
    );
    await expect(cancelarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: MSG_VENDA_CANCELAR_BAIXA_AUSENTE,
    });
    expect(ops).toHaveLength(0);
  });

  it("recusa motivo vazio", async () => {
    await expect(
      cancelarVendaComercial(1, { ...inputBase, motivo: "   " }),
    ).rejects.toMatchObject({ message: MSG_VENDA_CANCELAR_MOTIVO });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
