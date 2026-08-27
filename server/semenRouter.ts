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
  listSemenReprodutoresExternosDisponiveisDb,
  registrarEntradaSemenDb,
  corrigirEntradaSemenDb,
  ajustarEstoqueSemenDb,
} from "./semenEstoqueDb";
import {
  getSemenPartidaByIdLocal,
  getSemenEntradaResumoLocal,
  listSemenPartidasLocal,
  listSemenPartidasDisponiveisInseminacaoLocal,
  listSemenReprodutoresExternosDisponiveisLocal,
  registrarEntradaSemenLocal,
  corrigirEntradaSemenLocal,
  ajustarEstoqueSemenLocal,
} from "./semenEstoqueLocal";
import { getSemenUtilizadoDb, getSemenUtilizadoLocal, listSemenUtilizadoDb, listSemenUtilizadoLocal } from "./semenUtilizado";
import {
  createSemenReprodutorExternoCatalogoDb,
  createSemenReprodutorExternoCatalogoLocal,
  listSemenReprodutorExternoCatalogoDb,
  listSemenReprodutorExternoCatalogoLocal,
  updateSemenReprodutorExternoCatalogoDb,
  updateSemenReprodutorExternoCatalogoLocal,
} from "./semenReprodutorExternoCatalogo";

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
  reprodutorKey: z.string().max(120).optional(),
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
      if (
        input.origemReprodutor === SEMEN_ORIGEM_EXTERNO &&
        !input.reprodutorKey?.trim() &&
        !input.reprodutorTexto?.trim()
      ) {
        return [];
      }
      return withDbFallback(
        () =>
          listSemenPartidasDisponiveisInseminacaoDb(ctx.user.id, {
            fazendaId: input.fazendaId,
            origem: input.origemReprodutor,
            machoId: input.machoId,
            reprodutorTexto: input.reprodutorTexto,
            reprodutorKey: input.reprodutorKey,
          }),
        () =>
          listSemenPartidasDisponiveisInseminacaoLocal(ctx.user.id, {
            fazendaId: input.fazendaId,
            origem: input.origemReprodutor,
            machoId: input.machoId,
            reprodutorTexto: input.reprodutorTexto,
            reprodutorKey: input.reprodutorKey,
          }),
      );
    }),

  listReprodutoresExternosDisponiveis: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return withDbFallback(
        () => listSemenReprodutoresExternosDisponiveisDb(ctx.user.id, input.fazendaId),
        () => listSemenReprodutoresExternosDisponiveisLocal(ctx.user.id, input.fazendaId),
      );
    }),

  corrigirEntrada: protectedProcedure
    .input(
      z.object({
        movimentacaoId: z.number().int().positive(),
        quantidadeDoses: z.union([z.number(), z.string()]),
        custoTotal: z.union([z.number(), z.string()]),
        dataEntrada: z.string().optional(),
        motivoCodigo: z.string().min(1),
        motivoDescricao: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await withDbFallback(
          () => corrigirEntradaSemenDb(ctx.user.id, input),
          () => corrigirEntradaSemenLocal(ctx.user.id, input),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Não foi possível corrigir o lançamento.";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  ajustarEstoque: protectedProcedure
    .input(
      z.object({
        partidaId: z.number().int().positive(),
        modo: z.string().min(1),
        saldoNovo: z.union([z.number(), z.string()]).optional(),
        valorNovo: z.union([z.number(), z.string()]).optional(),
        motivoCodigo: z.string().min(1),
        motivoDescricao: z.string().max(255).optional(),
        observacao: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await withDbFallback(
          () => ajustarEstoqueSemenDb(ctx.user.id, input),
          () => ajustarEstoqueSemenLocal(ctx.user.id, input),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Não foi possível ajustar o estoque.";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  listUtilizado: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        search: z.string().max(200).optional(),
        dataIni: z.string().max(10).optional(),
        dataFim: z.string().max(10).optional(),
        reprodutor: z.string().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return withDbFallback(
        () => listSemenUtilizadoDb(ctx.user.id, input),
        () => listSemenUtilizadoLocal(ctx.user.id, input),
      );
    }),

  getUtilizado: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(500),
        fazendaId: z.number().int().positive(),
        search: z.string().max(200).optional(),
        dataIni: z.string().max(10).optional(),
        dataFim: z.string().max(10).optional(),
        reprodutor: z.string().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const row = await withDbFallback(
        () => getSemenUtilizadoDb(ctx.user.id, input.key, input),
        () => getSemenUtilizadoLocal(ctx.user.id, input.key, input),
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Utilização de sêmen não encontrada." });
      }
      return row;
    }),

  listCatalogoExternos: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        incluirInativos: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return withDbFallback(
        () =>
          listSemenReprodutorExternoCatalogoDb(
            ctx.user.id,
            input.fazendaId,
            input.incluirInativos ?? false,
          ),
        () =>
          listSemenReprodutorExternoCatalogoLocal(
            ctx.user.id,
            input.fazendaId,
            input.incluirInativos ?? false,
          ),
      );
    }),

  createCatalogoExterno: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        reprodutorTexto: z.string().max(500),
        centralPadrao: z.string().max(150).optional(),
        observacoes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return withDbFallback(
        () =>
          createSemenReprodutorExternoCatalogoDb(ctx.user.id, input.fazendaId, {
            reprodutorTexto: input.reprodutorTexto,
            centralPadrao: input.centralPadrao,
            observacoes: input.observacoes,
          }),
        () =>
          createSemenReprodutorExternoCatalogoLocal(ctx.user.id, input.fazendaId, {
            reprodutorTexto: input.reprodutorTexto,
            centralPadrao: input.centralPadrao,
            observacoes: input.observacoes,
          }),
      );
    }),

  updateCatalogoExterno: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        reprodutorKey: z.string().min(1).max(120),
        reprodutorTexto: z.string().max(500).optional(),
        centralPadrao: z.string().max(150).nullable().optional(),
        observacoes: z.string().max(2000).nullable().optional(),
        ativo: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await withDbFallback(
          () =>
            updateSemenReprodutorExternoCatalogoDb(ctx.user.id, input.fazendaId, input.reprodutorKey, {
              reprodutorTexto: input.reprodutorTexto,
              centralPadrao: input.centralPadrao,
              observacoes: input.observacoes,
              ativo: input.ativo,
            }),
          () =>
            updateSemenReprodutorExternoCatalogoLocal(ctx.user.id, input.fazendaId, input.reprodutorKey, {
              reprodutorTexto: input.reprodutorTexto,
              centralPadrao: input.centralPadrao,
              observacoes: input.observacoes,
              ativo: input.ativo,
            }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Não foi possível atualizar o cadastro.";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
});
