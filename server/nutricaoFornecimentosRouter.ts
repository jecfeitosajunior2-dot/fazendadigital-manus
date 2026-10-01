import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoFornecimentosService } from "./nutricaoFornecimentos";
import { NUTRICAO_FORN_STATUS } from "../shared/nutricaoFornecimentos";

const fornInput = z.object({
  fazendaId: z.number().int().positive(),
  loteId: z.number().int().positive(),
  planejamentoId: z.number().int().positive().nullable().optional(),
  cochoId: z.number().int().positive().nullable().optional(),
  tipoOrigem: z.enum(["produto", "dieta"]),
  produtoId: z.number().int().positive().nullable().optional(),
  dietaId: z.number().int().positive().nullable().optional(),
  origemOperacional: z.enum(["direta", "batida"]).optional(),
  batidaId: z.number().int().positive().nullable().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quantidadeFornecidaKg: z.number().positive(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const nutricaoFornecimentosRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      loteId: z.number().int().positive().optional(),
      tipoOrigem: z.enum(["produto", "dieta"]).optional(),
      status: z.enum(NUTRICAO_FORN_STATUS).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoFornecimentosService.listar(ctx.user.id, input)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoFornecimentosService.obter(ctx.user.id, input.id)),

  listPlanejamentos: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      loteId: z.number().int().positive(),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(({ ctx, input }) =>
      nutricaoFornecimentosService.listarPlanejamentos(ctx.user.id, input.fazendaId, input.loteId, input.data),
    ),

  preview: protectedProcedure
    .input(fornInput)
    .query(({ ctx, input }) => nutricaoFornecimentosService.preview(ctx.user.id, input)),

  confirmar: protectedProcedure
    .input(fornInput)
    .mutation(({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "Usuário";
      return nutricaoFornecimentosService.confirmar(ctx.user.id, registradoPor, input);
    }),

  estornar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      motivo: z.string().min(1).max(80),
      observacao: z.string().max(200).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "Usuário";
      return nutricaoFornecimentosService.estornar(ctx.user.id, registradoPor, input);
    }),
});
