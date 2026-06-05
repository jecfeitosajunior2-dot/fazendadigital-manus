import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Reproduz o input de lotes.create do routers.ts para validar que o payload
 * enviado pelo diálogo de criação rápida de lote (no formulário de animal)
 * é aceito corretamente: nome obrigatório, descrição opcional.
 */
const loteCreateInput = z.object({
  nome: z.string(),
  descricao: z.string().optional(),
  localizacao: z.string().optional(),
  capacidade: z.number().optional(),
});

/**
 * Reproduz a lógica do handler handleLoteSelectChange: ao escolher a opção
 * sentinela "__new__", o formulário abre o diálogo em vez de setar o loteId.
 */
function resolveLoteSelect(value: string): { openDialog: boolean; loteId: string | null } {
  if (value === "__new__") return { openDialog: true, loteId: null };
  return { openDialog: false, loteId: value };
}

describe("criação rápida de lote", () => {
  it("aceita payload com apenas o nome", () => {
    const result = loteCreateInput.safeParse({ nome: "Lote Recria 2026" });
    expect(result.success).toBe(true);
  });

  it("aceita payload com nome e descrição", () => {
    const result = loteCreateInput.safeParse({
      nome: "Lote Engorda",
      descricao: "Bois em terminação",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita payload sem nome", () => {
    const result = loteCreateInput.safeParse({ descricao: "sem nome" });
    expect(result.success).toBe(false);
  });

  it("abre o diálogo quando a opção '__new__' é selecionada", () => {
    const r = resolveLoteSelect("__new__");
    expect(r.openDialog).toBe(true);
    expect(r.loteId).toBeNull();
  });

  it("seleciona o loteId quando uma opção normal é escolhida", () => {
    const r = resolveLoteSelect("42");
    expect(r.openDialog).toBe(false);
    expect(r.loteId).toBe("42");
  });

  it("trata 'Sem lote' (valor vazio) como ausência de lote, sem abrir diálogo", () => {
    const r = resolveLoteSelect("");
    expect(r.openDialog).toBe(false);
    expect(r.loteId).toBe("");
  });
});
