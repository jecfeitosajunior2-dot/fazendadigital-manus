import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createNutricaoPlanejamentoService, type NutricaoPlanPersistido, type NutricaoPlanStore } from "./nutricaoPlanejamento";
import type { NutricaoPlanDietaRef, NutricaoPlanInput, NutricaoPlanLoteRef, NutricaoPlanPesagemRef, NutricaoPlanProdutoRef } from "../shared/nutricaoPlanejamento";
import { MSG_PLAN_CONFLITO, MSG_PLAN_MATERIAL_INICIADO } from "../shared/nutricaoPlanejamento";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(seed?: {
  lotes?: NutricaoPlanLoteRef[];
  produtos?: NutricaoPlanProdutoRef[];
  dietas?: NutricaoPlanDietaRef[];
  animaisPorLote?: Record<number, number[]>;
  pesagens?: NutricaoPlanPesagemRef[];
}): NutricaoPlanStore & { rows: NutricaoPlanPersistido[]; estoqueMutacoes: number } {
  const state = {
    lotes: seed?.lotes ?? [
      { id: 1, userId: 10, fazendaId: 1, ativo: true, nome: "B01" },
      { id: 2, userId: 10, fazendaId: 2, ativo: true, nome: "Lote B" },
    ],
    produtos: seed?.produtos ?? [
      { produtoId: 10, nome: "Sal mineral", unidade: "kg", valorUnitario: "3.20", quantidade: "1000", controlarSaldo: true, vinculadoFazenda: true },
      { produtoId: 20, nome: "Proteinado", unidade: "kg", valorUnitario: "2.00", quantidade: "500", controlarSaldo: true, vinculadoFazenda: true },
    ],
    dietas: seed?.dietas ?? [
      {
        id: 5, userId: 10, fazendaId: 1, nome: "Mineral 90", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 1000,
        ingredientes: [{ produtoId: 10, quantidadeKg: 600 }, { produtoId: 20, quantidadeKg: 400 }],
      },
      {
        id: 6, userId: 10, fazendaId: 2, nome: "Dieta B", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 1000,
        ingredientes: [{ produtoId: 20, quantidadeKg: 1000 }],
      },
    ],
    animaisPorLote: seed?.animaisPorLote ?? { 1: Array.from({ length: 100 }, (_, i) => i + 1), 2: [201] },
    pesagens: seed?.pesagens ?? [],
    rows: [] as NutricaoPlanPersistido[],
    nextId: 1,
    estoqueMutacoes: 0,
  };

  return {
    get rows() { return state.rows; },
    get estoqueMutacoes() { return state.estoqueMutacoes; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async listProdutosFazenda(fazendaId) {
      if (fazendaId === 1) return state.produtos.filter(p => p.produtoId === 10 || p.produtoId === 20);
      if (fazendaId === 2) return [{ ...state.produtos[1]!, produtoId: 20 }];
      return [];
    },
    async listDietasFazenda(userId, fazendaId) {
      return state.dietas.filter(d => d.userId === userId && d.fazendaId === fazendaId && d.status === "ativa");
    },
    async getDieta(userId, dietaId) {
      return state.dietas.find(d => d.id === dietaId && d.userId === userId) ?? null;
    },
    async getLote(userId, loteId) {
      return state.lotes.find(l => l.id === loteId && l.userId === userId) ?? null;
    },
    async listLotesFazenda(userId, fazendaId) {
      return state.lotes.filter(l => l.userId === userId && l.fazendaId === fazendaId && l.ativo);
    },
    async listAnimaisAtivosLote(_userId, loteId) {
      return state.animaisPorLote[loteId] ?? [];
    },
    async listPesagensAnimais(_userId, animalIds) {
      const wanted = new Set(animalIds);
      return state.pesagens.filter(p => wanted.has(p.animalId));
    },
    async find(userId, id) {
      return state.rows.find(r => r.id === id && r.userId === userId) ?? null;
    },
    async list(userId, fazendaId) {
      return state.rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
    },
    async transaction(fn) {
      const snap = clone(state.rows);
      const snapNext = state.nextId;
      try {
        return await fn({
          async insert(row) {
            const id = state.nextId++;
            state.rows.push({ id, ...row });
            return id;
          },
          async update(id, userId, patch) {
            const row = state.rows.find(r => r.id === id && r.userId === userId);
            if (row) Object.assign(row, patch);
          },
        });
      } catch (error) {
        state.rows = snap;
        state.nextId = snapNext;
        throw error;
      }
    },
  };
}

function produtoInput(over: Partial<NutricaoPlanInput> = {}): NutricaoPlanInput {
  return {
    fazendaId: 1,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 10,
    modalidadeMeta: "g_cab_dia",
    valorMeta: 100,
    frequencia: "diaria",
    dataInicio: "2026-10-01",
    ...over,
  };
}

function dietaInput(over: Partial<NutricaoPlanInput> = {}): NutricaoPlanInput {
  return produtoInput({
    tipoOrigem: "dieta",
    produtoId: null,
    dietaId: 5,
    modalidadeMeta: "kg_cab_dia",
    valorMeta: 2,
    ...over,
  });
}

describe("nutricaoPlanejamento service", () => {
  it("1: cria planejamento com produto", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    const out = await svc.criar(10, produtoInput(), "2026-09-01");
    expect(out.id).toBe(1);
    expect(store.rows[0]).toMatchObject({ tipoOrigem: "produto", produtoId: 10, dietaId: null, loteId: 1 });
    expect(store.estoqueMutacoes).toBe(0);
  });

  it("2: cria planejamento com dieta", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    const out = await svc.criar(10, dietaInput(), "2026-09-01");
    expect(out.id).toBe(1);
    expect(store.rows[0]).toMatchObject({ tipoOrigem: "dieta", dietaId: 5, produtoId: null });
  });

  it("5: lote de outra fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await expect(svc.criar(10, produtoInput({ loteId: 2 }))).rejects.toMatchObject({ message: /não pertence/ });
  });

  it("6: dieta de outra fazenda é bloqueada", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await expect(svc.criar(10, dietaInput({ dietaId: 6 }))).rejects.toMatchObject({ message: /não pertence/ });
  });

  it("7: produto não vinculado à fazenda é bloqueado", async () => {
    const store = criarStore({
      produtos: [{ produtoId: 99, nome: "X", unidade: "kg", valorUnitario: "1", quantidade: "1", controlarSaldo: true, vinculadoFazenda: true }],
    });
    const svc = createNutricaoPlanejamentoService(store);
    await expect(svc.criar(10, produtoInput({ produtoId: 99 }))).rejects.toBeTruthy();
  });

  it("8: outro usuário não acessa", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await svc.criar(10, produtoInput(), "2026-09-01");
    await expect(svc.obter(99, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("17: lote vazio pode ter planejamento", async () => {
    const store = criarStore({ animaisPorLote: { 1: [] } });
    const svc = createNutricaoPlanejamentoService(store);
    const out = await svc.criar(10, produtoInput(), "2026-09-01");
    const got = await svc.obter(10, out.id, "2026-10-01");
    expect(got.projecao.loteVazio).toBe(true);
    expect(got.projecao.necessidadeKgDia).toBe(0);
    expect(got.projecao.metaKgPorCabecaDia).toBe(0.1);
  });

  it("25/26/27: criar/editar/encerrar/cancelar não muta estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    const created = await svc.criar(10, produtoInput({ dataInicio: "2026-10-10" }), "2026-10-01");
    await svc.editar(10, created.id, produtoInput({ dataInicio: "2026-10-10", observacoes: "ok" }), "2026-10-01");
    await svc.encerrar(10, created.id, "2026-10-01");
    const created2 = await svc.criar(10, produtoInput({ dataInicio: "2026-11-01", produtoId: 20 }), "2026-10-01");
    await svc.cancelar(10, created2.id);
    expect(store.estoqueMutacoes).toBe(0);
    expect(store.rows).toHaveLength(2);
  });

  it("28: conflito da mesma origem/período é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await svc.criar(10, produtoInput({ dataInicio: "2026-10-01", dataFim: "2026-10-31" }), "2026-09-01");
    await expect(
      svc.criar(10, produtoInput({ dataInicio: "2026-10-15", dataFim: "2026-11-15" }), "2026-09-01"),
    ).rejects.toMatchObject({ message: MSG_PLAN_CONFLITO });
    expect(store.rows).toHaveLength(1);
  });

  it("29: produtos diferentes simultâneos no mesmo lote são permitidos", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await svc.criar(10, produtoInput({ produtoId: 10, modalidadeMeta: "ad_libitum", valorMeta: null }), "2026-09-01");
    await svc.criar(10, produtoInput({ produtoId: 20, modalidadeMeta: "kg_cab_dia", valorMeta: 1 }), "2026-09-01");
    expect(store.rows).toHaveLength(2);
  });

  it("30: produto + dieta simultâneos diferentes no mesmo lote são permitidos", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await svc.criar(10, produtoInput(), "2026-09-01");
    await svc.criar(10, dietaInput(), "2026-09-01");
    expect(store.rows).toHaveLength(2);
  });

  it("33: edição antes do início é permitida", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    const created = await svc.criar(10, produtoInput({ dataInicio: "2026-10-10", valorMeta: 100 }), "2026-10-01");
    await svc.editar(10, created.id, produtoInput({ dataInicio: "2026-10-10", valorMeta: 120 }), "2026-10-01");
    expect(Number(store.rows[0]?.valorMeta)).toBe(120);
  });

  it("34: alteração material após início não reescreve o histórico", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    const created = await svc.criar(10, produtoInput({ dataInicio: "2026-09-01", valorMeta: 100 }), "2026-09-01");
    await expect(
      svc.editar(10, created.id, produtoInput({ dataInicio: "2026-09-01", valorMeta: 150 }), "2026-10-01"),
    ).rejects.toMatchObject({ message: MSG_PLAN_MATERIAL_INICIADO });
    expect(Number(store.rows[0]?.valorMeta)).toBe(100);

    const sub = await svc.substituir(10, created.id, produtoInput({ dataInicio: "2026-10-01", valorMeta: 150 }), "2026-10-01");
    expect(store.rows[0]?.status).toBe("encerrado");
    expect(store.rows[0]?.dataFim).toBe("2026-09-30");
    expect(sub.id).toBe(2);
    expect(Number(store.rows[1]?.valorMeta)).toBe(150);
    expect(store.rows[1]?.dataInicio).toBe("2026-10-01");
  });

  it("35: listagem respeita fazenda", async () => {
    const store = criarStore();
    const svc = createNutricaoPlanejamentoService(store);
    await svc.criar(10, produtoInput(), "2026-09-01");
    await svc.criar(10, produtoInput({ fazendaId: 2, loteId: 2, produtoId: 20 }), "2026-09-01");
    const a = await svc.listar(10, { fazendaId: 1 }, "2026-10-01");
    const b = await svc.listar(10, { fazendaId: 2 }, "2026-10-01");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.fazendaId).toBe(1);
    expect(b[0]?.fazendaId).toBe(2);
  });
});

describe("nutricaoPlanejamento — estoque e rota", () => {
  it("service não referencia movimentação de estoque", () => {
    const src = readFileSync(new URL("./nutricaoPlanejamento.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/estoqueMovimentacoes/);
    expect(src).not.toMatch(/estoque\.quantidade\s*=/);
    expect(src).not.toMatch(/createMovimentacao/);
  });

  it("36: /nutricao/planejamento usa a nova tela", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/path="\/nutricao\/planejamento".*NutricaoPlanejamentoListPage|NutricaoPlanejamentoListPage[\s\S]*\/nutricao\/planejamento/);
    expect(app).not.toMatch(/path="\/nutricao\/planejamento"\s+component=\{SuppliesManagementPage\}/);
    expect(app).toMatch(/path="\/nutricao\/visao-geral"\s+component=\{NutricaoVisaoGeralPage\}/);
  });
});
