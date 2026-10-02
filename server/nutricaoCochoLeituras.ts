import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import {
  lotes,
  nutricaoCochoLeituras,
  nutricaoCochos,
  nutricaoFornecimentos,
} from "../drizzle/schema";
import { formatarIdentificacaoCocho, type NutricaoCochoRef } from "../shared/nutricaoCochos";
import {
  calcularConsumoAparente,
  consumoFornCicloJaFechado,
  MSG_LEITURA_CANCELADA,
  MSG_LEITURA_NAO_EDITAR,
  MSG_LEITURA_NAO_ENCONTRADA,
  normalizarEscore,
  normalizarHoraFornecimento,
  validarLeituraInput,
  type ConsumoAparente,
  type LeituraCicloRef,
  type NutricaoLeituraFornRef,
  type NutricaoLeituraInput,
  type NutricaoLeituraStatus,
} from "../shared/nutricaoCochoLeituras";
import { hojeISODateLocal, normalizarDataCivil, type NutricaoPlanLoteRef } from "../shared/nutricaoPlanejamento";
import { db } from "./db";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type LeituraPersistida = {
  id: number;
  userId: number;
  fazendaId: number;
  cochoId: number;
  loteId: number | null;
  fornecimentoId: number | null;
  data: string;
  hora: string | null;
  sobraKg: string | null;
  escore: string | null;
  observacoes: string | null;
  cochoNomeSnapshot: string | null;
  loteNomeSnapshot: string | null;
  alimentoNomeSnapshot: string | null;
  status: NutricaoLeituraStatus;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

export type LeituraStore = {
  assertFazenda(userId: number, fazendaId: number): Promise<void>;
  getCocho(userId: number, id: number): Promise<NutricaoCochoRef | null>;
  getLote(userId: number, id: number): Promise<NutricaoPlanLoteRef | null>;
  getFornecimento(userId: number, id: number): Promise<NutricaoLeituraFornRef | null>;
  listFornecimentosCocho(userId: number, cochoId: number): Promise<NutricaoLeituraFornRef[]>;
  find(userId: number, id: number): Promise<LeituraPersistida | null>;
  list(userId: number, fazendaId: number): Promise<LeituraPersistida[]>;
  listPorCocho(userId: number, cochoId: number): Promise<LeituraPersistida[]>;
  insert(row: Omit<LeituraPersistida, "id">): Promise<number>;
  update(id: number, userId: number, patch: Omit<LeituraPersistida, "id" | "userId" | "fazendaId" | "status">): Promise<void>;
  setStatus(id: number, userId: number, status: NutricaoLeituraStatus): Promise<void>;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function toStatus(value: string | null | undefined): NutricaoLeituraStatus {
  return value === "cancelada" ? "cancelada" : "ativa";
}

function toCiclo(row: LeituraPersistida): LeituraCicloRef {
  return {
    id: row.id,
    cochoId: row.cochoId,
    loteId: row.loteId,
    fornecimentoId: row.fornecimentoId,
    data: row.data,
    hora: row.hora,
    sobraKg: row.sobraKg == null ? null : Number(row.sobraKg),
    status: row.status,
    createdAt: row.createdAt ?? null,
  };
}

export function createNutricaoCochoLeiturasService(store: LeituraStore) {
  async function ctxDe(userId: number, input: NutricaoLeituraInput) {
    const cocho = await store.getCocho(userId, input.cochoId);
    const fornecimento = Number(input.fornecimentoId) > 0
      ? await store.getFornecimento(userId, Number(input.fornecimentoId))
      : null;
    const loteId = Number(input.loteId) > 0 ? Number(input.loteId) : Number(fornecimento?.loteId) || 0;
    const lote = loteId > 0 ? await store.getLote(userId, loteId) : null;
    return { cocho, lote, fornecimento };
  }

  async function consumoDe(userId: number, row: LeituraPersistida, fornVinculado?: NutricaoLeituraFornRef | null) {
    const leituras = await store.listPorCocho(userId, row.cochoId);
    const forns = await store.listFornecimentosCocho(userId, row.cochoId);
    const vinculo = fornVinculado
      ?? (row.fornecimentoId ? await store.getFornecimento(userId, row.fornecimentoId) : null);
    return calcularConsumoAparente({
      leitura: toCiclo(row),
      leiturasCocho: leituras.map(toCiclo),
      fornecimentosCocho: forns,
      fornecimentoVinculado: vinculo,
    });
  }

  function payloadDe(
    userId: number,
    input: NutricaoLeituraInput,
    ctx: { cocho: NutricaoCochoRef; lote: NutricaoPlanLoteRef | null; fornecimento: NutricaoLeituraFornRef | null },
    atual?: LeituraPersistida,
  ): Omit<LeituraPersistida, "id" | "status"> {
    const loteId = Number(input.loteId) > 0
      ? Number(input.loteId)
      : ctx.fornecimento?.loteId ?? null;
    return {
      userId,
      fazendaId: input.fazendaId,
      cochoId: input.cochoId,
      loteId,
      fornecimentoId: Number(input.fornecimentoId) > 0 ? Number(input.fornecimentoId) : null,
      data: normalizarDataCivil(input.data)!,
      hora: normalizarHoraFornecimento(input.hora ?? null),
      sobraKg: input.sobraKg != null ? String(input.sobraKg) : null,
      escore: normalizarEscore(input.escore),
      observacoes: input.observacoes?.trim() || null,
      cochoNomeSnapshot: atual && atual.cochoId === input.cochoId
        ? atual.cochoNomeSnapshot
        : formatarIdentificacaoCocho(ctx.cocho.nome, ctx.cocho.codigo),
      loteNomeSnapshot: loteId
        ? (atual && atual.loteId === loteId ? atual.loteNomeSnapshot : (ctx.lote?.nome ?? `Lote ${loteId}`))
        : null,
      alimentoNomeSnapshot: ctx.fornecimento?.origemNomeSnapshot
        ?? (atual && atual.fornecimentoId === Number(input.fornecimentoId) ? atual.alimentoNomeSnapshot : null),
    };
  }

  return {
    async listar(
      userId: number,
      input: {
        fazendaId: number;
        cochoId?: number;
        loteId?: number;
        dataInicio?: string;
        dataFim?: string;
      },
    ) {
      await store.assertFazenda(userId, input.fazendaId);
      let rows = await store.list(userId, input.fazendaId);
      if (input.cochoId) rows = rows.filter(r => r.cochoId === input.cochoId);
      if (input.loteId) rows = rows.filter(r => r.loteId === input.loteId);
      if (input.dataInicio) rows = rows.filter(r => r.data >= input.dataInicio!);
      if (input.dataFim) rows = rows.filter(r => r.data <= input.dataFim!);
      const out: Array<LeituraPersistida & { consumo: ConsumoAparente }> = [];
      for (const row of rows) {
        out.push({ ...row, consumo: await consumoDe(userId, row) });
      }
      return out;
    },

    async listarPorCocho(userId: number, cochoId: number) {
      const cocho = await store.getCocho(userId, cochoId);
      if (!cocho) toTrpc(MSG_LEITURA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, cocho.fazendaId);
      const rows = await store.listPorCocho(userId, cochoId);
      const out = [];
      for (const row of rows.slice(0, 8)) {
        out.push({ ...row, consumo: await consumoDe(userId, row) });
      }
      return out;
    },

    async listarFornecimentosRef(userId: number, fazendaId: number, cochoId: number) {
      await store.assertFazenda(userId, fazendaId);
      const forns = await store.listFornecimentosCocho(userId, cochoId);
      return forns
        .filter(f => f.status === "confirmado" && f.fazendaId === fazendaId && f.cochoId === cochoId)
        .slice(0, 20);
    },

    async obter(userId: number, id: number) {
      const row = await store.find(userId, id);
      if (!row) toTrpc(MSG_LEITURA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, row.fazendaId);
      const forn = row.fornecimentoId ? await store.getFornecimento(userId, row.fornecimentoId) : null;
      return {
        ...row,
        consumo: await consumoDe(userId, row, forn),
        fornecimento: forn
          ? {
            id: forn.id,
            data: forn.data,
            hora: forn.hora,
            loteId: forn.loteId,
            origemNomeSnapshot: forn.origemNomeSnapshot,
            quantidadeFornecidaKg: forn.quantidadeFornecidaKg,
            batidaId: forn.batidaId,
            planejamentoId: forn.planejamentoId,
            status: forn.status,
          }
          : null,
      };
    },

    async preview(userId: number, input: NutricaoLeituraInput, hojeISO = hojeISODateLocal(), novaLeitura = true) {
      await store.assertFazenda(userId, input.fazendaId);
      const ctx = await ctxDe(userId, input);
      const check = validarLeituraInput(input, { ...ctx, hojeISO, novaLeitura });
      const draft: LeituraPersistida = {
        id: 0,
        ...payloadDe(userId, input, {
          cocho: ctx.cocho ?? { id: 0, userId, fazendaId: input.fazendaId, nome: "", status: "ativo" },
          lote: ctx.lote,
          fornecimento: ctx.fornecimento,
        }),
        status: "ativa",
      };
      let consumo = check.ok
        ? await consumoDe(userId, draft, ctx.fornecimento)
        : null;
      if (!consumo && novaLeitura && Number(input.fornecimentoId) > 0) {
        const tentativa = await consumoDe(userId, draft, ctx.fornecimento);
        if (consumoFornCicloJaFechado(tentativa)) consumo = tentativa;
      }
      return { ok: check.ok, message: check.ok ? null : check.message, consumo };
    },

    async criar(userId: number, input: NutricaoLeituraInput, hojeISO = hojeISODateLocal()) {
      await store.assertFazenda(userId, input.fazendaId);
      const ctx = await ctxDe(userId, input);
      const check = validarLeituraInput(input, { ...ctx, hojeISO, novaLeitura: true });
      if (!check.ok) toTrpc(check.message);
      const id = await store.insert({
        ...payloadDe(userId, input, { cocho: ctx.cocho!, lote: ctx.lote, fornecimento: ctx.fornecimento }),
        status: "ativa",
      });
      return { success: true as const, id };
    },

    async editar(userId: number, id: number, input: NutricaoLeituraInput, hojeISO = hojeISODateLocal()) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_LEITURA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "cancelada") toTrpc(MSG_LEITURA_NAO_EDITAR);
      const ctx = await ctxDe(userId, input);
      const check = validarLeituraInput(input, { ...ctx, hojeISO, novaLeitura: false });
      if (!check.ok) toTrpc(check.message);
      await store.update(id, userId, payloadDe(userId, input, {
        cocho: ctx.cocho!,
        lote: ctx.lote,
        fornecimento: ctx.fornecimento,
      }, atual));
      return { success: true as const, id };
    },

    async cancelar(userId: number, id: number) {
      const atual = await store.find(userId, id);
      if (!atual) toTrpc(MSG_LEITURA_NAO_ENCONTRADA, "NOT_FOUND");
      await store.assertFazenda(userId, atual.fazendaId);
      if (atual.status === "cancelada") toTrpc(MSG_LEITURA_CANCELADA);
      await store.setStatus(id, userId, "cancelada");
      return { success: true as const, status: "cancelada" as const };
    },
  };
}

function toLeituraRow(row: typeof nutricaoCochoLeituras.$inferSelect): LeituraPersistida {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    cochoId: row.cochoId,
    loteId: row.loteId ?? null,
    fornecimentoId: row.fornecimentoId ?? null,
    data: row.data,
    hora: row.hora ?? null,
    sobraKg: row.sobraKg == null ? null : String(row.sobraKg),
    escore: row.escore ?? null,
    observacoes: row.observacoes ?? null,
    cochoNomeSnapshot: row.cochoNomeSnapshot ?? null,
    loteNomeSnapshot: row.loteNomeSnapshot ?? null,
    alimentoNomeSnapshot: row.alimentoNomeSnapshot ?? null,
    status: toStatus(row.status),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function toFornRef(row: typeof nutricaoFornecimentos.$inferSelect): NutricaoLeituraFornRef {
  return {
    id: row.id,
    userId: row.userId,
    fazendaId: row.fazendaId,
    cochoId: row.cochoId ?? null,
    loteId: row.loteId,
    tipoOrigem: row.tipoOrigem,
    produtoId: row.produtoId ?? null,
    dietaId: row.dietaId ?? null,
    origemNomeSnapshot: row.origemNomeSnapshot ?? null,
    quantidadeFornecidaKg: Number(row.quantidadeFornecidaKg),
    status: row.status,
    data: row.data,
    hora: row.hora ?? null,
    populacaoSnapshot: row.populacaoSnapshot,
    batidaId: row.batidaId ?? null,
    planejamentoId: row.planejamentoId ?? null,
    createdAt: row.createdAt ?? null,
  };
}

export const nutricaoCochoLeiturasStore: LeituraStore = {
  async assertFazenda(userId, fazendaId) {
    await assertFazendaDoUsuario(userId, fazendaId);
  },
  async getCocho(userId, id) {
    const [row] = await db.select().from(nutricaoCochos).where(and(
      eq(nutricaoCochos.id, id), eq(nutricaoCochos.userId, userId),
    )).limit(1);
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      fazendaId: row.fazendaId,
      nome: row.nome,
      codigo: row.codigo ?? null,
      status: row.status,
    };
  },
  async getLote(userId, id) {
    const [row] = await db.select().from(lotes).where(and(eq(lotes.id, id), eq(lotes.userId, userId))).limit(1);
    if (!row) return null;
    return { id: row.id, userId: row.userId, fazendaId: row.fazendaId ?? null, ativo: row.ativo !== false, nome: row.nome };
  },
  async getFornecimento(userId, id) {
    const [row] = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.id, id), eq(nutricaoFornecimentos.userId, userId),
    )).limit(1);
    return row ? toFornRef(row) : null;
  },
  async listFornecimentosCocho(userId, cochoId) {
    const rows = await db.select().from(nutricaoFornecimentos).where(and(
      eq(nutricaoFornecimentos.userId, userId),
      eq(nutricaoFornecimentos.cochoId, cochoId),
    )).orderBy(desc(nutricaoFornecimentos.data), desc(nutricaoFornecimentos.id));
    return rows.map(toFornRef);
  },
  async find(userId, id) {
    const [row] = await db.select().from(nutricaoCochoLeituras).where(and(
      eq(nutricaoCochoLeituras.id, id), eq(nutricaoCochoLeituras.userId, userId),
    )).limit(1);
    return row ? toLeituraRow(row) : null;
  },
  async list(userId, fazendaId) {
    const rows = await db.select().from(nutricaoCochoLeituras).where(and(
      eq(nutricaoCochoLeituras.userId, userId), eq(nutricaoCochoLeituras.fazendaId, fazendaId),
    )).orderBy(desc(nutricaoCochoLeituras.data), desc(nutricaoCochoLeituras.id));
    return rows.map(toLeituraRow);
  },
  async listPorCocho(userId, cochoId) {
    const rows = await db.select().from(nutricaoCochoLeituras).where(and(
      eq(nutricaoCochoLeituras.userId, userId), eq(nutricaoCochoLeituras.cochoId, cochoId),
    )).orderBy(desc(nutricaoCochoLeituras.data), desc(nutricaoCochoLeituras.id));
    return rows.map(toLeituraRow);
  },
  async insert(row) {
    const result = await db.insert(nutricaoCochoLeituras).values({
      userId: row.userId,
      fazendaId: row.fazendaId,
      cochoId: row.cochoId,
      loteId: row.loteId,
      fornecimentoId: row.fornecimentoId,
      data: row.data,
      hora: row.hora,
      sobraKg: row.sobraKg,
      escore: row.escore,
      observacoes: row.observacoes,
      cochoNomeSnapshot: row.cochoNomeSnapshot,
      loteNomeSnapshot: row.loteNomeSnapshot,
      alimentoNomeSnapshot: row.alimentoNomeSnapshot,
      status: row.status,
    });
    const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Falha ao salvar a leitura." });
    }
    return id;
  },
  async update(id, userId, patch) {
    await db.update(nutricaoCochoLeituras).set({
      cochoId: patch.cochoId,
      loteId: patch.loteId,
      fornecimentoId: patch.fornecimentoId,
      data: patch.data,
      hora: patch.hora,
      sobraKg: patch.sobraKg,
      escore: patch.escore,
      observacoes: patch.observacoes,
      cochoNomeSnapshot: patch.cochoNomeSnapshot,
      loteNomeSnapshot: patch.loteNomeSnapshot,
      alimentoNomeSnapshot: patch.alimentoNomeSnapshot,
    }).where(and(eq(nutricaoCochoLeituras.id, id), eq(nutricaoCochoLeituras.userId, userId)));
  },
  async setStatus(id, userId, status) {
    await db.update(nutricaoCochoLeituras).set({ status }).where(and(
      eq(nutricaoCochoLeituras.id, id), eq(nutricaoCochoLeituras.userId, userId),
    ));
  },
};

export const nutricaoCochoLeiturasService = createNutricaoCochoLeiturasService(nutricaoCochoLeiturasStore);
