import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * Reproduz a lógica de validação do procedure lotes.movimentarAnimais.
 */

interface LoteRow {
  id: number;
  nome: string;
  userId: number;
  ativo: boolean | null;
}

interface AnimalRow {
  id: number;
  loteId: number | null;
  userId: number;
}

interface HistoricoRow {
  animalId: number;
  loteOrigemId: number;
  loteDestinoId: number;
  dataMovimentacao: string;
  usuarioNome: string;
}

async function movimentarAnimais(
  input: {
    loteOrigemId: number;
    loteDestinoId: number;
    animalIds: number[];
    dataMovimentacao: string;
  },
  userId: number,
  usuarioNome: string,
  lotesBanco: LoteRow[],
  animaisBanco: AnimalRow[],
  historicoBanco: HistoricoRow[],
) {
  if (input.loteOrigemId === input.loteDestinoId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino deve ser diferente do lote de origem." });
  }

  const loteOrigem = lotesBanco.find(l => l.id === input.loteOrigemId && l.userId === userId);
  if (!loteOrigem) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote de origem não encontrado." });
  }

  const loteDestino = lotesBanco.find(l => l.id === input.loteDestinoId && l.userId === userId);
  if (!loteDestino) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote de destino não encontrado." });
  }
  if (loteDestino.ativo === false) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino não está ativo." });
  }

  const animaisValidos = animaisBanco.filter(
    a => a.userId === userId && a.loteId === input.loteOrigemId && input.animalIds.includes(a.id),
  );

  if (animaisValidos.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum animal selecionado pertence ao lote de origem." });
  }

  for (const animal of animaisValidos) {
    animal.loteId = input.loteDestinoId;
    historicoBanco.push({
      animalId: animal.id,
      loteOrigemId: input.loteOrigemId,
      loteDestinoId: input.loteDestinoId,
      dataMovimentacao: input.dataMovimentacao,
      usuarioNome,
    });
  }

  return {
    success: true,
    count: animaisValidos.length,
    loteDestinoNome: loteDestino.nome,
  };
}

function criarFixtures() {
  const lotes: LoteRow[] = [
    { id: 1, nome: "Lote Bezerros", userId: 10, ativo: true },
    { id: 2, nome: "Lote Recria", userId: 10, ativo: true },
    { id: 3, nome: "Lote Inativo", userId: 10, ativo: false },
  ];
  const animais: AnimalRow[] = [
    { id: 101, loteId: 1, userId: 10 },
    { id: 102, loteId: 1, userId: 10 },
    { id: 103, loteId: 2, userId: 10 },
  ];
  const historico: HistoricoRow[] = [];
  return { lotes, animais, historico };
}

describe("lotes.movimentarAnimais", () => {
  it("transfere animais para outro lote e registra histórico", async () => {
    const { lotes, animais, historico } = criarFixtures();
    const resultado = await movimentarAnimais(
      { loteOrigemId: 1, loteDestinoId: 2, animalIds: [101, 102], dataMovimentacao: "2026-06-10" },
      10,
      "Paulo Gomes",
      lotes,
      animais,
      historico,
    );

    expect(resultado.count).toBe(2);
    expect(resultado.loteDestinoNome).toBe("Lote Recria");
    expect(animais.find(a => a.id === 101)?.loteId).toBe(2);
    expect(animais.find(a => a.id === 102)?.loteId).toBe(2);
    expect(historico).toHaveLength(2);
    expect(historico[0]).toMatchObject({
      animalId: 101,
      loteOrigemId: 1,
      loteDestinoId: 2,
      dataMovimentacao: "2026-06-10",
      usuarioNome: "Paulo Gomes",
    });
  });

  it("bloqueia destino igual à origem", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await expect(
      movimentarAnimais(
        { loteOrigemId: 1, loteDestinoId: 1, animalIds: [101], dataMovimentacao: "2026-06-10" },
        10,
        "Paulo Gomes",
        lotes,
        animais,
        historico,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("bloqueia lote de destino inativo", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await expect(
      movimentarAnimais(
        { loteOrigemId: 1, loteDestinoId: 3, animalIds: [101], dataMovimentacao: "2026-06-10" },
        10,
        "Paulo Gomes",
        lotes,
        animais,
        historico,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("bloqueia animais que não pertencem ao lote de origem", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await expect(
      movimentarAnimais(
        { loteOrigemId: 1, loteDestinoId: 2, animalIds: [103], dataMovimentacao: "2026-06-10" },
        10,
        "Paulo Gomes",
        lotes,
        animais,
        historico,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
