import { describe, it, expect } from "vitest";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

/**
 * Reproduz a lógica de validação do procedure lotes.excluir (server/routers.ts).
 *
 * Regras:
 *  - Lote não encontrado → lança NOT_FOUND
 *  - Lote com animais vinculados → lança PRECONDITION_FAILED com contagem
 *  - Lote sem animais → exclui e retorna { success: true, nomeLote }
 */

// ─── Tipos mínimos para simular o banco ──────────────────────────────────────
interface LoteRow {
  id: number;
  nome: string;
  userId: number;
}

interface AnimalRow {
  id: number;
  loteId: number | null;
  userId: number;
}

// ─── Função que replica a lógica do procedure ─────────────────────────────────
async function excluirLote(
  input: { id: number },
  userId: number,
  lotesBanco: LoteRow[],
  animaisBanco: AnimalRow[],
): Promise<{ success: boolean; nomeLote: string }> {
  // 1. Verifica se o lote pertence ao usuário
  const lote = lotesBanco.find((l) => l.id === input.id && l.userId === userId);
  if (!lote) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
  }

  // 2. Conta animais vinculados (independente de status)
  const qtdAnimais = animaisBanco.filter(
    (a) => a.loteId === input.id && a.userId === userId,
  ).length;

  if (qtdAnimais > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Não é possível excluir o lote "${lote.nome}". Existem ${qtdAnimais} animal(is) vinculado(s) a este lote. Mova ou remova os animais primeiro.`,
    });
  }

  // 3. Exclui o lote (simulado — apenas remove do array)
  const idx = lotesBanco.findIndex((l) => l.id === input.id);
  if (idx !== -1) lotesBanco.splice(idx, 1);

  return { success: true, nomeLote: lote.nome };
}

// ─── Dados de fixture ─────────────────────────────────────────────────────────
function criarFixtures() {
  const lotes: LoteRow[] = [
    { id: 1, nome: "Lote Recria", userId: 10 },
    { id: 2, nome: "Lote Engorda", userId: 10 },
    { id: 3, nome: "Lote Vazio", userId: 10 },
  ];

  const animais: AnimalRow[] = [
    { id: 101, loteId: 1, userId: 10 }, // 1 animal no Lote Recria
    { id: 102, loteId: 2, userId: 10 }, // 3 animais no Lote Engorda
    { id: 103, loteId: 2, userId: 10 },
    { id: 104, loteId: 2, userId: 10 },
    // Lote Vazio (id=3) não tem animais
  ];

  return { lotes, animais };
}

// ─── Testes ───────────────────────────────────────────────────────────────────
describe("lotes.excluir — validação de animais vinculados", () => {
  it("permite excluir lote sem animais vinculados", async () => {
    const { lotes, animais } = criarFixtures();
    const resultado = await excluirLote({ id: 3 }, 10, lotes, animais);
    expect(resultado.success).toBe(true);
    expect(resultado.nomeLote).toBe("Lote Vazio");
    // Confirma que o lote foi removido da lista
    expect(lotes.find((l) => l.id === 3)).toBeUndefined();
  });

  it("bloqueia exclusão de lote com 1 animal vinculado", async () => {
    const { lotes, animais } = criarFixtures();
    await expect(excluirLote({ id: 1 }, 10, lotes, animais)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("1 animal(is)"),
    });
  });

  it("bloqueia exclusão de lote com múltiplos animais vinculados e informa a contagem correta", async () => {
    const { lotes, animais } = criarFixtures();
    await expect(excluirLote({ id: 2 }, 10, lotes, animais)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("3 animal(is)"),
    });
  });

  it("a mensagem de bloqueio inclui o nome do lote", async () => {
    const { lotes, animais } = criarFixtures();
    try {
      await excluirLote({ id: 2 }, 10, lotes, animais);
      throw new Error("Deveria ter lançado TRPCError");
    } catch (err: any) {
      expect(err.message).toContain("Lote Engorda");
    }
  });

  it("retorna NOT_FOUND quando o lote não existe", async () => {
    const { lotes, animais } = criarFixtures();
    await expect(excluirLote({ id: 999 }, 10, lotes, animais)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("retorna NOT_FOUND quando o lote pertence a outro usuário", async () => {
    const { lotes, animais } = criarFixtures();
    // Lote id=3 existe mas pertence ao userId=10; tentativa com userId=99 deve falhar
    await expect(excluirLote({ id: 3 }, 99, lotes, animais)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lote sem animais: lote permanece na lista se a exclusão for bloqueada", async () => {
    const { lotes, animais } = criarFixtures();
    // Tenta excluir lote com animais — deve falhar e o lote deve continuar na lista
    try {
      await excluirLote({ id: 1 }, 10, lotes, animais);
    } catch {
      // esperado
    }
    expect(lotes.find((l) => l.id === 1)).toBeDefined();
  });
});

// ─── Validação do schema de input ─────────────────────────────────────────────
describe("lotes.excluir — validação do schema de input", () => {
  const inputSchema = z.object({ id: z.number() });

  it("aceita id numérico válido", () => {
    expect(inputSchema.safeParse({ id: 42 }).success).toBe(true);
  });

  it("rejeita id como string", () => {
    expect(inputSchema.safeParse({ id: "42" }).success).toBe(false);
  });

  it("rejeita input sem id", () => {
    expect(inputSchema.safeParse({}).success).toBe(false);
  });
});
