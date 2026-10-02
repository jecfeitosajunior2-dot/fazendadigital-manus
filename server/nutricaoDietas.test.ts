import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createNutricaoDietasService, type NutricaoDietasStore } from "./nutricaoDietas";
import { calcularCustoEstimadoDieta, type NutricaoDietaInput } from "../shared/nutricaoDietas";

type DietaMem = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  descricao: string | null;
  tipo: string;
  categoriaAnimal: string | null;
  objetivo: string | null;
  status: "ativa" | "inativa";
  dataInicio: string | null;
  dataFim: string | null;
  baseQuantidade: string;
  baseUnidade: string;
};

type IngMem = {
  id: number;
  dietaId: number;
  produtoId: number;
  quantidade: string;
  ordem: number;
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function criarStore(seed?: {
  fazendas?: Array<{ id: number; userId: number }>;
  produtos?: Array<{
    produtoId: number;
    fazendaId: number;
    nome: string;
    unidade: string;
    valorUnitario: string | null;
    embalagens?: unknown;
  }>;
  falharIngredientes?: boolean;
}): NutricaoDietasStore & {
  dietas: DietaMem[];
  ingredientes: IngMem[];
  estoqueMutacoes: number;
} {
  const state = {
    fazendas: seed?.fazendas ?? [
      { id: 1, userId: 10 },
      { id: 2, userId: 10 },
      { id: 3, userId: 99 },
    ],
    produtos: seed?.produtos ?? [
      { produtoId: 10, fazendaId: 1, nome: "Milho", unidade: "kg", valorUnitario: "1.20" },
      { produtoId: 11, fazendaId: 1, nome: "Farelo", unidade: "kg", valorUnitario: "2.10" },
      { produtoId: 12, fazendaId: 1, nome: "Núcleo", unidade: "kg", valorUnitario: "4.00" },
      { produtoId: 15, fazendaId: 1, nome: "Silagem", unidade: "kg", valorUnitario: null },
      { produtoId: 20, fazendaId: 2, nome: "Sal B", unidade: "kg", valorUnitario: "3.00" },
    ],
    dietas: [] as DietaMem[],
    ingredientes: [] as IngMem[],
    nextDieta: 1,
    nextIng: 1,
    estoqueMutacoes: 0,
  };

  return {
    get dietas() {
      return state.dietas;
    },
    get ingredientes() {
      return state.ingredientes;
    },
    get estoqueMutacoes() {
      return state.estoqueMutacoes;
    },
    async assertFazenda(userId, fazendaId) {
      const ok = state.fazendas.some(f => f.id === fazendaId && f.userId === userId);
      if (!ok) {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
      }
    },
    async listProdutosFazenda(fazendaId) {
      return state.produtos
        .filter(p => p.fazendaId === fazendaId)
        .map(p => ({
          ...p,
          estoqueId: p.produtoId,
          categoria: "Nutricionais",
          vinculadoFazenda: true,
        }));
    },
    async findDieta(userId, id) {
      return state.dietas.find(d => d.id === id && d.userId === userId) ?? null;
    },
    async listDietas(userId, fazendaId, filters) {
      return state.dietas.filter(d => {
        if (d.userId !== userId || d.fazendaId !== fazendaId) return false;
        if (filters?.status && d.status !== filters.status) return false;
        if (filters?.search && !d.nome.toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
      });
    },
    async listIngredientes(dietaIds) {
      const wanted = new Set(dietaIds);
      return state.ingredientes.filter(i => wanted.has(i.dietaId));
    },
    async transaction(fn) {
      const snapD = clone(state.dietas);
      const snapI = clone(state.ingredientes);
      const snapNextD = state.nextDieta;
      const snapNextI = state.nextIng;
      try {
        return await fn({
          async insertDieta(row) {
            const id = state.nextDieta++;
            state.dietas.push({ id, ...row });
            return id;
          },
          async insertIngredientes(rows) {
            if (seed?.falharIngredientes) throw new Error("falha ingredientes");
            for (const row of rows) {
              state.ingredientes.push({ id: state.nextIng++, ...row });
            }
          },
          async updateDieta(id, userId, patch) {
            const dieta = state.dietas.find(d => d.id === id && d.userId === userId);
            if (dieta) Object.assign(dieta, patch);
          },
          async deleteIngredientes(dietaId) {
            state.ingredientes = state.ingredientes.filter(i => i.dietaId !== dietaId);
          },
          async setStatus(id, userId, status) {
            const dieta = state.dietas.find(d => d.id === id && d.userId === userId);
            if (dieta) dieta.status = status;
          },
        });
      } catch (error) {
        state.dietas = snapD;
        state.ingredientes = snapI;
        state.nextDieta = snapNextD;
        state.nextIng = snapNextI;
        throw error;
      }
    },
  };
}

function payloadValido(over: Partial<NutricaoDietaInput> = {}): NutricaoDietaInput {
  return {
    fazendaId: 1,
    nome: "Mineral 90",
    tipo: "mineral",
    baseQuantidade: 1000,
    ingredientes: [
      { produtoId: 10, quantidade: 600 },
      { produtoId: 11, quantidade: 400 },
    ],
    ...over,
  };
}

describe("nutricaoDietas service", () => {
  it("1/2: cria dieta válida pertencente à fazenda", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    const out = await svc.criar(10, payloadValido());
    expect(out.id).toBe(1);
    expect(store.dietas[0]).toMatchObject({ userId: 10, fazendaId: 1, nome: "Mineral 90", status: "ativa" });
    expect(store.ingredientes).toHaveLength(2);
    expect(store.estoqueMutacoes).toBe(0);
  });

  it("3: outro usuário não acessa a dieta", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await svc.criar(10, payloadValido());
    await expect(svc.obter(99, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("4/19: Fazenda A não lista dieta da Fazenda B", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await svc.criar(10, payloadValido());
    await svc.criar(10, payloadValido({ fazendaId: 2, ingredientes: [{ produtoId: 20, quantidade: 1000 }] }));
    const listaA = await svc.listar(10, { fazendaId: 1 });
    const listaB = await svc.listar(10, { fazendaId: 2 });
    expect(listaA).toHaveLength(1);
    expect(listaB).toHaveLength(1);
    expect(listaA[0]?.fazendaId).toBe(1);
    expect(listaB[0]?.fazendaId).toBe(2);
  });

  it("5: ingredientes referenciam produtos existentes da fazenda", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await svc.criar(10, payloadValido());
    expect(store.ingredientes.map(i => i.produtoId)).toEqual([10, 11]);
  });

  it("6: produto de outra fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await expect(
      svc.criar(10, payloadValido({ ingredientes: [{ produtoId: 20, quantidade: 1000 }] })),
    ).rejects.toMatchObject({ message: /não está vinculado/ });
    expect(store.dietas).toHaveLength(0);
  });

  it("7/8/9: duplicado, quantidade inválida e total diferente da base", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await expect(
      svc.criar(10, payloadValido({
        ingredientes: [
          { produtoId: 10, quantidade: 500 },
          { produtoId: 10, quantidade: 500 },
        ],
      })),
    ).rejects.toMatchObject({ message: /duas vezes/ });
    await expect(
      svc.criar(10, payloadValido({ ingredientes: [{ produtoId: 10, quantidade: 0 }] })),
    ).rejects.toBeTruthy();
    await expect(
      svc.criar(10, payloadValido({
        ingredientes: [{ produtoId: 10, quantidade: 980 }],
      })),
    ).rejects.toMatchObject({ message: /base da formulação/ });
    expect(store.dietas).toHaveLength(0);
  });

  it("10: falha nos ingredientes não deixa dieta pela metade", async () => {
    const store = criarStore({ falharIngredientes: true });
    const svc = createNutricaoDietasService(store);
    await expect(svc.criar(10, payloadValido())).rejects.toThrow(/falha ingredientes/);
    expect(store.dietas).toHaveLength(0);
    expect(store.ingredientes).toHaveLength(0);
  });

  it("11: edição substitui a composição", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    const created = await svc.criar(10, payloadValido());
    await svc.editar(10, created.id, payloadValido({
      nome: "Mineral 90 v2",
      ingredientes: [{ produtoId: 12, quantidade: 1000 }],
    }));
    expect(store.dietas[0]?.nome).toBe("Mineral 90 v2");
    expect(store.ingredientes).toHaveLength(1);
    expect(store.ingredientes[0]?.produtoId).toBe(12);
  });

  it("12/13: inativa e reativa", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    const created = await svc.criar(10, payloadValido());
    await svc.inativar(10, created.id);
    expect(store.dietas[0]?.status).toBe("inativa");
    await svc.reativar(10, created.id);
    expect(store.dietas[0]?.status).toBe("ativa");
  });

  it("14/15: criar/editar não muta estoque", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    const created = await svc.criar(10, payloadValido());
    await svc.editar(10, created.id, payloadValido({ nome: "X" }));
    expect(store.estoqueMutacoes).toBe(0);
  });

  it("16/17: custo estimado usa vigente e não inventa zero", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await svc.criar(10, payloadValido());
    await svc.criar(10, payloadValido({
      nome: "Incompleta",
      ingredientes: [
        { produtoId: 10, quantidade: 600 },
        { produtoId: 15, quantidade: 400 },
      ],
    }));
    const lista = await svc.listar(10, { fazendaId: 1 });
    const completa = lista.find(d => d.nome === "Mineral 90")!;
    const incompleta = lista.find(d => d.nome === "Incompleta")!;
    expect(completa.custo.completo).toBe(true);
    expect(completa.custo.custoTotal).toBe(1560);
    expect(incompleta.custo.completo).toBe(false);
    expect(incompleta.custo.custoTotal).toBeNull();
  });

  it("18: datas inválidas são bloqueadas", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await expect(
      svc.criar(10, payloadValido({ dataInicio: "2026-10-10", dataFim: "2026-10-01" })),
    ).rejects.toMatchObject({ message: /data final/i });
  });

  it("10/11/12: prévia do formulário e detalhe compartilham custo/kg; dieta não mexe estoque", async () => {
    const embalagens = [{ nome: "Saco", volume: 30, unidade: "kg" }];
    const store = criarStore({
      produtos: [{
        produtoId: 16,
        fazendaId: 1,
        nome: "Sal Nitrogenado 40 Flex LA",
        unidade: "sc",
        valorUnitario: "129.37",
        embalagens,
      }],
    });
    const svc = createNutricaoDietasService(store);
    const created = await svc.criar(10, payloadValido({
      nome: "Sal 100",
      baseQuantidade: 30,
      ingredientes: [{ produtoId: 16, quantidade: 30 }],
    }));
    const catalogo = await svc.listarProdutosFormulacao(10, 1);
    const produto = catalogo.find(p => p.produtoId === 16);
    expect(produto?.embalagens).toEqual(embalagens);
    const previa = calcularCustoEstimadoDieta({
      baseQuantidade: 30,
      ingredientes: [{
        produtoId: 16,
        quantidade: 30,
        unidade: produto?.unidade,
        valorUnitario: produto?.valorUnitario,
        embalagens: produto?.embalagens,
      }],
    });
    const detalhe = await svc.obter(10, created.id);
    expect(previa.ingredientes[0]?.custoMedioPorKg).toBe(detalhe.custo.ingredientes[0]?.custoMedioPorKg);
    expect(previa.custoTotal).toBe(detalhe.custo.custoTotal);
    expect(previa.custoPorKg).toBe(detalhe.custo.custoPorKg);
    expect(detalhe.custo.completo).toBe(true);
    expect(detalhe.custo.formulacaoFechada).toBe(true);
    expect(detalhe.custo.custoPorKg).toBe(4.31);
    const previaIncompleta = calcularCustoEstimadoDieta({
      baseQuantidade: 1000,
      ingredientes: [{
        produtoId: 16,
        quantidade: 30,
        unidade: produto?.unidade,
        valorUnitario: produto?.valorUnitario,
        embalagens: produto?.embalagens,
      }],
    });
    expect(previaIncompleta.custoTotal).toBe(129.37);
    expect(previaIncompleta.custoPorKg).toBeNull();
    expect(previaIncompleta.formulacaoFechada).toBe(false);
    expect(store.estoqueMutacoes).toBe(0);
  });

  it("usuário sem fazenda é bloqueado", async () => {
    const store = criarStore();
    const svc = createNutricaoDietasService(store);
    await expect(svc.criar(10, payloadValido({ fazendaId: 3 }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("nutricaoDietas — sem estoque e rota nova", () => {
  it("14: service não referencia movimentação de estoque", () => {
    const src = readFileSync(new URL("./nutricaoDietas.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/estoqueMovimentacoes/);
    expect(src).not.toMatch(/estoque\.quantidade/);
    expect(src).not.toMatch(/createMovimentacao/);
    expect(src).toContain("listProdutosFazenda");
  });

  it("11/12: cadastro da dieta não cria movimento de estoque", () => {
    const src = readFileSync(new URL("./nutricaoDietas.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/estoqueMovimentacoes|insert\(estoque|createMovimentacao/);
    const form = readFileSync(new URL("../client/src/pages/NutricaoDietaFormPage.tsx", import.meta.url), "utf8");
    expect(form).toMatch(/embalagens:\s*produto\.embalagens/);
    expect(form).toMatch(/rotuloEquivalenciaEmbalagemMassa/);
    expect(form).toContain("rotuloCustoMedioAtualLinhaDieta");
    expect(form).not.toContain("formatarCustoEstimadoDieta(linhaCusto.custoMedioPorKg");
  });

  it("20: /nutricao/dietas não usa mais a tela antiga de Batidas", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(app).toMatch(/path="\/nutricao\/dietas".*NutricaoDietasListPage|NutricaoDietasListPage[\s\S]*\/nutricao\/dietas/);
    expect(app).not.toMatch(/path="\/nutricao\/dietas"\s+component=\{SuppliesManagementPage\}/);
    expect(app).toMatch(/path="\/nutricao\/visao-geral"\s+component=\{NutricaoVisaoGeralPage\}/);
    expect(app).toMatch(/path="\/nutricao\/cochos".*NutricaoCochosListPage|NutricaoCochosListPage[\s\S]*\/nutricao\/cochos/);
    expect(app).not.toMatch(/path="\/nutricao\/cochos"\s+component=\{SuppliesManagementPage\}/);
  });
});
