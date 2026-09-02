import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertFazenda: vi.fn(),
  registrarLocal: vi.fn(),
  getLocalAnimal: vi.fn(),
  getLocalBaixa: vi.fn(),
  isDatabaseUnavailable: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: (...args: unknown[]) => mocks.assertFazenda(...args),
}));

vi.mock("./localFallbackStore", () => ({
  registrarLocalAnimalBaixa: (...args: unknown[]) => mocks.registrarLocal(...args),
  getLocalAnimal: (...args: unknown[]) => mocks.getLocalAnimal(...args),
  getLocalAnimalBaixa: (...args: unknown[]) => mocks.getLocalBaixa(...args),
  isDatabaseUnavailable: (...args: unknown[]) => mocks.isDatabaseUnavailable(...args),
}));

import { registrarBaixaAnimal } from "./animalBaixa";
import {
  MSG_BAIXA_ANIMAL_INATIVO,
  MSG_SAIDA_MORTE_DUPLICADA,
  MSG_VENDA_VIA_MANEJO_BLOQUEADA,
} from "../shared/animalBaixa";
import { MSG_CAUSA_MORTE_INVALIDA } from "../shared/causaMorte";

type Op =
  | { kind: "insert"; values: Record<string, unknown> }
  | { kind: "update"; values: Record<string, unknown> };

function makeTransaction(selectRows: unknown[][], ops: Op[]) {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectRows.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        ops.push({ kind: "insert", values });
        return [{ insertId: 77 }];
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          ops.push({ kind: "update", values });
          return [{ affectedRows: 1 }];
        }),
      })),
    })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return tx;
}

describe("registrarBaixaAnimal — transação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertFazenda.mockResolvedValue(undefined);
    mocks.registrarLocal.mockResolvedValue({ id: 77, tipo: "venda" });
    mocks.isDatabaseUnavailable.mockReturnValue(false);
  });

  it("insere o evento e atualiza o status dentro da mesma transação", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 10, status: "ativo", fazendaId: 3 }],
        [],
      ],
      ops,
    );

    const result = await registrarBaixaAnimal(1, {
      animalId: 10,
      fazendaId: 3,
      tipo: "morte",
      dataBaixa: "2026-08-20",
      motivo: "doenca",
    });

    expect(result).toMatchObject({ success: true, id: 77, status: "morto" });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(ops).toEqual([
      {
        kind: "insert",
        values: expect.objectContaining({
          animalId: 10,
          fazendaId: 3,
          tipo: "morte",
          dataBaixa: "2026-08-20",
          motivo: "doenca",
        }),
      },
      { kind: "update", values: { status: "morto" } },
    ]);
  });

  it("bloqueia animal que já não está ativo", async () => {
    const ops: Op[] = [];
    makeTransaction([[{ id: 10, status: "vendido", fazendaId: 3 }]], ops);

    await expect(
      registrarBaixaAnimal(1, {
        animalId: 10,
        fazendaId: 3,
        tipo: "morte",
        dataBaixa: "2026-08-20",
      }),
    ).rejects.toMatchObject({ message: MSG_BAIXA_ANIMAL_INATIVO });
    expect(ops).toHaveLength(0);
  });

  it("bloqueia uma segunda baixa antes de qualquer escrita", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 10, status: "ativo", fazendaId: 3 }],
        [{ id: 4 }],
      ],
      ops,
    );

    await expect(
      registrarBaixaAnimal(1, {
        animalId: 10,
        fazendaId: 3,
        tipo: "morte",
        dataBaixa: "2026-08-20",
      }),
    ).rejects.toMatchObject({ message: MSG_SAIDA_MORTE_DUPLICADA });
    expect(ops).toHaveLength(0);
  });

  it("rejeita nova Venda pelo endpoint de Movimentação", async () => {
    const ops: Op[] = [];
    makeTransaction([], ops);

    await expect(
      registrarBaixaAnimal(1, {
        animalId: 10,
        fazendaId: 3,
        tipo: "venda",
        dataBaixa: "2026-08-20",
      }),
    ).rejects.toMatchObject({ message: MSG_VENDA_VIA_MANEJO_BLOQUEADA });
    expect(ops).toHaveLength(0);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejeita causa textual livre em novo registro de Morte", async () => {
    const ops: Op[] = [];
    makeTransaction([], ops);

    await expect(
      registrarBaixaAnimal(1, {
        animalId: 10,
        fazendaId: 3,
        tipo: "morte",
        dataBaixa: "2026-08-20",
        motivo: "picada de cobra",
      }),
    ).rejects.toMatchObject({ message: MSG_CAUSA_MORTE_INVALIDA });
    expect(ops).toHaveLength(0);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("persiste Outro com a descrição no motivo, sem misturar observações", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 10, status: "ativo", fazendaId: 3 }],
        [],
      ],
      ops,
    );

    await registrarBaixaAnimal(1, {
      animalId: 10,
      fazendaId: 3,
      tipo: "morte",
      dataBaixa: "2026-08-20",
      motivo: "outro:Picada de cobra",
      observacoes: "Animal estava em tratamento há três dias.",
    });

    expect(ops[0]).toEqual({
      kind: "insert",
      values: expect.objectContaining({
        tipo: "morte",
        motivo: "outro:Picada de cobra",
        observacoes: "Animal estava em tratamento há três dias.",
      }),
    });
  });

  it("grava Transferência externa com Status Transferido sem mudar Fazenda/Lote", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 28, status: "ativo", fazendaId: 3 }],
        [],
      ],
      ops,
    );

    const result = await registrarBaixaAnimal(1, {
      animalId: 28,
      fazendaId: 3,
      tipo: "transferencia",
      dataBaixa: "2026-08-31",
      destino: "  Fazenda Santa Maria  ",
    });

    expect(result).toMatchObject({ success: true, status: "transferido" });
    expect(ops).toEqual([
      {
        kind: "insert",
        values: expect.objectContaining({
          animalId: 28,
          fazendaId: 3,
          tipo: "transferencia",
          dataBaixa: "2026-08-31",
          destino: "Fazenda Santa Maria",
          motivo: null,
        }),
      },
      { kind: "update", values: { status: "transferido" } },
    ]);
    expect(ops[1]?.values).not.toHaveProperty("fazendaId");
    expect(ops[1]?.values).not.toHaveProperty("loteId");
  });
});
