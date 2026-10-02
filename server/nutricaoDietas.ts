import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like } from "drizzle-orm";
import { estoque, nutricaoDietaIngredientes, nutricaoDietas } from "../drizzle/schema";
import {
  calcularCustoEstimadoDieta,
  MSG_DIETA_NAO_ENCONTRADA,
  MSG_DIETA_OWNERSHIP,
  NUTRICAO_DIETA_BASE_UNIDADE,
  type NutricaoDietaInput,
  type NutricaoDietaProdutoRef,
  type NutricaoDietaStatus,
  validarDietaInput,
} from "../shared/nutricaoDietas";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type NutricaoDietaProdutoFazenda = NutricaoDietaProdutoRef & {
  nome: string;
  categoria: string | null;
  estoqueId: number;
};

export type NutricaoDietaPersistida = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  descricao: string | null;
  tipo: string;
  categoriaAnimal: string | null;
  objetivo: string | null;
  formaUso: string | null;
  status: NutricaoDietaStatus;
  dataInicio: string | null;
  dataFim: string | null;
  baseQuantidade: string;
  baseUnidade: string;
};

export type NutricaoDietaIngredientePersistido = {
  id: number;
  dietaId: number;
  produtoId: number;
  quantidade: string;
  ordem: number;
};

export type NutricaoDietasTx = {
  insertDieta(row: Omit<NutricaoDietaPersistida, "id">): Promise<number>;
  insertIngredientes(rows: Array<Omit<NutricaoDietaIngredientePersistido, "id">>): Promise<void>;
  updateDieta(id: number, userId: number, patch: Omit<NutricaoDietaPersistida, "id" | "userId">): Promise<void>;
  deleteIngredientes(dietaId: number): Promise<void>;
  setStatus(id: number, userId: number, status: NutricaoDietaStatus): Promise<void>;
};

export type NutricaoDietasStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  listProdutosFazenda(fazendaId: number): Promise<NutricaoDietaProdutoFazenda[]>;
  findDieta(userId: number, id: number): Promise<NutricaoDietaPersistida | null>;
  listDietas(
    userId: number,
    fazendaId: number,
    filters?: { status?: NutricaoDietaStatus; search?: string },
  ): Promise<NutricaoDietaPersistida[]>;
  listIngredientes(dietaIds: number[]): Promise<NutricaoDietaIngredientePersistido[]>;
  transaction<T>(fn: (tx: NutricaoDietasTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function toStatus(value: string | null | undefined): NutricaoDietaStatus {
  return value === "inativa" ? "inativa" : "ativa";
}

function mapProdutos(produtos: NutricaoDietaProdutoFazenda[]): Map<number, NutricaoDietaProdutoRef> {
  return new Map(produtos.map(p => [p.produtoId, p]));
}

function montarCusto(
  dieta: NutricaoDietaPersistida,
  ingredientes: NutricaoDietaIngredientePersistido[],
  produtos: NutricaoDietaProdutoFazenda[],
) {
  const porId = new Map(produtos.map(p => [p.produtoId, p]));
  return calcularCustoEstimadoDieta({
    baseQuantidade: Number(dieta.baseQuantidade),
    ingredientes: ingredientes.map(i => {
      const produto = porId.get(i.produtoId);
      return {
        produtoId: i.produtoId,
        quantidade: Number(i.quantidade),
        unidade: produto?.unidade ?? "kg",
        valorUnitario: produto?.valorUnitario ?? null,
        embalagens: produto?.embalagens,
      };
    }),
  });
}

export function createNutricaoDietasService(store: NutricaoDietasStore) {
  async function produtosDaFazenda(fazendaId: number) {
    return store.listProdutosFazenda(fazendaId);
  }

  function validarOuErro(input: NutricaoDietaInput, produtos: NutricaoDietaProdutoFazenda[]) {
    const check = validarDietaInput(input, mapProdutos(produtos));
    if (!check.ok) toTrpc(check.message);
  }

  return {
    async listar(
      userId: number,
      input: { fazendaId: number; status?: NutricaoDietaStatus; search?: string },
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      const dietas = await store.listDietas(userId, input.fazendaId, {
        status: input.status,
        search: input.search?.trim() || undefined,
      });
      const ingredientes = await store.listIngredientes(dietas.map(d => d.id));
      const produtos = await produtosDaFazenda(input.fazendaId);
      const ingsByDieta = new Map<number, NutricaoDietaIngredientePersistido[]>();
      for (const ing of ingredientes) {
        const list = ingsByDieta.get(ing.dietaId) ?? [];
        list.push(ing);
        ingsByDieta.set(ing.dietaId, list);
      }
      return dietas.map(dieta => {
        const ings = ingsByDieta.get(dieta.id) ?? [];
        const custo = montarCusto(dieta, ings, produtos);
        return {
          ...dieta,
          ingredientesCount: ings.length,
          custo,
        };
      });
    },

    async obter(userId: number, id: number) {
      const dieta = await store.findDieta(userId, id);
      if (!dieta) toTrpc(MSG_DIETA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, dieta.fazendaId);
      const ingredientes = await store.listIngredientes([dieta.id]);
      const produtos = await produtosDaFazenda(dieta.fazendaId);
      const porId = new Map(produtos.map(p => [p.produtoId, p]));
      const custo = montarCusto(dieta, ingredientes, produtos);
      return {
        ...dieta,
        custo,
        ingredientes: ingredientes
          .slice()
          .sort((a, b) => a.ordem - b.ordem || a.id - b.id)
          .map(ing => {
            const produto = porId.get(ing.produtoId);
            const linha = custo.ingredientes.find(i => i.produtoId === ing.produtoId);
            return {
              ...ing,
              produtoNome: produto?.nome ?? `Produto ${ing.produtoId}`,
              produtoUnidade: produto?.unidade ?? null,
              produtoCategoria: produto?.categoria ?? null,
              custoMedioPorKg: linha?.custoMedioPorKg ?? null,
              custoEstimado: linha?.custoEstimado ?? null,
              percentual: linha?.percentual ?? null,
              custoConhecido: linha?.custoConhecido ?? false,
            };
          }),
      };
    },

    async listarProdutosFormulacao(userId: number, fazendaId: number) {
      await store.assertFazenda(userId, fazendaId);
      return produtosDaFazenda(fazendaId);
    },

    async criar(userId: number, input: NutricaoDietaInput) {
      await store.assertFazenda(userId, input.fazendaId);
      const produtos = await produtosDaFazenda(input.fazendaId);
      validarOuErro(input, produtos);
      const id = await store.transaction(async tx => {
        const dietaId = await tx.insertDieta({
          userId,
          fazendaId: input.fazendaId,
          nome: input.nome.trim(),
          descricao: input.descricao?.trim() || null,
          tipo: input.tipo,
          categoriaAnimal: input.categoriaAnimal?.trim() || null,
          objetivo: input.objetivo?.trim() || null,
          formaUso: input.formaUso,
          status: "ativa",
          dataInicio: input.dataInicio?.trim() || null,
          dataFim: input.dataFim?.trim() || null,
          baseQuantidade: String(input.baseQuantidade),
          baseUnidade: NUTRICAO_DIETA_BASE_UNIDADE,
        });
        await tx.insertIngredientes(
          input.ingredientes.map((ing, ordem) => ({
            dietaId,
            produtoId: ing.produtoId,
            quantidade: String(ing.quantidade),
            ordem,
          })),
        );
        return dietaId;
      });
      return { success: true as const, id };
    },

    async editar(userId: number, id: number, input: NutricaoDietaInput) {
      const atual = await store.findDieta(userId, id);
      if (!atual) toTrpc(MSG_DIETA_NAO_ENCONTRADA, "NOT_FOUND");
      if (atual.userId !== userId) toTrpc(MSG_DIETA_OWNERSHIP, "FORBIDDEN");
      await store.assertFazenda(userId, atual.fazendaId);
      if (input.fazendaId !== atual.fazendaId) {
        toTrpc("A fazenda da dieta não pode ser alterada.");
      }
      const produtos = await produtosDaFazenda(atual.fazendaId);
      validarOuErro({ ...input, fazendaId: atual.fazendaId }, produtos);
      await store.transaction(async tx => {
        await tx.updateDieta(id, userId, {
          fazendaId: atual.fazendaId,
          nome: input.nome.trim(),
          descricao: input.descricao?.trim() || null,
          tipo: input.tipo,
          categoriaAnimal: input.categoriaAnimal?.trim() || null,
          objetivo: input.objetivo?.trim() || null,
          formaUso: input.formaUso,
          status: atual.status,
          dataInicio: input.dataInicio?.trim() || null,
          dataFim: input.dataFim?.trim() || null,
          baseQuantidade: String(input.baseQuantidade),
          baseUnidade: NUTRICAO_DIETA_BASE_UNIDADE,
        });
        await tx.deleteIngredientes(id);
        await tx.insertIngredientes(
          input.ingredientes.map((ing, ordem) => ({
            dietaId: id,
            produtoId: ing.produtoId,
            quantidade: String(ing.quantidade),
            ordem,
          })),
        );
      });
      return { success: true as const, id };
    },

    async inativar(userId: number, id: number) {
      const atual = await store.findDieta(userId, id);
      if (!atual) toTrpc(MSG_DIETA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      await store.transaction(async tx => {
        await tx.setStatus(id, userId, "inativa");
      });
      return { success: true as const, status: "inativa" as const };
    },

    async reativar(userId: number, id: number) {
      const atual = await store.findDieta(userId, id);
      if (!atual) toTrpc(MSG_DIETA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      await store.transaction(async tx => {
        await tx.setStatus(id, userId, "ativa");
      });
      return { success: true as const, status: "ativa" as const };
    },
  };
}

function toDietaRow(row: typeof nutricaoDietas.$inferSelect): NutricaoDietaPersistida {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    nome: row.nome,
    descricao: row.descricao ?? null,
    tipo: row.tipo,
    categoriaAnimal: row.categoriaAnimal ?? null,
    objetivo: row.objetivo ?? null,
    formaUso: row.formaUso ?? null,
    status: toStatus(row.status),
    dataInicio: row.dataInicio ?? null,
    dataFim: row.dataFim ?? null,
    baseQuantidade: String(row.baseQuantidade),
    baseUnidade: row.baseUnidade,
  };
}

export const nutricaoDietasStore: NutricaoDietasStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },

  async listProdutosFazenda(fazendaId) {
    const rows = await db
      .select({
        estoqueId: estoque.id,
        produtoId: estoque.produtoId,
        nome: estoque.nome,
        unidade: estoque.unidade,
        valorUnitario: estoque.valorUnitario,
        embalagens: estoque.embalagens,
        situacao: estoque.situacao,
        categoria: estoque.categoria,
      })
      .from(estoque)
      .where(eq(estoque.fazendaId, fazendaId));
    return rows
      .filter(r => r.produtoId != null && r.produtoId > 0 && (r.situacao ?? "ativo") !== "inativo")
      .map(r => ({
        estoqueId: r.estoqueId,
        produtoId: Number(r.produtoId),
        nome: r.nome,
        unidade: r.unidade ?? null,
        valorUnitario: r.valorUnitario ?? null,
        embalagens: r.embalagens ?? null,
        categoria: r.categoria ?? null,
        vinculadoFazenda: true,
      }));
  },

  async findDieta(userId, id) {
    const [row] = await db
      .select()
      .from(nutricaoDietas)
      .where(and(eq(nutricaoDietas.id, id), eq(nutricaoDietas.userId, userId)))
      .limit(1);
    return row ? toDietaRow(row) : null;
  },

  async listDietas(userId, fazendaId, filters) {
    const conditions = [
      eq(nutricaoDietas.userId, userId),
      eq(nutricaoDietas.fazendaId, fazendaId),
    ];
    if (filters?.status) conditions.push(eq(nutricaoDietas.status, filters.status));
    if (filters?.search) conditions.push(like(nutricaoDietas.nome, `%${filters.search}%`));
    const rows = await db
      .select()
      .from(nutricaoDietas)
      .where(and(...conditions))
      .orderBy(desc(nutricaoDietas.updatedAt), desc(nutricaoDietas.id));
    return rows.map(toDietaRow);
  },

  async listIngredientes(dietaIds) {
    if (dietaIds.length === 0) return [];
    const rows = await db
      .select()
      .from(nutricaoDietaIngredientes)
      .where(inArray(nutricaoDietaIngredientes.dietaId, dietaIds));
    return rows.map(r => ({
        id: r.id,
        dietaId: r.dietaId,
        produtoId: r.produtoId,
        quantidade: String(r.quantidade),
        ordem: r.ordem,
      }));
  },

  transaction(fn) {
    return db.transaction(async tx => {
      return fn({
        async insertDieta(row) {
          const result = await tx.insert(nutricaoDietas).values(row);
          const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
          if (!Number.isFinite(id) || id <= 0) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar a dieta." });
          }
          return id;
        },
        async insertIngredientes(rows) {
          if (rows.length === 0) return;
          await tx.insert(nutricaoDietaIngredientes).values(rows);
        },
        async updateDieta(id, userId, patch) {
          await tx
            .update(nutricaoDietas)
            .set(patch)
            .where(and(eq(nutricaoDietas.id, id), eq(nutricaoDietas.userId, userId)));
        },
        async deleteIngredientes(dietaId) {
          await tx
            .delete(nutricaoDietaIngredientes)
            .where(eq(nutricaoDietaIngredientes.dietaId, dietaId));
        },
        async setStatus(id, userId, status) {
          await tx
            .update(nutricaoDietas)
            .set({ status })
            .where(and(eq(nutricaoDietas.id, id), eq(nutricaoDietas.userId, userId)));
        },
      });
    });
  },
};

export const nutricaoDietasService = createNutricaoDietasService(nutricaoDietasStore);
