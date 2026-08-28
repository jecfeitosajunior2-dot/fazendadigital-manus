import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  assertDataMovimentacaoNaoFutura,
  isLoteDestinoMesmaFazenda,
  isMesmoLoteDestino,
  MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM,
  MSG_TROCA_LOTE_DESTINO_INATIVO,
  MSG_TROCA_LOTE_FAZENDA,
  MSG_TROCA_LOTE_MESMO_LOTE,
  MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM,
} from "../shared/transferirAnimaisEntreLotes";

/**
 * Espelha a regra central de lotes.movimentarAnimais / transferirAnimaisEntreLotesDb
 * sem bater no banco.
 */

interface LoteRow {
  id: number;
  nome: string;
  userId: number;
  ativo: boolean | null;
  fazendaId?: number | null;
}

interface AnimalRow {
  id: number;
  loteId: number | null;
  userId: number;
  status?: string;
  fazendaId?: number | null;
}

interface HistoricoRow {
  animalId: number;
  loteOrigemId: number | null;
  loteDestinoId: number;
  dataMovimentacao: string;
  usuarioNome: string;
  observacoes?: string | null;
}

async function movimentarAnimais(
  input: {
    loteOrigemId?: number;
    loteDestinoId: number;
    animalIds: number[];
    dataMovimentacao: string;
    responsavel?: string;
    observacoes?: string;
  },
  userId: number,
  usuarioNome: string,
  lotesBanco: LoteRow[],
  animaisBanco: AnimalRow[],
  historicoBanco: HistoricoRow[],
  hojeISO = "2026-08-28",
) {
  const dataOk = assertDataMovimentacaoNaoFutura(input.dataMovimentacao, hojeISO);
  if (!dataOk.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: dataOk.message });
  }

  if (input.loteOrigemId != null && input.loteOrigemId === input.loteDestinoId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM });
  }

  const loteOrigem =
    input.loteOrigemId != null
      ? lotesBanco.find(l => l.id === input.loteOrigemId && l.userId === userId)
      : undefined;
  if (input.loteOrigemId != null && !loteOrigem) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote de origem não encontrado." });
  }

  const loteDestino = lotesBanco.find(l => l.id === input.loteDestinoId && l.userId === userId);
  if (!loteDestino) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lote de destino não encontrado." });
  }
  if (loteDestino.ativo === false) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_DESTINO_INATIVO });
  }

  const encontrados = animaisBanco.filter(
    a => a.userId === userId && input.animalIds.includes(a.id),
  );
  const animaisValidos =
    input.loteOrigemId != null
      ? encontrados.filter(a => a.loteId === input.loteOrigemId)
      : encontrados;

  if (animaisValidos.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        input.loteOrigemId != null
          ? MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM
          : "Nenhum animal válido foi encontrado para a troca de lote.",
    });
  }

  const nome = input.responsavel?.trim() || usuarioNome;
  const obs = input.observacoes?.trim() || null;

  for (const animal of animaisValidos) {
    if (animal.status && animal.status !== "ativo") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível transferir animais ativos." });
    }
    if (isMesmoLoteDestino(animal.loteId, input.loteDestinoId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_MESMO_LOTE });
    }
    if (!isLoteDestinoMesmaFazenda(animal.fazendaId ?? loteOrigem?.fazendaId, loteDestino.fazendaId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_FAZENDA });
    }

    const origem = animal.loteId && animal.loteId > 0 ? animal.loteId : null;
    animal.loteId = input.loteDestinoId;
    historicoBanco.push({
      animalId: animal.id,
      loteOrigemId: origem,
      loteDestinoId: input.loteDestinoId,
      dataMovimentacao: input.dataMovimentacao,
      usuarioNome: nome,
      observacoes: obs,
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
    { id: 1, nome: "Lote Bezerros", userId: 10, ativo: true, fazendaId: 1 },
    { id: 2, nome: "Lote Recria", userId: 10, ativo: true, fazendaId: 1 },
    { id: 3, nome: "Lote Inativo", userId: 10, ativo: false, fazendaId: 1 },
    { id: 4, nome: "Lote Fazenda A", userId: 10, ativo: true, fazendaId: 2 },
  ];
  const animais: AnimalRow[] = [
    { id: 101, loteId: 1, userId: 10, status: "ativo", fazendaId: 1 },
    { id: 102, loteId: 1, userId: 10, status: "ativo", fazendaId: 1 },
    { id: 103, loteId: 2, userId: 10, status: "ativo", fazendaId: 1 },
    { id: 100, loteId: null, userId: 10, status: "ativo", fazendaId: 1 },
  ];
  const historico: HistoricoRow[] = [];
  return { lotes, animais, historico };
}

describe("lotes.movimentarAnimais", () => {
  it("transfere vários animais pelo Editar Lote e registra histórico por animal", async () => {
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
    expect(historico[1].animalId).toBe(102);
  });

  it("transfere um animal pelo Manejo Pontual sem loteOrigemId", async () => {
    const { lotes, animais, historico } = criarFixtures();
    const resultado = await movimentarAnimais(
      {
        loteDestinoId: 2,
        animalIds: [101],
        dataMovimentacao: "2026-08-28",
        responsavel: "Pedro",
        observacoes: "Transferência após desmama.",
      },
      10,
      "Usuário",
      lotes,
      animais,
      historico,
    );

    expect(resultado.count).toBe(1);
    expect(animais.find(a => a.id === 101)?.loteId).toBe(2);
    expect(historico[0]).toMatchObject({
      animalId: 101,
      loteOrigemId: 1,
      loteDestinoId: 2,
      usuarioNome: "Pedro",
      observacoes: "Transferência após desmama.",
    });
  });

  it("permite animal sem lote e grava origem nula", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await movimentarAnimais(
      { loteDestinoId: 1, animalIds: [100], dataMovimentacao: "2026-08-28" },
      10,
      "Pedro",
      lotes,
      animais,
      historico,
    );
    expect(animais.find(a => a.id === 100)?.loteId).toBe(1);
    expect(historico[0].loteOrigemId).toBeNull();
  });

  it("bloqueia destino igual à origem no Editar Lote", async () => {
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
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_DESTINO_IGUAL_ORIGEM });
  });

  it("bloqueia o mesmo lote no Manejo Pontual", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await expect(
      movimentarAnimais(
        { loteDestinoId: 1, animalIds: [101], dataMovimentacao: "2026-08-28" },
        10,
        "Pedro",
        lotes,
        animais,
        historico,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_MESMO_LOTE });
  });

  it("bloqueia lote de outra fazenda", async () => {
    const { lotes, animais, historico } = criarFixtures();
    await expect(
      movimentarAnimais(
        { loteDestinoId: 4, animalIds: [101], dataMovimentacao: "2026-08-28" },
        10,
        "Pedro",
        lotes,
        animais,
        historico,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_FAZENDA });
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
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: MSG_TROCA_LOTE_SEM_ANIMAIS_ORIGEM });
  });
});
