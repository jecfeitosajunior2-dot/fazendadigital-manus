import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createNutricaoFornecimentosService,
  type FornIngPersistido,
  type FornMovPersistido,
  type FornPersistido,
  type FornStore,
} from "./nutricaoFornecimentos";
import type { NutricaoFornEstoqueRef, NutricaoFornInput, NutricaoFornPlanejamentoRef } from "../shared/nutricaoFornecimentos";
import type { NutricaoCochoRef } from "../shared/nutricaoCochos";
import { MSG_FORN_JA_ESTORNADO, MSG_FORN_MOTIVO, MSG_FORN_NAO_EDITAR, MSG_FORN_SALDO } from "../shared/nutricaoFornecimentos";
import { MSG_CONVERSAO_KG_AMBIGUA, MSG_CONVERSAO_KG_INDISPONIVEL } from "../shared/estoqueConversaoKg";
import type { NutricaoPlanDietaRef, NutricaoPlanLoteRef } from "../shared/nutricaoPlanejamento";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(seed?: {
  produtos?: NutricaoFornEstoqueRef[];
  dietas?: NutricaoPlanDietaRef[];
  planejamentos?: NutricaoFornPlanejamentoRef[];
  cochos?: NutricaoCochoRef[];
  animais?: number[];
  falharNaSegundaSaida?: boolean;
  falharEstorno?: boolean;
  batidas?: import("../shared/nutricaoFornecimentos").NutricaoFornBatidaRef[];
}): FornStore & {
  rows: FornPersistido[];
  ings: FornIngPersistido[];
  movs: FornMovPersistido[];
  produtos: NutricaoFornEstoqueRef[];
  dietas: NutricaoPlanDietaRef[];
  cochos: NutricaoCochoRef[];
  previewCount: number;
} {
  const state = {
    lotes: [
      { id: 1, userId: 10, fazendaId: 1, ativo: true, nome: "B01" },
      { id: 2, userId: 10, fazendaId: 2, ativo: true, nome: "Lote B" },
    ] as NutricaoPlanLoteRef[],
    produtos: seed?.produtos ?? [
      { estoqueId: 100, produtoId: 10, nome: "Sal", unidade: "kg", valorUnitario: "3.20", quantidade: "100", controlarSaldo: true, vinculadoFazenda: true },
      { estoqueId: 101, produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "2.10", quantidade: "80", controlarSaldo: true, vinculadoFazenda: true },
      { estoqueId: 102, produtoId: 12, nome: "Núcleo", unidade: "kg", valorUnitario: "4.00", quantidade: "40", controlarSaldo: true, vinculadoFazenda: true },
    ],
    dietas: seed?.dietas ?? [{
      id: 5, userId: 10, fazendaId: 1, nome: "Dieta 90", status: "ativa",
      dataInicio: null, dataFim: null, baseQuantidade: 1000,
      ingredientes: [
        { produtoId: 10, quantidadeKg: 600 },
        { produtoId: 11, quantidadeKg: 250 },
        { produtoId: 12, quantidadeKg: 150 },
      ],
    }],
    planejamentos: seed?.planejamentos ?? [{
      id: 7, fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10, dietaId: null,
      modalidadeMeta: "g_cab_dia", valorMeta: 100, status: "ativo",
      dataInicio: "2026-10-01", dataFim: null,
    }],
    cochos: seed?.cochos ?? [{
      id: 3, userId: 10, fazendaId: 1, nome: "Cocho Pasto 444", codigo: "C01", status: "ativo",
    }],
    animais: seed?.animais ?? Array.from({ length: 100 }, (_, i) => i + 1),
    rows: [] as FornPersistido[],
    ings: [] as FornIngPersistido[],
    movs: [] as FornMovPersistido[],
    nextF: 1,
    nextM: 1,
    previewCount: 0,
    batidas: seed?.batidas ?? [] as import("../shared/nutricaoFornecimentos").NutricaoFornBatidaRef[],
    txQueue: Promise.resolve() as Promise<unknown>,
  };

  function refBatida(id: number) {
    const batida = state.batidas.find(b => b.id === id);
    if (!batida) return null;
    const dist = state.rows
      .filter(r => r.batidaId === id && r.status === "confirmado")
      .reduce((s, r) => s + Number(r.quantidadeFornecidaKg), 0);
    return {
      ...batida,
      quantidadeDistribuidaKg: dist,
      saldoDisponivelKg: Number(batida.quantidadePreparadaKg) - dist,
    };
  }

  return {
    get rows() { return state.rows; },
    get ings() { return state.ings; },
    get movs() { return state.movs; },
    get produtos() { return state.produtos; },
    get dietas() { return state.dietas; },
    get cochos() { return state.cochos; },
    get previewCount() { return state.previewCount; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async getLote(userId, loteId) {
      return state.lotes.find(l => l.id === loteId && l.userId === userId) ?? null;
    },
    async listAnimaisAtivosLote() { return state.animais; },
    async listProdutosFazenda() { return state.produtos; },
    async getDieta(userId, dietaId) {
      return state.dietas.find(d => d.id === dietaId && d.userId === userId) ?? null;
    },
    async getPlanejamento(userId, id) {
      if (userId !== 10) return null;
      return state.planejamentos.find(p => p.id === id) ?? null;
    },
    async getCocho(userId, id) {
      if (userId !== 10) return null;
      return state.cochos.find(c => c.id === id) ?? null;
    },
    async getBatida(userId, id) {
      if (userId !== 10) return null;
      return refBatida(id);
    },
    async listPlanejamentosLote(userId, fazendaId, loteId) {
      if (userId !== 10) return [];
      return state.planejamentos.filter(p => p.fazendaId === fazendaId && p.loteId === loteId);
    },
    async find(userId, id) {
      return state.rows.find(r => r.id === id && r.userId === userId) ?? null;
    },
    async list(userId, fazendaId) {
      return state.rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
    },
    async listIngredientes(fornecimentoId) {
      return state.ings.filter(i => i.fornecimentoId === fornecimentoId);
    },
    async listMovimentacoes(fornecimentoId) {
      return state.movs.filter(m => m.fornecimentoId === fornecimentoId);
    },
    async transaction(fn) {
      const run = async () => {
      const snap = {
        rows: clone(state.rows),
        ings: clone(state.ings),
        movs: clone(state.movs),
        produtos: clone(state.produtos),
        nextF: state.nextF,
        nextM: state.nextM,
      };
      try {
        return await fn({
          async insertFornecimento(row) {
            const id = state.nextF++;
            state.rows.push({ id, ...row });
            return id;
          },
          async insertIngredientes(rows) { state.ings.push(...rows); },
          async debitarEstoque(estoqueId, qtd) {
            const p = state.produtos.find(x => x.estoqueId === estoqueId);
            if (!p) throw new Error("sem produto");
            const atual = Number(p.quantidade ?? 0);
            if (atual < qtd) throw new Error("saldo");
            p.quantidade = String(atual - qtd);
          },
          async insertSaida(row) {
            if (seed?.falharNaSegundaSaida && state.movs.length >= 1) throw new Error("falha segunda saida");
            const id = state.nextM++;
            state.movs.push({
              id,
              fornecimentoId: row.fornecimentoId,
              estoqueId: row.estoqueId,
              quantidade: String(-Math.abs(row.quantidadeUnidade)),
              tipo: "Consumo interno",
              status: "ativa",
              unidadeEstoqueSnapshot: row.unidadeEstoqueSnapshot ?? null,
              conteudoPorUnidadeSnapshot:
                row.conteudoPorUnidadeSnapshot == null ? null : String(row.conteudoPorUnidadeSnapshot),
              unidadeConteudoSnapshot: row.unidadeConteudoSnapshot ?? null,
              quantidadeFisicaSnapshot:
                row.quantidadeFisicaSnapshot == null ? null : String(row.quantidadeFisicaSnapshot),
              unidadeFisicaSnapshot: row.unidadeFisicaSnapshot ?? null,
            });
            return id;
          },
          async listMovimentacoesAtivas(fornecimentoId) {
            return state.movs.filter(m => m.fornecimentoId === fornecimentoId && m.status === "ativa");
          },
          async marcarEstornadas(ids) {
            for (const m of state.movs) if (ids.includes(m.id)) m.status = "estornada";
          },
          async insertEstorno(row) {
            if (seed?.falharEstorno) throw new Error("falha estorno");
            state.movs.push({
              id: state.nextM++,
              fornecimentoId: row.fornecimentoId,
              estoqueId: row.estoqueId,
              quantidade: String(Math.abs(row.quantidadeUnidade)),
              tipo: "Consumo interno",
              status: "estorno",
              unidadeEstoqueSnapshot: row.unidadeEstoqueSnapshot ?? null,
              conteudoPorUnidadeSnapshot:
                row.conteudoPorUnidadeSnapshot == null ? null : String(row.conteudoPorUnidadeSnapshot),
              unidadeConteudoSnapshot: row.unidadeConteudoSnapshot ?? null,
              quantidadeFisicaSnapshot:
                row.quantidadeFisicaSnapshot == null ? null : String(row.quantidadeFisicaSnapshot),
              unidadeFisicaSnapshot: row.unidadeFisicaSnapshot ?? null,
            });
          },
          async creditarEstoque(estoqueId, qtd) {
            const p = state.produtos.find(x => x.estoqueId === estoqueId);
            if (p) p.quantidade = String(Number(p.quantidade ?? 0) + qtd);
          },
          async setEstornado(id, patch) {
            const row = state.rows.find(r => r.id === id);
            if (row) {
              row.status = "estornado";
              row.motivoEstorno = patch.motivoEstorno;
              row.observacaoEstorno = patch.observacaoEstorno;
            }
          },
          async lockBatida(id) {
            return refBatida(id);
          },
        });
      } catch (error) {
        state.rows = snap.rows;
        state.ings = snap.ings;
        state.movs = snap.movs;
        state.produtos = snap.produtos;
        state.nextF = snap.nextF;
        state.nextM = snap.nextM;
        throw error;
      }
      };
      const next = state.txQueue.then(run, run);
      state.txQueue = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

const produtoInput = (over: Partial<NutricaoFornInput> = {}): NutricaoFornInput => ({
  fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10,
  data: "2026-10-01", quantidadeFornecidaKg: 20, ...over,
});

const dietaInput = (over: Partial<NutricaoFornInput> = {}): NutricaoFornInput => ({
  fazendaId: 1, loteId: 1, tipoOrigem: "dieta", dietaId: 5,
  data: "2026-10-01", quantidadeFornecidaKg: 100, ...over,
});

describe("nutricaoFornecimentos service", () => {
  it("1/4/12/18/39: avulso de produto baixa uma vez e snapshota custo", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    const out = await svc.confirmar(10, "Pedro", produtoInput(), "2026-10-01");
    expect(out.id).toBe(1);
    expect(Number(store.produtos[0]?.quantidade)).toBe(80);
    expect(store.movs).toHaveLength(1);
    expect(store.movs[0]?.quantidade).toBe("-20");
    expect(store.movs[0]?.fornecimentoId).toBe(1);
    expect(store.rows[0]?.custoCompleto).toBe(true);
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(64);
    expect(store.rows[0]?.populacaoSnapshot).toBe(100);
    expect(store.ings).toHaveLength(0);
  });

  it("2/38: ligado a planejamento não altera o planejamento", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ planejamentoId: 7, quantidadeFornecidaKg: 12 }), "2026-10-01");
    expect(store.rows[0]?.planejamentoId).toBe(7);
    expect(store.rows[0]?.planejamentoMetaSnapshot).toContain("g/cab");
    const plan = await store.getPlanejamento(10, 7);
    expect(plan?.valorMeta).toBe(100);
    expect(plan?.status).toBe("ativo");
  });

  it("3: sem planejamento é permitido", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ planejamentoId: null }), "2026-10-01");
    expect(store.rows[0]?.planejamentoId).toBeNull();
  });

  it("5/6/13: dieta baixa ingredientes e não cria produto dieta", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput(), "2026-10-01");
    expect(store.movs).toHaveLength(3);
    expect(store.ings).toHaveLength(3);
    expect(store.ings.map(i => Number(i.quantidadeKg))).toEqual([60, 25, 15]);
    expect(Number(store.produtos[0]?.quantidade)).toBe(40);
    expect(Number(store.produtos[1]?.quantidade)).toBe(55);
    expect(Number(store.produtos[2]?.quantidade)).toBe(25);
    expect(store.rows[0]?.produtoId).toBeNull();
  });

  it("7: saldo insuficiente de produto bloqueia tudo", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", produtoInput({ quantidadeFornecidaKg: 200 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_FORN_SALDO });
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
  });

  it("8/9: falha na 2ª saída da dieta faz rollback", async () => {
    const store = criarStore({ falharNaSegundaSaida: true });
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", dietaInput(), "2026-10-01")).rejects.toThrow(/falha segunda/);
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(store.ings).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
  });

  it("10: preview não baixa estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    const prev = await svc.preview(10, produtoInput(), "2026-10-01");
    expect(prev.preview.podeConfirmar).toBe(true);
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
  });

  it("14: custo posterior não muda snapshot", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput(), "2026-10-01");
    store.produtos[0]!.valorUnitario = "9.99";
    const got = await svc.obter(10, 1);
    expect(Number(got.custoTotalSnapshot)).toBe(64);
  });

  it("15/29: mudança da dieta não altera snapshot; estorno usa snapshot", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput(), "2026-10-01");
    store.dietas[0]!.ingredientes = [{ produtoId: 10, quantidadeKg: 1000 }];
    const got = await svc.obter(10, 1);
    expect(got.ingredientes.map(i => Number(i.quantidadeKg))).toEqual([60, 25, 15]);
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
    expect(Number(store.produtos[1]?.quantidade)).toBe(80);
    expect(Number(store.produtos[2]?.quantidade)).toBe(40);
  });

  it("17: custo desconhecido com saldo permite operação", async () => {
    const store = criarStore({
      produtos: [{ estoqueId: 100, produtoId: 10, nome: "Sal", unidade: "kg", valorUnitario: null, quantidade: "50", controlarSaldo: true, vinculadoFazenda: true }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ quantidadeFornecidaKg: 10 }), "2026-10-01");
    expect(store.rows[0]?.custoCompleto).toBe(false);
    expect(store.rows[0]?.custoTotalSnapshot).toBeNull();
    expect(Number(store.produtos[0]?.quantidade)).toBe(40);
  });

  it("24: produto incompatível com planejamento é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", dietaInput({ planejamentoId: 7 }), "2026-10-01"))
      .rejects.toBeTruthy();
    expect(store.rows).toHaveLength(0);
  });

  it("25/26/35: ownership", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput(), "2026-10-01");
    await expect(svc.obter(99, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.confirmar(10, "Pedro", produtoInput({ loteId: 2 }), "2026-10-01")).rejects.toBeTruthy();
    const lista = await svc.listar(10, { fazendaId: 1 });
    expect(lista).toHaveLength(1);
    expect(lista[0]?.planejamentoId).toBeNull();
    expect(lista[0]?.origemOperacional).toBe("direta");
  });

  it("vínculo histórico do planejamentoId na lista e no estorno", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ planejamentoId: 7 }), "2026-10-01");
    const comVinculo = await svc.listar(10, { fazendaId: 1 });
    expect(comVinculo[0]?.planejamentoId).toBe(7);
    expect(comVinculo[0]?.origemOperacional).toBe("direta");
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(store.rows[0]?.planejamentoId).toBe(7);
    expect(store.rows[0]?.status).toBe("estornado");
    const depois = await svc.listar(10, { fazendaId: 1 });
    expect(depois[0]?.planejamentoId).toBe(7);
    expect(depois[0]?.status).toBe("estornado");
  });

  it("27/30/31: estorno de produto, segundo bloqueado, motivo obrigatório", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput(), "2026-10-01");
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "" }, "2026-10-02"))
      .rejects.toMatchObject({ message: MSG_FORN_MOTIVO });
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
    expect(store.rows[0]?.status).toBe("estornado");
    expect(store.movs.some(m => m.status === "estorno")).toBe(true);
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "outro" }, "2026-10-03"))
      .rejects.toMatchObject({ message: MSG_FORN_JA_ESTORNADO });
  });

  it("32: falha no estorno faz rollback", async () => {
    const store = criarStore({ falharEstorno: true });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput(), "2026-10-01");
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02"))
      .rejects.toThrow(/falha estorno/);
    expect(store.rows[0]?.status).toBe("confirmado");
    expect(Number(store.produtos[0]?.quantidade)).toBe(80);
  });

  it("33: edição destrutiva é recusada", () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    expect(() => svc.recusarEdicao()).toThrow(MSG_FORN_NAO_EDITAR);
  });

  it("20: fornecimento sem cocho continua válido", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ cochoId: null }), "2026-10-01");
    expect(store.rows[0]?.cochoId).toBeNull();
  });

  it("21/25: fornecimento com cocho ativo grava snapshot", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ cochoId: 3 }), "2026-10-01");
    expect(store.rows[0]?.cochoId).toBe(3);
    expect(store.rows[0]?.cochoNomeSnapshot).toBe("Cocho Pasto 444 (C01)");
    expect(Number(store.produtos[0]?.quantidade)).toBe(80);
  });

  it("22: cocho de outra fazenda é bloqueado", async () => {
    const store = criarStore({
      cochos: [{ id: 9, userId: 10, fazendaId: 2, nome: "Outro", status: "ativo" }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", produtoInput({ cochoId: 9 }), "2026-10-01")).rejects.toBeTruthy();
    expect(store.rows).toHaveLength(0);
  });

  it("23/24/26: inativo bloqueia novo; snapshot antigo permanece", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ cochoId: 3 }), "2026-10-01");
    store.cochos[0]!.status = "inativo";
    store.cochos[0]!.nome = "Renomeado";
    const got = await svc.obter(10, 1);
    expect(got.cochoNomeSnapshot).toBe("Cocho Pasto 444 (C01)");
    await expect(svc.confirmar(10, "Pedro", produtoInput({ cochoId: 3, quantidadeFornecidaKg: 5 }), "2026-10-01"))
      .rejects.toBeTruthy();
  });

  it("28/29: estorno com cocho devolve estoque sem usar o cocho", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ cochoId: 3 }), "2026-10-01");
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(100);
    expect(store.rows[0]?.cochoId).toBe(3);
  });

  it("49/50: fornecimento direto de produto e dieta continua funcionando", async () => {
    const store = criarStore();
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ quantidadeFornecidaKg: 5 }), "2026-10-01");
    await svc.confirmar(10, "Pedro", dietaInput({ quantidadeFornecidaKg: 20 }), "2026-10-01");
    expect(store.rows).toHaveLength(2);
    expect(store.movs.length).toBeGreaterThan(1);
  });

  it("27-33/41-48: fornecimento originado de batida não baixa estoque e aloca custo", async () => {
    const store = criarStore({
      batidas: [{
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90",
        quantidadePreparadaKg: 1000, quantidadeDistribuidaKg: 0, saldoDisponivelKg: 1000,
        status: "confirmado", custoCompleto: true, custoPorKgSnapshot: 1.5, custoTotalSnapshot: 1500,
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    const saldosAntes = store.produtos.map(p => p.quantidade);
    await svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 600, loteId: 1,
    }), "2026-10-01");
    expect(store.rows[0]?.origemOperacional).toBe("batida");
    expect(store.rows[0]?.batidaId).toBe(10);
    expect(store.rows[0]?.loteId).toBe(1);
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(900);
    expect(store.movs).toHaveLength(0);
    expect(store.ings).toHaveLength(0);
    expect(store.produtos.map(p => p.quantidade)).toEqual(saldosAntes);

    await svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 300,
    }), "2026-10-01");
    expect(store.rows).toHaveLength(2);
    expect(store.rows.every(r => r.batidaId === 10)).toBe(true);

    await expect(svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 150,
    }), "2026-10-01")).rejects.toBeTruthy();
    expect(store.rows).toHaveLength(2);

    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(store.rows[0]?.status).toBe("estornado");
    expect(store.movs).toHaveLength(0);
    expect(store.produtos.map(p => p.quantidade)).toEqual(saldosAntes);

    await svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 700,
    }), "2026-10-01");
    expect(store.rows).toHaveLength(3);
  });

  it("30: concorrência não permite sobredistribuição da batida", async () => {
    const store = criarStore({
      batidas: [{
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90",
        quantidadePreparadaKg: 100, quantidadeDistribuidaKg: 0, saldoDisponivelKg: 100,
        status: "confirmado", custoCompleto: true, custoPorKgSnapshot: 1, custoTotalSnapshot: 100,
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    const results = await Promise.allSettled([
      svc.confirmar(10, "A", dietaInput({ origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 80 }), "2026-10-01"),
      svc.confirmar(10, "B", dietaInput({ origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 80 }), "2026-10-01"),
    ]);
    const ok = results.filter(r => r.status === "fulfilled");
    const fail = results.filter(r => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    const total = store.rows.filter(r => r.status === "confirmado").reduce((s, r) => s + Number(r.quantidadeFornecidaKg), 0);
    expect(total).toBeLessThanOrEqual(100);
  });

  it("45/46: planejamento compatível na batida; incompatível bloqueia", async () => {
    const store = criarStore({
      batidas: [{
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90",
        quantidadePreparadaKg: 1000, quantidadeDistribuidaKg: 0, saldoDisponivelKg: 1000,
        status: "confirmado", custoCompleto: true, custoPorKgSnapshot: 1.5, custoTotalSnapshot: 1500,
      }],
      planejamentos: [
        { id: 20, fazendaId: 1, loteId: 1, tipoOrigem: "dieta", produtoId: null, dietaId: 5, modalidadeMeta: "g_cab_dia", valorMeta: 100, status: "ativo", dataInicio: "2026-10-01", dataFim: null },
        { id: 21, fazendaId: 1, loteId: 1, tipoOrigem: "dieta", produtoId: null, dietaId: 99, modalidadeMeta: "g_cab_dia", valorMeta: 100, status: "ativo", dataInicio: "2026-10-01", dataFim: null },
      ],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, planejamentoId: 20, quantidadeFornecidaKg: 10,
    }), "2026-10-01");
    expect(store.rows[0]?.planejamentoId).toBe(20);
    await expect(svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, planejamentoId: 21, quantidadeFornecidaKg: 10,
    }), "2026-10-01")).rejects.toBeTruthy();
  });

  it("48: custo incompleto da batida permanece incompleto no fornecimento", async () => {
    const store = criarStore({
      batidas: [{
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90",
        quantidadePreparadaKg: 1000, quantidadeDistribuidaKg: 0, saldoDisponivelKg: 1000,
        status: "confirmado", custoCompleto: false, custoPorKgSnapshot: null, custoTotalSnapshot: null,
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput({
      origemOperacional: "batida", batidaId: 10, quantidadeFornecidaKg: 100,
    }), "2026-10-01");
    expect(store.rows[0]?.custoCompleto).toBe(false);
    expect(store.rows[0]?.custoTotalSnapshot).toBeNull();
  });

  it("42: cocho opcional no fornecimento da batida", async () => {
    const store = criarStore({
      batidas: [{
        id: 10, userId: 10, fazendaId: 1, dietaId: 5, dietaNomeSnapshot: "Dieta 90",
        quantidadePreparadaKg: 1000, quantidadeDistribuidaKg: 0, saldoDisponivelKg: 1000,
        status: "confirmado", custoCompleto: true, custoPorKgSnapshot: 1, custoTotalSnapshot: 1000,
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput({ origemOperacional: "batida", batidaId: 10, cochoId: 3, quantidadeFornecidaKg: 50 }), "2026-10-01");
    await svc.confirmar(10, "Pedro", dietaInput({ origemOperacional: "batida", batidaId: 10, cochoId: null, quantidadeFornecidaKg: 50 }), "2026-10-01");
    expect(store.rows[0]?.cochoId).toBe(3);
    expect(store.rows[1]?.cochoId).toBeNull();
  });

  it("20: ad libitum permite quantidade", async () => {
    const store = criarStore({
      planejamentos: [{
        id: 8, fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10,
        modalidadeMeta: "ad_libitum", status: "ativo", dataInicio: "2026-10-01",
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ planejamentoId: 8, quantidadeFornecidaKg: 100 }), "2026-10-01");
    expect(store.rows[0]?.planejamentoModalidadeSnapshot).toBe("ad_libitum");
    expect(store.rows[0]?.planejamentoNecessidadeKgSnapshot).toBeNull();
  });
});

describe("nutricaoFornecimentos — rota e estoque oficial", () => {
  it("11: formulário só confirma no clique, sem baixa ao abrir", () => {
    const src = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoFormPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("preview.useQuery");
    expect(src).toContain("confirmar.useMutation");
    expect(src).toContain("confirmar.mutate(payload)");
    expect(src).toContain("A prévia não movimenta estoque");
  });

  it("36: rota usa a nova página", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/NutricaoFornecimentosListPage/);
    expect(app).toMatch(/path="\/nutricao\/fornecimentos"/);
    expect(app).not.toMatch(/path="\/nutricao\/fornecimentos"\s+component=\{SuppliesManagementPage\}/);
  });

  it("37: não cria registro por animal", () => {
    const src = readFileSync(new URL("./nutricaoFornecimentos.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/animais\.insert|insert\(animais\)/);
    expect(src).toContain("populacaoSnapshot");
    expect(src).toContain("nutricaoFornecimentoId");
  });

  it("usa tipo oficial de saída e não toca batidas", () => {
    const src = readFileSync(new URL("./nutricaoFornecimentos.ts", import.meta.url), "utf8");
    expect(src).toMatch(/NUTRICAO_FORN_TIPO_SAIDA|Consumo interno/);
    expect(src).not.toMatch(/from\(batidas\)|insert\(batidas\)/);
  });

  it("detalhe usa snapshot e não a dieta atual", () => {
    const src = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoDetalhePage.tsx", import.meta.url), "utf8");
    expect(src).toContain("ingredientes");
    expect(src).toContain("produtoNomeSnapshot");
    expect(src).not.toMatch(/nutricaoDietas\.get/);
  });

  it("detalhe formata oferecido/cabeça pelo helper compartilhado", () => {
    const src = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoDetalhePage.tsx", import.meta.url), "utf8");
    expect(src).toContain("formatarOferecidoPorCabeca");
    expect(src).toContain("planejamentoModalidadeSnapshot");
    expect(src).toContain("Quantidade fornecida");
    expect(src).not.toMatch(/porCabeca\?\.toLocaleString/);
    expect(src).not.toContain("g/cabeça/dia");
  });

  it("lista e detalhe separam vínculo de planejamento da origem operacional", () => {
    const lista = readFileSync(new URL("../client/src/pages/NutricaoFornecimentosListPage.tsx", import.meta.url), "utf8");
    const detalhe = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoDetalhePage.tsx", import.meta.url), "utf8");
    const svc = readFileSync(new URL("./nutricaoFornecimentos.ts", import.meta.url), "utf8");
    expect(lista).toContain('label: "Planejamento"');
    expect(lista).toContain("rotuloVinculoPlanejamentoForn(row.planejamentoId)");
    expect(lista).toContain("labelOrigemOperacionalForn(row.origemOperacional)");
    expect(lista).not.toContain("Não planejado");
    expect(lista).not.toMatch(/["']Planejado["']/);
    expect(detalhe).toContain("rotuloVinculoPlanejamentoForn(data.planejamentoId)");
    expect(detalhe).toContain("Ver planejamento");
    const listarFn = svc.slice(svc.indexOf("async listar"), svc.indexOf("async obter"));
    expect(listarFn).toContain("...row");
    expect(listarFn).toContain("getLote");
    expect(listarFn).not.toContain("getPlanejamento");
    expect(listarFn).not.toContain("listPlanejamentos");
    const setEstornadoFn = svc.slice(svc.indexOf("async setEstornado"), svc.indexOf("async lockBatida"));
    expect(setEstornadoFn).toContain('status: "estornado"');
    expect(setEstornadoFn).not.toContain("planejamentoId");
  });
});

const saco30 = [{ nome: "Saco", volume: 30, unidade: "kg" }];
const saco25 = [{ nome: "Saco", volume: 25, unidade: "kg" }];

function produtoSal(over: Partial<NutricaoFornEstoqueRef> = {}): NutricaoFornEstoqueRef {
  return {
    estoqueId: 200,
    produtoId: 22,
    nome: "Sal Nitrogenado 40 Flex LA",
    unidade: "sc",
    valorUnitario: "90",
    quantidade: "10",
    controlarSaldo: true,
    vinculadoFazenda: true,
    embalagens: saco30,
    ...over,
  };
}

describe("conversão operacional por embalagem — fornecimento", () => {
  it("A: 10 sc × 30 kg, fornece 45 kg → 8,5 sc, -1,5 sc, custo R$135, snapshot 30", async () => {
    const store = criarStore({ produtos: [produtoSal()] });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ produtoId: 22, quantidadeFornecidaKg: 45 }), "2026-10-01");
    expect(Number(store.produtos[0]?.quantidade)).toBe(8.5);
    expect(store.produtos[0]?.valorUnitario).toBe("90");
    expect(store.rows[0]?.quantidadeFornecidaKg).toBe("45");
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(135);
    expect(store.movs).toHaveLength(1);
    expect(Number(store.movs[0]?.quantidade)).toBe(-1.5);
    expect(store.movs[0]?.unidadeEstoqueSnapshot).toBe("sc");
    expect(Number(store.movs[0]?.conteudoPorUnidadeSnapshot)).toBe(30);
    expect(store.movs[0]?.unidadeConteudoSnapshot).toBe("kg");
    expect(Number(store.movs[0]?.quantidadeFisicaSnapshot)).toBe(-45);
    expect(store.movs[0]?.unidadeFisicaSnapshot).toBe("kg");
    expect(store.produtos[0]).not.toHaveProperty("quantidadeKg");
  });

  it("B: 10 sc × 25 kg, fornece 45 kg → 8,2 sc e -1,8 sc", async () => {
    const store = criarStore({ produtos: [produtoSal({ valorUnitario: "100", embalagens: saco25 })] });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ produtoId: 22, quantidadeFornecidaKg: 45 }), "2026-10-01");
    expect(Number(store.produtos[0]?.quantidade)).toBe(8.2);
    expect(Number(store.movs[0]?.quantidade)).toBe(-1.8);
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(180);
  });

  it("C: dieta de 45 kg do sal 30 kg/sc baixa 1,5 sc", async () => {
    const store = criarStore({
      produtos: [produtoSal()],
      dietas: [{
        id: 5, userId: 10, fazendaId: 1, nome: "Dieta Sal", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 45,
        ingredientes: [{ produtoId: 22, quantidadeKg: 45 }],
      }],
    });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", dietaInput({ quantidadeFornecidaKg: 45 }), "2026-10-01");
    expect(Number(store.produtos[0]?.quantidade)).toBe(8.5);
    expect(Number(store.movs[0]?.quantidade)).toBe(-1.5);
    expect(Number(store.ings[0]?.quantidadeKg)).toBe(45);
    expect(Number(store.ings[0]?.quantidadeUnidade)).toBe(1.5);
  });

  it("E: depois de mudar cadastro para 25 kg/sc, snapshot e estorno continuam 1,5 sc / 45 kg", async () => {
    const store = criarStore({ produtos: [produtoSal()] });
    const svc = createNutricaoFornecimentosService(store);
    await svc.confirmar(10, "Pedro", produtoInput({ produtoId: 22, quantidadeFornecidaKg: 45 }), "2026-10-01");
    store.produtos[0]!.embalagens = saco25;
    expect(Number(store.movs[0]?.conteudoPorUnidadeSnapshot)).toBe(30);
    expect(Number(store.movs[0]?.quantidadeFisicaSnapshot)).toBe(-45);
    expect(Number(store.movs[0]?.quantidade)).toBe(-1.5);
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(10);
    const estorno = store.movs.find(m => m.status === "estorno");
    expect(Number(estorno?.quantidade)).toBe(1.5);
    expect(Number(estorno?.conteudoPorUnidadeSnapshot)).toBe(30);
    expect(Number(estorno?.quantidadeFisicaSnapshot)).toBe(45);
  });

  it("F: sc sem embalagem é bloqueado com mensagem clara", async () => {
    const store = criarStore({ produtos: [produtoSal({ embalagens: undefined })] });
    delete store.produtos[0]!.embalagens;
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", produtoInput({ produtoId: 22, quantidadeFornecidaKg: 45 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_CONVERSAO_KG_INDISPONIVEL });
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(10);
  });

  it("G: duas embalagens de massa bloqueiam por ambiguidade", async () => {
    const store = criarStore({
      produtos: [produtoSal({
        embalagens: [
          { nome: "Saco 25 kg", volume: 25, unidade: "kg" },
          { nome: "Saco 30 kg", volume: 30, unidade: "kg" },
        ],
      })],
    });
    const svc = createNutricaoFornecimentosService(store);
    await expect(svc.confirmar(10, "Pedro", produtoInput({ produtoId: 22, quantidadeFornecidaKg: 45 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_CONVERSAO_KG_AMBIGUA });
    expect(store.rows).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(10);
  });

  it("schema de estoque não cria segundo saldo em kg", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const start = schema.indexOf("export const estoque = mysqlTable");
    const end = schema.indexOf("export const estoqueMovimentacoes");
    const bloco = schema.slice(start, end);
    expect(bloco).not.toMatch(/quantidadeKg|quantidade_kg/);
    expect(schema).toContain("unidadeEstoqueSnapshot");
    expect(schema).toContain("conteudoPorUnidadeSnapshot");
    expect(schema).toContain("quantidadeFisicaSnapshot");
  });
});
