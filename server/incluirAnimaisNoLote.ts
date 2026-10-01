import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { animais, animalLoteMovimentacoes, lotes, pastos } from "../drizzle/schema";
import {
  buildEntradaInicialLoteMovimentacao,
} from "../shared/animalLoteMovimentacaoEntrada";
import { hojeISODateLocal } from "../shared/transferirAnimaisEntreLotes";
import {
  animalCompativelComFazendaLote,
  buildPastoFazendaMap,
  resolveAnimalLocalizacaoFromLote,
} from "./animaisPorFazenda";
import { db } from "./db";

export type IncluirAnimaisNoLoteInput = {
  loteId: number;
  animalIds: number[];
};

export type IncluirAnimaisNoLoteLote = {
  id: number;
  fazendaId: number | null;
  pastoAtualId: number | null;
  ativo: boolean | null;
};

export type IncluirAnimaisNoLoteAnimal = {
  id: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
};

export type IncluirAnimaisNoLoteMovimentacao = ReturnType<typeof buildEntradaInicialLoteMovimentacao>;

export type IncluirAnimaisNoLoteTx = {
  updateAnimaisLocalizacao(input: {
    userId: number;
    animalIds: number[];
    loteId: number;
    pastoId: number | null;
    fazendaId: number;
  }): Promise<void>;
  insertMovimentacoes(rows: IncluirAnimaisNoLoteMovimentacao[]): Promise<void>;
};

export type IncluirAnimaisNoLoteStore = {
  findLote(userId: number, loteId: number): Promise<IncluirAnimaisNoLoteLote | null>;
  findPasto(userId: number, pastoId: number): Promise<{ id: number; fazendaId: number | null } | null>;
  findAnimais(userId: number, animalIds: number[]): Promise<IncluirAnimaisNoLoteAnimal[]>;
  transaction<T>(fn: (tx: IncluirAnimaisNoLoteTx) => Promise<T>): Promise<T>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

export function selecionarAnimaisValidosParaInclusao(
  animaisRows: IncluirAnimaisNoLoteAnimal[],
  fazendaIdLote: number,
): { validos: IncluirAnimaisNoLoteAnimal[]; erroAmigavel: string | null } {
  const validos: IncluirAnimaisNoLoteAnimal[] = [];
  let erroAmigavel: string | null = null;
  for (const animal of animaisRows) {
    if (animal.status !== "ativo") {
      if (!erroAmigavel) erroAmigavel = "Só é possível adicionar animais ativos ao lote.";
      continue;
    }
    if (!animalCompativelComFazendaLote(animal, fazendaIdLote)) {
      if (!erroAmigavel) {
        erroAmigavel = "Este animal pertence a outra fazenda e não pode ser incluído neste lote.";
      }
      continue;
    }
    if (animal.loteId != null) {
      if (!erroAmigavel) {
        erroAmigavel = "Este animal já pertence a outro lote. Use a transferência entre lotes para movimentá-lo.";
      }
      continue;
    }
    validos.push(animal);
  }
  return { validos, erroAmigavel };
}

export function createIncluirAnimaisNoLoteService(store: IncluirAnimaisNoLoteStore) {
  return async function incluirAnimaisNoLote(
    userId: number,
    input: IncluirAnimaisNoLoteInput,
    opts: { usuarioNome: string; dataMovimentacao?: string; now?: Date },
  ): Promise<{ success: true; count: number }> {
    const lote = await store.findLote(userId, input.loteId);
    if (!lote) toTrpc("Lote não encontrado.", "NOT_FOUND");
    if (lote.ativo === false) {
      toTrpc("Este Lote está inativo e não aceita novos animais.");
    }
    if (!lote.fazendaId && !lote.pastoAtualId) {
      toTrpc("Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.");
    }

    const pastoFazendaMap = new Map<number, number>();
    if (lote.pastoAtualId) {
      const pasto = await store.findPasto(userId, lote.pastoAtualId);
      if (pasto?.fazendaId) pastoFazendaMap.set(pasto.id, pasto.fazendaId);
    }
    const { fazendaId: fazendaIdLote, pastoId: pastoIdLote } = resolveAnimalLocalizacaoFromLote(
      lote,
      pastoFazendaMap,
    );
    if (!fazendaIdLote) {
      toTrpc("Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.");
    }

    const animaisRows = await store.findAnimais(userId, input.animalIds);
    if (animaisRows.length === 0) {
      toTrpc("Nenhum animal válido foi encontrado para inclusão.");
    }

    const { validos, erroAmigavel } = selecionarAnimaisValidosParaInclusao(animaisRows, fazendaIdLote);
    if (validos.length === 0) {
      toTrpc(erroAmigavel || "Nenhum animal válido para inclusão neste lote.");
    }

    const dataMovimentacao = opts.dataMovimentacao ?? hojeISODateLocal(opts.now);
    const usuarioNome = opts.usuarioNome.trim() || "Usuário";
    const movimentacoes = validos.map(animal =>
      buildEntradaInicialLoteMovimentacao({
        userId,
        animalId: animal.id,
        loteDestinoId: input.loteId,
        pastoOrigemId: animal.pastoId,
        pastoDestinoId: pastoIdLote,
        fazendaId: fazendaIdLote,
        dataMovimentacao,
        usuarioNome,
      }),
    );

    await store.transaction(async tx => {
      await tx.updateAnimaisLocalizacao({
        userId,
        animalIds: validos.map(a => a.id),
        loteId: input.loteId,
        pastoId: pastoIdLote,
        fazendaId: fazendaIdLote,
      });
      await tx.insertMovimentacoes(movimentacoes);
    });

    return { success: true, count: validos.length };
  };
}

function txFromDrizzle(tx: typeof db): IncluirAnimaisNoLoteTx {
  return {
    async updateAnimaisLocalizacao(input) {
      await tx
        .update(animais)
        .set({
          loteId: input.loteId,
          pastoId: input.pastoId,
          fazendaId: input.fazendaId,
        })
        .where(and(
          eq(animais.userId, input.userId),
          inArray(animais.id, input.animalIds),
        ));
    },
    async insertMovimentacoes(rows) {
      if (rows.length === 0) return;
      await tx.insert(animalLoteMovimentacoes).values(rows);
    },
  };
}

export const incluirAnimaisNoLoteStore: IncluirAnimaisNoLoteStore = {
  async findLote(userId, loteId) {
    const [lote] = await db
      .select({
        id: lotes.id,
        fazendaId: lotes.fazendaId,
        pastoAtualId: lotes.pastoAtualId,
        ativo: lotes.ativo,
      })
      .from(lotes)
      .where(and(eq(lotes.id, loteId), eq(lotes.userId, userId)))
      .limit(1);
    return lote ?? null;
  },

  async findPasto(userId, pastoId) {
    const [pasto] = await db
      .select({ id: pastos.id, fazendaId: pastos.fazendaId })
      .from(pastos)
      .where(and(eq(pastos.id, pastoId), eq(pastos.userId, userId)))
      .limit(1);
    return pasto ?? null;
  },

  async findAnimais(userId, animalIds) {
    if (animalIds.length === 0) return [];
    return db
      .select({
        id: animais.id,
        fazendaId: animais.fazendaId,
        loteId: animais.loteId,
        pastoId: animais.pastoId,
        status: animais.status,
      })
      .from(animais)
      .where(and(eq(animais.userId, userId), inArray(animais.id, animalIds)));
  },

  transaction(fn) {
    return db.transaction(tx => fn(txFromDrizzle(tx as unknown as typeof db)));
  },
};

export const incluirAnimaisNoLoteDb = createIncluirAnimaisNoLoteService(incluirAnimaisNoLoteStore);
