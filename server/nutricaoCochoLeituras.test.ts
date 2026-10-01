import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createNutricaoCochoLeiturasService,
  type LeituraPersistida,
  type LeituraStore,
} from "./nutricaoCochoLeituras";
import type { NutricaoCochoRef } from "../shared/nutricaoCochos";
import type { NutricaoLeituraFornRef, NutricaoLeituraInput } from "../shared/nutricaoCochoLeituras";
import {
  MSG_CONS_AVULSA,
  MSG_CONS_SO_ESCORE,
  MSG_LEITURA_COCHO,
  MSG_LEITURA_COCHO_FAZENDA,
  MSG_LEITURA_COCHO_INATIVO,
  MSG_LEITURA_FORN_COCHO,
  MSG_LEITURA_FORN_ESTORNADO,
  MSG_LEITURA_FORN_LOTE,
  MSG_LEITURA_FORN_TEMPO,
  MSG_LEITURA_LOTE_FAZENDA,
  MSG_LEITURA_SOBRA,
  MSG_LEITURA_VAZIA,
} from "../shared/nutricaoCochoLeituras";
import type { NutricaoPlanLoteRef } from "../shared/nutricaoPlanejamento";

const HOJE = "2026-10-01";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function forn(over: Partial<NutricaoLeituraFornRef> = {}): NutricaoLeituraFornRef {
  return {
    id: 1,
    userId: 10,
    fazendaId: 1,
    cochoId: 1,
    loteId: 1,
    tipoOrigem: "produto",
    produtoId: 10,
    dietaId: null,
    origemNomeSnapshot: "Milho",
    quantidadeFornecidaKg: 100,
    status: "confirmado",
    data: HOJE,
    hora: "08:00",
    populacaoSnapshot: 50,
    batidaId: 7,
    planejamentoId: 3,
    ...over,
  };
}

function criarStore(seed?: {
  forns?: NutricaoLeituraFornRef[];
  leituras?: LeituraPersistida[];
}) {
  const state = {
    cochos: [
      { id: 1, userId: 10, fazendaId: 1, nome: "C01", codigo: "C01", status: "ativo" },
      { id: 2, userId: 10, fazendaId: 2, nome: "C02", codigo: "C02", status: "ativo" },
      { id: 3, userId: 10, fazendaId: 1, nome: "C03", codigo: "C03", status: "inativo" },
    ] as NutricaoCochoRef[],
    lotes: [
      { id: 1, userId: 10, fazendaId: 1, ativo: true, nome: "B01" },
      { id: 2, userId: 10, fazendaId: 2, ativo: true, nome: "Lote B" },
      { id: 3, userId: 10, fazendaId: 1, ativo: true, nome: "B02" },
    ] as NutricaoPlanLoteRef[],
    forns: seed?.forns ?? [] as NutricaoLeituraFornRef[],
    rows: seed?.leituras ? clone(seed.leituras) : [] as LeituraPersistida[],
    next: (seed?.leituras?.reduce((m, r) => Math.max(m, r.id), 0) ?? 0) + 1,
    estoqueSaldo: 400,
    batidaSaldo: 180,
    batidaStatus: "confirmada",
    planejamentoMeta: 12,
    custoLancado: 320,
  };

  const store: LeituraStore & typeof state = {
    get rows() { return state.rows; },
    get forns() { return state.forns; },
    get cochos() { return state.cochos; },
    get lotes() { return state.lotes; },
    get next() { return state.next; },
    get estoqueSaldo() { return state.estoqueSaldo; },
    get batidaSaldo() { return state.batidaSaldo; },
    get batidaStatus() { return state.batidaStatus; },
    get planejamentoMeta() { return state.planejamentoMeta; },
    get custoLancado() { return state.custoLancado; },
    set estoqueSaldo(v) { state.estoqueSaldo = v; },
    set batidaSaldo(v) { state.batidaSaldo = v; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async getCocho(userId, id) {
      return state.cochos.find(c => c.id === id && c.userId === userId) ?? null;
    },
    async getLote(userId, id) {
      return state.lotes.find(l => l.id === id && l.userId === userId) ?? null;
    },
    async getFornecimento(userId, id) {
      return state.forns.find(f => f.id === id && f.userId === userId) ?? null;
    },
    async listFornecimentosCocho(userId, cochoId) {
      return state.forns.filter(f => f.userId === userId && f.cochoId === cochoId);
    },
    async find(userId, id) {
      return state.rows.find(r => r.id === id && r.userId === userId) ?? null;
    },
    async list(userId, fazendaId) {
      return state.rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
    },
    async listPorCocho(userId, cochoId) {
      return state.rows.filter(r => r.userId === userId && r.cochoId === cochoId);
    },
    async insert(row) {
      const id = state.next++;
      state.rows.push({ id, ...row });
      return id;
    },
    async update(id, userId, patch) {
      const row = state.rows.find(r => r.id === id && r.userId === userId);
      if (row) Object.assign(row, patch, { updatedAt: new Date("2026-10-01T18:00:00") });
    },
    async setStatus(id, userId, status) {
      const row = state.rows.find(r => r.id === id && r.userId === userId);
      if (row) row.status = status;
    },
  };
  return store;
}

function input(over: Partial<NutricaoLeituraInput> = {}): NutricaoLeituraInput {
  return {
    fazendaId: 1,
    cochoId: 1,
    loteId: 1,
    data: HOJE,
    hora: "17:00",
    sobraKg: 20,
    ...over,
  };
}

function snapshotExterno(store: ReturnType<typeof criarStore>) {
  return {
    estoque: store.estoqueSaldo,
    batida: store.batidaSaldo,
    batidaStatus: store.batidaStatus,
    planejamento: store.planejamentoMeta,
    custo: store.custoLancado,
    forns: clone(store.forns),
  };
}

describe("nutricaoCochoLeituras service", () => {
  it("1: cria leitura com sobra", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    const out = await svc.criar(10, input({ sobraKg: 20 }), HOJE);
    expect(out.id).toBe(1);
    expect(store.rows[0]).toMatchObject({ sobraKg: "20", status: "ativa", cochoId: 1 });
  });

  it("2: cria leitura com escore", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: null, escore: "baixo" }), HOJE);
    expect(store.rows[0]?.escore).toBe("baixo");
    expect(store.rows[0]?.sobraKg).toBeNull();
  });

  it("3: cria leitura só com observação", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: null, observacoes: "Cocho molhado após chuva" }), HOJE);
    expect(store.rows[0]?.observacoes).toContain("chuva");
  });

  it("4: leitura vazia é bloqueada", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ sobraKg: null, escore: null, observacoes: "" }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_VAZIA });
    expect(store.rows).toHaveLength(0);
  });

  it("5: sobra zero é permitida", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 0 }), HOJE);
    expect(store.rows[0]?.sobraKg).toBe("0");
  });

  it("6: sobra negativa é bloqueada", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ sobraKg: -2 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_SOBRA });
  });

  it("7: cocho obrigatório", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ cochoId: 99 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_COCHO });
  });

  it("8: cocho de outra fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ cochoId: 2 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_COCHO_FAZENDA });
  });

  it("9: outro usuário é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input(), HOJE);
    await expect(svc.obter(99, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.criar(99, input(), HOJE)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.listar(99, { fazendaId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("10: lote é opcional", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ loteId: null }), HOJE);
    expect(store.rows[0]?.loteId).toBeNull();
  });

  it("11: lote de outra fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ loteId: 2 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_LOTE_FAZENDA });
  });

  it("12: fornecimento é opcional", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: null }), HOJE);
    expect(store.rows[0]?.fornecimentoId).toBeNull();
  });

  it("13: fornecimento estornado é bloqueado", async () => {
    const store = criarStore({ forns: [forn({ status: "estornado" })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ fornecimentoId: 1 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_FORN_ESTORNADO });
  });

  it("14: fornecimento de outro cocho é bloqueado", async () => {
    const store = criarStore({ forns: [forn({ cochoId: 2, fazendaId: 1 })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ fornecimentoId: 1 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_FORN_COCHO });
  });

  it("15: lote incompatível com o fornecimento é bloqueado", async () => {
    const store = criarStore({ forns: [forn({ loteId: 1 })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ fornecimentoId: 1, loteId: 3 }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_FORN_LOTE });
  });

  it("16: leitura anterior ao fornecimento não vincula", async () => {
    const store = criarStore({ forns: [forn({ hora: "08:00" })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ fornecimentoId: 1, hora: "07:00" }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_FORN_TEMPO });
  });

  it("17: leitura avulsa não inventa consumo", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: null, sobraKg: 20 }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.calculavel).toBe(false);
    expect(got.consumo.motivo).toBe(MSG_CONS_AVULSA);
    expect(got.consumo.consumoAparenteKg).toBeNull();
  });

  it("18: escore sem sobra não vira kg", async () => {
    const store = criarStore({ forns: [forn()] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: null, escore: "1" }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.calculavel).toBe(false);
    expect(got.consumo.motivo).toBe(MSG_CONS_SO_ESCORE);
  });

  it("19: 100 − 20 = 80 aparente no caso simples", async () => {
    const store = criarStore({ forns: [forn()] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: 20, hora: "17:00" }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.calculavel).toBe(true);
    expect(got.consumo.consumoAparenteKg).toBe(80);
    expect(got.loteId).toBe(1);
    expect(got.alimentoNomeSnapshot).toBe("Milho");
  });

  it("20/21: ciclo 10 + 150 − 20 = 140 e soma múltiplos fornecimentos", async () => {
    const store = criarStore({
      forns: [
        forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100 }),
        forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50 }),
      ],
    });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 10, hora: "07:00", fornecimentoId: null }), HOJE);
    await svc.criar(10, input({ sobraKg: 20, hora: "17:00", fornecimentoId: null }), HOJE);
    const got = await svc.obter(10, 2);
    expect(got.consumo.consumoAparenteKg).toBe(140);
    expect(got.consumo.fornecidoKg).toBe(150);
    expect(got.consumo.sobraInicialKg).toBe(10);
  });

  it("22: estornado não entra na soma do ciclo", async () => {
    const store = criarStore({
      forns: [
        forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100 }),
        forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50, status: "estornado" }),
      ],
    });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 10, hora: "07:00" }), HOJE);
    await svc.criar(10, input({ sobraKg: 20, hora: "17:00" }), HOJE);
    const got = await svc.obter(10, 2);
    expect(got.consumo.consumoAparenteKg).toBe(90);
  });

  it("23: leitura cancelada não fecha ciclo", async () => {
    const store = criarStore({ forns: [forn()] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 10, hora: "10:00" }), HOJE);
    await svc.criar(10, input({ sobraKg: 20, hora: "17:00", fornecimentoId: null }), HOJE);
    await svc.cancelar(10, 1);
    const atual = await svc.obter(10, 2);
    expect(atual.consumo.calculavel).toBe(false);
    expect(atual.consumo.motivo).toBe(MSG_CONS_AVULSA);
    const cancelada = await svc.obter(10, 1);
    expect(cancelada.consumo.calculavel).toBe(false);
  });

  it("24: troca de lote no intervalo impede cálculo", async () => {
    const store = criarStore({
      forns: [forn({ id: 1, hora: "08:00", loteId: 3 })],
    });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 10, hora: "07:00", loteId: 1 }), HOJE);
    await svc.criar(10, input({ sobraKg: 20, hora: "17:00", loteId: 3 }), HOJE);
    const got = await svc.obter(10, 2);
    expect(got.consumo.calculavel).toBe(false);
    expect(got.consumo.motivo).toMatch(/lote/i);
  });

  it("25: troca de alimento impede cálculo", async () => {
    const store = criarStore({
      forns: [
        forn({ id: 1, hora: "08:00", produtoId: 10 }),
        forn({ id: 2, hora: "12:00", tipoOrigem: "dieta", dietaId: 5, produtoId: null, origemNomeSnapshot: "Dieta 90" }),
      ],
    });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ sobraKg: 10, hora: "07:00" }), HOJE);
    await svc.criar(10, input({ sobraKg: 20, hora: "17:00" }), HOJE);
    const got = await svc.obter(10, 2);
    expect(got.consumo.calculavel).toBe(false);
    expect(got.consumo.motivo).toMatch(/alimento/i);
  });

  it("26: cochos diferentes não são misturados", async () => {
    const store = criarStore({
      forns: [
        forn({ id: 1, cochoId: 1, quantidadeFornecidaKg: 100 }),
        forn({ id: 9, cochoId: 2, fazendaId: 2, quantidadeFornecidaKg: 999 }),
      ],
    });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: 20 }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.consumoAparenteKg).toBe(80);
    expect(got.consumo.fornecimentoIds).toEqual([1]);
  });

  it("27/28/29/30/31/32/33: leitura não mexe em estoque, sobra, batida, planejamento, fornecimento nem custo", async () => {
    const store = criarStore({ forns: [forn()] });
    const antes = snapshotExterno(store);
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: 20 }), HOJE);
    await svc.editar(10, 1, input({ fornecimentoId: 1, sobraKg: 15 }), HOJE);
    await svc.cancelar(10, 1);
    expect(snapshotExterno(store)).toEqual(antes);
  });

  it("34: consumo aparente não é persistido", async () => {
    const store = criarStore({ forns: [forn()] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1 }), HOJE);
    expect(store.rows[0]).not.toHaveProperty("consumoAparenteKg");
    expect(JSON.stringify(store.rows[0])).not.toMatch(/consumoAparente/);
  });

  it("35: correção da leitura recalcula o derivado", async () => {
    const store = criarStore({ forns: [forn()] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: 20 }), HOJE);
    expect((await svc.obter(10, 1)).consumo.consumoAparenteKg).toBe(80);
    await svc.editar(10, 1, input({ fornecimentoId: 1, sobraKg: 10 }), HOJE);
    expect((await svc.obter(10, 1)).consumo.consumoAparenteKg).toBe(90);
  });

  it("36: cocho renomeado preserva snapshot", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ observacoes: "ok" }), HOJE);
    store.cochos[0]!.nome = "Cocho Novo";
    const got = await svc.obter(10, 1);
    expect(got.cochoNomeSnapshot).toBe("C01 (C01)");
  });

  it("preview de correção não trata cocho inativo como nova leitura", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ observacoes: "histórica" }), HOJE);
    store.cochos[0]!.status = "inativo";
    const prev = await svc.preview(10, input({ observacoes: "correção" }), HOJE, false);
    expect(prev.ok).toBe(true);
    const prevNova = await svc.preview(10, input({ observacoes: "nova" }), HOJE, true);
    expect(prevNova.ok).toBe(false);
  });

  it("37: cocho inativado mantém leitura antiga e bloqueia nova", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ observacoes: "histórica" }), HOJE);
    store.cochos[0]!.status = "inativo";
    const got = await svc.obter(10, 1);
    expect(got.observacoes).toBe("histórica");
    await expect(svc.criar(10, input({ observacoes: "nova" }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_COCHO_INATIVO });
  });

  it("38/39: data civil e hora opcional", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ data: "2026-06-03", hora: null, observacoes: "sem hora", sobraKg: null }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.data).toBe("2026-06-03");
    expect(got.hora).toBeNull();
  });

  it("40: mesma data sem ordem segura não calcula", async () => {
    const store = criarStore({ forns: [forn({ hora: null })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, hora: "17:00", sobraKg: 20 }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.calculavel).toBe(false);
    expect(got.consumo.motivo).toMatch(/temporal|ordem/i);
  });

  it("41/42/43: população atual não entra; /cab e /cab/dia só com base defensável", async () => {
    const store = criarStore({ forns: [forn({ populacaoSnapshot: 50 })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, sobraKg: 20, hora: "17:00" }), HOJE);
    const got = await svc.obter(10, 1);
    expect(got.consumo.kgPorCabeca).toBe(1.6);
    expect(got.consumo.kgPorCabecaDia).not.toBeNull();

    const store2 = criarStore({
      forns: [
        forn({ id: 1, hora: "08:00", quantidadeFornecidaKg: 100, populacaoSnapshot: 50 }),
        forn({ id: 2, hora: "12:00", quantidadeFornecidaKg: 50, populacaoSnapshot: 80 }),
      ],
    });
    const svc2 = createNutricaoCochoLeiturasService(store2);
    await svc2.criar(10, input({ sobraKg: 10, hora: "07:00" }), HOJE);
    await svc2.criar(10, input({ sobraKg: 20, hora: "17:00" }), HOJE);
    const ciclo = await svc2.obter(10, 2);
    expect(ciclo.consumo.consumoAparenteKg).toBe(140);
    expect(ciclo.consumo.kgPorCabeca).toBeNull();
    expect(ciclo.consumo.kgPorCabecaDia).toBeNull();
  });

  it("44: multi-fazenda — lista não mistura fazendas", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ observacoes: "F1" }), HOJE);
    await svc.criar(10, input({ fazendaId: 2, cochoId: 2, loteId: null, observacoes: "F2", sobraKg: null }), HOJE);
    const a = await svc.listar(10, { fazendaId: 1 });
    const b = await svc.listar(10, { fazendaId: 2 });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.fazendaId).toBe(1);
    expect(b[0]?.fazendaId).toBe(2);
  });

  it("herda lote do fornecimento e não troca silenciosamente", async () => {
    const store = criarStore({ forns: [forn({ loteId: 1 })] });
    const svc = createNutricaoCochoLeiturasService(store);
    await svc.criar(10, input({ fornecimentoId: 1, loteId: null, sobraKg: 20 }), HOJE);
    expect(store.rows[0]?.loteId).toBe(1);
    expect(store.rows[0]?.loteNomeSnapshot).toBe("B01");
  });

  it("cocho inativo no cadastro não recebe nova leitura", async () => {
    const store = criarStore();
    const svc = createNutricaoCochoLeiturasService(store);
    await expect(svc.criar(10, input({ cochoId: 3, observacoes: "x", sobraKg: null }), HOJE))
      .rejects.toMatchObject({ message: MSG_LEITURA_COCHO_INATIVO });
  });
});

describe("nutricaoCochoLeituras — contrato estático", () => {
  it("34/49: schema sem consumo persistido, sem batidaId e sem reusar legacy", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const start = schema.indexOf("export const nutricaoCochoLeituras");
    const tabela = schema.slice(start, start + 1800);
    expect(tabela).toContain('mysqlTable("nutricao_cocho_leituras"');
    expect(tabela).toContain("cochoId");
    expect(tabela).toContain("loteId");
    expect(tabela).toContain("fornecimentoId");
    expect(tabela).toContain("sobraKg");
    expect(tabela).toContain("escore");
    expect(tabela).not.toMatch(/batidaId/);
    expect(tabela).not.toMatch(/consumoAparente/);
    expect(schema).toContain('export const batidas = mysqlTable("batidas"');
    expect(schema).toContain('export const nutricaoCochos = mysqlTable("nutricao_cochos"');
  });

  it("27/50: service não movimenta estoque nem altera batida/fornecimento", () => {
    const src = readFileSync(new URL("./nutricaoCochoLeituras.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/estoqueMovimentacoes|debitarEstoque|createMovimentacao|creditarEstoque/);
    expect(src).not.toMatch(/db\.update\(nutricaoFornecimentos\)|db\.update\(nutricaoBatidas\)|db\.update\(nutricaoPlanejamentos\)/);
    expect(src).not.toMatch(/insert\(estoque/);
  });

  it("45: rotas novas abrem as páginas corretas e ficam antes de /cochos/:id", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const nova = app.indexOf('path="/nutricao/cochos/leituras/nova"');
    const lista = app.indexOf('path="/nutricao/cochos/leituras"');
    const detalheCocho = app.indexOf('path="/nutricao/cochos/:id"');
    expect(app).toMatch(/NutricaoCochoLeiturasListPage/);
    expect(app).toMatch(/NutricaoCochoLeituraFormPage/);
    expect(app).toMatch(/NutricaoCochoLeituraDetalhePage/);
    expect(nova).toBeGreaterThan(-1);
    expect(lista).toBeGreaterThan(-1);
    expect(detalheCocho).toBeGreaterThan(lista);
  });

  it("46: detalhe do cocho mostra leituras reais e ação de registrar", () => {
    const page = readFileSync(new URL("../client/src/pages/NutricaoCochoDetalhePage.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/Leituras recentes/);
    expect(page).toMatch(/Registrar leitura/);
    expect(page).toMatch(/nutricaoCochoLeituras\.listPorCocho/);
  });

  it("47/48: fornecimento com cocho inicia leitura; sem cocho não inventa", () => {
    const page = readFileSync(new URL("../client/src/pages/NutricaoFornecimentoDetalhePage.tsx", import.meta.url), "utf8");
    expect(page).toMatch(/data\.cochoId \?/);
    expect(page).toMatch(/Registrar leitura do cocho/);
    expect(page).toMatch(/fornecimentoId=\$\{data\.id\}/);
  });

  it("menu aponta para /nutricao/cochos/leituras", () => {
    const data = readFileSync(new URL("../client/src/lib/data.ts", import.meta.url), "utf8");
    expect(data).toMatch(/label: "Leituras de Cocho"[\s\S]*path: "\/nutricao\/cochos\/leituras"/);
  });
});
