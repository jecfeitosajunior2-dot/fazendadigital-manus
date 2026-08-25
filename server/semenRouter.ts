import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_STATUS_DISPONIVEL,
  SEMEN_STATUS_ESGOTADO,
  validateSemenEntradaInput,
} from "../shared/semenEstoque";
import { isDatabaseUnavailable } from "./localFallbackStore";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getSemenPartidaByIdDb,
  getSemenEntradaResumoDb,
  listSemenPartidasDb,
  listSemenPartidasDisponiveisInseminacaoDb,
  registrarEntradaSemenDb,
} from "./semenEstoqueDb";
import {
  getSemenPartidaByIdLocal,
  getSemenEntradaResumoLocal,
  listSemenPartidasLocal,
  listSemenPartidasDisponiveisInseminacaoLocal,
  registrarEntradaSemenLocal,
} from "./semenEstoqueLocal";

const origemSchema = z.enum([SEMEN_ORIGEM_INTERNO, SEMEN_ORIGEM_EXTERNO]);
const statusFilterSchema = z.enum([SEMEN_STATUS_DISPONIVEL, SEMEN_STATUS_ESGOTADO, "todos"]);

const entradaInputSchema = z.object({
  fazendaId: z.number().int().positive(),
  origemReprodutor: origemSchema,
  machoId: z.number().int().positive().optional(),
  reprodutorTexto: z.string().max(500).optional(),
  partida: z.string().max(120).optional(),
  centralOrigem: z.string().max(150).optional(),
  quantidadeDoses: z.union([z.number(), z.string()]),
  custoTotal: z.union([z.number(), z.string()]),
  dataEntrada: z.string().optional(),
  observacoes: z.string().max(2000).optional(),
});

async function withDbFallback<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return fallback();
  }
}

const listDisponiveisInputSchema = z.object({
  fazendaId: z.number().int().positive(),
  origemReprodutor: origemSchema,
  machoId: z.number().int().positive().optional(),
  reprodutorTexto: z.string().max(500).optional(),
});

export const semenRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        search: z.string().max(200).optional(),
        status: statusFilterSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return withDbFallback(
        () =>
          listSemenPartidasDb(ctx.user.id, {
            fazendaId: input.fazendaId,
            search: input.search,
            status: input.status ?? "todos",
          }),
        () =>
          listSemenPartidasLocal(ctx.user.id, {
            fazendaId: input.fazendaId,
            search: input.search,
            status: input.status ?? "todos",
          }),
      );
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await withDbFallback(
        () => getSemenPartidaByIdDb(ctx.user.id, input.id),
        () => getSemenPartidaByIdLocal(ctx.user.id, input.id),
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Partida de sêmen não encontrada." });
      }
      return row;
    }),

  getEntradaResumo: protectedProcedure
    .input(z.object({ movimentacaoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await withDbFallback(
        () => getSemenEntradaResumoDb(ctx.user.id, input.movimentacaoId),
        () => getSemenEntradaResumoLocal(ctx.user.id, input.movimentacaoId),
      );
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Movimentação de entrada não encontrada.",
        });
      }
      return row;
    }),

  registrarEntrada: protectedProcedure.input(entradaInputSchema).mutation(async ({ ctx, input }) => {
    const validacao = validateSemenEntradaInput(input);
    if (!validacao.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: validacao.message });
    }

    return withDbFallback(
      () => registrarEntradaSemenDb(ctx.user.id, input.fazendaId, validacao.value),
      () => registrarEntradaSemenLocal(ctx.user.id, input.fazendaId, validacao.value),
    );
  }),

  listDisponiveisParaInseminacao: protectedProcedure
    .input(listDisponiveisInputSchema)
    .query(async ({ ctx, input }) => {
      if (input.origemReprodutor === SEMEN_ORIGEM_INTERNO && !input.machoId) {
        return [];
      }
      if (input.origemReprodutor === SEMEN_ORIGEM_EXTERNO && !input.reprodutorTexto?.trim()) {
        return [];
      }
      return withDbFallback(
        () =>
          listSemenPartidasDisponiveisInseminacaoDb(ctx.user.id, {
            fazendaId: input.fazendaId,
            origem: input.origemReprodutor,
            machoId: input.machoId,
            reprodutorTexto: input.reprodutorTexto,
          }),
        () =>
          listSemenPartidasDisponiveisInseminacaoLocal(ctx.user.id, {
            fazendaId: input.fazendaId,
            origem: input.origemReprodutor,
            machoId: input.machoId,
            reprodutorTexto: input.reprodutorTexto,
          }),
      );
    }),
});
