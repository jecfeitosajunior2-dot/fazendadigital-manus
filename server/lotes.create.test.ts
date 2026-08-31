import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Reproduz o input de lotes.create do routers.ts: nome obrigatório,
 * descrição opcional, fazenda obrigatória. Cadastro oficial: Rebanho → Lotes.
 */
const loteCreateInput = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  localizacao: z.string().optional(),
  capacidade: z.number().optional(),
  fazendaId: z.number({ required_error: "Selecione uma fazenda." }),
});

describe("lotes.create", () => {
  it("aceita payload com nome e fazenda", () => {
    const result = loteCreateInput.safeParse({ nome: "Lote Recria 2026", fazendaId: 1 });
    expect(result.success).toBe(true);
  });

  it("aceita payload com nome, descrição e fazenda", () => {
    const result = loteCreateInput.safeParse({
      nome: "Lote Engorda",
      descricao: "Bois em terminação",
      fazendaId: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita payload sem nome", () => {
    const result = loteCreateInput.safeParse({ descricao: "sem nome", fazendaId: 1 });
    expect(result.success).toBe(false);
  });

  it("rejeita payload sem fazenda", () => {
    const result = loteCreateInput.safeParse({ nome: "Lote Sem Fazenda" });
    expect(result.success).toBe(false);
  });
});
