import { beforeEach, describe, expect, it, vi } from "vitest";
import { MSG_COMPRA_FORNECEDOR_INVALIDO, MSG_COMPRA_MODO_INDIVIDUAL } from "../shared/compraComercial";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  assertFazenda: vi.fn(),
}));

vi.mock("./db", () => ({
  db: {
    transaction: (...args: unknown[]) => mocks.transaction(...args),
  },
}));

vi.mock("./manejoContexto", () => ({
  assertFazendaDoUsuario: (...args: unknown[]) => mocks.assertFazenda(...args),
}));

import { confirmarCompraNaoIdentificados } from "./confirmarCompra";
import { avaliarConfirmacaoCompraNaoIdentificados } from "../shared/compraComercial";

type Op = { kind: string; table?: string; values: unknown };

function makeTransaction(selectRows: unknown[][], ops: Op[]) {
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn((table: { [Symbol.toStringTag]?: string }) => ({
        where: vi.fn(() => {
          const rows = selectRows.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(async () => rows),
          });
        }),
      })),
    })),
    insert: vi.fn((table: { _: { name?: string } }) => ({
      values: vi.fn(async (values: unknown) => {
        ops.push({ kind: "insert", table: String(table?._?.name ?? "unknown"), values });
        return [{ insertId: 15 }];
      }),
    })),
  };
  mocks.transaction.mockImplementation(async callback => callback(tx));
  return tx;
}

const inputBase = {
  fazendaId: 1,
  data: "2026-09-22",
  fornecedorId: 9,
  formaPrecificacao: "kg" as const,
  precoUnitario: 12.5,
  frete: 3000,
  outrosCustos: 0,
  modoIdentificacao: "nao_identificados" as const,
  grupos: [
    { categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: 4400 },
    { categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: 4000 },
  ],
};

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.assertFazenda.mockReset();
  mocks.assertFazenda.mockResolvedValue(undefined);
});

describe("confirmarCompraNaoIdentificados", () => {
  it("19. isolamento: fazenda de outro usuário é barrada antes da transação", async () => {
    mocks.assertFazenda.mockRejectedValue(new Error("fazenda alheia"));
    await expect(confirmarCompraNaoIdentificados(1, inputBase)).rejects.toThrow("fazenda alheia");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("20. confirma sem lote/pasto e ignora destino enviado", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1 }],
        [{ id: 9, nome: "Agro Central", tipo: "fornecedor", ativo: true }],
      ],
      ops,
    );
    const result = await confirmarCompraNaoIdentificados(1, {
      ...inputBase,
      loteDestinoId: 80,
      pastoDestinoId: 99,
    });
    expect(result.success).toBe(true);
    const compra = ops.find(op => op.kind === "insert")?.values as {
      loteDestinoId?: number | null;
      pastoDestinoId?: number | null;
    };
    expect(compra.loteDestinoId).toBeNull();
    expect(compra.pastoDestinoId).toBeNull();
  });

  it("21-23. não cria animal, pesagem nem movimentação", async () => {
    const ops: Op[] = [];
    makeTransaction(
      [
        [{ id: 1 }],
        [{ id: 9, nome: "Agro Central", tipo: "fornecedor", ativo: true }],
        [],
      ],
      ops,
    );
    const result = await confirmarCompraNaoIdentificados(1, inputBase);
    expect(result.success).toBe(true);
    expect(result.compraId).toBe(15);
    expect(result.quantidade).toBe(40);
    expect(result.custoTotal).toBe(108000);
    const tabelas = ops.map(op => JSON.stringify(op.values)).join(" ");
    expect(tabelas).not.toMatch(/brinco|pesoAtual|animalId/);
    expect(ops).toHaveLength(2);
  });

  it("fornecedor de outro tipo ou inativo é rejeitado", async () => {
    makeTransaction(
      [
        [{ id: 1 }],
        [{ id: 9, nome: "Lucas Coelho", tipo: "cliente", ativo: true }],
        [],
      ],
      [],
    );
    await expect(confirmarCompraNaoIdentificados(1, inputBase)).rejects.toMatchObject({
      message: MSG_COMPRA_FORNECEDOR_INVALIDO,
    });
  });

  it("recalcula no backend e ignora total do navegador", () => {
    const r = avaliarConfirmacaoCompraNaoIdentificados({
      ...inputBase,
      precoUnitario: 12.5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.calculado.custoTotal).toBe(108000);
      expect(r.calculado.valorAnimais).toBe(105000);
    }
  });

  it("modo individual não passa na avaliação", () => {
    expect(
      avaliarConfirmacaoCompraNaoIdentificados({
        ...inputBase,
        modoIdentificacao: "individuais",
      }),
    ).toEqual({ ok: false, message: MSG_COMPRA_MODO_INDIVIDUAL });
  });
});
