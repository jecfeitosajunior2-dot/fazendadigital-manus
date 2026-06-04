import { describe, it, expect } from "vitest";
import { validarSaldoEstoquePecas } from "./routers";
import { db } from "./db";
import { estoque } from "../drizzle/schema";
import { eq } from "drizzle-orm";

describe("validarSaldoEstoquePecas", () => {
  it("não lança erro quando não há peças", async () => {
    await expect(validarSaldoEstoquePecas(undefined)).resolves.toBeUndefined();
    await expect(validarSaldoEstoquePecas([])).resolves.toBeUndefined();
  });

  it("não lança erro para peças sem vínculo de estoque (estoqueId null)", async () => {
    await expect(
      validarSaldoEstoquePecas([{ nome: "Peça avulsa", quantidade: 999, estoqueId: null }])
    ).resolves.toBeUndefined();
  });

  it("bloqueia quando a quantidade solicitada excede o saldo disponível", async () => {
    // Cria item de estoque com 60 de saldo
    const result = await db.insert(estoque).values({
      nome: "Óleo Hidráulico TESTE",
      categoria: "Lubrificantes",
      unidade: "L",
      quantidade: "60.00",
      valorUnitario: "45.00",
    });
    const id = Number((result as any)[0]?.insertId);
    try {
      await expect(
        validarSaldoEstoquePecas([{ nome: "Óleo Hidráulico TESTE", quantidade: 100, estoqueId: id }])
      ).rejects.toThrow(/Estoque insuficiente/);
      // Quantidade igual ao saldo deve passar
      await expect(
        validarSaldoEstoquePecas([{ nome: "Óleo Hidráulico TESTE", quantidade: 60, estoqueId: id }])
      ).resolves.toBeUndefined();
      // Soma de múltiplas linhas do mesmo item deve ser considerada
      await expect(
        validarSaldoEstoquePecas([
          { nome: "Óleo Hidráulico TESTE", quantidade: 40, estoqueId: id },
          { nome: "Óleo Hidráulico TESTE", quantidade: 30, estoqueId: id },
        ])
      ).rejects.toThrow(/Estoque insuficiente/);
    } finally {
      await db.delete(estoque).where(eq(estoque.id, id));
    }
  });
});
