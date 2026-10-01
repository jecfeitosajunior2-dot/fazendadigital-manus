import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createNutricaoCochosService, type CochoFornecimentoResumo, type CochoPersistido, type CochosStore } from "./nutricaoCochos";
import type { NutricaoCochoInput, NutricaoCochoPastoRef } from "../shared/nutricaoCochos";
import { MSG_COCHO_CODIGO, MSG_COCHO_FAZENDA_FIXA, MSG_COCHO_PASTO } from "../shared/nutricaoCochos";

function criarStore(seed?: {
  pastos?: NutricaoCochoPastoRef[];
  forns?: CochoFornecimentoResumo[];
}): CochosStore & { rows: CochoPersistido[]; forns: CochoFornecimentoResumo[] } {
  const state = {
    pastos: seed?.pastos ?? [
      { id: 444, userId: 10, fazendaId: 1, nome: "Pasto 444" },
      { id: 9, userId: 10, fazendaId: 2, nome: "Pasto B" },
    ],
    rows: [] as CochoPersistido[],
    forns: seed?.forns ?? [] as CochoFornecimentoResumo[],
    next: 1,
  };

  return {
    get rows() { return state.rows; },
    get forns() { return state.forns; },
    async assertFazenda(userId, fazendaId) {
      if (userId === 10 && (fazendaId === 1 || fazendaId === 2)) return;
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    },
    async find(userId, id) {
      return state.rows.find(r => r.id === id && r.userId === userId) ?? null;
    },
    async list(userId, fazendaId) {
      return state.rows.filter(r => r.userId === userId && r.fazendaId === fazendaId);
    },
    async getPasto(userId, pastoId) {
      return state.pastos.find(p => p.id === pastoId && p.userId === userId) ?? null;
    },
    async listPastos(userId, fazendaId) {
      return state.pastos.filter(p => p.userId === userId && p.fazendaId === fazendaId);
    },
    async codigoEmUso(userId, fazendaId, codigo, exceptId) {
      const alvo = codigo.trim().toLowerCase();
      return state.rows.some(r =>
        r.userId === userId && r.fazendaId === fazendaId && r.id !== exceptId
        && (r.codigo ?? "").trim().toLowerCase() === alvo,
      );
    },
    async insert(row) {
      const id = state.next++;
      state.rows.push({ id, ...row });
      return id;
    },
    async update(id, userId, patch) {
      const row = state.rows.find(r => r.id === id && r.userId === userId);
      if (row) Object.assign(row, patch);
    },
    async setStatus(id, userId, status) {
      const row = state.rows.find(r => r.id === id && r.userId === userId);
      if (row) row.status = status;
    },
    async listFornecimentos(userId, cochoId) {
      return state.forns.filter(f => f.cochoId === cochoId).sort((a, b) => b.id - a.id);
    },
    async getLoteNome() { return "B01"; },
  };
}

const input = (over: Partial<NutricaoCochoInput> = {}): NutricaoCochoInput => ({
  fazendaId: 1, nome: "Cocho Pasto 444", tipo: "mineral", codigo: "C01", ...over,
});

describe("nutricaoCochos service", () => {
  it("1/8/17: cria cocho sem pasto e sem estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    const out = await svc.criar(10, input({ pastoId: null, localizacaoDescricao: "Praça" }));
    expect(out.id).toBe(1);
    expect(store.rows[0]).toMatchObject({ nome: "Cocho Pasto 444", pastoId: null, status: "ativo" });
  });

  it("5/6: ownership e fazenda", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    await svc.criar(10, input());
    await expect(svc.obter(99, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const listaB = await svc.listar(10, { fazendaId: 2 });
    expect(listaB).toHaveLength(0);
  });

  it("7: pasto de outra fazenda bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    await expect(svc.criar(10, input({ pastoId: 9 }))).rejects.toMatchObject({ message: MSG_COCHO_PASTO });
  });

  it("14/15/16: inativa, reativa e não apaga", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    await svc.criar(10, input());
    await svc.inativar(10, 1);
    expect(store.rows[0]?.status).toBe("inativo");
    await svc.reativar(10, 1);
    expect(store.rows[0]?.status).toBe("ativo");
    expect(store.rows).toHaveLength(1);
  });

  it("18/19: editar e inativar não tocam estoque (sem API de estoque)", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    await svc.criar(10, input());
    await svc.editar(10, 1, input({ nome: "Cocho Praça 01", codigo: "C02" }));
    expect(store.rows[0]?.nome).toBe("Cocho Praça 01");
    await expect(svc.editar(10, 1, input({ fazendaId: 2, nome: "X", tipo: "mineral" })))
      .rejects.toMatchObject({ message: MSG_COCHO_FAZENDA_FIXA });
  });

  it("código duplicado na fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoCochosService(store);
    await svc.criar(10, input());
    await expect(svc.criar(10, input({ nome: "Outro" }))).rejects.toMatchObject({ message: MSG_COCHO_CODIGO });
  });

  it("30/31: histórico só do próprio cocho; último vem dos fatos", async () => {
    const store = criarStore({
      forns: [
        { id: 2, cochoId: 1, data: "2026-10-02", hora: null, loteId: 1, origemNomeSnapshot: "Sal", quantidadeFornecidaKg: "12", status: "confirmado" },
        { id: 9, cochoId: 99, data: "2026-10-03", hora: null, loteId: 1, origemNomeSnapshot: "Outro", quantidadeFornecidaKg: "99", status: "confirmado" },
      ],
    });
    const svc = createNutricaoCochosService(store);
    await svc.criar(10, input());
    const got = await svc.obter(10, 1);
    expect(got.fornecimentos).toHaveLength(1);
    expect(got.ultimoFornecimento?.quantidadeFornecidaKg).toBe("12");
    expect(got.ultimoFornecimento?.loteNome).toBe("B01");
  });

  it("32/33: cadastro do cocho não tem lote/dieta/produto fixos", () => {
    const src = readFileSync(new URL("./nutricaoCochos.ts", import.meta.url), "utf8");
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    const start = schema.indexOf("export const nutricaoCochos");
    const tabela = schema.slice(start, schema.indexOf("export const nutricaoFornecimentoIngredientes"));
    expect(tabela).not.toMatch(/loteId|dietaId|produtoId/);
    expect(src).not.toMatch(/estoqueMovimentacoes|debitarEstoque|createMovimentacao/);
    expect(src).not.toMatch(/from\(cochos\)|insert\(cochos\)/);
  });

  it("34: rota usa a nova página", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/NutricaoCochosListPage/);
    expect(app).toMatch(/path="\/nutricao\/cochos"/);
    expect(app).not.toMatch(/path="\/nutricao\/cochos"\s+component=\{SuppliesManagementPage\}/);
    expect(app).toMatch(/path="\/nutricao\/batidas"\s+component=\{NutricaoBatidasListPage\}/);
  });

  it("35: menu aponta para /nutricao/cochos", () => {
    const data = readFileSync(new URL("../client/src/lib/data.ts", import.meta.url), "utf8");
    expect(data).toMatch(/label: "Cochos"[\s\S]*path: "\/nutricao\/cochos"/);
  });

  it("36: batidas legacy intactas no schema", () => {
    const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
    expect(schema).toContain('export const batidas = mysqlTable("batidas"');
    expect(schema).toContain('export const nutricaoCochos = mysqlTable("nutricao_cochos"');
  });
});
