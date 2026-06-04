import { describe, it, expect } from "vitest";
import { db } from "./db";
import { estoque } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

describe("manutencao.categoria-filter", () => {
  it("deve filtrar itens por múltiplas categorias", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças", "Lubrificantes"]));

    expect(Array.isArray(items)).toBe(true);
    items.forEach(item => {
      expect(["Peças", "Lubrificantes"]).toContain(item.categoria);
    });
  });

  it("deve retornar itens vazios quando filtro não corresponde", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Categoria Inexistente"]));

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(0);
  });

  it("deve retornar itens quando filtro inclui apenas uma categoria", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças"]));

    expect(Array.isArray(items)).toBe(true);
    items.forEach(item => {
      expect(item.categoria).toBe("Peças");
    });
  });

  it("deve retornar itens com subcategoria quando disponível", async () => {
    const items = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        categoria: estoque.categoria,
        subcategoria: estoque.subcategoria,
      })
      .from(estoque)
      .where(inArray(estoque.categoria, ["Peças", "Lubrificantes"]));

    expect(Array.isArray(items)).toBe(true);
    items.forEach(item => {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("nome");
      expect(item).toHaveProperty("categoria");
      expect(item).toHaveProperty("subcategoria");
    });
  });

  it("deve retornar itens com informações completas para o autocomplete", async () => {
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

    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      const item = items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("nome");
      expect(item).toHaveProperty("categoria");
      expect(item).toHaveProperty("valorUnitario");
    }
  });
});
