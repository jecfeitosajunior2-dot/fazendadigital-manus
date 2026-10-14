import { describe, expect, it } from "vitest";
import { persistirCapital } from "../shared/estoqueCapital";
import { calcularQuantidadeEstoquePorDose } from "../client/src/lib/produto-types";
import {
  MSG_SAUDE_ESTORNO_DUPLO,
  MSG_SAUDE_ESTORNO_LEGADO,
  SAUDE_MOV_MANEJO,
  SAUDE_MOV_TIPO,
  SAUDE_STATUS_ESTORNADO,
} from "../shared/saudeEstoque";
import {
  estornarManejoSanitarioNoTx,
  persistirManejoSanitarioNoTx,
  SaudeEstoqueError,
  type SaudeEstoqueTx,
  type SaudeMovimentacaoRow,
  type SaudeRegistroRow,
} from "./saudeEstoque";
import type { EstoqueItemParaMovimentacao } from "./estoqueMovimentacaoTx";

type MemEstoque = EstoqueItemParaMovimentacao & {
  valorTotalEstoque: string;
  capitalInicializadoEm: Date | null;
};

type MemMov = SaudeMovimentacaoRow & {
  motivoEstorno?: string;
  valor?: string;
};

type MemState = {
  estoques: Map<number, MemEstoque>;
  movs: MemMov[];
  saudes: SaudeRegistroRow[];
  nextSaude: number;
  nextMov: number;
};

function cap(valor: string | number | null | undefined): string {
  return persistirCapital(String(valor ?? "0"));
}

function cloneState(state: MemState): MemState {
  return {
    estoques: new Map(
      [...state.estoques.entries()].map(([id, item]) => [id, { ...item }]),
    ),
    movs: state.movs.map((m) => ({ ...m })),
    saudes: state.saudes.map((s) => ({ ...s })),
    nextSaude: state.nextSaude,
    nextMov: state.nextMov,
  };
}

function restoreState(target: MemState, snap: MemState) {
  target.estoques = snap.estoques;
  target.movs = snap.movs;
  target.saudes = snap.saudes;
  target.nextSaude = snap.nextSaude;
  target.nextMov = snap.nextMov;
}

function criarMem(opts?: { failAfterRegistro?: boolean }): { state: MemState; tx: SaudeEstoqueTx; withTx: <T>(fn: (tx: SaudeEstoqueTx) => Promise<T>) => Promise<T> } {
  const state: MemState = {
    estoques: new Map(),
    movs: [],
    saudes: [],
    nextSaude: 1,
    nextMov: 1,
  };

  function buildTx(): SaudeEstoqueTx {
    return {
      async findEstoque(id) {
        return state.estoques.get(id) ?? null;
      },
      async insertMovimentacao(values) {
        if (opts?.failAfterRegistro && state.saudes.length > 0) {
          throw new Error("falha sintética após o registro sanitário");
        }
        const id = state.nextMov++;
        const row: MemMov = {
          id,
          estoqueId: values.estoqueId,
          quantidade: values.quantidade,
          valorEstoqueMovimentado: values.valorEstoqueMovimentado ?? null,
          grupoId: values.grupoId ?? null,
          tipo: values.tipo ?? null,
          manejo: values.manejo ?? null,
          status: values.status ?? "ativa",
          destino: values.destino ?? null,
          fazendaId: values.fazendaId ?? null,
          valor: values.valor ?? undefined,
        };
        state.movs.push(row);
        return id;
      },
      async updateEstoque(id, patch) {
        const item = state.estoques.get(id);
        if (!item) throw new Error("Produto não encontrado.");
        item.quantidade = patch.quantidade;
        if (patch.valorUnitario != null) item.valorUnitario = patch.valorUnitario;
        if (patch.valorTotalEstoque != null) item.valorTotalEstoque = patch.valorTotalEstoque;
      },
      async insertRegistro(row) {
        const id = state.nextSaude++;
        state.saudes.push({
          ...row,
          id,
          estoqueMovimentacaoId: row.estoqueMovimentacaoId ?? null,
          status: row.status,
        });
        return id;
      },
      async updateRegistro(id, patch) {
        const row = state.saudes.find((s) => s.id === id);
        if (!row) throw new Error("Registro sanitário não encontrado.");
        const { estornadoEmAgora, ...rest } = patch;
        Object.assign(row, rest);
        if (estornadoEmAgora) row.estornadoEm = "CURRENT_TIMESTAMP";
      },
      async findRegistro(userId, id) {
        return state.saudes.find((s) => s.id === id && s.userId === userId) ?? null;
      },
      async findMovimentacao(id) {
        return state.movs.find((m) => m.id === id) ?? null;
      },
      async marcarMovimentacaoEstornada(id, motivo) {
        const mov = state.movs.find((m) => m.id === id);
        if (mov) {
          mov.status = "estornada";
          mov.motivoEstorno = motivo;
        }
      },
    };
  }

  async function withTx<T>(fn: (tx: SaudeEstoqueTx) => Promise<T>): Promise<T> {
    const snap = cloneState(state);
    try {
      return await fn(buildTx());
    } catch (err) {
      restoreState(state, snap);
      throw err;
    }
  }

  return { state, tx: buildTx(), withTx };
}

function seedCapital(state: MemState, id = 1) {
  state.estoques.set(id, {
    id,
    fazendaId: 10,
    quantidade: "10.00",
    controlarSaldo: true,
    valorUnitario: "10.000000",
    valorTotalEstoque: "100.00",
    capitalInicializadoEm: new Date("2026-10-01T12:00:00"),
    nome: "Vacina teste",
  });
}

const baseCreate = {
  userId: 910001,
  registradoPor: "Teste isolado",
  animalId: 77,
  fazendaId: 10,
  tipo: "Vacinação",
  medicamento: "Vacina teste",
  dosagem: "2 un",
  estoqueId: 1,
  quantidadeConsumo: "2",
  valorUnitario: "10.00",
  custoPrevisto: "20.00",
  dataRegistro: "2026-10-12",
};

describe("saudeEstoque — persistir e estornar", () => {
  it("grava data civil 2026-10-13 sem virar Date/UTC", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    await withTx((tx) => persistirManejoSanitarioNoTx(tx, {
      ...baseCreate,
      dataRegistro: "2026-10-13",
    }));
    expect(state.saudes[0]?.dataRegistro).toBe("2026-10-13");
    expect(state.saudes[0]?.dataRegistro).not.toBeInstanceOf(Date);
  });

  it("A. criação CAPITAL baixa quantidade, capital, cria movimentação e vincula", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    const out = await withTx((tx) => persistirManejoSanitarioNoTx(tx, baseCreate));
    const item = state.estoques.get(1)!;
    const mov = state.movs[0];
    const saude = state.saudes[0];
    expect(Number(item.quantidade)).toBe(8);
    expect(cap(item.valorTotalEstoque)).toBe("80.00");
    expect(cap(mov.valorEstoqueMovimentado)).toBe("20.00");
    expect(Number(mov.quantidade)).toBe(-2);
    expect(mov.tipo).toBe(SAUDE_MOV_TIPO);
    expect(mov.manejo).toBe(SAUDE_MOV_MANEJO);
    expect(mov.valor).toBeUndefined();
    expect(saude.estoqueMovimentacaoId).toBe(out.movimentacaoId);
    expect(cap(out.custo)).toBe("20.00");
    expect(cap(saude.custo)).toBe("20.00");
  });

  it("B. estorno devolve snapshot, cria inversa e preserva o registro", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    const created = await withTx((tx) => persistirManejoSanitarioNoTx(tx, baseCreate));
    await withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));
    const item = state.estoques.get(1)!;
    const saude = state.saudes[0];
    const inversa = state.movs.find((m) => m.status === "estorno");
    const original = state.movs.find((m) => m.id === created.movimentacaoId);
    expect(state.saudes).toHaveLength(1);
    expect(saude.status).toBe(SAUDE_STATUS_ESTORNADO);
    expect(saude.motivoEstorno).toBeTruthy();
    expect(Number(item.quantidade)).toBe(10);
    expect(cap(item.valorTotalEstoque)).toBe("100.00");
    expect(inversa).toBeTruthy();
    expect(Number(inversa!.quantidade)).toBe(2);
    expect(cap(inversa!.valorEstoqueMovimentado)).toBe("20.00");
    expect(original?.status).toBe("estornada");
  });

  it("C. custo médio mudou depois — estorno usa o snapshot original", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    const created = await withTx((tx) => persistirManejoSanitarioNoTx(tx, baseCreate));
    const item = state.estoques.get(1)!;
    item.valorTotalEstoque = "240.00";
    item.valorUnitario = "30.000000";
    await withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));
    const depois = state.estoques.get(1)!;
    expect(Number(depois.quantidade)).toBe(10);
    expect(cap(depois.valorTotalEstoque)).toBe("260.00");
    const inversa = state.movs.find((m) => m.status === "estorno");
    expect(cap(inversa!.valorEstoqueMovimentado)).toBe("20.00");
  });

  it("D. duplo estorno é bloqueado", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    const created = await withTx((tx) => persistirManejoSanitarioNoTx(tx, baseCreate));
    await withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }));
    await expect(withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: created.id,
      hojeISO: "2026-10-13",
    }))).rejects.toThrow(MSG_SAUDE_ESTORNO_DUPLO);
    expect(state.movs.filter((m) => m.status === "estorno")).toHaveLength(1);
  });

  it("E. legado sem vínculo não inventa movimento nem capital", async () => {
    const { state, withTx } = criarMem();
    seedCapital(state);
    state.saudes.push({
      id: 50,
      userId: 910001,
      animalId: 77,
      tipo: "Vacinação",
      estoqueId: 1,
      quantidadeConsumo: "2",
      custo: "20.00",
      dataRegistro: "2026-09-01",
      estoqueMovimentacaoId: null,
      status: "ativo",
    });
    state.nextSaude = 51;
    await expect(withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: 50,
      hojeISO: "2026-10-13",
    }))).rejects.toBeInstanceOf(SaudeEstoqueError);
    await expect(withTx((tx) => estornarManejoSanitarioNoTx(tx, {
      userId: 910001,
      registradoPor: "Teste isolado",
      id: 50,
      hojeISO: "2026-10-13",
    }))).rejects.toThrow(MSG_SAUDE_ESTORNO_LEGADO);
    expect(state.movs).toHaveLength(0);
    expect(Number(state.estoques.get(1)!.quantidade)).toBe(10);
    expect(cap(state.estoques.get(1)!.valorTotalEstoque)).toBe("100.00");
    expect(state.saudes[0].status).toBe("ativo");
  });

  it("F. rollback: falha depois do registro não deixa manejo nem baixa", async () => {
    const { state, withTx } = criarMem({ failAfterRegistro: true });
    seedCapital(state);
    await expect(withTx((tx) => persistirManejoSanitarioNoTx(tx, baseCreate)))
      .rejects.toThrow(/falha sintética/);
    expect(state.saudes).toHaveLength(0);
    expect(state.movs).toHaveLength(0);
    expect(Number(state.estoques.get(1)!.quantidade)).toBe(10);
    expect(cap(state.estoques.get(1)!.valorTotalEstoque)).toBe("100.00");
  });

  it("conversão de unidade: 20 ml em frasco de 10 ml vira 2 fr no estoque", async () => {
    const conv = calcularQuantidadeEstoquePorDose({
      doseValor: 20,
      doseUnidade: "ml",
      unidadeEstoque: "fr",
      embalagensRaw: JSON.stringify([{ nome: "Frasco 10 ml", volume: 10, unidade: "ml" }]),
    });
    expect("quantidade" in conv).toBe(true);
    if (!("quantidade" in conv)) return;
    expect(conv.quantidade).toBe(2);

    const { state, withTx } = criarMem();
    seedCapital(state);
    const out = await withTx((tx) => persistirManejoSanitarioNoTx(tx, {
      ...baseCreate,
      quantidadeConsumo: String(conv.quantidade),
      dosagem: "20 ml",
      unidadeEstoque: "fr",
    }));
    expect(Number(state.estoques.get(1)!.quantidade)).toBe(8);
    expect(cap(out.custo)).toBe("20.00");
    expect(Number(state.movs[0].quantidade)).toBe(-2);
  });
});
