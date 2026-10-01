import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createNutricaoVisaoGeralService, type VgStore } from "./nutricaoVisaoGeral";
import type { VgBatida, VgForn, VgLeitura, VgLote, VgPlan } from "../shared/nutricaoVisaoGeral";
import type { NutricaoPlanDietaRef, NutricaoPlanProdutoRef } from "../shared/nutricaoPlanejamento";

function forn(over: Partial<VgForn> = {}): VgForn {
  return {
    id: 1, fazendaId: 1, loteId: 1, planejamentoId: 1, cochoId: 1, cochoNomeSnapshot: "C01",
    tipoOrigem: "produto", produtoId: 10, dietaId: null, origemOperacional: "direta", batidaId: null,
    data: "2026-10-01", hora: "08:00", quantidadeFornecidaKg: 100, populacaoSnapshot: 50,
    origemNomeSnapshot: "Milho", custoTotalSnapshot: 200, custoPorKgSnapshot: 2, custoCompleto: true,
    status: "confirmado", planejamentoMetaSnapshot: "2 kg/cab/dia", ...over,
  };
}

function plan(over: Partial<VgPlan> = {}): VgPlan {
  return {
    id: 1, fazendaId: 1, loteId: 1, tipoOrigem: "produto", produtoId: 10, dietaId: null,
    modalidadeMeta: "kg_cab_dia", valorMeta: 2, frequencia: "diaria", tratosPorDia: 2,
    frequenciaIntervaloDias: null, frequenciaDiasSemana: [], dataInicio: "2026-10-01",
    dataFim: "2026-10-31", status: "ativo", origemNome: "Milho", ...over,
  };
}

function criarStore(seed?: {
  forns?: VgForn[];
  plans?: VgPlan[];
  leituras?: VgLeitura[];
  batidas?: VgBatida[];
  lotes?: VgLote[];
  produtos?: NutricaoPlanProdutoRef[];
  dietas?: NutricaoPlanDietaRef[];
}): VgStore & { estoqueSaldo: number } {
  const state = {
    estoqueSaldo: 500,
    forns: seed?.forns ?? [forn()],
    plans: seed?.plans ?? [plan()],
    leituras: seed?.leituras ?? [],
    batidas: seed?.batidas ?? [],
    lotes: seed?.lotes ?? [
      { id: 1, nome: "B01", fazendaId: 1 },
      { id: 9, nome: "Outra", fazendaId: 2 },
    ],
    produtos: seed?.produtos ?? [{
      produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "2", quantidade: "500",
      controlarSaldo: true, vinculadoFazenda: true,
    }],
    dietas: seed?.dietas ?? [],
  };
  return {
    get estoqueSaldo() { return state.estoqueSaldo; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async getLote(userId, loteId) {
      if (userId !== 10) return null;
      return state.lotes.find(l => l.id === loteId) ?? null;
    },
    async listFornecimentos(userId, fazendaId) {
      if (userId !== 10) return [];
      return state.forns.filter(f => f.fazendaId === fazendaId);
    },
    async listPlanejamentos(userId, fazendaId) {
      if (userId !== 10) return [];
      return state.plans.filter(p => p.fazendaId === fazendaId);
    },
    async listLeituras(userId, fazendaId) {
      if (userId !== 10) return [];
      return state.leituras.filter(l => l.fazendaId === fazendaId);
    },
    async listBatidas(userId, fazendaId) {
      if (userId !== 10) return [];
      return state.batidas.filter(b => b.fazendaId === fazendaId);
    },
    async listLotes(userId, fazendaId) {
      if (userId !== 10) return [];
      return state.lotes.filter(l => l.fazendaId === fazendaId);
    },
    async listProdutos() { return state.produtos; },
    async listDietas() { return state.dietas; },
    async listAnimaisAtivosLote() { return Array.from({ length: 50 }, (_, i) => i + 1); },
    async listPesagens() { return []; },
  };
}

describe("nutricaoVisaoGeral service", () => {
  it("39: Fazenda A não inclui fatos da Fazenda B", async () => {
    const store = criarStore({
      forns: [forn({ fazendaId: 1 }), forn({ id: 2, fazendaId: 2, quantidadeFornecidaKg: 999 })],
      plans: [plan({ fazendaId: 1 }), plan({ id: 2, fazendaId: 2 })],
    });
    const svc = createNutricaoVisaoGeralService(store);
    const a = await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10" }, "2026-10-10");
    expect(a.cards.kgFornecido).toBe(100);
    expect(a.cards.lotesAtendidos).toBe(1);
  });

  it("40: lote de outra fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoVisaoGeralService(store);
    await expect(svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10", loteId: 9 }, "2026-10-10"))
      .rejects.toMatchObject({ message: /lote/i });
  });

  it("41-43: leituras, batidas e planejamentos de outra fazenda não entram", async () => {
    const store = criarStore({
      forns: [forn({ fazendaId: 1 })],
      plans: [plan({ fazendaId: 1 })],
      leituras: [{
        id: 1, fazendaId: 2, cochoId: 2, loteId: 9, fornecimentoId: null,
        data: "2026-10-01", hora: null, sobraKg: 20, status: "ativa",
        cochoNomeSnapshot: "C-B", loteNomeSnapshot: "Outra",
      }],
      batidas: [{ id: 1, fazendaId: 2, dietaId: 5, dietaNomeSnapshot: "X", data: "2026-10-01", quantidadePreparadaKg: 80, status: "confirmado" }],
    });
    const svc = createNutricaoVisaoGeralService(store);
    const a = await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10" }, "2026-10-10");
    expect(a.consumo.linhas).toHaveLength(0);
    expect(a.batidasSaldo).toHaveLength(0);
    expect(a.planejado.every(p => p.loteNome !== "Outra")).toBe(true);
  });

  it("38/50: dashboard é só leitura e não mexe em estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoVisaoGeralService(store);
    await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10" }, "2026-10-10");
    expect(store.estoqueSaldo).toBe(500);
  });

  it("49: filtro de lote atualiza o recorte", async () => {
    const store = criarStore({
      forns: [
        forn({ id: 1, loteId: 1, quantidadeFornecidaKg: 100 }),
        forn({ id: 2, loteId: 3, quantidadeFornecidaKg: 40, populacaoSnapshot: 20 }),
      ],
      lotes: [
        { id: 1, nome: "B01", fazendaId: 1 },
        { id: 3, nome: "B03", fazendaId: 1 },
      ],
    });
    const svc = createNutricaoVisaoGeralService(store);
    const todos = await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10" }, "2026-10-10");
    const um = await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10", loteId: 1 }, "2026-10-10");
    expect(todos.cards.kgFornecido).toBe(140);
    expect(um.cards.kgFornecido).toBe(100);
    expect(um.cards.lotesAtendidos).toBe(1);
  });

  it("54: estado vazio quando não há movimento", async () => {
    const store = criarStore({ forns: [], plans: [], leituras: [], batidas: [] });
    const svc = createNutricaoVisaoGeralService(store);
    const out = await svc.carregar(10, { fazendaId: 1, de: "2026-10-01", ate: "2026-10-10" }, "2026-10-10");
    expect(out.vazio).toBe(true);
  });
});

describe("nutricaoVisaoGeral — contrato estático", () => {
  it("46/30: zero nova tabela e zero migration", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    expect(schema).not.toMatch(/nutricao_visao_geral|nutricaoVisaoGeral = mysqlTable/);
    expect(schema).toContain("nutricao_fornecimentos");
    expect(schema).toContain("nutricao_cocho_leituras");
  });

  it("28/38: service não movimenta estoque nem altera fatos", () => {
    const src = readFileSync(new URL("./nutricaoVisaoGeral.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/insert\(|update\(|delete\(|debitarEstoque|creditarEstoque|createMovimentacao/);
    expect(src).toMatch(/montarPainelNutricao/);
    expect(src).toMatch(/calcularConsumoAparente|from "\.\.\/shared\/nutricaoVisaoGeral"/);
  });

  it("48/53/55: rota abre dashboard real e módulos anteriores permanecem", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/path="\/nutricao\/visao-geral"\s+component=\{NutricaoVisaoGeralPage\}/);
    expect(app).not.toMatch(/path="\/nutricao\/visao-geral"\s+component=\{SuppliesManagementPage\}/);
    expect(app).toMatch(/path="\/nutricao\/planejamento"/);
    expect(app).toMatch(/path="\/nutricao\/dietas"/);
    expect(app).toMatch(/path="\/nutricao\/fornecimentos"/);
    expect(app).toMatch(/path="\/nutricao\/cochos"/);
    expect(app).toMatch(/path="\/nutricao\/batidas"/);
    expect(app).toMatch(/path="\/nutricao\/cochos\/leituras"/);
  });

  it("51/52: dashboard tem links para fornecimentos e leituras", () => {
    const page = readFileSync(new URL("../client/src/pages/NutricaoVisaoGeralPage.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/\/nutricao\/fornecimentos\/\$\{f\.id\}/);
    expect(page).toMatch(/\/nutricao\/cochos\/leituras\/\$\{l\.id\}/);
    expect(page).toMatch(/População observada/);
    expect(page).toMatch(/Quantidade fornecida/);
    expect(page).toMatch(/Consumo aparente/);
    expect(page).not.toMatch(/GMD|custo\/kg de ganho|consumo real/i);
    expect(page).not.toMatch(/SuppliesManagementPage/);
  });

  it("menu Visão Geral aponta para o dashboard", () => {
    const data = readFileSync(new URL("../client/src/lib/data.ts", import.meta.url), "utf8");
    expect(data).toMatch(/label: "Visão Geral"[\s\S]*path: "\/nutricao\/visao-geral"/);
  });
});
