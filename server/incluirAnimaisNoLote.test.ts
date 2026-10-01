import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { buildLotePeriodsForAnimal } from "../shared/historicoSubdivisaoAnimal";
import {
  createIncluirAnimaisNoLoteService,
  type IncluirAnimaisNoLoteAnimal,
  type IncluirAnimaisNoLoteLote,
  type IncluirAnimaisNoLoteMovimentacao,
  type IncluirAnimaisNoLoteStore,
} from "./incluirAnimaisNoLote";

type AnimalMem = IncluirAnimaisNoLoteAnimal;
type LoteMem = IncluirAnimaisNoLoteLote & { userId: number };
type PastoMem = { id: number; userId: number; fazendaId: number | null };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function criarStore(seed?: {
  lotes?: LoteMem[];
  pastos?: PastoMem[];
  animais?: AnimalMem[];
  falharHistorico?: boolean;
}): IncluirAnimaisNoLoteStore & {
  animais: AnimalMem[];
  movimentacoes: IncluirAnimaisNoLoteMovimentacao[];
} {
  const state = {
    lotes: clone(seed?.lotes ?? [
      { id: 1, userId: 10, fazendaId: 1, pastoAtualId: 11, ativo: true },
      { id: 2, userId: 10, fazendaId: 1, pastoAtualId: 12, ativo: true },
      { id: 3, userId: 10, fazendaId: 2, pastoAtualId: 21, ativo: true },
      { id: 4, userId: 10, fazendaId: 1, pastoAtualId: 11, ativo: false },
    ]),
    pastos: clone(seed?.pastos ?? [
      { id: 11, userId: 10, fazendaId: 1 },
      { id: 12, userId: 10, fazendaId: 1 },
      { id: 21, userId: 10, fazendaId: 2 },
    ]),
    animais: clone(seed?.animais ?? [
      { id: 101, fazendaId: 1, loteId: null, pastoId: null, status: "ativo" },
      { id: 102, fazendaId: 1, loteId: null, pastoId: 11, status: "ativo" },
      { id: 103, fazendaId: 1, loteId: 1, pastoId: 11, status: "ativo" },
      { id: 104, fazendaId: 2, loteId: null, pastoId: null, status: "ativo" },
      { id: 105, fazendaId: 1, loteId: null, pastoId: null, status: "vendido" },
    ]),
    movimentacoes: [] as IncluirAnimaisNoLoteMovimentacao[],
  };

  return {
    get animais() {
      return state.animais;
    },
    get movimentacoes() {
      return state.movimentacoes;
    },
    async findLote(userId, loteId) {
      return state.lotes.find(l => l.id === loteId && l.userId === userId) ?? null;
    },
    async findPasto(userId, pastoId) {
      return state.pastos.find(p => p.id === pastoId && p.userId === userId) ?? null;
    },
    async findAnimais(userId, animalIds) {
      const wanted = new Set(animalIds);
      return state.animais.filter(a => wanted.has(a.id));
    },
    async transaction(fn) {
      const snapAnimais = clone(state.animais);
      const snapMovs = clone(state.movimentacoes);
      try {
        return await fn({
          async updateAnimaisLocalizacao(input) {
            const ids = new Set(input.animalIds);
            for (const animal of state.animais) {
              if (!ids.has(animal.id)) continue;
              animal.loteId = input.loteId;
              animal.pastoId = input.pastoId;
              animal.fazendaId = input.fazendaId;
            }
          },
          async insertMovimentacoes(rows) {
            if (seed?.falharHistorico) {
              throw new Error("falha historico");
            }
            state.movimentacoes.push(...rows);
          },
        });
      } catch (error) {
        state.animais.splice(0, state.animais.length, ...snapAnimais);
        state.movimentacoes.splice(0, state.movimentacoes.length, ...snapMovs);
        throw error;
      }
    },
  };
}

const opts = {
  usuarioNome: "Paulo Gomes",
  dataMovimentacao: "2026-10-01",
};

describe("incluirAnimaisNoLote — histórico de entrada", () => {
  it("cenário 1: sem lote → B01 grava lote atual e uma entrada histórica", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    const out = await incluir(10, { loteId: 1, animalIds: [101] }, opts);

    expect(out).toEqual({ success: true, count: 1 });
    expect(store.animais.find(a => a.id === 101)).toMatchObject({
      loteId: 1,
      fazendaId: 1,
      pastoId: 11,
    });
    expect(store.movimentacoes).toHaveLength(1);
    expect(store.movimentacoes[0]).toMatchObject({
      userId: 10,
      animalId: 101,
      loteOrigemId: null,
      loteDestinoId: 1,
      pastoDestinoId: 11,
      fazendaId: 1,
      dataMovimentacao: "2026-10-01",
      usuarioNome: "Paulo Gomes",
    });
  });

  it("cenário 2: transferência posterior gera só mais uma movimentação", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    await incluir(10, { loteId: 1, animalIds: [101] }, opts);

    store.movimentacoes.push({
      userId: 10,
      animalId: 101,
      loteOrigemId: 1,
      loteDestinoId: 2,
      pastoOrigemId: 11,
      pastoDestinoId: 12,
      fazendaId: 1,
      dataMovimentacao: "2026-10-15",
      usuarioNome: "Paulo Gomes",
      observacoes: null,
    });
    const animal = store.animais.find(a => a.id === 101)!;
    animal.loteId = 2;
    animal.pastoId = 12;

    const doAnimal = store.movimentacoes.filter(m => m.animalId === 101);
    expect(doAnimal).toHaveLength(2);
    expect(doAnimal[0]).toMatchObject({ loteOrigemId: null, loteDestinoId: 1 });
    expect(doAnimal[1]).toMatchObject({ loteOrigemId: 1, loteDestinoId: 2 });
  });

  it("cenário 3: vários animais sem lote recebem um histórico cada", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    const out = await incluir(10, { loteId: 1, animalIds: [101, 102] }, opts);

    expect(out.count).toBe(2);
    expect(store.animais.find(a => a.id === 101)?.loteId).toBe(1);
    expect(store.animais.find(a => a.id === 102)?.loteId).toBe(1);
    expect(store.movimentacoes).toHaveLength(2);
    expect(store.movimentacoes.map(m => m.animalId).sort()).toEqual([101, 102]);
    expect(store.movimentacoes.every(m => m.loteOrigemId === null && m.loteDestinoId === 1)).toBe(true);
  });

  it("cenário 4: falha no histórico não deixa loteId alterado", async () => {
    const store = criarStore({ falharHistorico: true });
    const incluir = createIncluirAnimaisNoLoteService(store);
    await expect(incluir(10, { loteId: 1, animalIds: [101] }, opts)).rejects.toThrow(/falha historico/);
    expect(store.animais.find(a => a.id === 101)?.loteId).toBeNull();
    expect(store.movimentacoes).toHaveLength(0);
  });

  it("cenário 5: segunda inclusão do mesmo animal no B01 não duplica histórico", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    await incluir(10, { loteId: 1, animalIds: [101] }, opts);
    await expect(incluir(10, { loteId: 1, animalIds: [101] }, opts)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(store.animais.find(a => a.id === 101)?.loteId).toBe(1);
    expect(store.movimentacoes).toHaveLength(1);
  });

  it("cenário 5: animal já no B01 não cria movimentação fictícia", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    await expect(incluir(10, { loteId: 1, animalIds: [103] }, opts)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Este animal já pertence a outro lote. Use a transferência entre lotes para movimentá-lo.",
    });
    expect(store.animais.find(a => a.id === 103)?.loteId).toBe(1);
    expect(store.movimentacoes).toHaveLength(0);
  });

  it("cenário 6: fazenda/ownership inválidos continuam bloqueados", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);

    await expect(incluir(99, { loteId: 1, animalIds: [101] }, opts)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Lote não encontrado.",
    });

    await expect(incluir(10, { loteId: 1, animalIds: [104] }, opts)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Este animal pertence a outra fazenda e não pode ser incluído neste lote.",
    });
    expect(store.animais.find(a => a.id === 104)?.loteId).toBeNull();
    expect(store.movimentacoes).toHaveLength(0);

    await expect(incluir(10, { loteId: 4, animalIds: [101] }, opts)).rejects.toBeInstanceOf(TRPCError);
    expect(store.animais.find(a => a.id === 101)?.loteId).toBeNull();
  });

  it("cenário 9: sem lote → B01 → B02 reconstrói períodos", async () => {
    const store = criarStore();
    const incluir = createIncluirAnimaisNoLoteService(store);
    await incluir(10, { loteId: 1, animalIds: [101] }, opts);
    store.movimentacoes.push({
      userId: 10,
      animalId: 101,
      loteOrigemId: 1,
      loteDestinoId: 2,
      pastoOrigemId: 11,
      pastoDestinoId: 12,
      fazendaId: 1,
      dataMovimentacao: "2026-10-15",
      usuarioNome: "Paulo Gomes",
      observacoes: null,
    });

    const periods = buildLotePeriodsForAnimal(
      2,
      store.movimentacoes
        .filter(m => m.animalId === 101)
        .map((m, i) => ({
          id: i + 1,
          loteOrigemId: m.loteOrigemId,
          loteDestinoId: m.loteDestinoId,
          dataMovimentacao: m.dataMovimentacao,
        })),
    );

    expect(periods).toEqual([
      { loteId: 1, fromInclusive: "2026-10-01", toExclusive: "2026-10-15" },
      { loteId: 2, fromInclusive: "2026-10-15", toExclusive: null },
    ]);
  });

  it("cenário 10: B01 → sem lote não inventa destino nulo; período antigo permanece aberto", () => {
    const historico = [
      {
        id: 1,
        loteOrigemId: null,
        loteDestinoId: 1,
        dataMovimentacao: "2026-10-01",
      },
    ];
    expect(historico).toHaveLength(1);
    expect(historico[0]?.loteDestinoId).toBe(1);
    expect(buildLotePeriodsForAnimal(null, historico)).toEqual([
      { loteId: 1, fromInclusive: "2026-10-01", toExclusive: null },
    ]);
  });
});
