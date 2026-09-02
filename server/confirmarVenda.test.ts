import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertFazenda: vi.fn(),
  loadLote: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: (...args: unknown[]) => mocks.assertFazenda(...args),
}));

vi.mock("./animaisPorFazenda", async importOriginal => {
  const actual = await importOriginal<typeof import("./animaisPorFazenda")>();
  return {
    ...actual,
    loadLoteFazendaContextForUser: (...args: unknown[]) => mocks.loadLote(...args),
  };
});

import { confirmarVendaComercial } from "./confirmarVenda";
import { MSG_VENDA_ANIMAL_DUPLICADO, MSG_VENDA_ANIMAL_OUTRA_FAZENDA, MSG_VENDA_SEM_ITENS } from "../shared/vendaComercial";

type Op =
  | { kind: "insert"; values: unknown }
  | { kind: "update"; values: Record<string, unknown> };

function makeTransaction(selectRows: unknown[][], ops: Op[], affectedRows = 2) {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = selectRows.shift() ?? [];
          const result = Object.assign(Promise.resolve(rows), {
            limit: vi.fn(async () => rows),
          });
          return result;
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: unknown) => {
        ops.push({ kind: "insert", values });
        return [{ insertId: 44 }];
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          ops.push({ kind: "update", values });
          return [{ affectedRows }];
        }),
      })),
    })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return tx;
}

const inputBase = {
  fazendaId: 1,
  data: "2026-08-31",
  compradorId: 2,
  formaPrecificacao: "kg" as const,
  precoPadrao: 20.5,
  itens: [
    { animalId: 10, pesoVenda: 391, precoUnitario: 20.5 },
    { animalId: 11, pesoVenda: 300, precoUnitario: 20.5 },
  ],
};

describe("confirmarVendaComercial", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertFazenda.mockResolvedValue(undefined);
    mocks.loadLote.mockResolvedValue({ loteFazendaById: new Map(), pastoFazendaMap: new Map() });
  });

  it("grava venda, itens, baixa e status Vendido na mesma transação (teste B/J)", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1, nome: "Fazenda J" }],
        [{ id: 2, nome: "Comprador X", tipo: "cliente", ativo: true }],
        [
          { id: 10, brinco: "10", status: "ativo", fazendaId: 1, loteId: 5 },
          { id: 11, brinco: "28", status: "ativo", fazendaId: 1, loteId: 5 },
        ],
        [],
        [{ id: 5, nome: "Lote A" }],
      ],
      ops,
    );

    const result = await confirmarVendaComercial(1, inputBase);

    expect(result).toMatchObject({ success: true, vendaId: 44, quantidade: 2, valorTotal: 14165.5 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(ops[0]).toEqual({
      kind: "insert",
      values: expect.objectContaining({
        fazendaId: 1,
        compradorId: 2,
        comprador: "Comprador X",
        status: "concluido",
        quantidadeAnimais: 2,
      }),
    });
    expect(ops[1]?.kind).toBe("insert");
    expect(ops[2]).toEqual({
      kind: "insert",
      values: expect.arrayContaining([
        expect.objectContaining({ animalId: 10, tipo: "venda", destino: "Comprador X" }),
        expect.objectContaining({ animalId: 11, tipo: "venda" }),
      ]),
    });
    expect(ops[3]).toEqual({ kind: "update", values: { status: "vendido" } });
  });

  it("bloqueia animal duplicado antes de gravar (teste C)", async () => {
    const ops: Op[] = [];
    makeTransaction([], ops);
    await expect(
      confirmarVendaComercial(1, {
        ...inputBase,
        itens: [
          { animalId: 10, pesoVenda: 391, precoUnitario: 20.5 },
          { animalId: 10, pesoVenda: 300, precoUnitario: 20.5 },
        ],
      }),
    ).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_DUPLICADO });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("bloqueia animal de outra Fazenda (teste D)", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1, nome: "Fazenda J" }],
        [{ id: 2, nome: "Comprador X", tipo: "cliente", ativo: true }],
        [{ id: 10, brinco: "10", status: "ativo", fazendaId: 9, loteId: null }],
        [],
      ],
      ops,
    );

    await expect(
      confirmarVendaComercial(1, {
        ...inputBase,
        itens: [{ animalId: 10, pesoVenda: 391, precoUnitario: 20.5 }],
      }),
    ).rejects.toMatchObject({ message: MSG_VENDA_ANIMAL_OUTRA_FAZENDA });
    expect(ops).toHaveLength(0);
  });

  it("não confirma venda vazia", async () => {
    await expect(confirmarVendaComercial(1, { ...inputBase, itens: [] })).rejects.toMatchObject({
      message: MSG_VENDA_SEM_ITENS,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("aborta se o animal deixou de estar Ativo (teste P)", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1, nome: "Fazenda J" }],
        [{ id: 2, nome: "Comprador X", tipo: "cliente", ativo: true }],
        [{ id: 10, brinco: "10", status: "morto", fazendaId: 1, loteId: null }],
        [],
      ],
      ops,
    );

    await expect(
      confirmarVendaComercial(1, {
        ...inputBase,
        itens: [{ animalId: 10, pesoVenda: 391, precoUnitario: 20.5 }],
      }),
    ).rejects.toMatchObject({
      message: "O animal 10 não está mais disponível para Venda.",
    });
    expect(ops).toHaveLength(0);
  });

  it("faz rollback se o status não puder ser atualizado (concorrência)", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1, nome: "Fazenda J" }],
        [{ id: 2, nome: "Comprador X", tipo: "cliente", ativo: true }],
        [
          { id: 10, brinco: "10", status: "ativo", fazendaId: 1, loteId: null },
          { id: 11, brinco: "28", status: "ativo", fazendaId: 1, loteId: null },
        ],
        [],
      ],
      ops,
      1,
    );

    await expect(confirmarVendaComercial(1, inputBase)).rejects.toMatchObject({
      message: expect.stringContaining("não estão mais disponíveis"),
    });
    expect(ops.some(op => op.kind === "insert")).toBe(true);
  });
});
