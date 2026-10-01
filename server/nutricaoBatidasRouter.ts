import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { nutricaoBatidasService } from "./nutricaoBatidas";
import { NUTRICAO_BATIDA_SITUACOES, NUTRICAO_BATIDA_STATUS } from "../shared/nutricaoBatidas";

const batidaInput = z.object({
  fazendaId: z.number().int().positive(),
  dietaId: z.number().int().positive(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quantidadePreparadaKg: z.number().positive(),
  observacoes: z.string().max(2000).nullable().optional(),
});

export const nutricaoBatidasRouter = router({
  list: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      dietaId: z.number().int().positive().optional(),
      status: z.enum(NUTRICAO_BATIDA_STATUS).optional(),
      situacao: z.enum(NUTRICAO_BATIDA_SITUACOES).optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }))
    .query(({ ctx, input }) => nutricaoBatidasService.listar(ctx.user.id, input)),

  listDisponiveis: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoBatidasService.listarDisponiveis(ctx.user.id, input.fazendaId)),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => nutricaoBatidasService.obter(ctx.user.id, input.id)),

  preview: protectedProcedure
    .input(batidaInput)
    .query(({ ctx, input }) => nutricaoBatidasService.preview(ctx.user.id, input)),

  confirmar: protectedProcedure
    .input(batidaInput)
    .mutation(({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "Usuário";
      return nutricaoBatidasService.confirmar(ctx.user.id, registradoPor, input);
    }),

  estornar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      motivo: z.string().min(1).max(80),
      observacao: z.string().max(200).nullable().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "Usuário";
      return nutricaoBatidasService.estornar(ctx.user.id, registradoPor, input);
    }),
});
