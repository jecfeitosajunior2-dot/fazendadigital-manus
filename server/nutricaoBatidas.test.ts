import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createNutricaoBatidasService,
  type BatidaIngPersistido,
  type BatidaMovPersistido,
  type BatidaPersistida,
  type BatidaStore,
  type BatidaFornVinculado,
} from "./nutricaoBatidas";
import type { NutricaoFornEstoqueRef } from "../shared/nutricaoFornecimentos";
import {
  MSG_BATIDA_COM_FORN,
  MSG_BATIDA_DIETA,
  MSG_BATIDA_DIETA_FAZENDA,
  MSG_BATIDA_JA_ESTORNADA,
  MSG_BATIDA_MOTIVO,
  MSG_BATIDA_QTD,
  MSG_BATIDA_SALDO,
} from "../shared/nutricaoBatidas";
import { MSG_BATIDA_DIETA_PRONTA } from "../shared/nutricaoDietas";
import type { NutricaoPlanDietaRef } from "../shared/nutricaoPlanejamento";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(seed?: {
  produtos?: NutricaoFornEstoqueRef[];
  dietas?: NutricaoPlanDietaRef[];
  falharNaUltimaSaida?: boolean;
  falharEstorno?: boolean;
}): BatidaStore & {
  rows: BatidaPersistida[];
  ings: BatidaIngPersistido[];
  movs: BatidaMovPersistido[];
  forns: BatidaFornVinculado[];
  produtos: NutricaoFornEstoqueRef[];
  dietas: NutricaoPlanDietaRef[];
} {
  const state = {
    produtos: seed?.produtos ?? [
      { estoqueId: 100, produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "1.00", quantidade: "1000", controlarSaldo: true, vinculadoFazenda: true },
      { estoqueId: 101, produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "2.00", quantidade: "800", controlarSaldo: true, vinculadoFazenda: true },
      { estoqueId: 102, produtoId: 12, nome: "Núcleo", unidade: "kg", valorUnitario: "4.00", quantidade: "400", controlarSaldo: true, vinculadoFazenda: true },
    ],
    dietas: seed?.dietas ?? [{
      id: 5, userId: 10, fazendaId: 1, nome: "Engorda 1", status: "ativa",
      dataInicio: null, dataFim: null, baseQuantidade: 500,
      ingredientes: [
        { produtoId: 10, quantidadeKg: 300 },
        { produtoId: 11, quantidadeKg: 150 },
        { produtoId: 12, quantidadeKg: 50 },
      ],
    }],
    rows: [] as BatidaPersistida[],
    ings: [] as BatidaIngPersistido[],
    movs: [] as BatidaMovPersistido[],
    forns: [] as Array<BatidaFornVinculado & { batidaId: number }>,
    nextB: 1,
    nextM: 1,
  };

  return {
    get rows() { return state.rows; },
    get ings() { return state.ings; },
    get movs() { return state.movs; },
    get forns() { return state.forns; },
    get produtos() { return state.produtos; },
    get dietas() { return state.dietas; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async listProdutosFazenda() { return state.produtos; },
    async listDietasFazenda(userId, fazendaId) {
      return state.dietas.filter(d => d.userId === userId && d.fazendaId === fazendaId && d.status === "ativa");
    },
    async getDieta(userId, dietaId) {
      return state.dietas.find(d => d.id === dietaId && d.userId === userId) ?? null;
    },
    async find(userId, id) {
      return state.rows.find(r => r.id === id && r.userId === userId) ?? null;
    },
    async list(userId, fazendaId) {
      return state.rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
    },
    async listIngredientes(batidaId) {
      return state.ings.filter(i => i.batidaId === batidaId);
    },
    async listMovimentacoes(batidaId) {
      return state.movs.filter(m => m.batidaId === batidaId);
    },
    async listFornecimentos(batidaId) {
      return state.forns.filter(f => f.batidaId === batidaId);
    },
    async getLoteNome() { return "B01"; },
    async transaction(fn) {
      const snap = {
        rows: clone(state.rows),
        ings: clone(state.ings),
        movs: clone(state.movs),
        produtos: clone(state.produtos),
        nextB: state.nextB,
        nextM: state.nextM,
      };
      try {
        return await fn({
          async insertBatida(row) {
            const id = state.nextB++;
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
            if (seed?.falharNaUltimaSaida && state.movs.length >= 2) throw new Error("falha ultima saida");
            const id = state.nextM++;
            state.movs.push({
              id,
              batidaId: row.batidaId,
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
          async listMovimentacoesAtivas(batidaId) {
            return state.movs.filter(m => m.batidaId === batidaId && m.status === "ativa");
          },
          async marcarEstornadas(ids) {
            for (const m of state.movs) if (ids.includes(m.id)) m.status = "estornada";
          },
          async insertEstorno(row) {
            if (seed?.falharEstorno) throw new Error("falha estorno");
            state.movs.push({
              id: state.nextM++,
              batidaId: row.batidaId,
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
          async contarFornecimentosConfirmados(batidaId) {
            return state.forns.filter(f => f.status === "confirmado" && f.batidaId === batidaId).length;
          },
        });
      } catch (error) {
        state.rows = snap.rows;
        state.ings = snap.ings;
        state.movs = snap.movs;
        state.produtos = snap.produtos;
        state.nextB = snap.nextB;
        state.nextM = snap.nextM;
        throw error;
      }
    },
  };
}

const inputOk = (over: Partial<{ fazendaId: number; dietaId: number; data: string; quantidadePreparadaKg: number; hora?: string | null }> = {}) => ({
  fazendaId: 1,
  dietaId: 5,
  data: "2026-10-01",
  quantidadePreparadaKg: 1000,
  ...over,
});

describe("nutricaoBatidas service", () => {
  it("1/14/24/25/26: cria batida válida, baixa uma vez e saldo inicial = preparada", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    const out = await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    expect(out.id).toBe(1);
    expect(store.rows[0]?.status).toBe("confirmado");
    expect(store.ings).toHaveLength(3);
    expect(store.ings.map(i => Number(i.quantidadeKg))).toEqual([600, 300, 100]);
    expect(store.movs).toHaveLength(3);
    expect(store.movs.every(m => m.batidaId === 1)).toBe(true);
    expect(Number(store.produtos[0]?.quantidade)).toBe(400);
    expect(Number(store.produtos[1]?.quantidade)).toBe(500);
    expect(Number(store.produtos[2]?.quantidade)).toBe(300);
    const got = await svc.obter(10, 1);
    expect(got.quantidadeDistribuidaKg).toBe(0);
    expect(got.saldoDisponivelKg).toBe(1000);
    expect(got.situacao).toBe("disponivel");
  });

  it("2/6/7: dieta e quantidade inválidas bloqueiam", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk({ dietaId: 99 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA });
    await expect(svc.confirmar(10, "Pedro", inputOk({ quantidadePreparadaKg: 0 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_QTD });
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
  });

  it("3: dieta de outra fazenda bloqueada", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk({ fazendaId: 2 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA_FAZENDA });
    expect(store.rows).toHaveLength(0);
  });

  it("4: dieta de outro usuário bloqueada", async () => {
    const store = criarStore({
      dietas: [{
        id: 5, userId: 99, fazendaId: 1, nome: "Alheia", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 500,
        ingredientes: [{ produtoId: 10, quantidadeKg: 500 }],
      }],
    });
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk(), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA });
  });

  it("5: dieta inativa bloqueada", async () => {
    const store = criarStore();
    store.dietas[0]!.status = "inativa";
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk(), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA });
  });

  it("12/13: saldo insuficiente de um ingrediente não baixa nenhum", async () => {
    const store = criarStore({
      produtos: [
        { estoqueId: 100, produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "1.00", quantidade: "1000", controlarSaldo: true, vinculadoFazenda: true },
        { estoqueId: 101, produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "2.00", quantidade: "800", controlarSaldo: true, vinculadoFazenda: true },
        { estoqueId: 102, produtoId: 12, nome: "Núcleo", unidade: "kg", valorUnitario: "4.00", quantidade: "10", controlarSaldo: true, vinculadoFazenda: true },
      ],
    });
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk(), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_SALDO });
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
    expect(Number(store.produtos[1]?.quantidade)).toBe(800);
    expect(Number(store.produtos[2]?.quantidade)).toBe(10);
  });

  it("15: falha na última movimentação gera rollback total", async () => {
    const store = criarStore({ falharNaUltimaSaida: true });
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk(), "2026-10-01")).rejects.toThrow(/falha ultima/);
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(store.ings).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
  });

  it("16: preview não baixa estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    const prev = await svc.preview(10, inputOk(), "2026-10-01");
    expect(prev.preview.podeConfirmar).toBe(true);
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
  });

  it("18/19: snapshot congelado; mudança da dieta não altera batida antiga", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    store.dietas[0]!.ingredientes = [{ produtoId: 10, quantidadeKg: 500 }];
    store.dietas[0]!.nome = "Outra";
    const got = await svc.obter(10, 1);
    expect(got.dietaNomeSnapshot).toBe("Engorda 1");
    expect(got.ingredientes.map(i => Number(i.quantidadeKg))).toEqual([600, 300, 100]);
  });

  it("20/21: custo completo", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    expect(store.rows[0]?.custoCompleto).toBe(true);
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(1600);
    expect(Number(store.rows[0]?.custoKgSnapshot)).toBe(1.6);
  });

  it("22/23: custo incompleto permite batida e não grava zero", async () => {
    const store = criarStore({
      produtos: [
        { estoqueId: 100, produtoId: 10, nome: "Milho", unidade: "kg", valorUnitario: "1.00", quantidade: "1000", controlarSaldo: true, vinculadoFazenda: true },
        { estoqueId: 101, produtoId: 11, nome: "Farelo", unidade: "kg", valorUnitario: "2.00", quantidade: "800", controlarSaldo: true, vinculadoFazenda: true },
        { estoqueId: 102, produtoId: 12, nome: "Núcleo", unidade: "kg", valorUnitario: null, quantidade: "400", controlarSaldo: true, vinculadoFazenda: true },
      ],
    });
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    expect(store.rows[0]?.custoCompleto).toBe(false);
    expect(store.rows[0]?.custoTotalSnapshot).toBeNull();
    expect(store.rows[0]?.custoKgSnapshot).toBeNull();
    expect(store.ings.find(i => i.produtoId === 12)?.custoTotalSnapshot).toBeNull();
    expect(Number(store.produtos[2]?.quantidade)).toBe(300);
  });

  it("34/35/36/37/38/39: estorno da batida", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    store.forns.push({
      id: 1, batidaId: 1, data: "2026-10-01", hora: null, loteId: 1, quantidadeFornecidaKg: "600", status: "confirmado", cochoNomeSnapshot: null,
    });
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02"))
      .rejects.toMatchObject({ message: MSG_BATIDA_COM_FORN });
    store.forns[0]!.status = "estornado";
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "" }, "2026-10-02"))
      .rejects.toMatchObject({ message: MSG_BATIDA_MOTIVO });
    store.dietas[0]!.ingredientes = [{ produtoId: 10, quantidadeKg: 500 }];
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(store.rows[0]?.status).toBe("estornado");
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
    expect(Number(store.produtos[1]?.quantidade)).toBe(800);
    expect(Number(store.produtos[2]?.quantidade)).toBe(400);
    expect(store.movs.some(m => m.status === "estorno")).toBe(true);
    await expect(svc.estornar(10, "Pedro", { id: 1, motivo: "outro" }, "2026-10-03"))
      .rejects.toMatchObject({ message: MSG_BATIDA_JA_ESTORNADA });
  });

  it("40: batida estornada não aparece para distribuição", async () => {
    const store = criarStore();
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk(), "2026-10-01");
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    const disp = await svc.listarDisponiveis(10, 1);
    expect(disp).toHaveLength(0);
  });
});

describe("nutricaoBatidas — rotas, schema e coexistência", () => {
  it("17: formulário só confirma no clique", () => {
    const src = readFileSync(new URL("../client/src/pages/NutricaoBatidaFormPage.tsx", import.meta.url), "utf8");
    expect(src).toContain("preview.useQuery");
    expect(src).toContain("confirmar.useMutation");
    expect(src).toContain("confirmar.mutate(payload)");
    expect(src).toContain("A prévia não movimenta estoque");
  });

  it("52: rota /nutricao/batidas usa a página nova", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/NutricaoBatidasListPage/);
    expect(app).toMatch(/path="\/nutricao\/batidas"/);
    expect(app).not.toMatch(/path="\/nutricao\/batidas"\s+component=\{SuppliesManagementPage\}/);
  });

  it("43/44: batida não possui lote nem cocho fixos", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const start = schema.indexOf("export const nutricaoBatidas");
    const end = schema.indexOf("export const nutricaoBatidaIngredientes");
    const bloco = schema.slice(start, end);
    expect(bloco).not.toMatch(/loteId|cochoId/);
  });

  it("53: tabela legacy batidas permanece intacta", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    expect(schema).toContain('export const batidas = mysqlTable("batidas"');
    expect(schema).toContain('export const nutricaoBatidas = mysqlTable("nutricao_batidas"');
    const src = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from\(batidas\)|insert\(batidas\)/);
  });

  it("54/55: nenhuma leitura de cocho nem registro por animal", () => {
    const src = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/leitura.?cocho|nutricao_leituras|escore|sobra/i);
    expect(src).not.toMatch(/animais\.insert|insert\(animais\)/);
  });

  it("24: vínculo explícito com estoque", () => {
    const src = readFileSync(new URL("./nutricaoBatidas.ts", import.meta.url), "utf8");
    expect(src).toContain("nutricaoBatidaId");
    expect(src).toContain("NUTRICAO_BATIDA_TIPO_SAIDA");
  });
});

describe("conversão operacional por embalagem — batida", () => {
  it("D: batida de 45 kg do sal 30 kg/sc baixa 1,5 sc", async () => {
    const store = criarStore({
      produtos: [{
        estoqueId: 200,
        produtoId: 22,
        nome: "Sal Nitrogenado 40 Flex LA",
        unidade: "sc",
        valorUnitario: "90",
        quantidade: "10",
        controlarSaldo: true,
        vinculadoFazenda: true,
        embalagens: [{ nome: "Saco", volume: 30, unidade: "kg" }],
      }],
      dietas: [{
        id: 5, userId: 10, fazendaId: 1, nome: "Dieta Sal", status: "ativa",
        dataInicio: null, dataFim: null, baseQuantidade: 45,
        ingredientes: [{ produtoId: 22, quantidadeKg: 45 }],
      }],
    });
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk({ quantidadePreparadaKg: 45 }), "2026-10-01");
    expect(Number(store.produtos[0]?.quantidade)).toBe(8.5);
    expect(store.produtos[0]?.valorUnitario).toBe("90");
    expect(Number(store.movs[0]?.quantidade)).toBe(-1.5);
    expect(Number(store.movs[0]?.conteudoPorUnidadeSnapshot)).toBe(30);
    expect(Number(store.movs[0]?.quantidadeFisicaSnapshot)).toBe(-45);
    expect(Number(store.ings[0]?.quantidadeKg)).toBe(45);
    expect(Number(store.ings[0]?.quantidadeUnidade)).toBe(1.5);
    expect(Number(store.rows[0]?.custoTotalSnapshot)).toBe(135);

    store.produtos[0]!.embalagens = [{ nome: "Saco", volume: 25, unidade: "kg" }];
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(10);
    const estorno = store.movs.find(m => m.status === "estorno");
    expect(Number(estorno?.quantidade)).toBe(1.5);
    expect(Number(estorno?.conteudoPorUnidadeSnapshot)).toBe(30);
  });
});

describe("nutricaoBatidas — forma de uso", () => {
  function dietaRef(over: Partial<NutricaoPlanDietaRef> = {}): NutricaoPlanDietaRef {
    return {
      id: 5, userId: 10, fazendaId: 1, nome: "Engorda 1", status: "ativa",
      dataInicio: null, dataFim: null, baseQuantidade: 500,
      ingredientes: [
        { produtoId: 10, quantidadeKg: 300 },
        { produtoId: 11, quantidadeKg: 150 },
        { produtoId: 12, quantidadeKg: 50 },
      ],
      ...over,
    };
  }

  it("A: pronta não aparece no seletor; B/C/D: opcional, obrigatória e legado aparecem", async () => {
    const store = criarStore({
      dietas: [
        dietaRef({ id: 1, nome: "Pronta", formaUso: "pronta_fornecer" }),
        dietaRef({ id: 2, nome: "Opcional", formaUso: "preparo_opcional" }),
        dietaRef({ id: 3, nome: "Obrigatória", formaUso: "preparo_obrigatorio" }),
        dietaRef({ id: 4, nome: "Legada", formaUso: null }),
      ],
    });
    const svc = createNutricaoBatidasService(store);
    const lista = await svc.listarDietasParaBatida(10, 1);
    expect(lista.map(d => d.nome)).toEqual(["Opcional", "Obrigatória", "Legada"]);
  });

  it("E: API recebe dieta pronta e o backend bloqueia", async () => {
    const store = criarStore({
      dietas: [dietaRef({ formaUso: "pronta_fornecer" })],
    });
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk(), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA_PRONTA });
    expect(store.rows).toHaveLength(0);
    expect(store.movs).toHaveLength(0);
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
  });

  it("F: 1 ingrediente + obrigatório confirma batida", async () => {
    const store = criarStore({
      dietas: [dietaRef({
        formaUso: "preparo_obrigatorio",
        baseQuantidade: 30,
        ingredientes: [{ produtoId: 10, quantidadeKg: 30 }],
      })],
    });
    const svc = createNutricaoBatidasService(store);
    const out = await svc.confirmar(10, "Pedro", inputOk({ quantidadePreparadaKg: 30 }), "2026-10-01");
    expect(out.id).toBe(1);
    expect(Number(store.produtos[0]?.quantidade)).toBe(970);
  });

  it("G: 2 ingredientes + pronta é bloqueada", async () => {
    const store = criarStore({
      dietas: [dietaRef({
        formaUso: "pronta_fornecer",
        baseQuantidade: 100,
        ingredientes: [
          { produtoId: 10, quantidadeKg: 60 },
          { produtoId: 11, quantidadeKg: 40 },
        ],
      })],
    });
    const svc = createNutricaoBatidasService(store);
    await expect(svc.confirmar(10, "Pedro", inputOk({ quantidadePreparadaKg: 100 }), "2026-10-01"))
      .rejects.toMatchObject({ message: MSG_BATIDA_DIETA_PRONTA });
  });

  it("I/J: estoque baixa uma vez e estorno continua correto", async () => {
    const store = criarStore({
      dietas: [dietaRef({ formaUso: "preparo_opcional" })],
    });
    const svc = createNutricaoBatidasService(store);
    await svc.confirmar(10, "Pedro", inputOk({ quantidadePreparadaKg: 500 }), "2026-10-01");
    expect(Number(store.produtos[0]?.quantidade)).toBe(700);
    expect(Number(store.produtos[1]?.quantidade)).toBe(650);
    expect(Number(store.produtos[2]?.quantidade)).toBe(350);
    store.dietas[0]!.formaUso = "pronta_fornecer";
    await svc.estornar(10, "Pedro", { id: 1, motivo: "erro_lancamento" }, "2026-10-02");
    expect(Number(store.produtos[0]?.quantidade)).toBe(1000);
    expect(Number(store.produtos[1]?.quantidade)).toBe(800);
    expect(Number(store.produtos[2]?.quantidade)).toBe(400);
  });

  it("Nova Batida usa listDietasParaBatida e não filtra o planejamento", () => {
    const form = readFileSync(new URL("../client/src/pages/NutricaoBatidaFormPage.tsx", import.meta.url), "utf8");
    const router = readFileSync(new URL("./nutricaoBatidasRouter.ts", import.meta.url), "utf8");
    const planRouter = readFileSync(new URL("./nutricaoPlanejamentoRouter.ts", import.meta.url), "utf8");
    expect(form).toContain("listDietasParaBatida");
    expect(form).not.toContain("nutricaoPlanejamento.listDietas");
    expect(form).toContain("MSG_BATIDA_SEM_DIETA_PREPARO");
    expect(router).toContain("listDietasParaBatida");
    expect(planRouter).not.toContain("podeDietaGerarBatida");
    expect(planRouter).not.toContain("formaUso");
  });

  it("Nova Batida: vazio só após sucesso, seletor desabilitado e sem tratar como erro", () => {
    const form = readFileSync(new URL("../client/src/pages/NutricaoBatidaFormPage.tsx", import.meta.url), "utf8");
    expect(form).toContain("estadoDietasParaBatida");
    expect(form).toContain("estadoDietas === \"carregando\"");
    expect(form).toContain("estadoDietas === \"vazio\"");
    expect(form).toContain("MSG_BATIDA_SEM_DIETA_PREPARO_COMPLEMENTO");
    expect(form).toContain("disabled={seletorDietaDesabilitado}");
    expect(form).toContain("text-[12px] text-gray-500");
    const blocoVazio = form.slice(form.indexOf("estadoDietas === \"vazio\""), form.indexOf("estadoDietas === \"vazio\"") + 420);
    expect(blocoVazio).toContain("MSG_BATIDA_SEM_DIETA_PREPARO");
    expect(blocoVazio).not.toContain("text-red");
    expect(form).not.toContain("toast.error(MSG_BATIDA_SEM_DIETA_PREPARO)");
    expect(form).toContain("!payload");
  });
});
