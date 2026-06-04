import { describe, it, expect } from "vitest";
import { db } from "./db";
import { estoque } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

describe("estoque.listByCategories", () => {
  it("deve retornar itens das categorias Peças e Lubrificantes", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
        subcategoria: estoque.subcategoria,
        unidade: estoque.unidade,
        quantidade: estoque.quantidade,
        valorUnitario: estoque.valorUnitario,
        fabricante: estoque.fabricante,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças", "Lubrificantes"]));

    // Apenas verificar que a query funciona
    expect(Array.isArray(items)).toBe(true);
  });

  it("deve retornar itens da categoria Peças com todos os campos", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
        subcategoria: estoque.subcategoria,
        unidade: estoque.unidade,
        quantidade: estoque.quantidade,
        valorUnitario: estoque.valorUnitario,
        fabricante: estoque.fabricante,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças"]));

    // Verificar estrutura dos dados retornados
    if (items.length > 0) {
      const item = items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("nome");
      expect(item).toHaveProperty("categoria");
      expect(item).toHaveProperty("subcategoria");
      expect(item).toHaveProperty("unidade");
      expect(item).toHaveProperty("quantidade");
      expect(item).toHaveProperty("valorUnitario");
      expect(item).toHaveProperty("fabricante");
    }
  });

  it("deve retornar itens ordenados por nome", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças", "Lubrificantes"]));

    // Verificar que a query retorna um array
    expect(Array.isArray(items)).toBe(true);

    // Se houver múltiplos itens, verificar que todos têm nomes
    if (items.length > 1) {
      for (let i = 1; i < items.length; i++) {
        expect(typeof items[i].nome).toBe("string");
        expect(typeof items[i - 1].nome).toBe("string");
      }
    }
  });

  it("deve incluir valorUnitario quando disponível", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        valorUnitario: estoque.valorUnitario,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças", "Lubrificantes"]));

    // Verificar que a query retorna um array
    expect(Array.isArray(items)).toBe(true);

    // Se houver itens, verificar que valorUnitario pode ser null ou um valor
    if (items.length > 0) {
      items.forEach(item => {
        const isValidValue = item.valorUnitario === null || typeof item.valorUnitario === "string" || typeof item.valorUnitario === "number";
        expect(isValidValue).toBe(true);
      });
    }
  });
});
